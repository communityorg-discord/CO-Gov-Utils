/**
 * Office Manager
 * Manage protected office voice channels with waiting room system
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, UserSelectMenuBuilder, ChannelType } = require('discord.js');
const { execute, query, queryOne } = require('./database');

const WAITING_ROOM_ID = '1462300279281287189';
const OFFICE_PANEL_CHANNEL = '1462372004383686769';

// In-memory queue: { oddenId -> { userId, wantedOffice, wantedOfficeName, timestamp } }
const waitingQueue = new Map();

// Initialize tables
function initOfficeTables() {
    try {
        // Protected offices
        execute(`
      CREATE TABLE IF NOT EXISTS protected_offices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        channel_name TEXT,
        registered_by TEXT,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, channel_id)
      )
    `);

        // Pre-approved users
        execute(`
      CREATE TABLE IF NOT EXISTS office_allowlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        channel_id TEXT,
        allowed_by TEXT,
        allowed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, user_id, channel_id)
      )
    `);

        // Panel message ID storage
        execute(`
      CREATE TABLE IF NOT EXISTS office_panels (
        guild_id TEXT PRIMARY KEY,
        waiting_panel_message_id TEXT,
        admin_panel_message_id TEXT
      )
    `);

        console.log('[OfficeManager] ✓ Tables initialized');
    } catch (e) {
        console.error('[OfficeManager] Table init failed:', e.message);
    }
}

/**
 * Check if a channel is a protected office
 */
function isProtectedOffice(guildId, channelId) {
    const office = queryOne(
        'SELECT * FROM protected_offices WHERE guild_id = ? AND channel_id = ?',
        [guildId, channelId]
    );
    return !!office;
}

/**
 * Check if user is allowed in an office
 */
function isUserAllowed(guildId, userId, channelId) {
    // Check specific channel allowlist
    const specific = queryOne(
        'SELECT * FROM office_allowlist WHERE guild_id = ? AND user_id = ? AND channel_id = ?',
        [guildId, userId, channelId]
    );
    if (specific) return true;

    // Check global allowlist (channel_id = NULL means all offices)
    const global = queryOne(
        'SELECT * FROM office_allowlist WHERE guild_id = ? AND user_id = ? AND channel_id IS NULL',
        [guildId, userId]
    );
    return !!global;
}

/**
 * Register a channel as protected office
 */
function registerOffice(guildId, channelId, channelName, registeredBy) {
    try {
        execute(`
      INSERT OR REPLACE INTO protected_offices (guild_id, channel_id, channel_name, registered_by)
      VALUES (?, ?, ?, ?)
    `, [guildId, channelId, channelName, registeredBy]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Unregister a protected office
 */
function unregisterOffice(guildId, channelId) {
    try {
        execute('DELETE FROM protected_offices WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Get all protected offices
 */
function getProtectedOffices(guildId) {
    return query('SELECT * FROM protected_offices WHERE guild_id = ?', [guildId]);
}

/**
 * Allow user in office
 */
function allowUser(guildId, userId, channelId, allowedBy) {
    try {
        execute(`
      INSERT OR REPLACE INTO office_allowlist (guild_id, user_id, channel_id, allowed_by)
      VALUES (?, ?, ?, ?)
    `, [guildId, userId, channelId, allowedBy]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Remove user allowance
 */
function removeAllow(guildId, userId, channelId) {
    try {
        execute('DELETE FROM office_allowlist WHERE guild_id = ? AND user_id = ? AND channel_id = ?',
            [guildId, userId, channelId || null]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Add to waiting queue
 */
function addToQueue(visitorId, officeId, officeName) {
    waitingQueue.set(visitorId, {
        oddenId: visitorId,
        wantedOffice: officeId,
        wantedOfficeName: officeName,
        timestamp: Date.now()
    });
}

/**
 * Remove from waiting queue
 */
function removeFromQueue(visitorId) {
    waitingQueue.delete(visitorId);
}

/**
 * Get waiting queue as array
 */
function getWaitingQueue() {
    return Array.from(waitingQueue.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Handle voice state update - auto-kick unauthorized + auto-status
 */
async function handleVoiceUpdate(oldState, newState, client) {
    // Handle channel leave - update old channel status
    if (oldState.channel && oldState.channelId !== newState?.channelId) {
        await updateChannelStatus(oldState.channel, client);
    }

    // Handle channel join
    if (newState.channel && oldState.channelId !== newState.channelId) {
        const guildId = newState.guild.id;
        const channelId = newState.channel.id;
        const userId = newState.member.id;

        // Check if this is a protected office
        if (isProtectedOffice(guildId, channelId)) {
            // Check if user is allowed
            if (!isUserAllowed(guildId, userId, channelId) &&
                !newState.member.permissions.has('ManageChannels')) {
                // Not allowed - kick to waiting room
                try {
                    const waitingRoom = await client.channels.fetch(WAITING_ROOM_ID).catch(() => null);
                    if (waitingRoom) {
                        // Add to queue
                        addToQueue(userId, channelId, newState.channel.name);

                        // Move to waiting room
                        await newState.setChannel(waitingRoom, 'Unauthorized office entry - moved to waiting room');

                        // Update panel
                        await updateWaitingPanel(client, guildId);

                        // DM user
                        try {
                            await newState.member.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('🏢 Office Access Required')
                                        .setColor(0xF39C12)
                                        .setDescription(`You've been moved to the waiting room.\n\nYou requested access to: **${newState.channel.name}**\n\nPlease wait for staff approval.`)
                                        .setTimestamp()
                                ]
                            });
                        } catch (e) { /* DMs disabled */ }
                    }
                } catch (e) {
                    console.error('[OfficeManager] Kick failed:', e.message);
                }
                return;
            }
        }

        // User is allowed or not protected - update status
        await updateChannelStatus(newState.channel, client);
    }
}

/**
 * Update voice channel status with fancy info
 */
async function updateChannelStatus(channel, client) {
    if (!channel || !client) return;

    try {
        const members = channel.members;
        const memberCount = members.size;

        // Check if channel is locked (Connect permission denied for @everyone)
        const everyonePerms = channel.permissionOverwrites.cache.get(channel.guild.id);
        const isLocked = everyonePerms?.deny?.has('Connect') || false;

        let status = '';

        if (isLocked) {
            // Show locked status with channel name
            if (memberCount === 0) {
                status = `⚠️ ${channel.name} • 🔒 LOCKED`;
            } else {
                status = `⚠️ ${channel.name} • 🔒 ${memberCount} inside`;
            }
        } else if (memberCount === 0) {
            // Empty - clear status
            status = '';
        } else {
            // Show channel name + member count
            status = `🏢 ${channel.name} • ${memberCount} ${memberCount === 1 ? 'member' : 'members'}`;
        }

        // Use client's built-in REST to set voice channel status
        await client.rest.put(`/channels/${channel.id}/voice-status`, {
            body: { status: status }
        });

        console.log(`[OfficeManager] Status: ${channel.name} → "${status}"`);
    } catch (e) {
        console.error(`[OfficeManager] Status failed: ${e.message}`);
    }
}

/**
 * Create/update waiting room panel
 */
async function updateWaitingPanel(client, guildId) {
    try {
        const channel = await client.channels.fetch(OFFICE_PANEL_CHANNEL).catch(() => null);
        if (!channel) return;

        const queue = getWaitingQueue();

        const embed = new EmbedBuilder()
            .setTitle('🏢 Office Waiting Room')
            .setColor(queue.length > 0 ? 0xF39C12 : 0x2ECC71)
            .setTimestamp();

        if (queue.length === 0) {
            embed.setDescription('*No one waiting*');
        } else {
            let desc = `**${queue.length}** person(s) waiting:\n\n`;
            for (const visitor of queue.slice(0, 10)) {
                const waitTime = Math.floor((Date.now() - visitor.timestamp) / 60000);
                desc += `👤 <@${visitor.oddenId}> → **${visitor.wantedOfficeName}** (${waitTime}m)\n`;
            }
            if (queue.length > 10) desc += `\n*...and ${queue.length - 10} more*`;
            embed.setDescription(desc);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('office_approve')
                .setLabel('✅ Approve Next')
                .setStyle(ButtonStyle.Success)
                .setDisabled(queue.length === 0),
            new ButtonBuilder()
                .setCustomId('office_deny')
                .setLabel('❌ Deny Next')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(queue.length === 0),
            new ButtonBuilder()
                .setCustomId('office_refresh')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('office_admin')
                .setLabel('⚙️ Admin')
                .setStyle(ButtonStyle.Primary)
        );

        // Get stored message ID
        const panel = queryOne('SELECT * FROM office_panels WHERE guild_id = ?', [guildId]);

        if (panel?.waiting_panel_message_id) {
            // Edit existing message
            try {
                const msg = await channel.messages.fetch(panel.waiting_panel_message_id);
                await msg.edit({ embeds: [embed], components: [row] });
                return;
            } catch (e) {
                // Message deleted, create new
            }
        }

        // Send new message
        const msg = await channel.send({ embeds: [embed], components: [row] });
        execute(`
      INSERT OR REPLACE INTO office_panels (guild_id, waiting_panel_message_id)
      VALUES (?, ?)
    `, [guildId, msg.id]);

    } catch (e) {
        console.error('[OfficeManager] Panel update failed:', e.message);
    }
}

/**
 * Show admin panel
 */
async function showAdminPanel(interaction) {
    const offices = getProtectedOffices(interaction.guild.id);

    const embed = new EmbedBuilder()
        .setTitle('⚙️ Office Administration')
        .setColor(0x3498DB)
        .setTimestamp();

    if (offices.length === 0) {
        embed.setDescription('No protected offices registered.');
    } else {
        let desc = '**Protected Offices:**\n\n';
        for (const office of offices) {
            desc += `🏢 <#${office.channel_id}>\n`;
        }
        embed.setDescription(desc);
    }

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('office_register')
            .setLabel('➕ Register Office')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('office_unregister')
            .setLabel('➖ Unregister Office')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('office_preapprove')
            .setLabel('👤 Pre-Approve User')
            .setStyle(ButtonStyle.Primary)
    );

    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ embeds: [embed], components: [row1] });
        } else {
            await interaction.reply({ embeds: [embed], components: [row1], ephemeral: true });
        }
    } catch (e) {
        console.error('[OfficeManager] Admin panel error:', e.message);
    }
}

/**
 * Handle button interactions
 */
async function handleButton(interaction, client) {
    const customId = interaction.customId;

    switch (customId) {
        case 'office_approve':
            return handleApprove(interaction, client);
        case 'office_deny':
            return handleDeny(interaction, client);
        case 'office_refresh':
            await updateWaitingPanel(client, interaction.guild.id);
            return interaction.reply({ content: '🔄 Refreshed!', ephemeral: true });
        case 'office_admin':
            return showAdminPanel(interaction);
        case 'office_register':
            return showRegisterModal(interaction);
        case 'office_unregister':
            return showUnregisterMenu(interaction);
        case 'office_preapprove':
            return showPreapproveMenu(interaction);
    }
}

async function handleApprove(interaction, client) {
    const queue = getWaitingQueue();
    if (queue.length === 0) {
        return interaction.reply({ content: '❌ No one in queue.', ephemeral: true });
    }

    const next = queue[0];

    try {
        // Find the user in waiting room
        const waitingRoom = await client.channels.fetch(WAITING_ROOM_ID);
        const member = await interaction.guild.members.fetch(next.oddenId);

        if (!member.voice.channel || member.voice.channelId !== WAITING_ROOM_ID) {
            removeFromQueue(next.oddenId);
            await updateWaitingPanel(client, interaction.guild.id);
            return interaction.reply({ content: '❌ User left waiting room.', ephemeral: true });
        }

        // Add user to allowlist for this specific office BEFORE moving (prevents kick from locked office)
        allowUser(interaction.guild.id, next.oddenId, next.wantedOffice, interaction.user.id);

        // Move to office
        const office = await client.channels.fetch(next.wantedOffice);
        await member.voice.setChannel(office, `Approved by ${interaction.user.tag}`);

        // Remove from queue
        removeFromQueue(next.oddenId);
        await updateWaitingPanel(client, interaction.guild.id);

        return interaction.reply({ content: `✅ Moved <@${next.oddenId}> to **${next.wantedOfficeName}** (added to allowlist)`, ephemeral: true });
    } catch (e) {
        return interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true });
    }
}

async function handleDeny(interaction, client) {
    const queue = getWaitingQueue();
    if (queue.length === 0) {
        return interaction.reply({ content: '❌ No one in queue.', ephemeral: true });
    }

    const next = queue[0];

    try {
        const member = await interaction.guild.members.fetch(next.oddenId);

        // Disconnect from waiting room
        if (member.voice.channel) {
            await member.voice.disconnect('Access denied by staff');
        }

        // DM user
        try {
            await member.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🏢 Access Denied')
                        .setColor(0xE74C3C)
                        .setDescription(`Your request to access **${next.wantedOfficeName}** was denied.`)
                        .setTimestamp()
                ]
            });
        } catch (e) { /* DMs disabled */ }

        removeFromQueue(next.oddenId);
        await updateWaitingPanel(client, interaction.guild.id);

        return interaction.reply({ content: `❌ Denied <@${next.oddenId}>`, ephemeral: true });
    } catch (e) {
        return interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true });
    }
}

async function showRegisterModal(interaction) {
    // Use channel select menu
    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('office_register_select')
            .setPlaceholder('Select voice channel to protect')
            .setChannelTypes(ChannelType.GuildVoice)
    );

    await interaction.reply({ content: 'Select a voice channel to register as protected office:', components: [row], ephemeral: true });
}

async function showUnregisterMenu(interaction) {
    const offices = getProtectedOffices(interaction.guild.id);

    if (offices.length === 0) {
        return interaction.reply({ content: 'No offices registered.', ephemeral: true });
    }

    const options = offices.slice(0, 25).map(o => ({
        label: o.channel_name || 'Unknown',
        value: o.channel_id
    }));

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('office_unregister_select')
            .setPlaceholder('Select office to unregister')
            .addOptions(options)
    );

    await interaction.reply({ content: 'Select office to remove protection:', components: [row], ephemeral: true });
}

async function showPreapproveMenu(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId('office_preapprove_user')
            .setPlaceholder('Select user to pre-approve')
    );

    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: 'Select user to pre-approve for all offices:', components: [row] });
        } else {
            await interaction.reply({ content: 'Select user to pre-approve for all offices:', components: [row], ephemeral: true });
        }
    } catch (e) {
        console.error('[OfficeManager] Preapprove menu error:', e.message);
    }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenu(interaction, client) {
    const customId = interaction.customId;

    try {
        if (customId === 'office_register_select') {
            const channelId = interaction.values[0];
            const channel = await client.channels.fetch(channelId);
            registerOffice(interaction.guild.id, channelId, channel.name, interaction.user.id);
            return interaction.update({ content: `✅ Registered **${channel.name}** as protected office.`, components: [] });
        }

        if (customId === 'office_unregister_select') {
            const channelId = interaction.values[0];
            unregisterOffice(interaction.guild.id, channelId);
            return interaction.update({ content: `✅ Removed protection from office.`, components: [] });
        }

        if (customId === 'office_preapprove_user') {
            const userId = interaction.values[0];
            allowUser(interaction.guild.id, userId, null, interaction.user.id);
            return interaction.update({ content: `✅ <@${userId}> pre-approved for all offices.`, components: [] });
        }
    } catch (e) {
        console.error('[OfficeManager] Select menu error:', e.message);
    }
}

/**
 * Initialize panel on startup
 */
async function initializePanel(client, guildId) {
    await updateWaitingPanel(client, guildId);
}

// Initialize on load
initOfficeTables();

module.exports = {
    isProtectedOffice,
    isUserAllowed,
    registerOffice,
    unregisterOffice,
    getProtectedOffices,
    allowUser,
    removeAllow,
    addToQueue,
    removeFromQueue,
    getWaitingQueue,
    handleVoiceUpdate,
    updateWaitingPanel,
    showAdminPanel,
    handleButton,
    handleSelectMenu,
    initializePanel,
    WAITING_ROOM_ID,
    OFFICE_PANEL_CHANNEL
};

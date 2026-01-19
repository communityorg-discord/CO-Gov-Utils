/**
 * /vc - Voice Channel Hub
 * Button-based voice channel controls
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vc')
        .setDescription('Voice channel control hub')
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'vc');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        return showVCHub(interaction);
    },

    // Export button handler
    handleButton,
    handleSelectMenu
};

/**
 * Show the main VC hub
 */
async function showVCHub(interaction, edit = false) {
    const member = interaction.member;
    const currentVC = member.voice?.channel;

    const embed = new EmbedBuilder()
        .setTitle('🎙️ Voice Channel Control Hub')
        .setColor(0x3498DB)
        .setTimestamp();

    if (currentVC) {
        const members = currentVC.members;
        const memberList = members.map(m => `• ${m.user.tag}`).slice(0, 10).join('\n');

        embed.addFields(
            { name: '📍 Your Current VC', value: `**${currentVC.name}**`, inline: true },
            { name: '👥 Users', value: `${members.size}${currentVC.userLimit ? `/${currentVC.userLimit}` : ''}`, inline: true },
            { name: '🔒 Status', value: currentVC.permissionsFor(interaction.guild.id)?.has('Connect') !== false ? '🟢 Open' : '🔴 Locked', inline: true }
        );

        if (memberList) {
            embed.addFields({ name: '👤 Members', value: memberList || 'Empty', inline: false });
        }
    } else {
        embed.setDescription('*You are not in a voice channel*\n\nJoin a VC or select one below to manage it.');
    }

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('vc:lock')
            .setLabel('🔒 Lock')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('vc:unlock')
            .setLabel('🔓 Unlock')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('vc:limit')
            .setLabel('🔢 Set Limit')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('vc:status')
            .setLabel('📝 Set Status')
            .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('vc:move')
            .setLabel('👋 Move User')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('vc:disconnect')
            .setLabel('📤 Disconnect')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('vc:disconnectall')
            .setLabel('📤 Disconnect All')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('vc:refresh')
            .setLabel('🔄')
            .setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('vc:mute')
            .setLabel('🔇 Mute User')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('vc:unmute')
            .setLabel('🔊 Unmute User')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('vc:moveall')
            .setLabel('👥 Move All')
            .setStyle(ButtonStyle.Primary)
    );

    const options = { embeds: [embed], components: [row1, row2, row3], ephemeral: true };

    if (edit) {
        return interaction.update(options);
    }
    return interaction.reply(options);
}

/**
 * Handle button interactions
 */
async function handleButton(interaction) {
    const customId = interaction.customId;
    const action = customId.split(':')[1];

    switch (action) {
        case 'refresh':
            return showVCHub(interaction, true);

        case 'lock':
            return handleLock(interaction);

        case 'unlock':
            return handleUnlock(interaction);

        case 'limit':
            return showLimitMenu(interaction);

        case 'status':
            return showStatusModal(interaction);

        case 'move':
            return showMoveUserMenu(interaction);

        case 'disconnect':
            return showDisconnectMenu(interaction);

        case 'disconnectall':
            return handleDisconnectAll(interaction);

        case 'mute':
            return showMuteMenu(interaction);

        case 'unmute':
            return showUnmuteMenu(interaction);

        case 'moveall':
            return showMoveAllMenu(interaction);
    }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenu(interaction) {
    const customId = interaction.customId;

    if (customId === 'vc:limit_select') {
        return handleLimitSelect(interaction);
    }
    if (customId === 'vc:move_user') {
        return handleMoveUserSelect(interaction);
    }
    if (customId === 'vc:move_channel') {
        return handleMoveChannelSelect(interaction);
    }
    if (customId === 'vc:disconnect_user') {
        return handleDisconnectUser(interaction);
    }
    if (customId === 'vc:mute_user') {
        return handleMuteUser(interaction);
    }
    if (customId === 'vc:unmute_user') {
        return handleUnmuteUser(interaction);
    }
    if (customId === 'vc:moveall_from') {
        return handleMoveAllFrom(interaction);
    }
    if (customId === 'vc:moveall_to') {
        return handleMoveAllTo(interaction);
    }
}

// ============ Action Handlers ============

async function handleLock(interaction) {
    const channel = interaction.member.voice?.channel;
    if (!channel) {
        return interaction.reply({ content: '❌ Join a VC first.', ephemeral: true });
    }

    await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });

    // Update status
    try {
        await channel.setStatus('🔒 Locked');
    } catch (e) { /* Status not supported */ }

    return interaction.reply({ content: `🔒 Locked **${channel.name}**`, ephemeral: true });
}

async function handleUnlock(interaction) {
    const channel = interaction.member.voice?.channel;
    if (!channel) {
        return interaction.reply({ content: '❌ Join a VC first.', ephemeral: true });
    }

    await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: null });

    try {
        await channel.setStatus('');
    } catch (e) { /* Status not supported */ }

    return interaction.reply({ content: `🔓 Unlocked **${channel.name}**`, ephemeral: true });
}

async function showLimitMenu(interaction) {
    const options = [
        { label: 'No Limit', value: '0' },
        { label: '2 Users', value: '2' },
        { label: '5 Users', value: '5' },
        { label: '10 Users', value: '10' },
        { label: '15 Users', value: '15' },
        { label: '20 Users', value: '20' },
        { label: '25 Users', value: '25' },
        { label: '50 Users', value: '50' }
    ];

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('vc:limit_select')
            .setPlaceholder('Select user limit')
            .addOptions(options)
    );

    return interaction.reply({ content: 'Select a user limit:', components: [row], ephemeral: true });
}

async function handleLimitSelect(interaction) {
    const limit = parseInt(interaction.values[0]);
    const channel = interaction.member.voice?.channel;

    if (!channel) {
        return interaction.update({ content: '❌ Join a VC first.', components: [] });
    }

    await channel.setUserLimit(limit);
    return interaction.update({ content: `✅ Set **${channel.name}** limit to ${limit || 'unlimited'}`, components: [] });
}

async function showStatusModal(interaction) {
    const channel = interaction.member.voice?.channel;
    if (!channel) {
        return interaction.reply({ content: '❌ Join a VC first.', ephemeral: true });
    }

    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

    const modal = new ModalBuilder()
        .setCustomId('vc:status_modal')
        .setTitle('Set Voice Channel Status');

    const statusInput = new TextInputBuilder()
        .setCustomId('status_text')
        .setLabel('Status (leave empty to clear)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(500)
        .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(statusInput));
    return interaction.showModal(modal);
}

async function showMoveUserMenu(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId('vc:move_user')
            .setPlaceholder('Select user to move')
    );

    return interaction.reply({ content: 'Select a user to move:', components: [row], ephemeral: true });
}

// Store selected user temporarily
const pendingMoves = new Map();

async function handleMoveUserSelect(interaction) {
    const userId = interaction.values[0];
    pendingMoves.set(interaction.user.id, userId);

    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('vc:move_channel')
            .setPlaceholder('Select destination channel')
            .setChannelTypes(ChannelType.GuildVoice)
    );

    return interaction.update({ content: `Moving <@${userId}> to:`, components: [row] });
}

async function handleMoveChannelSelect(interaction) {
    const userId = pendingMoves.get(interaction.user.id);
    const channelId = interaction.values[0];

    if (!userId) {
        return interaction.update({ content: '❌ Session expired. Try again.', components: [] });
    }

    try {
        const member = await interaction.guild.members.fetch(userId);
        const channel = await interaction.guild.channels.fetch(channelId);
        await member.voice.setChannel(channel);
        pendingMoves.delete(interaction.user.id);
        return interaction.update({ content: `✅ Moved <@${userId}> to **${channel.name}**`, components: [] });
    } catch (e) {
        return interaction.update({ content: `❌ Failed: ${e.message}`, components: [] });
    }
}

async function showDisconnectMenu(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId('vc:disconnect_user')
            .setPlaceholder('Select user to disconnect')
    );

    return interaction.reply({ content: 'Select a user to disconnect:', components: [row], ephemeral: true });
}

async function handleDisconnectUser(interaction) {
    const userId = interaction.values[0];

    try {
        const member = await interaction.guild.members.fetch(userId);
        if (!member.voice.channel) {
            return interaction.update({ content: '❌ User not in voice.', components: [] });
        }
        await member.voice.disconnect();
        return interaction.update({ content: `✅ Disconnected <@${userId}>`, components: [] });
    } catch (e) {
        return interaction.update({ content: `❌ Failed: ${e.message}`, components: [] });
    }
}

async function handleDisconnectAll(interaction) {
    const channel = interaction.member.voice?.channel;
    if (!channel) {
        return interaction.reply({ content: '❌ Join a VC first.', ephemeral: true });
    }

    let count = 0;
    for (const [, member] of channel.members) {
        if (member.id === interaction.user.id) continue; // Don't disconnect self
        try {
            await member.voice.disconnect();
            count++;
        } catch (e) { }
    }

    return interaction.reply({ content: `✅ Disconnected ${count} user(s) from **${channel.name}**`, ephemeral: true });
}

async function showMuteMenu(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId('vc:mute_user')
            .setPlaceholder('Select user to mute')
    );

    return interaction.reply({ content: 'Select a user to server mute:', components: [row], ephemeral: true });
}

async function handleMuteUser(interaction) {
    const userId = interaction.values[0];

    try {
        const member = await interaction.guild.members.fetch(userId);
        await member.voice.setMute(true);
        return interaction.update({ content: `🔇 Muted <@${userId}>`, components: [] });
    } catch (e) {
        return interaction.update({ content: `❌ Failed: ${e.message}`, components: [] });
    }
}

async function showUnmuteMenu(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId('vc:unmute_user')
            .setPlaceholder('Select user to unmute')
    );

    return interaction.reply({ content: 'Select a user to unmute:', components: [row], ephemeral: true });
}

async function handleUnmuteUser(interaction) {
    const userId = interaction.values[0];

    try {
        const member = await interaction.guild.members.fetch(userId);
        await member.voice.setMute(false);
        return interaction.update({ content: `🔊 Unmuted <@${userId}>`, components: [] });
    } catch (e) {
        return interaction.update({ content: `❌ Failed: ${e.message}`, components: [] });
    }
}

const pendingMoveAll = new Map();

async function showMoveAllMenu(interaction) {
    const currentVC = interaction.member.voice?.channel;
    if (!currentVC) {
        return interaction.reply({ content: '❌ Join a VC first. Move All will move everyone from YOUR current VC.', ephemeral: true });
    }

    // Store the current channel as the source
    pendingMoveAll.set(interaction.user.id, currentVC.id);

    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('vc:moveall_to')
            .setPlaceholder('Select destination channel')
            .setChannelTypes(ChannelType.GuildVoice)
    );

    return interaction.reply({
        content: `Moving **${currentVC.members.size}** user(s) from **${currentVC.name}** to:`,
        components: [row],
        ephemeral: true
    });
}

async function handleMoveAllFrom(interaction) {
    const fromId = interaction.values[0];
    pendingMoveAll.set(interaction.user.id, fromId);

    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('vc:moveall_to')
            .setPlaceholder('Select destination channel')
            .setChannelTypes(ChannelType.GuildVoice)
    );

    return interaction.update({ content: 'Select destination channel:', components: [row] });
}

async function handleMoveAllTo(interaction) {
    const fromId = pendingMoveAll.get(interaction.user.id);
    const toId = interaction.values[0];

    if (!fromId) {
        return interaction.update({ content: '❌ Session expired. Try again.', components: [] });
    }

    // Defer to prevent timeout during move operation
    await interaction.deferUpdate();

    try {
        const fromChannel = await interaction.guild.channels.fetch(fromId);
        const toChannel = await interaction.guild.channels.fetch(toId);

        // Get all members in the voice channel by checking voice states
        const voiceMembers = [];
        for (const [memberId, state] of interaction.guild.voiceStates.cache) {
            if (state.channelId === fromId) {
                voiceMembers.push(memberId);
            }
        }

        let count = 0;
        for (const memberId of voiceMembers) {
            try {
                const member = await interaction.guild.members.fetch(memberId);
                await member.voice.setChannel(toChannel);
                count++;
            } catch (e) {
                console.error(`[VC MoveAll] Failed to move ${memberId}:`, e.message);
            }
        }

        pendingMoveAll.delete(interaction.user.id);
        return interaction.editReply({ content: `✅ Moved ${count} user(s) from **${fromChannel.name}** to **${toChannel.name}**`, components: [] });
    } catch (e) {
        return interaction.editReply({ content: `❌ Failed: ${e.message}`, components: [] });
    }
}

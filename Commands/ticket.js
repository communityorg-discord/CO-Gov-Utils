/**
 * /ticket - Help Desk Ticket System Command
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const ticketManager = require('../utils/ticketManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Help desk ticket system')
        .addSubcommand(sub => sub
            .setName('setup')
            .setDescription('Post the ticket creation panel'))
        .addSubcommand(sub => sub
            .setName('log')
            .setDescription('Log transcript and close this ticket'))
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a user to this ticket')
            .addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a user from this ticket')
            .addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('claim')
            .setDescription('Claim this ticket'))
        .addSubcommand(sub => sub
            .setName('unclaim')
            .setDescription('Unclaim this ticket'))
        .addSubcommand(sub => sub
            .setName('priority')
            .setDescription('Set ticket priority')
            .addStringOption(opt => opt
                .setName('level')
                .setDescription('Priority level')
                .setRequired(true)
                .addChoices(
                    { name: '⬇️ Low', value: 'low' },
                    { name: '➡️ Medium', value: 'medium' },
                    { name: '⬆️ High', value: 'high' },
                    { name: '🚨 Urgent', value: 'urgent' }
                )))
        .addSubcommand(sub => sub
            .setName('note')
            .setDescription('Add an internal note (staff only)')
            .addStringOption(opt => opt.setName('content').setDescription('Note content').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('notes')
            .setDescription('View all notes for this ticket'))
        .addSubcommand(sub => sub
            .setName('transfer')
            .setDescription('Transfer ticket to another staff member')
            .addUserOption(opt => opt.setName('staff').setDescription('Staff to transfer to').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('rename')
            .setDescription('Rename this ticket channel')
            .addStringOption(opt => opt.setName('name').setDescription('New channel name').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('stats')
            .setDescription('View ticket statistics'))
        .addSubcommand(sub => sub
            .setName('search')
            .setDescription('Search tickets and transcripts')
            .addStringOption(opt => opt.setName('query').setDescription('Search query (ticket ID, username, or user ID)').setRequired(true))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'setup': return handleSetup(interaction);
            case 'log': return handleLog(interaction);
            case 'add': return handleAdd(interaction);
            case 'remove': return handleRemove(interaction);
            case 'claim': return handleClaim(interaction);
            case 'unclaim': return handleUnclaim(interaction);
            case 'priority': return handlePriority(interaction);
            case 'note': return handleNote(interaction);
            case 'notes': return handleNotes(interaction);
            case 'transfer': return handleTransfer(interaction);
            case 'rename': return handleRename(interaction);
            case 'stats': return handleStats(interaction);
            case 'search': return handleSearch(interaction);
        }
    },

    async handleButton(interaction) {
        const [, action, channelId] = interaction.customId.split(':');

        // Create button is for everyone
        if (action === 'create') {
            return showTypeSelect(interaction);
        }

        // All other actions require staff
        if (!ticketManager.isStaff(interaction.member)) {
            return interaction.reply({ content: '❌ Only staff can use these buttons.', ephemeral: true });
        }

        switch (action) {
            case 'claim': return handleClaimButton(interaction);
            case 'unclaim': return handleUnclaimButton(interaction);
            case 'log': return handleLogButton(interaction);
        }
    },

    async handleSelectMenu(interaction) {
        const [, action] = interaction.customId.split(':');
        if (action === 'type') return handleTypeSelect(interaction);
    }
};

// ============================================================
// SUBCOMMAND HANDLERS
// ============================================================

async function handleSetup(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Only administrators can run this.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🎫 Help Desk Support')
        .setColor(0x3498DB)
        .setDescription('Need help? Click the button below to create a support ticket.\n\nOur support team will assist you shortly.')
        .addFields(
            { name: '🎫 General Support', value: 'Questions & assistance', inline: true },
            { name: '🤖 Bot Issues', value: 'Bugs & problems', inline: true },
            { name: '🏛️ Government', value: 'Government issues', inline: true }
        )
        .setFooter({ text: 'USGRP Help Desk' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:create').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '✅ Ticket panel posted!', ephemeral: true });
}

async function handleLog(interaction) {
    if (!ticketManager.isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
    }

    const ticket = ticketManager.getTicket(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });

    await interaction.deferReply();
    const result = await ticketManager.logAndCloseTicket(interaction.channel, interaction.member, interaction.client);

    if (result.ok) {
        return interaction.editReply({ content: `✅ **${result.ticketId}** logged. Closing...` });
    }
    return interaction.editReply({ content: `❌ ${result.error}` });
}

async function handleAdd(interaction) {
    const ticket = ticketManager.getTicket(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });

    const user = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    return interaction.reply({ content: `✅ Added <@${user.id}>` });
}

async function handleRemove(interaction) {
    const ticket = ticketManager.getTicket(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });

    const user = interaction.options.getUser('user');
    if (user.id === ticket.userId) return interaction.reply({ content: '❌ Cannot remove ticket owner.', ephemeral: true });

    await interaction.channel.permissionOverwrites.delete(user.id);
    return interaction.reply({ content: `✅ Removed <@${user.id}>` });
}

async function handleClaim(interaction) {
    if (!ticketManager.isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
    }

    const result = await ticketManager.claimTicket(interaction.channel, interaction.member);
    if (result.ok) return interaction.reply({ content: '✅ Claimed!', ephemeral: true });
    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
}

async function handleUnclaim(interaction) {
    const result = await ticketManager.unclaimTicket(interaction.channel, interaction.member);
    if (result.ok) return interaction.reply({ content: '✅ Unclaimed.', ephemeral: true });
    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
}

async function handlePriority(interaction) {
    if (!ticketManager.isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
    }

    const level = interaction.options.getString('level');
    const result = await ticketManager.setPriority(interaction.channel, level);

    if (result.ok) return interaction.reply({ content: '✅ Priority updated.', ephemeral: true });
    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
}

async function handleNote(interaction) {
    if (!ticketManager.isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
    }

    const content = interaction.options.getString('content');
    const result = ticketManager.addNote(interaction.channel.id, interaction.user.id, interaction.user.tag, content);

    if (result.ok) {
        const embed = new EmbedBuilder()
            .setTitle('📝 Internal Note Added')
            .setColor(0x9B59B6)
            .setDescription(content)
            .setFooter({ text: `By ${interaction.user.tag}` })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
}

async function handleNotes(interaction) {
    if (!ticketManager.isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
    }

    const notes = ticketManager.getNotes(interaction.channel.id);
    if (notes.length === 0) {
        return interaction.reply({ content: '📝 No notes for this ticket.', ephemeral: true });
    }

    const notesList = notes.map((n, i) =>
        `**${i + 1}.** ${n.content}\n*— ${n.authorTag} <t:${Math.floor(new Date(n.timestamp).getTime() / 1000)}:R>*`
    ).join('\n\n');

    const embed = new EmbedBuilder()
        .setTitle('📝 Ticket Notes')
        .setColor(0x9B59B6)
        .setDescription(notesList.substring(0, 4000));

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleTransfer(interaction) {
    if (!ticketManager.isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
    }

    const staff = interaction.options.getMember('staff');
    if (!ticketManager.isStaff(staff)) {
        return interaction.reply({ content: '❌ Target must be staff.', ephemeral: true });
    }

    const result = await ticketManager.transferTicket(interaction.channel, interaction.member, staff);
    if (result.ok) return interaction.reply({ content: `✅ Transferred to <@${staff.id}>`, ephemeral: true });
    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
}

async function handleRename(interaction) {
    if (!ticketManager.isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
    }

    const name = interaction.options.getString('name');
    const result = await ticketManager.renameTicket(interaction.channel, name);

    if (result.ok) return interaction.reply({ content: `✅ Renamed to **${result.newName}**` });
    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
}

async function handleStats(interaction) {
    if (!ticketManager.isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
    }

    const stats = ticketManager.getStats();

    const staffList = Object.entries(stats.staffClaims)
        .map(([id, data]) => `<@${id}>: ${data.count}`)
        .join('\n') || 'None';

    const embed = new EmbedBuilder()
        .setTitle('📊 Ticket Statistics')
        .setColor(0x3498DB)
        .addFields(
            { name: '📂 Open Tickets', value: String(stats.open), inline: true },
            { name: '✅ Total Closed', value: String(stats.totalClosed), inline: true },
            { name: '📋 Total Created', value: String((stats.counters.general || 0) + (stats.counters.bot || 0) + (stats.counters.government || 0)), inline: true },
            { name: '🎫 By Type', value: `Support: ${stats.byType.general}\nBug: ${stats.byType.bot}\nGov: ${stats.byType.government}`, inline: true },
            { name: '⚡ By Priority', value: `🚨 ${stats.byPriority.urgent} | ⬆️ ${stats.byPriority.high} | ➡️ ${stats.byPriority.medium} | ⬇️ ${stats.byPriority.low}`, inline: true },
            { name: '📊 Status', value: `Open: ${stats.byStatus.open}\nClaimed: ${stats.byStatus.claimed}`, inline: true },
            { name: '👥 Staff Claims', value: staffList.substring(0, 500), inline: false }
        )
        .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSearch(interaction) {
    if (!ticketManager.isStaff(interaction.member)) {
        return interaction.reply({ content: '❌ Staff only.', ephemeral: true });
    }

    const query = interaction.options.getString('query');
    const results = ticketManager.searchTickets(query);

    if (results.length === 0) {
        return interaction.reply({ content: `❌ No results for "${query}"`, ephemeral: true });
    }

    const resultsList = results.map(r => {
        if (r.source === 'open') {
            return `🟢 **${r.id}** - <@${r.userId}> - ${r.status} - <#${r.channelId}>`;
        } else {
            return `📁 **${r.id}** - Transcript: \`${r.file}\``;
        }
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results: "${query}"`)
        .setColor(0x3498DB)
        .setDescription(resultsList.substring(0, 4000))
        .setFooter({ text: `${results.length} results found` });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ============================================================
// BUTTON HANDLERS
// ============================================================

async function showTypeSelect(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket:type')
            .setPlaceholder('Select ticket type...')
            .addOptions(
                Object.entries(ticketManager.TICKET_TYPES).map(([key, info]) => ({
                    label: info.name, value: key, emoji: info.emoji, description: `Create a ${info.name.toLowerCase()} ticket`
                }))
            )
    );
    return interaction.reply({ content: '**Select support type:**', components: [row], ephemeral: true });
}

async function handleTypeSelect(interaction) {
    const type = interaction.values[0];
    await interaction.deferUpdate();

    const result = await ticketManager.createTicket(interaction.guild, interaction.user, type);

    if (result.ok) {
        return interaction.editReply({ content: `✅ Go to <#${result.channel.id}>`, components: [] });
    }
    return interaction.editReply({ content: `❌ ${result.error}`, components: [] });
}

async function handleClaimButton(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const result = await ticketManager.claimTicket(interaction.channel, interaction.member);
    if (result.ok) return interaction.editReply({ content: '✅ Claimed!' });
    return interaction.editReply({ content: `❌ ${result.error}` });
}

async function handleUnclaimButton(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const result = await ticketManager.unclaimTicket(interaction.channel, interaction.member);
    if (result.ok) return interaction.editReply({ content: '✅ Unclaimed.' });
    return interaction.editReply({ content: `❌ ${result.error}` });
}

async function handleLogButton(interaction) {
    await interaction.deferReply();
    const result = await ticketManager.logAndCloseTicket(interaction.channel, interaction.member, interaction.client);
    if (result.ok) return interaction.editReply({ content: `✅ **${result.ticketId}** logged. Closing...` });
    return interaction.editReply({ content: `❌ ${result.error}` });
}

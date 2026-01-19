/**
 * /audit-log - Discord Audit Log Viewer
 * Search and browse server audit logs
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');

// Map audit log events to readable names
const AUDIT_EVENTS = {
    [AuditLogEvent.ChannelCreate]: { name: 'Channel Create', emoji: '📁' },
    [AuditLogEvent.ChannelDelete]: { name: 'Channel Delete', emoji: '🗑️' },
    [AuditLogEvent.ChannelUpdate]: { name: 'Channel Update', emoji: '✏️' },
    [AuditLogEvent.MemberBanAdd]: { name: 'Member Ban', emoji: '🔨' },
    [AuditLogEvent.MemberBanRemove]: { name: 'Member Unban', emoji: '✅' },
    [AuditLogEvent.MemberKick]: { name: 'Member Kick', emoji: '👢' },
    [AuditLogEvent.MemberUpdate]: { name: 'Member Update', emoji: '👤' },
    [AuditLogEvent.MemberRoleUpdate]: { name: 'Role Update', emoji: '🎭' },
    [AuditLogEvent.MessageDelete]: { name: 'Message Delete', emoji: '🗑️' },
    [AuditLogEvent.MessageBulkDelete]: { name: 'Bulk Delete', emoji: '🗑️' },
    [AuditLogEvent.RoleCreate]: { name: 'Role Create', emoji: '🎭' },
    [AuditLogEvent.RoleDelete]: { name: 'Role Delete', emoji: '🗑️' },
    [AuditLogEvent.RoleUpdate]: { name: 'Role Update', emoji: '✏️' },
    [AuditLogEvent.InviteCreate]: { name: 'Invite Create', emoji: '🔗' },
    [AuditLogEvent.InviteDelete]: { name: 'Invite Delete', emoji: '🔗' },
    [AuditLogEvent.GuildUpdate]: { name: 'Server Update', emoji: '⚙️' },
    [AuditLogEvent.EmojiCreate]: { name: 'Emoji Create', emoji: '😀' },
    [AuditLogEvent.EmojiDelete]: { name: 'Emoji Delete', emoji: '🗑️' },
    [AuditLogEvent.EmojiUpdate]: { name: 'Emoji Update', emoji: '✏️' },
    [AuditLogEvent.WebhookCreate]: { name: 'Webhook Create', emoji: '🔗' },
    [AuditLogEvent.WebhookDelete]: { name: 'Webhook Delete', emoji: '🗑️' },
    [AuditLogEvent.WebhookUpdate]: { name: 'Webhook Update', emoji: '✏️' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('audit-log')
        .setDescription('View Discord audit logs')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
        .addSubcommand(sub => sub
            .setName('recent')
            .setDescription('View recent audit log entries')
            .addIntegerOption(opt => opt
                .setName('limit')
                .setDescription('Number of entries (max 25)')
                .setMinValue(1)
                .setMaxValue(25)))
        .addSubcommand(sub => sub
            .setName('user')
            .setDescription('View actions by a specific user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to search')
                .setRequired(true))
            .addIntegerOption(opt => opt
                .setName('limit')
                .setDescription('Number of entries (max 25)')
                .setMinValue(1)
                .setMaxValue(25)))
        .addSubcommand(sub => sub
            .setName('target')
            .setDescription('View actions targeting a specific user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('Target user')
                .setRequired(true))
            .addIntegerOption(opt => opt
                .setName('limit')
                .setDescription('Number of entries (max 25)')
                .setMinValue(1)
                .setMaxValue(25)))
        .addSubcommand(sub => sub
            .setName('type')
            .setDescription('View specific action types')
            .addStringOption(opt => opt
                .setName('action')
                .setDescription('Action type')
                .setRequired(true)
                .addChoices(
                    { name: 'Bans', value: 'bans' },
                    { name: 'Kicks', value: 'kicks' },
                    { name: 'Role Changes', value: 'roles' },
                    { name: 'Channel Changes', value: 'channels' },
                    { name: 'Message Deletes', value: 'messages' }
                ))
            .addIntegerOption(opt => opt
                .setName('limit')
                .setDescription('Number of entries (max 25)')
                .setMinValue(1)
                .setMaxValue(25))),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'audit-log');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'recent': return handleRecent(interaction);
            case 'user': return handleUser(interaction);
            case 'target': return handleTarget(interaction);
            case 'type': return handleType(interaction);
        }
    }
};

async function handleRecent(interaction) {
    const limit = interaction.options.getInteger('limit') || 10;

    await interaction.deferReply({ ephemeral: true });

    try {
        const logs = await interaction.guild.fetchAuditLogs({ limit });

        if (logs.entries.size === 0) {
            return interaction.editReply({ content: '📋 No audit log entries found.' });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Recent Audit Log')
            .setColor(0x3498DB)
            .setFooter({ text: `Showing ${logs.entries.size} entries` })
            .setTimestamp();

        let description = '';
        for (const [, entry] of logs.entries) {
            const event = AUDIT_EVENTS[entry.action] || { name: 'Unknown', emoji: '❓' };
            const time = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
            const target = entry.target?.tag || entry.target?.name || entry.targetId || 'Unknown';

            description += `${event.emoji} **${event.name}**\n`;
            description += `└ By: ${entry.executor?.tag || 'Unknown'}\n`;
            description += `└ Target: ${target}\n`;
            description += `└ ${time}\n\n`;
        }

        embed.setDescription(description.substring(0, 4000));

        return interaction.editReply({ embeds: [embed] });
    } catch (e) {
        return interaction.editReply({ content: `❌ Failed to fetch audit logs: ${e.message}` });
    }
}

async function handleUser(interaction) {
    const user = interaction.options.getUser('user');
    const limit = interaction.options.getInteger('limit') || 10;

    await interaction.deferReply({ ephemeral: true });

    try {
        const logs = await interaction.guild.fetchAuditLogs({ limit: 100 });
        const filtered = [...logs.entries.values()].filter(e => e.executor?.id === user.id).slice(0, limit);

        if (filtered.length === 0) {
            return interaction.editReply({ content: `📋 No audit log entries by ${user.tag} found.` });
        }

        const embed = new EmbedBuilder()
            .setTitle(`📋 Actions by ${user.tag}`)
            .setColor(0x9B59B6)
            .setThumbnail(user.displayAvatarURL())
            .setFooter({ text: `Found ${filtered.length} entries` })
            .setTimestamp();

        let description = '';
        for (const entry of filtered) {
            const event = AUDIT_EVENTS[entry.action] || { name: 'Unknown', emoji: '❓' };
            const time = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
            const target = entry.target?.tag || entry.target?.name || entry.targetId || 'Unknown';

            description += `${event.emoji} **${event.name}** - ${time}\n`;
            description += `└ Target: ${target}\n\n`;
        }

        embed.setDescription(description.substring(0, 4000));

        return interaction.editReply({ embeds: [embed] });
    } catch (e) {
        return interaction.editReply({ content: `❌ Failed to fetch audit logs: ${e.message}` });
    }
}

async function handleTarget(interaction) {
    const user = interaction.options.getUser('user');
    const limit = interaction.options.getInteger('limit') || 10;

    await interaction.deferReply({ ephemeral: true });

    try {
        const logs = await interaction.guild.fetchAuditLogs({ limit: 100 });
        const filtered = [...logs.entries.values()].filter(e => e.targetId === user.id).slice(0, limit);

        if (filtered.length === 0) {
            return interaction.editReply({ content: `📋 No audit log entries targeting ${user.tag} found.` });
        }

        const embed = new EmbedBuilder()
            .setTitle(`📋 Actions on ${user.tag}`)
            .setColor(0xE74C3C)
            .setThumbnail(user.displayAvatarURL())
            .setFooter({ text: `Found ${filtered.length} entries` })
            .setTimestamp();

        let description = '';
        for (const entry of filtered) {
            const event = AUDIT_EVENTS[entry.action] || { name: 'Unknown', emoji: '❓' };
            const time = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;

            description += `${event.emoji} **${event.name}** - ${time}\n`;
            description += `└ By: ${entry.executor?.tag || 'Unknown'}\n`;
            if (entry.reason) {
                description += `└ Reason: ${entry.reason.substring(0, 50)}\n`;
            }
            description += '\n';
        }

        embed.setDescription(description.substring(0, 4000));

        return interaction.editReply({ embeds: [embed] });
    } catch (e) {
        return interaction.editReply({ content: `❌ Failed to fetch audit logs: ${e.message}` });
    }
}

async function handleType(interaction) {
    const actionType = interaction.options.getString('action');
    const limit = interaction.options.getInteger('limit') || 10;

    await interaction.deferReply({ ephemeral: true });

    let types = [];
    switch (actionType) {
        case 'bans':
            types = [AuditLogEvent.MemberBanAdd, AuditLogEvent.MemberBanRemove];
            break;
        case 'kicks':
            types = [AuditLogEvent.MemberKick];
            break;
        case 'roles':
            types = [AuditLogEvent.RoleCreate, AuditLogEvent.RoleDelete, AuditLogEvent.RoleUpdate, AuditLogEvent.MemberRoleUpdate];
            break;
        case 'channels':
            types = [AuditLogEvent.ChannelCreate, AuditLogEvent.ChannelDelete, AuditLogEvent.ChannelUpdate];
            break;
        case 'messages':
            types = [AuditLogEvent.MessageDelete, AuditLogEvent.MessageBulkDelete];
            break;
    }

    try {
        const logs = await interaction.guild.fetchAuditLogs({ limit: 100 });
        const filtered = [...logs.entries.values()].filter(e => types.includes(e.action)).slice(0, limit);

        if (filtered.length === 0) {
            return interaction.editReply({ content: `📋 No ${actionType} entries found.` });
        }

        const embed = new EmbedBuilder()
            .setTitle(`📋 ${actionType.charAt(0).toUpperCase() + actionType.slice(1)} Log`)
            .setColor(0x2ECC71)
            .setFooter({ text: `Found ${filtered.length} entries` })
            .setTimestamp();

        let description = '';
        for (const entry of filtered) {
            const event = AUDIT_EVENTS[entry.action] || { name: 'Unknown', emoji: '❓' };
            const time = `<t:${Math.floor(entry.createdTimestamp / 1000)}:R>`;
            const target = entry.target?.tag || entry.target?.name || entry.targetId || 'Unknown';

            description += `${event.emoji} **${event.name}** - ${time}\n`;
            description += `└ By: ${entry.executor?.tag || 'Unknown'}\n`;
            description += `└ Target: ${target}\n`;
            if (entry.reason) {
                description += `└ Reason: ${entry.reason.substring(0, 50)}\n`;
            }
            description += '\n';
        }

        embed.setDescription(description.substring(0, 4000));

        return interaction.editReply({ embeds: [embed] });
    } catch (e) {
        return interaction.editReply({ content: `❌ Failed to fetch audit logs: ${e.message}` });
    }
}

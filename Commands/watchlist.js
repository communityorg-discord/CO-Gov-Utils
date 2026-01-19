/**
 * /watchlist - User Watchlist Command
 * Flag users for monitoring, auto-alert when they join/message
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const watchlistManager = require('../utils/watchlistManager');
const auditLogger = require('../utils/auditLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('watchlist')
        .setDescription('Manage user watchlist for monitoring')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a user to the watchlist')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to watch')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Reason for watching')
                .setRequired(true))
            .addBooleanOption(opt => opt
                .setName('alert_join')
                .setDescription('Alert when user joins (default: true)'))
            .addBooleanOption(opt => opt
                .setName('alert_message')
                .setDescription('Alert when user messages (default: true)')))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a user from the watchlist')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to remove')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('check')
            .setDescription('Check if a user is on the watchlist')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to check')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('View the full watchlist')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'watchlist');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'add': return handleAdd(interaction);
            case 'remove': return handleRemove(interaction);
            case 'check': return handleCheck(interaction);
            case 'view': return handleView(interaction);
        }
    }
};

async function handleAdd(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const alertJoin = interaction.options.getBoolean('alert_join') ?? true;
    const alertMessage = interaction.options.getBoolean('alert_message') ?? true;

    // Check if already on watchlist
    const existing = watchlistManager.isOnWatchlist(interaction.guild.id, user.id);
    if (existing) {
        return interaction.reply({
            content: `⚠️ ${user.tag} is already on the watchlist.\nReason: ${existing.reason}`,
            ephemeral: true
        });
    }

    const result = watchlistManager.addToWatchlist(
        interaction.guild.id,
        user.id,
        user.tag,
        reason,
        interaction.user.id,
        interaction.user.tag,
        { alertOnJoin: alertJoin, alertOnMessage: alertMessage }
    );

    if (result.success) {
        // Log to audit channel
        await auditLogger.logWatchlistAction(interaction.client, interaction.guild.id, 'add', user, interaction.user, reason);

        const embed = new EmbedBuilder()
            .setTitle('👁️ User Added to Watchlist')
            .setColor(0xE74C3C)
            .setThumbnail(user.displayAvatarURL())
            .addFields(
                { name: '👤 User', value: `${user.tag}\n\`${user.id}\``, inline: true },
                { name: '👮 Added By', value: interaction.user.tag, inline: true },
                { name: '⚠️ Reason', value: reason, inline: false },
                { name: '🔔 Alerts', value: `Join: ${alertJoin ? '✅' : '❌'} | Message: ${alertMessage ? '✅' : '❌'}`, inline: false }
            )
            .setFooter({ text: 'Staff will be alerted when this user is active' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return interaction.reply({ content: `❌ Failed to add to watchlist: ${result.error}`, ephemeral: true });
}

async function handleRemove(interaction) {
    const user = interaction.options.getUser('user');

    const existing = watchlistManager.isOnWatchlist(interaction.guild.id, user.id);
    if (!existing) {
        return interaction.reply({ content: `❌ ${user.tag} is not on the watchlist.`, ephemeral: true });
    }

    const result = watchlistManager.removeFromWatchlist(interaction.guild.id, user.id);

    if (result.success) {
        // Log to audit channel
        await auditLogger.logWatchlistAction(interaction.client, interaction.guild.id, 'remove', user, interaction.user);

        const embed = new EmbedBuilder()
            .setTitle('✅ User Removed from Watchlist')
            .setColor(0x2ECC71)
            .addFields(
                { name: '👤 User', value: `${user.tag}\n\`${user.id}\``, inline: true },
                { name: '👮 Removed By', value: interaction.user.tag, inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return interaction.reply({ content: `❌ Failed to remove from watchlist.`, ephemeral: true });
}

async function handleCheck(interaction) {
    const user = interaction.options.getUser('user');
    const entry = watchlistManager.isOnWatchlist(interaction.guild.id, user.id);

    if (!entry) {
        return interaction.reply({
            content: `✅ ${user.tag} is **not** on the watchlist.`,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('👁️ Watchlist Entry')
        .setColor(0xE74C3C)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
            { name: '👤 User', value: `${user.tag}\n\`${user.id}\``, inline: true },
            { name: '👮 Added By', value: entry.added_by_tag || 'Unknown', inline: true },
            { name: '📅 Added', value: `<t:${Math.floor(new Date(entry.added_at).getTime() / 1000)}:R>`, inline: true },
            { name: '⚠️ Reason', value: entry.reason || 'No reason', inline: false },
            { name: '🔔 Alerts', value: `Join: ${entry.alert_on_join ? '✅' : '❌'} | Message: ${entry.alert_on_message ? '✅' : '❌'}`, inline: false }
        )
        .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleView(interaction) {
    const entries = watchlistManager.getGuildWatchlist(interaction.guild.id);

    if (entries.length === 0) {
        return interaction.reply({ content: '📋 The watchlist is empty.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('👁️ Server Watchlist')
        .setColor(0xE74C3C)
        .setFooter({ text: `Total: ${entries.length} user(s)` })
        .setTimestamp();

    // Show up to 15 entries
    const displayEntries = entries.slice(0, 15);
    let description = '';

    for (const entry of displayEntries) {
        const date = new Date(entry.added_at).toLocaleDateString();
        const alerts = [];
        if (entry.alert_on_join) alerts.push('📥');
        if (entry.alert_on_message) alerts.push('💬');

        description += `**<@${entry.user_id}>** ${alerts.join('')}\n`;
        description += `└ ${entry.reason?.substring(0, 50) || 'No reason'}${entry.reason?.length > 50 ? '...' : ''} • ${date}\n\n`;
    }

    if (entries.length > 15) {
        description += `\n*... and ${entries.length - 15} more*`;
    }

    embed.setDescription(description);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

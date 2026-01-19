/**
 * /invite-tracker - Invite Tracking Command
 * Track who invited whom
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const inviteTracker = require('../utils/inviteTracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite-tracker')
        .setDescription('Track server invites')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName('lookup')
            .setDescription('See who invited a user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to lookup')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('stats')
            .setDescription('View invite stats for a user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to check (defaults to you)')))
        .addSubcommand(sub => sub
            .setName('leaderboard')
            .setDescription('View top inviters'))
        .addSubcommand(sub => sub
            .setName('recent')
            .setDescription('View recent joins with invite info')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'invite-tracker');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'lookup': return handleLookup(interaction);
            case 'stats': return handleStats(interaction);
            case 'leaderboard': return handleLeaderboard(interaction);
            case 'recent': return handleRecent(interaction);
        }
    }
};

async function handleLookup(interaction) {
    const user = interaction.options.getUser('user');
    const invite = inviteTracker.getInvitedBy(interaction.guild.id, user.id);

    if (!invite) {
        return interaction.reply({
            content: `❓ No invite data found for ${user.tag}. They may have joined before tracking was enabled.`,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🔗 Invite Lookup')
        .setColor(0x3498DB)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
            { name: '👤 User', value: `${user.tag}\n\`${user.id}\``, inline: true },
            { name: '🎟️ Invite Code', value: invite.invite_code || 'Unknown', inline: true },
            { name: '👥 Invited By', value: invite.inviter_tag ? `${invite.inviter_tag}\n\`${invite.inviter_id}\`` : 'Unknown', inline: true },
            { name: '📅 Joined', value: `<t:${Math.floor(new Date(invite.joined_at).getTime() / 1000)}:R>`, inline: true }
        )
        .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStats(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const stats = inviteTracker.getInviterStats(interaction.guild.id, user.id);

    const embed = new EmbedBuilder()
        .setTitle(`📊 Invite Stats: ${user.tag}`)
        .setColor(0x9B59B6)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
            { name: '🎟️ Total Invites', value: String(stats.total), inline: true }
        )
        .setTimestamp();

    if (stats.recent.length > 0) {
        let recentList = '';
        for (const invite of stats.recent.slice(0, 5)) {
            const date = new Date(invite.joined_at).toLocaleDateString();
            recentList += `• ${invite.user_tag} - ${date}\n`;
        }
        embed.addFields({ name: '🕐 Recent Invites', value: recentList || 'None', inline: false });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLeaderboard(interaction) {
    const leaderboard = inviteTracker.getInviteLeaderboard(interaction.guild.id, 10);

    if (leaderboard.length === 0) {
        return interaction.reply({ content: '📊 No invite data yet.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 Invite Leaderboard')
        .setColor(0xF1C40F)
        .setTimestamp();

    let description = '';
    const medals = ['🥇', '🥈', '🥉'];

    for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const medal = medals[i] || `${i + 1}.`;
        description += `${medal} <@${entry.inviter_id}> - **${entry.invite_count}** invites\n`;
    }

    embed.setDescription(description);
    embed.setFooter({ text: `Top ${leaderboard.length} inviters` });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRecent(interaction) {
    const recent = inviteTracker.getRecentJoins(interaction.guild.id, 15);

    if (recent.length === 0) {
        return interaction.reply({ content: '📊 No tracked joins yet.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🕐 Recent Joins')
        .setColor(0x2ECC71)
        .setFooter({ text: `Showing ${recent.length} recent joins` })
        .setTimestamp();

    let description = '';
    for (const join of recent) {
        const time = `<t:${Math.floor(new Date(join.joined_at).getTime() / 1000)}:R>`;
        description += `<@${join.user_id}> - ${time}\n`;
        description += `└ Invited by: ${join.inviter_tag || 'Unknown'}\n\n`;
    }

    embed.setDescription(description);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

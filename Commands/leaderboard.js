/**
 * /leaderboard - Activity Leaderboards
 * Top users by messages, voice, invites
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const activityTracker = require('../utils/activityTracker');
const inviteTracker = require('../utils/inviteTracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View activity leaderboards')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(sub => sub
            .setName('messages')
            .setDescription('Top message senders')
            .addStringOption(opt => opt
                .setName('period')
                .setDescription('Time period')
                .addChoices(
                    { name: 'Today', value: '1' },
                    { name: 'This Week', value: '7' },
                    { name: 'This Month', value: '30' },
                    { name: 'All Time', value: '365' }
                )))
        .addSubcommand(sub => sub
            .setName('voice')
            .setDescription('Top voice users')
            .addStringOption(opt => opt
                .setName('period')
                .setDescription('Time period')
                .addChoices(
                    { name: 'Today', value: '1' },
                    { name: 'This Week', value: '7' },
                    { name: 'This Month', value: '30' },
                    { name: 'All Time', value: '365' }
                )))
        .addSubcommand(sub => sub
            .setName('invites')
            .setDescription('Top inviters')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'leaderboard');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'messages': return handleMessages(interaction);
            case 'voice': return handleVoice(interaction);
            case 'invites': return handleInvites(interaction);
        }
    }
};

async function handleMessages(interaction) {
    const period = parseInt(interaction.options.getString('period') || '30');
    const periodName = { 1: 'Today', 7: 'This Week', 30: 'This Month', 365: 'All Time' }[period];

    const top = activityTracker.getTopMessagers(interaction.guild.id, period, 10);

    if (top.length === 0) {
        return interaction.reply({ content: '📊 No message data yet.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 Message Leaderboard')
        .setColor(0xF1C40F)
        .setFooter({ text: periodName })
        .setTimestamp();

    const medals = ['🥇', '🥈', '🥉'];
    let description = '';

    for (let i = 0; i < top.length; i++) {
        const medal = medals[i] || `${i + 1}.`;
        description += `${medal} <@${top[i].user_id}> - **${top[i].total.toLocaleString()}** messages\n`;
    }

    embed.setDescription(description);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleVoice(interaction) {
    const period = parseInt(interaction.options.getString('period') || '30');
    const periodName = { 1: 'Today', 7: 'This Week', 30: 'This Month', 365: 'All Time' }[period];

    const top = activityTracker.getTopVoice(interaction.guild.id, period, 10);

    if (top.length === 0) {
        return interaction.reply({ content: '📊 No voice data yet.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 Voice Leaderboard')
        .setColor(0x9B59B6)
        .setFooter({ text: periodName })
        .setTimestamp();

    const medals = ['🥇', '🥈', '🥉'];
    let description = '';

    for (let i = 0; i < top.length; i++) {
        const medal = medals[i] || `${i + 1}.`;
        const hours = Math.floor(top[i].total / 60);
        const mins = top[i].total % 60;
        const time = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        description += `${medal} <@${top[i].user_id}> - **${time}**\n`;
    }

    embed.setDescription(description);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleInvites(interaction) {
    const top = inviteTracker.getInviteLeaderboard(interaction.guild.id, 10);

    if (top.length === 0) {
        return interaction.reply({ content: '📊 No invite data yet.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 Invite Leaderboard')
        .setColor(0x2ECC71)
        .setTimestamp();

    const medals = ['🥇', '🥈', '🥉'];
    let description = '';

    for (let i = 0; i < top.length; i++) {
        const medal = medals[i] || `${i + 1}.`;
        description += `${medal} <@${top[i].inviter_id}> - **${top[i].invite_count}** invites\n`;
    }

    embed.setDescription(description);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

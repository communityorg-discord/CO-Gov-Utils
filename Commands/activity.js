/**
 * /activity - User Activity Command
 * View activity stats for users, channels, and server
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const activityTracker = require('../utils/activityTracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('View user and server activity statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(sub => sub
            .setName('user')
            .setDescription('View activity for a specific user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to check')
                .setRequired(true))
            .addIntegerOption(opt => opt
                .setName('days')
                .setDescription('Days to look back (default 30)')
                .setMinValue(1)
                .setMaxValue(90)))
        .addSubcommand(sub => sub
            .setName('server')
            .setDescription('View server-wide activity')
            .addIntegerOption(opt => opt
                .setName('days')
                .setDescription('Days to look back (default 30)')
                .setMinValue(1)
                .setMaxValue(90)))
        .addSubcommand(sub => sub
            .setName('me')
            .setDescription('View your own activity')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'activity');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'user': return handleUser(interaction);
            case 'server': return handleServer(interaction);
            case 'me': return handleMe(interaction);
        }
    }
};

async function handleUser(interaction) {
    const user = interaction.options.getUser('user');
    const days = interaction.options.getInteger('days') || 30;

    const stats = activityTracker.getUserActivity(interaction.guild.id, user.id, days);
    const currentSession = activityTracker.getCurrentSessionTime(interaction.guild.id, user.id);
    const totalVoice = stats.totalVoice + currentSession;

    const embed = new EmbedBuilder()
        .setTitle(`📊 Activity: ${user.tag}`)
        .setColor(0x3498DB)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
            { name: '💬 Messages', value: stats.totalMessages.toLocaleString(), inline: true },
            { name: '🎙️ Voice Time', value: formatMinutes(totalVoice) + (currentSession > 0 ? ' 🔴' : ''), inline: true },
            { name: '📅 Active Days', value: `${stats.activeDays}/${days}`, inline: true }
        )
        .setFooter({ text: currentSession > 0 ? `Last ${days} days • Currently in VC (${currentSession}m)` : `Last ${days} days` })
        .setTimestamp();

    // Add daily breakdown
    if (stats.daily.length > 0) {
        let dailyText = '';
        for (const day of stats.daily.slice(0, 7)) {
            dailyText += `${day.date}: ${day.message_count} msgs, ${formatMinutes(day.voice_minutes)}\n`;
        }
        embed.addFields({ name: '📈 Recent Days', value: dailyText || 'No data', inline: false });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleServer(interaction) {
    const days = interaction.options.getInteger('days') || 30;

    const stats = activityTracker.getGuildActivity(interaction.guild.id, days);

    const embed = new EmbedBuilder()
        .setTitle(`📊 Server Activity`)
        .setColor(0x2ECC71)
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
            { name: '💬 Total Messages', value: stats.totalMessages.toLocaleString(), inline: true },
            { name: '🎙️ Total Voice', value: formatMinutes(stats.totalVoice), inline: true },
            { name: '👥 Active Users', value: stats.uniqueUsers.toLocaleString(), inline: true }
        )
        .setFooter({ text: `Last ${days} days` })
        .setTimestamp();

    // Add daily breakdown
    if (stats.daily.length > 0) {
        let dailyText = '';
        for (const day of stats.daily) {
            dailyText += `${day.date}: ${day.messages?.toLocaleString() || 0} msgs\n`;
        }
        embed.addFields({ name: '📈 Last 7 Days', value: dailyText || 'No data', inline: false });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleMe(interaction) {
    const stats = activityTracker.getUserActivity(interaction.guild.id, interaction.user.id, 30);
    const currentSession = activityTracker.getCurrentSessionTime(interaction.guild.id, interaction.user.id);
    const totalVoice = stats.totalVoice + currentSession;

    const embed = new EmbedBuilder()
        .setTitle(`📊 Your Activity`)
        .setColor(0x9B59B6)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
            { name: '💬 Messages', value: stats.totalMessages.toLocaleString(), inline: true },
            { name: '🎙️ Voice Time', value: formatMinutes(totalVoice) + (currentSession > 0 ? ' 🔴' : ''), inline: true },
            { name: '📅 Active Days', value: `${stats.activeDays}/30`, inline: true }
        )
        .setFooter({ text: currentSession > 0 ? 'Last 30 days • Currently in VC (' + currentSession + 'm)' : 'Last 30 days' })
        .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

function formatMinutes(minutes) {
    if (!minutes || minutes === 0) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

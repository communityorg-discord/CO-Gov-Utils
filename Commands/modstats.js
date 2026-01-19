/**
 * /modstats - Moderator Statistics
 * View mod action counts and team performance
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const { query, queryOne } = require('../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('modstats')
        .setDescription('View moderator action statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(sub => sub
            .setName('user')
            .setDescription('View stats for a specific moderator')
            .addUserOption(opt => opt
                .setName('mod')
                .setDescription('Moderator to check')
                .setRequired(true))
            .addIntegerOption(opt => opt
                .setName('days')
                .setDescription('Days to look back')
                .setMinValue(1)
                .setMaxValue(90)))
        .addSubcommand(sub => sub
            .setName('team')
            .setDescription('View all moderators stats'))
        .addSubcommand(sub => sub
            .setName('actions')
            .setDescription('View action breakdown')
            .addIntegerOption(opt => opt
                .setName('days')
                .setDescription('Days to look back')
                .setMinValue(1)
                .setMaxValue(90)))
        .addSubcommand(sub => sub
            .setName('dashboard')
            .setDescription('Visual analytics dashboard')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'modstats');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'user': return handleUser(interaction);
            case 'team': return handleTeam(interaction);
            case 'actions': return handleActions(interaction);
            case 'dashboard': return handleDashboard(interaction);
        }
    }
};

async function handleUser(interaction) {
    const mod = interaction.options.getUser('mod');
    const days = interaction.options.getInteger('days') || 30;

    try {
        // Get action counts by type
        const actions = query(`
      SELECT action, COUNT(*) as count
      FROM cases
      WHERE guild_id = ? AND moderator_id = ?
      AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY action
      ORDER BY count DESC
    `, [interaction.guild.id, mod.id, days]);

        const total = queryOne(`
      SELECT COUNT(*) as count
      FROM cases
      WHERE guild_id = ? AND moderator_id = ?
      AND created_at >= datetime('now', '-' || ? || ' days')
    `, [interaction.guild.id, mod.id, days]);

        const embed = new EmbedBuilder()
            .setTitle(`📊 Mod Stats: ${mod.tag}`)
            .setColor(0x3498DB)
            .setThumbnail(mod.displayAvatarURL())
            .addFields(
                { name: '📋 Total Actions', value: String(total?.count || 0), inline: true }
            )
            .setFooter({ text: `Last ${days} days` })
            .setTimestamp();

        if (actions.length > 0) {
            let breakdown = '';
            for (const action of actions) {
                const emoji = getActionEmoji(action.action);
                breakdown += `${emoji} ${action.action}: **${action.count}**\n`;
            }
            embed.addFields({ name: '📈 Breakdown', value: breakdown, inline: false });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
        return interaction.reply({ content: '❌ Failed to fetch stats.', ephemeral: true });
    }
}

async function handleTeam(interaction) {
    try {
        const mods = query(`
      SELECT moderator_id, moderator_tag, COUNT(*) as total
      FROM cases
      WHERE guild_id = ?
      AND created_at >= datetime('now', '-30 days')
      GROUP BY moderator_id
      ORDER BY total DESC
      LIMIT 15
    `, [interaction.guild.id]);

        if (mods.length === 0) {
            return interaction.reply({ content: '📊 No moderation actions in the last 30 days.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('👮 Moderation Team Stats')
            .setColor(0x2ECC71)
            .setFooter({ text: 'Last 30 days' })
            .setTimestamp();

        let description = '';
        for (let i = 0; i < mods.length; i++) {
            const rank = i + 1;
            description += `**${rank}.** <@${mods[i].moderator_id}> - **${mods[i].total}** actions\n`;
        }

        embed.setDescription(description);

        return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
        return interaction.reply({ content: '❌ Failed to fetch team stats.', ephemeral: true });
    }
}

async function handleActions(interaction) {
    const days = interaction.options.getInteger('days') || 30;

    try {
        const actions = query(`
      SELECT action, COUNT(*) as count
      FROM cases
      WHERE guild_id = ?
      AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY action
      ORDER BY count DESC
    `, [interaction.guild.id, days]);

        const total = queryOne(`
      SELECT COUNT(*) as count
      FROM cases
      WHERE guild_id = ?
      AND created_at >= datetime('now', '-' || ? || ' days')
    `, [interaction.guild.id, days]);

        const embed = new EmbedBuilder()
            .setTitle('📊 Action Breakdown')
            .setColor(0xE74C3C)
            .addFields(
                { name: '📋 Total Actions', value: String(total?.count || 0), inline: true }
            )
            .setFooter({ text: `Last ${days} days` })
            .setTimestamp();

        if (actions.length > 0) {
            let breakdown = '';
            for (const action of actions) {
                const emoji = getActionEmoji(action.action);
                const percent = total?.count ? Math.round((action.count / total.count) * 100) : 0;
                breakdown += `${emoji} **${action.action}**: ${action.count} (${percent}%)\n`;
            }
            embed.addFields({ name: '📈 By Type', value: breakdown, inline: false });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
        return interaction.reply({ content: '❌ Failed to fetch action stats.', ephemeral: true });
    }
}

function getActionEmoji(action) {
    const emojis = {
        'WARN': '⚠️',
        'MUTE': '🔇',
        'UNMUTE': '🔊',
        'KICK': '👢',
        'BAN': '🔨',
        'UNBAN': '✅',
        'SOFTBAN': '🔨',
        'NOTE': '📝'
    };
    return emojis[action?.toUpperCase()] || '📋';
}

/**
 * Build a text-based bar chart
 */
function buildBar(value, max, length = 10) {
    if (max === 0) return '░'.repeat(length);
    const filled = Math.round((value / max) * length);
    return '█'.repeat(filled) + '░'.repeat(length - filled);
}

async function handleDashboard(interaction) {
    try {
        // Get stats for last 7 days
        const weeklyActions = query(`
          SELECT date(created_at) as day, COUNT(*) as count
          FROM cases
          WHERE guild_id = ?
          AND created_at >= datetime('now', '-7 days')
          GROUP BY date(created_at)
          ORDER BY day ASC
        `, [interaction.guild.id]);

        // Get top mods this week
        const topMods = query(`
          SELECT moderator_id, COUNT(*) as count
          FROM cases
          WHERE guild_id = ?
          AND created_at >= datetime('now', '-7 days')
          GROUP BY moderator_id
          ORDER BY count DESC
          LIMIT 5
        `, [interaction.guild.id]);

        // Get action breakdown
        const actions = query(`
          SELECT action, COUNT(*) as count
          FROM cases
          WHERE guild_id = ?
          AND created_at >= datetime('now', '-7 days')
          GROUP BY action
          ORDER BY count DESC
        `, [interaction.guild.id]);

        // Get totals
        const thisWeek = queryOne(`
          SELECT COUNT(*) as count FROM cases
          WHERE guild_id = ? AND created_at >= datetime('now', '-7 days')
        `, [interaction.guild.id]);

        const lastWeek = queryOne(`
          SELECT COUNT(*) as count FROM cases
          WHERE guild_id = ?
          AND created_at >= datetime('now', '-14 days')
          AND created_at < datetime('now', '-7 days')
        `, [interaction.guild.id]);

        const thisWeekCount = thisWeek?.count || 0;
        const lastWeekCount = lastWeek?.count || 0;
        const change = lastWeekCount > 0 ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100) : 0;
        const trend = change > 0 ? `📈 +${change}%` : change < 0 ? `📉 ${change}%` : '➖ 0%';

        const embed = new EmbedBuilder()
            .setTitle('📊 Mod Analytics Dashboard')
            .setColor(0x9B59B6)
            .setTimestamp();

        // Summary
        embed.addFields(
            { name: '📅 This Week', value: String(thisWeekCount), inline: true },
            { name: '📆 Last Week', value: String(lastWeekCount), inline: true },
            { name: '📈 Trend', value: trend, inline: true }
        );

        // Daily activity chart
        if (weeklyActions.length > 0) {
            const maxDaily = Math.max(...weeklyActions.map(d => d.count));
            let chart = '```\n';
            for (const day of weeklyActions) {
                const dayName = new Date(day.day).toLocaleDateString('en-US', { weekday: 'short' });
                chart += `${dayName} ${buildBar(day.count, maxDaily, 15)} ${day.count}\n`;
            }
            chart += '```';
            embed.addFields({ name: '📦 Daily Activity', value: chart, inline: false });
        }

        // Top moderators
        if (topMods.length > 0) {
            const maxMod = topMods[0]?.count || 1;
            let modChart = '';
            for (let i = 0; i < topMods.length; i++) {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
                modChart += `${medal} <@${topMods[i].moderator_id}> \`${buildBar(topMods[i].count, maxMod, 8)}\` **${topMods[i].count}**\n`;
            }
            embed.addFields({ name: '🏆 Top Moderators', value: modChart, inline: false });
        }

        // Action breakdown
        if (actions.length > 0) {
            const maxAction = actions[0]?.count || 1;
            let actionChart = '';
            for (const action of actions.slice(0, 6)) {
                const emoji = getActionEmoji(action.action);
                actionChart += `${emoji} ${action.action} \`${buildBar(action.count, maxAction, 8)}\` **${action.count}**\n`;
            }
            embed.addFields({ name: '📋 Actions', value: actionChart, inline: false });
        }

        embed.setFooter({ text: 'Last 7 days | Refresh with /modstats dashboard' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
        console.error('[ModStats] Dashboard error:', e.message);
        return interaction.reply({ content: '❌ Failed to load dashboard.', ephemeral: true });
    }
}

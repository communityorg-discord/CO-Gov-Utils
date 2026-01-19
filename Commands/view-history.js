/**
 * /view-history - View a user's case history
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const caseManager = require('../utils/caseManager');
const { hasPermission, buildPermissionDeniedEmbed } = require('../utils/advancedPermissions');
const { ACTION_COLORS, ACTION_EMOJIS } = require('../utils/modLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('view-history')
    .setDescription('View a user\'s moderation history')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to view history for')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('filter')
        .setDescription('Filter by action type')
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Warns', value: 'warn' },
          { name: 'Mutes', value: 'mute' },
          { name: 'Kicks', value: 'kick' },
          { name: 'Bans', value: 'ban' }
        )),

  async execute(interaction) {
    const permCheck = hasPermission(interaction.member, 'view-history');
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('view-history', permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('user');
    const filter = interaction.options.getString('filter') || 'all';

    await interaction.deferReply({ ephemeral: true });

    // Get active cases
    const cases = caseManager.getUserCases(interaction.guild.id, target.id)
      .filter(c => filter === 'all' || c.action_type === filter);

    if (cases.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`📋 History for ${target.tag}`)
        .setColor(0x27AE60)
        .setDescription('No moderation history found.')
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // Get stats
    const stats = {
      warn: cases.filter(c => c.action_type === 'warn').length,
      mute: cases.filter(c => c.action_type === 'mute').length,
      kick: cases.filter(c => c.action_type === 'kick').length,
      ban: cases.filter(c => c.action_type === 'ban').length
    };
    const totalPoints = caseManager.getUserWarnPoints(interaction.guild.id, target.id);

    // Build case list
    const caseList = cases.slice(0, 15).map(c => {
      const emoji = ACTION_EMOJIS[c.action_type] || '📋';
      const date = new Date(c.created_at).toLocaleDateString();
      const reason = c.reason?.length > 50 ? c.reason.substring(0, 50) + '...' : (c.reason || 'No reason');
      return `${emoji} \`${c.case_id}\` - ${c.action_type.toUpperCase()} (${date})\n   └ ${reason}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`📋 History for ${target.tag}`)
      .setColor(cases.length > 5 ? 0xE74C3C : (cases.length > 2 ? 0xF39C12 : 0x3498DB))
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '📊 Statistics', value: `⚠️ Warns: ${stats.warn}\n🔇 Mutes: ${stats.mute}\n👢 Kicks: ${stats.kick}\n🔨 Bans: ${stats.ban}`, inline: true },
        { name: '⚠️ Warn Points', value: `${totalPoints}/${process.env.MAX_WARN_POINTS || 10}`, inline: true },
        { name: '📋 Total Cases', value: String(cases.length), inline: true }
      )
      .setDescription(caseList)
      .setFooter({ text: `Showing ${Math.min(cases.length, 15)} of ${cases.length} cases` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};

/**
 * /deleted-history - View deleted cases for a user
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const caseManager = require('../utils/caseManager');
const { hasPermission, buildPermissionDeniedEmbed } = require('../utils/advancedPermissions');
const { ACTION_EMOJIS } = require('../utils/modLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deleted-history')
    .setDescription('View deleted cases for a user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to view deleted history for')
        .setRequired(true)),

  async execute(interaction) {
    const permCheck = hasPermission(interaction.member, 'deleted-history');
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('deleted-history', permCheck.requiredLevel || 'SENIOR_MOD', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    // Get deleted cases
    const deletedCases = caseManager.getDeletedCases(interaction.guild.id, target.id);

    if (deletedCases.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`🗑️ Deleted History for ${target.tag}`)
        .setColor(0x27AE60)
        .setDescription('No deleted cases found.')
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // Build case list
    const caseList = deletedCases.slice(0, 15).map(c => {
      const emoji = ACTION_EMOJIS[c.action_type] || '📋';
      const deletedDate = new Date(c.deleted_at).toLocaleDateString();
      const reason = c.reason?.length > 50 ? c.reason.substring(0, 50) + '...' : (c.reason || 'No reason');
      return `${emoji} \`${c.case_id}\` - ${c.action_type.toUpperCase()}\n   └ Deleted: ${deletedDate} by <@${c.deleted_by}>\n   └ Original reason: ${reason}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`🗑️ Deleted History for ${target.tag}`)
      .setColor(0x7F8C8D)
      .setThumbnail(target.displayAvatarURL())
      .setDescription(caseList)
      .addFields(
        { name: '📋 Deleted Cases', value: String(deletedCases.length), inline: true },
        { name: '⚠️ Note', value: 'Use `/case restore <id>` to restore a deleted case', inline: false }
      )
      .setFooter({ text: `Voided cases are not shown here` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};

/**
 * /warn - Issue a warning to a user
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const caseManager = require('../utils/caseManager');
const { hasPermission, buildPermissionDeniedEmbed, logCommand, dmSuperusers, canModerate } = require('../utils/advancedPermissions');
const { logModAction, formatDuration } = require('../utils/modLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('evidence')
        .setDescription('Evidence or additional notes')),

  async execute(interaction) {
    // Permission check using advanced permissions
    const permCheck = hasPermission(interaction.member, 'warn');
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('warn', permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const evidence = interaction.options.getString('evidence');

    // Get target member
    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
    }

    // Check if can moderate target
    if (!canModerate(interaction.member, targetMember)) {
      return interaction.reply({
        content: '❌ You cannot warn this user (insufficient permissions).',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      // Create case
      const caseData = caseManager.createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        userTag: target.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        actionType: 'warn',
        reason,
        evidence
      });

      // Get total warnings for context
      const userCases = caseManager.getUserCases(interaction.guild.id, target.id);
      const totalWarns = userCases.filter(c => c.action_type === 'warn' && c.status === 'active').length;

      // Try to DM the user
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle('⚠️ Warning Received')
          .setColor(0xF39C12)
          .setDescription(`You have received a warning in **${interaction.guild.name}**`)
          .addFields(
            { name: 'Reason', value: reason, inline: false },
            { name: 'Case ID', value: caseData.case_id, inline: true }
          )
          .setTimestamp();

        await target.send({ embeds: [dmEmbed] });
      } catch (e) {
        // DM failed, continue anyway
      }

      // Log action
      await logModAction(interaction.client, interaction.guild.id, caseData);
      logCommand(interaction.guild.id, interaction.user.id, interaction.user.tag, 'warn', null, target.id, target.tag, { reason }, 'success');

      // DM superusers
      const superuserEmbed = new EmbedBuilder()
        .setTitle('📋 Moderation Log: WARN')
        .setColor(0xF39C12)
        .addFields(
          { name: 'Server', value: interaction.guild.name, inline: true },
          { name: 'Target', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Case ID', value: caseData.case_id, inline: true },
          { name: 'Total Warnings', value: String(totalWarns), inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();
      await dmSuperusers(interaction.client, superuserEmbed);

      // Response embed
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Warning Issued')
        .setColor(0xF39C12)
        .addFields(
          { name: 'User', value: `${target} (${target.tag})`, inline: true },
          { name: 'Total Warnings', value: String(totalWarns), inline: true },
          { name: 'Case ID', value: caseData.case_id, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: `Warned by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[Warn] Error:', error);
      return interaction.editReply({ content: '❌ Failed to issue warning.' });
    }
  }
};

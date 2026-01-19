/**
 * /unban - Unban a user from the server
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const caseManager = require('../utils/caseManager');
const { hasPermission, buildPermissionDeniedEmbed } = require('../utils/advancedPermissions');
const { logModAction, logAudit } = require('../utils/modLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server')
    .addStringOption(opt =>
      opt.setName('user-id')
        .setDescription('User ID to unban')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for unban')),

  async execute(interaction) {
    const permCheck = hasPermission(interaction.member, 'unban');
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('unban', permCheck.requiredLevel || 'SENIOR_MOD', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const userId = interaction.options.getString('user-id');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Validate user ID
    if (!/^\d{17,19}$/.test(userId)) {
      return interaction.reply({ content: '❌ Invalid user ID format.', ephemeral: true });
    }

    await interaction.deferReply();

    try {
      // Check if user is banned
      const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
      
      if (!ban) {
        return interaction.editReply({ content: '❌ This user is not banned.' });
      }

      // Unban the user
      await interaction.guild.members.unban(userId, `${interaction.user.tag}: ${reason}`);

      // Create case
      const caseData = caseManager.createCase({
        guildId: interaction.guild.id,
        globalCase: false,
        userId: userId,
        userTag: ban.user?.tag || userId,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        actionType: 'unban',
        reason
      });

      // Log
      await logModAction(interaction.client, interaction.guild.id, caseData, 'unban');
      logAudit(interaction.guild.id, 'UNBAN', interaction.user.id, interaction.user.tag, userId, ban.user?.tag || userId, { reason, caseId: caseData.case_id });

      const embed = new EmbedBuilder()
        .setTitle('✅ User Unbanned')
        .setColor(0x27AE60)
        .addFields(
          { name: 'User', value: `${ban.user?.tag || userId} (${userId})`, inline: true },
          { name: 'Case ID', value: caseData.case_id, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: `Unbanned by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[Unban] Error:', error);
      return interaction.editReply({ content: '❌ Failed to unban user.' });
    }
  }
};

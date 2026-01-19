/**
 * /ban - Ban a user from the server
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const caseManager = require('../utils/caseManager');
const { hasPermission, buildPermissionDeniedEmbed, logCommand, dmSuperusers, canModerate } = require('../utils/advancedPermissions');
const { logModAction } = require('../utils/modLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('delete-days')
        .setDescription('Days of messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7))
    .addStringOption(option =>
      option.setName('evidence')
        .setDescription('Evidence or additional notes')),

  async execute(interaction) {
    const permCheck = hasPermission(interaction.member, 'ban');
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('ban', permCheck.requiredLevel || 'SENIOR_MOD', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const deleteDays = interaction.options.getInteger('delete-days') || 0;
    const evidence = interaction.options.getString('evidence');

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);

    // Check permissions only if user is in server
    if (targetMember) {
      if (!canModerate(interaction.member, targetMember)) {
        return interaction.reply({
          content: '❌ You cannot ban this user (insufficient permissions).',
          ephemeral: true
        });
      }

      if (!targetMember.bannable) {
        return interaction.reply({
          content: '❌ I cannot ban this user (bot lacks permissions or user has higher role).',
          ephemeral: true
        });
      }
    }

    await interaction.deferReply();

    try {
      // Create case first
      const caseData = caseManager.createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        userTag: target.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        actionType: 'ban',
        reason,
        evidence
      });

      // DM user before ban (if in server)
      if (targetMember) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle('🔨 You Have Been Banned')
            .setColor(0xC0392B)
            .setDescription(`You have been banned from **${interaction.guild.name}**`)
            .addFields(
              { name: 'Reason', value: reason, inline: false },
              { name: 'Case ID', value: caseData.case_id, inline: true }
            )
            .setTimestamp();

          await target.send({ embeds: [dmEmbed] });
        } catch (e) { }
      }

      // Ban the user
      await interaction.guild.members.ban(target.id, {
        deleteMessageSeconds: deleteDays * 24 * 60 * 60,
        reason: `[${caseData.case_id}] ${reason}`
      });

      // Log
      await logModAction(interaction.client, interaction.guild.id, caseData);
      logCommand(interaction.guild.id, interaction.user.id, interaction.user.tag, 'ban', null, target.id, target.tag, { reason, deleteDays }, 'success');

      // DM superusers
      const superuserEmbed = new EmbedBuilder()
        .setTitle('📋 Moderation Log: BAN')
        .setColor(0xC0392B)
        .addFields(
          { name: 'Server', value: interaction.guild.name, inline: true },
          { name: 'Target', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Case ID', value: caseData.case_id, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();
      await dmSuperusers(interaction.client, superuserEmbed);

      const embed = new EmbedBuilder()
        .setTitle('🔨 User Banned')
        .setColor(0xC0392B)
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Case ID', value: caseData.case_id, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: `Banned by ${interaction.user.tag}` })
        .setTimestamp();

      if (deleteDays > 0) {
        embed.addFields({ name: 'Messages Deleted', value: `${deleteDays} day(s)`, inline: true });
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[Ban] Error:', error);
      return interaction.editReply({ content: '❌ Failed to ban user.' });
    }
  }
};

/**
 * /kick - Kick a user from the server
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const caseManager = require('../utils/caseManager');
const { hasPermission, buildPermissionDeniedEmbed, logCommand, dmSuperusers, canModerate } = require('../utils/advancedPermissions');
const { logModAction } = require('../utils/modLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to kick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the kick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('evidence')
        .setDescription('Evidence or additional notes')),

  async execute(interaction) {
    const permCheck = hasPermission(interaction.member, 'kick');
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('kick', permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const evidence = interaction.options.getString('evidence');

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
    }

    if (!canModerate(interaction.member, targetMember)) {
      return interaction.reply({
        content: '❌ You cannot kick this user (insufficient permissions).',
        ephemeral: true
      });
    }

    if (!targetMember.kickable) {
      return interaction.reply({
        content: '❌ I cannot kick this user (bot lacks permissions or user has higher role).',
        ephemeral: true
      });
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
        actionType: 'kick',
        reason,
        evidence
      });

      // DM user before kick
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle('👢 You Have Been Kicked')
          .setColor(0xE74C3C)
          .setDescription(`You have been kicked from **${interaction.guild.name}**`)
          .addFields(
            { name: 'Reason', value: reason, inline: false },
            { name: 'Case ID', value: caseData.case_id, inline: true }
          )
          .setTimestamp();

        await target.send({ embeds: [dmEmbed] });
      } catch (e) { }

      // Kick the user
      await targetMember.kick(`[${caseData.case_id}] ${reason}`);

      // Log
      await logModAction(interaction.client, interaction.guild.id, caseData);
      logCommand(interaction.guild.id, interaction.user.id, interaction.user.tag, 'kick', null, target.id, target.tag, { reason }, 'success');

      // DM superusers
      const superuserEmbed = new EmbedBuilder()
        .setTitle('📋 Moderation Log: KICK')
        .setColor(0xE74C3C)
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
        .setTitle('👢 User Kicked')
        .setColor(0xE74C3C)
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Case ID', value: caseData.case_id, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: `Kicked by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[Kick] Error:', error);
      return interaction.editReply({ content: '❌ Failed to kick user.' });
    }
  }
};

/**
 * /mute - Mute a user (timeout)
 * Auto-creates muted role if it doesn't exist
 */

const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const caseManager = require('../utils/caseManager');
const { hasPermission, buildPermissionDeniedEmbed, logCommand, dmSuperusers, canModerate } = require('../utils/advancedPermissions');
const { logModAction, formatDuration } = require('../utils/modLogger');
const { execute } = require('../utils/database');
const { getGuildConfig, setGuildConfig } = require('./setup');

/**
 * Get or create the muted role
 */
async function getOrCreateMutedRole(guild) {
  const config = getGuildConfig(guild.id);

  // Check if we have a configured muted role
  if (config.mutedRoleId) {
    const existingRole = guild.roles.cache.get(config.mutedRoleId);
    if (existingRole) return existingRole;
  }

  // Check if a "Muted" role already exists
  let mutedRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');

  if (!mutedRole) {
    // Create the muted role
    mutedRole = await guild.roles.create({
      name: 'Muted',
      color: 0x7F8C8D,
      permissions: [],
      reason: 'Auto-created by Government Utilities for mute functionality'
    });

    // Set permissions on all channels
    for (const channel of guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
        await channel.permissionOverwrites.edit(mutedRole, {
          SendMessages: false,
          AddReactions: false,
          Speak: false
        }).catch(() => { });
      }
    }

    console.log(`[Mute] Auto-created Muted role in ${guild.name}`);
  }

  // Save to config
  setGuildConfig(guild.id, { mutedRoleId: mutedRole.id });

  return mutedRole;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute (timeout) a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to mute')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the mute')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Duration in minutes (0 = indefinite, max 40320 = 28 days)')
        .setMinValue(0)
        .setMaxValue(40320))
    .addStringOption(option =>
      option.setName('evidence')
        .setDescription('Evidence or additional notes')),

  async execute(interaction) {
    const permCheck = hasPermission(interaction.member, 'mute');
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('mute', permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const duration = interaction.options.getInteger('duration') ?? (parseInt(process.env.DEFAULT_MUTE_DURATION) || 60);
    const evidence = interaction.options.getString('evidence');

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
    }

    if (!canModerate(interaction.member, targetMember)) {
      return interaction.reply({
        content: '❌ You cannot mute this user (insufficient permissions).',
        ephemeral: true
      });
    }

    if (!targetMember.moderatable) {
      return interaction.reply({
        content: '❌ I cannot mute this user (bot lacks permissions or user has higher role).',
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
        actionType: 'mute',
        reason,
        evidence,
        duration
      });

      // Apply timeout (Discord max is 28 days)
      const timeoutMs = duration > 0 ? Math.min(duration * 60 * 1000, 28 * 24 * 60 * 60 * 1000) : 28 * 24 * 60 * 60 * 1000;
      await targetMember.timeout(timeoutMs, `[${caseData.case_id}] ${reason}`);

      // Track active mute
      const expiresAt = duration > 0 ? new Date(Date.now() + duration * 60 * 1000).toISOString() : null;
      execute(`
        INSERT INTO active_mutes (guild_id, user_id, case_id, expires_at)
        VALUES (?, ?, ?, ?)
      `, [interaction.guild.id, target.id, caseData.case_id, expiresAt]);

      // DM user
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle('🔇 You Have Been Muted')
          .setColor(0xE67E22)
          .setDescription(`You have been muted in **${interaction.guild.name}**`)
          .addFields(
            { name: 'Reason', value: reason, inline: false },
            { name: 'Duration', value: formatDuration(duration), inline: true },
            { name: 'Case ID', value: caseData.case_id, inline: true }
          )
          .setTimestamp();

        await target.send({ embeds: [dmEmbed] });
      } catch (e) { }

      // Log
      await logModAction(interaction.client, interaction.guild.id, caseData);
      logCommand(interaction.guild.id, interaction.user.id, interaction.user.tag, 'mute', null, target.id, target.tag, { reason, duration }, 'success');

      // DM superusers
      const superuserEmbed = new EmbedBuilder()
        .setTitle('📋 Moderation Log: MUTE')
        .setColor(0xE67E22)
        .addFields(
          { name: 'Server', value: interaction.guild.name, inline: true },
          { name: 'Target', value: `${target.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: interaction.user.tag, inline: true },
          { name: 'Case ID', value: caseData.case_id, inline: true },
          { name: 'Duration', value: formatDuration(duration), inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();
      await dmSuperusers(interaction.client, superuserEmbed);

      const embed = new EmbedBuilder()
        .setTitle('🔇 User Muted')
        .setColor(0xE67E22)
        .addFields(
          { name: 'User', value: `${target} (${target.tag})`, inline: true },
          { name: 'Duration', value: formatDuration(duration), inline: true },
          { name: 'Case ID', value: caseData.case_id, inline: true },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: `Muted by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[Mute] Error:', error);
      return interaction.editReply({ content: '❌ Failed to mute user.' });
    }
  }
};

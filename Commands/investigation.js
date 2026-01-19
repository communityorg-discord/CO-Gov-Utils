/**
 * /investigation - Open/close investigations with dedicated channels
 */

const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const caseManager = require('../utils/caseManager');
const { hasPermission, buildPermissionDeniedEmbed } = require('../utils/advancedPermissions');
const { logModAction, logAudit } = require('../utils/modLogger');
const { execute, query, queryOne } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('investigation')
    .setDescription('Manage investigations')
    .addSubcommand(sub =>
      sub.setName('open')
        .setDescription('Open an investigation on a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to investigate')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for investigation')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Close an investigation')
        .addStringOption(opt =>
          opt.setName('case-id')
            .setDescription('Case ID of the investigation')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('outcome')
            .setDescription('Outcome of the investigation')
            .setRequired(true)
            .addChoices(
              { name: 'Cleared - No action needed', value: 'cleared' },
              { name: 'Warned - Issue warning', value: 'warned' },
              { name: 'Suspended - Temporary removal', value: 'suspended' },
              { name: 'Terminated - Permanent removal', value: 'terminated' }
            ))
        .addStringOption(opt =>
          opt.setName('findings')
            .setDescription('Investigation findings/notes')))
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View an investigation')
        .addStringOption(opt =>
          opt.setName('case-id')
            .setDescription('Case ID of the investigation')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List open investigations')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'open':
        return handleOpen(interaction);
      case 'close':
        return handleClose(interaction);
      case 'view':
        return handleView(interaction);
      case 'list':
        return handleList(interaction);
    }
  }
};

async function handleOpen(interaction) {
  const permCheck = hasPermission(interaction.member, 'investigation', 'open');
  if (!permCheck.allowed) {
    return interaction.reply({
      embeds: [buildPermissionDeniedEmbed('investigation open', permCheck.requiredLevel || 'HR', permCheck.canRequest)],
      ephemeral: true
    });
  }

  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');

  const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!targetMember) {
    return interaction.reply({ content: '❌ User not found in server.', ephemeral: true });
  }

  // Check if already under investigation
  const existing = queryOne(
    'SELECT * FROM investigations WHERE guild_id = ? AND subject_id = ? AND status = ?',
    [interaction.guild.id, target.id, 'open']
  );

  if (existing) {
    return interaction.reply({ 
      content: `❌ ${target.tag} is already under investigation (Case: \`${existing.case_id}\`).`,
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
      actionType: 'investigation',
      reason
    });

    // Get category for investigation channels
    const categoryId = process.env.INVESTIGATION_CATEGORY_ID;
    
    // Create investigation channel
    const channelName = (process.env.INVESTIGATION_CHANNEL_FORMAT || 'investigation-{id}')
      .replace('{id}', caseData.case_id.toLowerCase())
      .replace('{user}', target.username.toLowerCase().replace(/[^a-z0-9]/g, ''));

    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId || null,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: target.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
        },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages]
        }
      ],
      reason: `Investigation ${caseData.case_id} - ${target.tag}`
    });

    // Store roles before removal
    const memberRoleId = process.env.MEMBER_ROLE_ID;
    const investigationRoleId = process.env.UNDER_INVESTIGATION_ROLE_ID;
    
    const rolesToRemove = targetMember.roles.cache.filter(role => 
      role.id !== interaction.guild.id &&
      role.id !== memberRoleId &&
      role.id !== investigationRoleId &&
      role.editable
    );
    const removedRoleIds = rolesToRemove.map(r => r.id);
    const removedRoleNames = rolesToRemove.map(r => r.name);

    // Remove roles
    for (const role of rolesToRemove.values()) {
      await targetMember.roles.remove(role, `Investigation ${caseData.case_id}`);
    }

    // Add Under Investigation role
    if (investigationRoleId) {
      const investigationRole = interaction.guild.roles.cache.get(investigationRoleId);
      if (investigationRole) {
        await targetMember.roles.add(investigationRole, `Investigation ${caseData.case_id}`);
      }
    }

    // Record investigation
    execute(`
      INSERT INTO investigations (case_id, guild_id, subject_id, subject_tag, investigator_id, investigator_tag, channel_id, reason, roles_removed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [caseData.case_id, interaction.guild.id, target.id, target.tag, interaction.user.id, interaction.user.tag, channel.id, reason, JSON.stringify(removedRoleIds)]);

    // Post intro message in investigation channel
    const introEmbed = new EmbedBuilder()
      .setTitle(`🔍 Investigation ${caseData.case_id}`)
      .setColor(0x9B59B6)
      .setDescription(`This channel has been created for the investigation of ${target}.`)
      .addFields(
        { name: 'Subject', value: `${target} (${target.tag})`, inline: true },
        { name: 'Investigator', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setFooter({ text: 'Use /investigation close to conclude this investigation' })
      .setTimestamp();

    await channel.send({ embeds: [introEmbed] });

    // Log
    await logModAction(interaction.client, interaction.guild.id, caseData, 'investigation');
    logAudit(interaction.guild.id, 'INVESTIGATION_OPEN', interaction.user.id, interaction.user.tag, target.id, target.tag, {
      caseId: caseData.case_id,
      channelId: channel.id,
      rolesRemoved: removedRoleNames
    });

    // DM the subject
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🔍 You Are Under Investigation')
        .setColor(0x9B59B6)
        .setDescription(`You are under investigation in **${interaction.guild.name}**.`)
        .addFields(
          { name: 'Reason', value: reason, inline: false },
          { name: 'Case ID', value: caseData.case_id, inline: true }
        )
        .setFooter({ text: 'Your roles have been temporarily removed. Please cooperate with the investigation.' })
        .setTimestamp();
      
      await target.send({ embeds: [dmEmbed] });
    } catch (e) {}

    const embed = new EmbedBuilder()
      .setTitle('🔍 Investigation Opened')
      .setColor(0x9B59B6)
      .addFields(
        { name: 'Subject', value: `${target} (${target.tag})`, inline: true },
        { name: 'Case ID', value: caseData.case_id, inline: true },
        { name: 'Channel', value: `${channel}`, inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setFooter({ text: `Opened by ${interaction.user.tag}` })
      .setTimestamp();

    if (removedRoleNames.length > 0) {
      embed.addFields({ name: 'Roles Removed', value: removedRoleNames.join(', '), inline: false });
    }

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Investigation] Open error:', error);
    return interaction.editReply({ content: '❌ Failed to open investigation.' });
  }
}

async function handleClose(interaction) {
  const permCheck = hasPermission(interaction.member, 'investigation', 'close');
  if (!permCheck.allowed) {
    return interaction.reply({
      embeds: [buildPermissionDeniedEmbed('investigation close', permCheck.requiredLevel || 'HR', permCheck.canRequest)],
      ephemeral: true
    });
  }

  const caseId = interaction.options.getString('case-id').toUpperCase();
  const outcome = interaction.options.getString('outcome');
  const findings = interaction.options.getString('findings') || 'No findings recorded';

  const investigation = queryOne(
    'SELECT * FROM investigations WHERE case_id = ? AND status = ?',
    [caseId, 'open']
  );

  if (!investigation) {
    return interaction.reply({ content: `❌ No open investigation found with ID \`${caseId}\`.`, ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const target = await interaction.client.users.fetch(investigation.subject_id);
    const targetMember = await interaction.guild.members.fetch(investigation.subject_id).catch(() => null);

    // Restore roles if cleared
    if (outcome === 'cleared' && targetMember && investigation.roles_removed) {
      const roleIds = JSON.parse(investigation.roles_removed);
      for (const roleId of roleIds) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role && role.editable) {
          await targetMember.roles.add(role, `Investigation ${caseId} cleared`).catch(() => {});
        }
      }
    }

    // Remove Under Investigation role
    if (targetMember) {
      const investigationRoleId = process.env.UNDER_INVESTIGATION_ROLE_ID;
      if (investigationRoleId) {
        const investigationRole = interaction.guild.roles.cache.get(investigationRoleId);
        if (investigationRole && targetMember.roles.cache.has(investigationRoleId)) {
          await targetMember.roles.remove(investigationRole, `Investigation ${caseId} closed`);
        }
      }
    }

    // Update database
    execute(`
      UPDATE investigations 
      SET status = 'closed', findings = ?, outcome = ?, closed_at = CURRENT_TIMESTAMP, closed_by = ?
      WHERE case_id = ?
    `, [findings, outcome, interaction.user.id, caseId]);

    // Archive channel (rename and lock)
    if (investigation.channel_id) {
      try {
        const channel = await interaction.guild.channels.fetch(investigation.channel_id);
        if (channel) {
          await channel.setName(`closed-${caseId.toLowerCase()}`);
          await channel.permissionOverwrites.edit(investigation.subject_id, {
            SendMessages: false
          });
          
          // Send closure message
          const closureEmbed = new EmbedBuilder()
            .setTitle('🔒 Investigation Closed')
            .setColor(outcome === 'cleared' ? 0x27AE60 : 0xE74C3C)
            .addFields(
              { name: 'Outcome', value: outcome.toUpperCase(), inline: true },
              { name: 'Closed By', value: interaction.user.tag, inline: true },
              { name: 'Findings', value: findings, inline: false }
            )
            .setTimestamp();
          
          await channel.send({ embeds: [closureEmbed] });
        }
      } catch (e) {
        console.error('[Investigation] Channel archive error:', e.message);
      }
    }

    logAudit(interaction.guild.id, 'INVESTIGATION_CLOSE', interaction.user.id, interaction.user.tag, investigation.subject_id, investigation.subject_tag, {
      caseId,
      outcome,
      findings
    });

    // DM the subject
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🔒 Investigation Concluded')
        .setColor(outcome === 'cleared' ? 0x27AE60 : 0xE74C3C)
        .setDescription(`Your investigation in **${interaction.guild.name}** has concluded.`)
        .addFields(
          { name: 'Case ID', value: caseId, inline: true },
          { name: 'Outcome', value: outcome.toUpperCase(), inline: true }
        )
        .setTimestamp();
      
      await target.send({ embeds: [dmEmbed] });
    } catch (e) {}

    const embed = new EmbedBuilder()
      .setTitle('🔒 Investigation Closed')
      .setColor(outcome === 'cleared' ? 0x27AE60 : 0xE74C3C)
      .addFields(
        { name: 'Case ID', value: caseId, inline: true },
        { name: 'Subject', value: `${target.tag}`, inline: true },
        { name: 'Outcome', value: outcome.toUpperCase(), inline: true },
        { name: 'Findings', value: findings, inline: false }
      )
      .setFooter({ text: `Closed by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Investigation] Close error:', error);
    return interaction.editReply({ content: '❌ Failed to close investigation.' });
  }
}

async function handleView(interaction) {
  const permCheck = hasPermission(interaction.member, 'investigation', 'view');
  if (!permCheck.allowed) {
    return interaction.reply({
      embeds: [buildPermissionDeniedEmbed('investigation view', permCheck.requiredLevel || 'SENIOR_MOD', permCheck.canRequest)],
      ephemeral: true
    });
  }

  const caseId = interaction.options.getString('case-id').toUpperCase();

  const investigation = queryOne('SELECT * FROM investigations WHERE case_id = ?', [caseId]);

  if (!investigation) {
    return interaction.reply({ content: `❌ Investigation \`${caseId}\` not found.`, ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(`🔍 Investigation ${caseId}`)
    .setColor(investigation.status === 'open' ? 0x9B59B6 : 0x7F8C8D)
    .addFields(
      { name: 'Subject', value: `<@${investigation.subject_id}> (${investigation.subject_tag})`, inline: true },
      { name: 'Investigator', value: `<@${investigation.investigator_id}>`, inline: true },
      { name: 'Status', value: investigation.status.toUpperCase(), inline: true },
      { name: 'Reason', value: investigation.reason || 'N/A', inline: false }
    )
    .setTimestamp(new Date(investigation.opened_at));

  if (investigation.channel_id) {
    embed.addFields({ name: 'Channel', value: `<#${investigation.channel_id}>`, inline: true });
  }

  if (investigation.status === 'closed') {
    embed.addFields(
      { name: 'Outcome', value: investigation.outcome?.toUpperCase() || 'N/A', inline: true },
      { name: 'Findings', value: investigation.findings || 'N/A', inline: false }
    );
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleList(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const investigations = query(
    'SELECT * FROM investigations WHERE guild_id = ? AND status = ? ORDER BY opened_at DESC',
    [interaction.guild.id, 'open']
  );

  if (investigations.length === 0) {
    return interaction.editReply({ content: '📋 No open investigations.' });
  }

  const list = investigations.map(i => 
    `• \`${i.case_id}\` - <@${i.subject_id}> (by <@${i.investigator_id}>)`
  ).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🔍 Open Investigations')
    .setColor(0x9B59B6)
    .setDescription(list)
    .setFooter({ text: `${investigations.length} open investigation(s)` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

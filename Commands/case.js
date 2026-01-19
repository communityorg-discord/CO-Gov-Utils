/**
 * /case - View, edit, delete, void, or restore cases
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const caseManager = require('../utils/caseManager');
const { hasPermission, buildPermissionDeniedEmbed } = require('../utils/advancedPermissions');
const { buildCaseEmbed, logAudit } = require('../utils/modLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Manage moderation cases')
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View a case by ID')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('Case ID (e.g., CASE-0001)')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('Edit a case')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('Case ID')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('edit-reason')
            .setDescription('Reason for this edit')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('New reason'))
        .addStringOption(opt =>
          opt.setName('evidence')
            .setDescription('New evidence'))
        .addIntegerOption(opt =>
          opt.setName('points')
            .setDescription('New points (for warns)')
            .setMinValue(1)
            .setMaxValue(10)))
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a case (still visible in deleted-history)')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('Case ID')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for deletion')))
    .addSubcommand(sub =>
      sub.setName('void')
        .setDescription('Void a case (completely hidden)')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('Case ID')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for voiding')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('restore')
        .setDescription('Restore a deleted case')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('Case ID')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'view':
        return handleView(interaction);
      case 'edit':
        return handleEdit(interaction);
      case 'delete':
        return handleDelete(interaction);
      case 'void':
        return handleVoid(interaction);
      case 'restore':
        return handleRestore(interaction);
    }
  }
};

async function handleView(interaction) {
  const permCheck = hasPermission(interaction.member, 'case', 'view');
  if (!permCheck.allowed) {
    return interaction.reply({
      embeds: [buildPermissionDeniedEmbed('case view', permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
      ephemeral: true
    });
  }

  const caseId = interaction.options.getString('id').toUpperCase();
  const caseData = caseManager.getCase(caseId);

  if (!caseData) {
    return interaction.reply({ content: `❌ Case \`${caseId}\` not found.`, ephemeral: true });
  }

  // Get edit history
  const edits = caseManager.getCaseEdits(caseId);

  const embed = buildCaseEmbed(caseData);

  if (edits.length > 0) {
    const editSummary = edits.slice(0, 5).map(e => 
      `• ${e.field_changed}: \`${e.old_value}\` → \`${e.new_value}\` by <@${e.editor_id}>`
    ).join('\n');
    embed.addFields({ name: `📝 Edit History (${edits.length})`, value: editSummary, inline: false });
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleEdit(interaction) {
  const permCheck = hasPermission(interaction.member, 'case', 'edit');
  if (!permCheck.allowed) {
    return interaction.reply({
      embeds: [buildPermissionDeniedEmbed('case edit', permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
      ephemeral: true
    });
  }

  const caseId = interaction.options.getString('id').toUpperCase();
  const editReason = interaction.options.getString('edit-reason');
  
  const caseData = caseManager.getCase(caseId);
  if (!caseData) {
    return interaction.reply({ content: `❌ Case \`${caseId}\` not found.`, ephemeral: true });
  }

  if (caseData.status !== 'active') {
    return interaction.reply({ content: `❌ Cannot edit a ${caseData.status} case.`, ephemeral: true });
  }

  // Build changes object
  const changes = {};
  const newReason = interaction.options.getString('reason');
  const newEvidence = interaction.options.getString('evidence');
  const newPoints = interaction.options.getInteger('points');

  if (newReason) changes.reason = newReason;
  if (newEvidence) changes.evidence = newEvidence;
  if (newPoints && caseData.action_type === 'warn') changes.points = newPoints;

  if (Object.keys(changes).length === 0) {
    return interaction.reply({ content: '❌ No changes specified.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const updatedCase = caseManager.editCase(caseId, interaction.user.id, interaction.user.tag, changes, editReason);

  logAudit(interaction.guild.id, 'CASE_EDIT', interaction.user.id, interaction.user.tag, caseData.user_id, caseData.user_tag, { caseId, changes, editReason });

  const embed = new EmbedBuilder()
    .setTitle('✏️ Case Edited')
    .setColor(0x3498DB)
    .setDescription(`Case \`${caseId}\` has been updated.`)
    .addFields(
      { name: 'Changes', value: Object.entries(changes).map(([k, v]) => `**${k}**: ${v}`).join('\n'), inline: false },
      { name: 'Edit Reason', value: editReason, inline: false }
    )
    .setFooter({ text: `Edited by ${interaction.user.tag}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function handleDelete(interaction) {
  const permCheck = hasPermission(interaction.member, 'case', 'delete');
  if (!permCheck.allowed) {
    return interaction.reply({
      embeds: [buildPermissionDeniedEmbed('case delete', permCheck.requiredLevel || 'SENIOR_MOD', permCheck.canRequest)],
      ephemeral: true
    });
  }

  const caseId = interaction.options.getString('id').toUpperCase();
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const caseData = caseManager.getCase(caseId);
  if (!caseData) {
    return interaction.reply({ content: `❌ Case \`${caseId}\` not found.`, ephemeral: true });
  }

  if (caseData.status === 'deleted') {
    return interaction.reply({ content: `❌ Case is already deleted.`, ephemeral: true });
  }

  if (caseData.status === 'voided') {
    return interaction.reply({ content: `❌ Case has been voided and cannot be modified.`, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  caseManager.deleteCase(caseId, interaction.user.id);

  logAudit(interaction.guild.id, 'CASE_DELETE', interaction.user.id, interaction.user.tag, caseData.user_id, caseData.user_tag, { caseId, reason });

  const embed = new EmbedBuilder()
    .setTitle('🗑️ Case Deleted')
    .setColor(0xE74C3C)
    .setDescription(`Case \`${caseId}\` has been deleted.\nIt will still appear in \`/deleted-history\`.`)
    .addFields({ name: 'Reason', value: reason, inline: false })
    .setFooter({ text: `Deleted by ${interaction.user.tag}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function handleVoid(interaction) {
  const permCheck = hasPermission(interaction.member, 'case', 'void');
  if (!permCheck.allowed) {
    return interaction.reply({
      embeds: [buildPermissionDeniedEmbed('case void', permCheck.requiredLevel || 'ADMIN', permCheck.canRequest)],
      ephemeral: true
    });
  }

  const caseId = interaction.options.getString('id').toUpperCase();
  const reason = interaction.options.getString('reason');

  const caseData = caseManager.getCase(caseId);
  if (!caseData) {
    return interaction.reply({ content: `❌ Case \`${caseId}\` not found.`, ephemeral: true });
  }

  if (caseData.status === 'voided') {
    return interaction.reply({ content: `❌ Case is already voided.`, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  caseManager.voidCase(caseId, interaction.user.id, reason);

  logAudit(interaction.guild.id, 'CASE_VOID', interaction.user.id, interaction.user.tag, caseData.user_id, caseData.user_tag, { caseId, reason });

  const embed = new EmbedBuilder()
    .setTitle('⛔ Case Voided')
    .setColor(0x7F8C8D)
    .setDescription(`Case \`${caseId}\` has been voided.\nIt will no longer appear in any history.`)
    .addFields({ name: 'Reason', value: reason, inline: false })
    .setFooter({ text: `Voided by ${interaction.user.tag}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function handleRestore(interaction) {
  const permCheck = hasPermission(interaction.member, 'case', 'restore');
  if (!permCheck.allowed) {
    return interaction.reply({
      embeds: [buildPermissionDeniedEmbed('case restore', permCheck.requiredLevel || 'ADMIN', permCheck.canRequest)],
      ephemeral: true
    });
  }

  const caseId = interaction.options.getString('id').toUpperCase();

  const caseData = caseManager.getCase(caseId);
  if (!caseData) {
    return interaction.reply({ content: `❌ Case \`${caseId}\` not found.`, ephemeral: true });
  }

  if (caseData.status === 'voided') {
    return interaction.reply({ content: `❌ Voided cases cannot be restored.`, ephemeral: true });
  }

  if (caseData.status === 'active') {
    return interaction.reply({ content: `❌ Case is already active.`, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  caseManager.restoreCase(caseId);

  logAudit(interaction.guild.id, 'CASE_RESTORE', interaction.user.id, interaction.user.tag, caseData.user_id, caseData.user_tag, { caseId });

  const embed = new EmbedBuilder()
    .setTitle('♻️ Case Restored')
    .setColor(0x27AE60)
    .setDescription(`Case \`${caseId}\` has been restored to active status.`)
    .setFooter({ text: `Restored by ${interaction.user.tag}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

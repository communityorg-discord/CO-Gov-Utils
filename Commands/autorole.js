/**
 * /autorole - Assign government positions to users
 * Automatically adds Staff Team and Government Team roles
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { hasPermission, buildPermissionDeniedEmbed } = require('../utils/advancedPermissions');
const { logAudit } = require('../utils/modLogger');
const { execute, query, queryOne } = require('../utils/database');

// Government positions (simplified list - expand as needed)
const GOVERNMENT_POSITIONS = {
  president: { name: 'President', category: 'executive' },
  vicePresident: { name: 'Vice President', category: 'executive' },
  chiefOfStaff: { name: 'Chief of Staff', category: 'executive' },
  pressSecretary: { name: 'Press Secretary', category: 'whiteHouse' },
  secretaryOfState: { name: 'Secretary of State', category: 'cabinet' },
  secretaryOfTreasury: { name: 'Secretary of the Treasury', category: 'cabinet' },
  secretaryOfDefense: { name: 'Secretary of Defense', category: 'cabinet' },
  attorneyGeneral: { name: 'Attorney General', category: 'cabinet' },
  fbiDirector: { name: 'FBI Director', category: 'intelligence' },
  ciaDirector: { name: 'CIA Director', category: 'intelligence' },
  supportDirector: { name: 'Support Director', category: 'support' },
  supportAgent: { name: 'Support Agent', category: 'support' },
  botOperator: { name: 'Bot Operator', category: 'admin' },
  auditViewer: { name: 'Audit Viewer', category: 'admin' }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Manage government position assignments')
    .addSubcommand(sub =>
      sub.setName('assign')
        .setDescription('Assign a government position to a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to assign position to')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('position')
            .setDescription('Position to assign')
            .setRequired(true)
            .setAutocomplete(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a government position from a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to remove position from')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('position')
            .setDescription('Position to remove')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for removal')))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all assigned positions in the server'))
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View positions assigned to a user')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to view')
            .setRequired(true))),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'position') {
      const search = focusedOption.value.toLowerCase();
      const choices = Object.entries(GOVERNMENT_POSITIONS)
        .filter(([key, pos]) => 
          key.toLowerCase().includes(search) || 
          pos.name.toLowerCase().includes(search))
        .map(([key, pos]) => ({
          name: `${pos.name} (${pos.category})`,
          value: key
        }))
        .slice(0, 25);
      
      return interaction.respond(choices);
    }
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'assign':
        return handleAssign(interaction);
      case 'remove':
        return handleRemove(interaction);
      case 'list':
        return handleList(interaction);
      case 'view':
        return handleView(interaction);
    }
  }
};

async function handleAssign(interaction) {
  const permCheck = hasPermission(interaction.member, 'autorole', 'assign');
  if (!permCheck.allowed) {
    return interaction.reply({
      embeds: [buildPermissionDeniedEmbed('autorole assign', permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
      ephemeral: true
    });
  }

  const target = interaction.options.getUser('user');
  const positionKey = interaction.options.getString('position');
  const position = GOVERNMENT_POSITIONS[positionKey];

  if (!position) {
    return interaction.reply({ content: '❌ Invalid position.', ephemeral: true });
  }

  const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!targetMember) {
    return interaction.reply({ content: '❌ User not found in server.', ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const rolesAdded = [];

    // Add Staff Team role
    const staffRoleId = process.env.STAFF_TEAM_ROLE_ID;
    if (staffRoleId) {
      const staffRole = interaction.guild.roles.cache.get(staffRoleId);
      if (staffRole && !targetMember.roles.cache.has(staffRoleId)) {
        await targetMember.roles.add(staffRole, `Assigned position: ${position.name}`);
        rolesAdded.push(staffRole.name);
      }
    }

    // Add Government Team role
    const govRoleId = process.env.GOVERNMENT_TEAM_ROLE_ID;
    if (govRoleId) {
      const govRole = interaction.guild.roles.cache.get(govRoleId);
      if (govRole && !targetMember.roles.cache.has(govRoleId)) {
        await targetMember.roles.add(govRole, `Assigned position: ${position.name}`);
        rolesAdded.push(govRole.name);
      }
    }

    // Add Member role
    const memberRoleId = process.env.MEMBER_ROLE_ID;
    if (memberRoleId) {
      const memberRole = interaction.guild.roles.cache.get(memberRoleId);
      if (memberRole && !targetMember.roles.cache.has(memberRoleId)) {
        await targetMember.roles.add(memberRole, `Assigned position: ${position.name}`);
        rolesAdded.push(memberRole.name);
      }
    }

    // Record assignment in database
    execute(`
      INSERT INTO staff_assignments (guild_id, user_id, user_tag, position_key, position_name, assigned_by, assigned_by_tag, roles_added)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [interaction.guild.id, target.id, target.tag, positionKey, position.name, interaction.user.id, interaction.user.tag, JSON.stringify(rolesAdded)]);

    logAudit(interaction.guild.id, 'POSITION_ASSIGN', interaction.user.id, interaction.user.tag, target.id, target.tag, { position: position.name, rolesAdded });

    const embed = new EmbedBuilder()
      .setTitle('✅ Position Assigned')
      .setColor(0x27AE60)
      .setDescription(`Successfully assigned **${position.name}** to ${target}`)
      .addFields(
        { name: 'Position', value: position.name, inline: true },
        { name: 'Category', value: position.category, inline: true },
        { name: 'Assigned By', value: interaction.user.tag, inline: true }
      )
      .setTimestamp();

    if (rolesAdded.length > 0) {
      embed.addFields({ name: '➕ Roles Added', value: rolesAdded.join('\n'), inline: false });
    }

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Autorole] Assign error:', error);
    return interaction.editReply({ content: '❌ Failed to assign position.' });
  }
}

async function handleRemove(interaction) {
  const permCheck = hasPermission(interaction.member, 'autorole', 'remove');
  if (!permCheck.allowed) {
    return interaction.reply({
      embeds: [buildPermissionDeniedEmbed('autorole remove', permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
      ephemeral: true
    });
  }

  const target = interaction.options.getUser('user');
  const positionKey = interaction.options.getString('position');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const position = GOVERNMENT_POSITIONS[positionKey];

  if (!position) {
    return interaction.reply({ content: '❌ Invalid position.', ephemeral: true });
  }

  await interaction.deferReply();

  try {
    // Update database record
    execute(`
      UPDATE staff_assignments 
      SET status = 'removed', removed_at = CURRENT_TIMESTAMP, removed_by = ?, removal_reason = ?
      WHERE guild_id = ? AND user_id = ? AND position_key = ? AND status = 'active'
    `, [interaction.user.id, reason, interaction.guild.id, target.id, positionKey]);

    logAudit(interaction.guild.id, 'POSITION_REMOVE', interaction.user.id, interaction.user.tag, target.id, target.tag, { position: position.name, reason });

    const embed = new EmbedBuilder()
      .setTitle('🔄 Position Removed')
      .setColor(0xE67E22)
      .setDescription(`Removed **${position.name}** from ${target}`)
      .addFields(
        { name: 'Position', value: position.name, inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setFooter({ text: `Removed by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Autorole] Remove error:', error);
    return interaction.editReply({ content: '❌ Failed to remove position.' });
  }
}

async function handleList(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const assignments = query(
    'SELECT * FROM staff_assignments WHERE guild_id = ? AND status = ? ORDER BY assigned_at DESC',
    [interaction.guild.id, 'active']
  );

  if (assignments.length === 0) {
    return interaction.editReply({ content: '📋 No active position assignments found.' });
  }

  const list = assignments.slice(0, 20).map(a => 
    `• <@${a.user_id}> - **${a.position_name}**`
  ).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📋 Active Position Assignments')
    .setColor(0x3498DB)
    .setDescription(list)
    .setFooter({ text: `${assignments.length} total assignments` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function handleView(interaction) {
  const target = interaction.options.getUser('user');

  await interaction.deferReply({ ephemeral: true });

  const assignments = query(
    'SELECT * FROM staff_assignments WHERE guild_id = ? AND user_id = ? AND status = ?',
    [interaction.guild.id, target.id, 'active']
  );

  if (assignments.length === 0) {
    return interaction.editReply({ content: `📋 ${target.tag} has no active position assignments.` });
  }

  const list = assignments.map(a => `• **${a.position_name}** (${GOVERNMENT_POSITIONS[a.position_key]?.category || 'unknown'})`).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`📋 Positions for ${target.tag}`)
    .setColor(0x3498DB)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(list)
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

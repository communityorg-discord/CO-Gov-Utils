/**
 * /permissions - Unified Permission Management
 * Frontend for advancedPermissions.js system
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permissions')
    .setDescription('Manage bot permissions')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
      .setName('view')
      .setDescription('View current permission configuration'))
    .addSubcommand(sub => sub
      .setName('check')
      .setDescription('Check a user\'s permissions')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to check')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('grant')
      .setDescription('Grant permission to a user or role')
      .addStringOption(opt => opt
        .setName('type')
        .setDescription('Type of grant')
        .setRequired(true)
        .addChoices(
          { name: 'Command - Grant access to a specific command', value: 'command' },
          { name: 'Level - Grant a permission level', value: 'level' },
          { name: 'Category - Grant access to a command category', value: 'category' }
        ))
      .addStringOption(opt => opt
        .setName('value')
        .setDescription('Command name, level, or category')
        .setRequired(true)
        .setAutocomplete(true))
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to grant permission to'))
      .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Role to grant permission to'))
      .addStringOption(opt => opt
        .setName('reason')
        .setDescription('Reason for granting')))
    .addSubcommand(sub => sub
      .setName('revoke')
      .setDescription('Revoke permission from a user or role')
      .addStringOption(opt => opt
        .setName('type')
        .setDescription('Type of permission')
        .setRequired(true)
        .addChoices(
          { name: 'Command', value: 'command' },
          { name: 'Level', value: 'level' },
          { name: 'Category', value: 'category' }
        ))
      .addStringOption(opt => opt
        .setName('value')
        .setDescription('Command, level, or category to revoke')
        .setRequired(true)
        .setAutocomplete(true))
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to revoke from'))
      .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Role to revoke from')))
    .addSubcommand(sub => sub
      .setName('superuser')
      .setDescription('Manage superusers')
      .addStringOption(opt => opt
        .setName('action')
        .setDescription('Action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' },
          { name: 'List', value: 'list' }
        ))
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to add/remove')))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all permission levels and commands'))
    .addSubcommand(sub => sub
      .setName('requests')
      .setDescription('View pending permission requests')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const focusedValue = focused.value.toLowerCase();
    const type = interaction.options.getString('type');

    let choices = [];

    if (type === 'level') {
      choices = Object.keys(advPerms.PERMISSION_LEVELS)
        .filter(l => l !== 'BOT_DEVELOPER') // Can't grant bot developer
        .filter(l => l.toLowerCase().includes(focusedValue))
        .map(l => ({ name: `${l} (Level ${advPerms.PERMISSION_LEVELS[l]})`, value: l }));
    } else if (type === 'category') {
      choices = Object.keys(advPerms.COMMAND_CATEGORIES)
        .filter(c => c.toLowerCase().includes(focusedValue))
        .map(c => ({ name: c, value: c }));
    } else {
      // Default to commands
      choices = Object.keys(advPerms.COMMAND_RESTRICTIONS)
        .filter(cmd => cmd.includes(focusedValue))
        .slice(0, 25)
        .map(cmd => ({ name: `/${cmd}`, value: cmd }));
    }

    await interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // Only superusers can manage permissions (grant/revoke/superuser)
    if (['grant', 'revoke', 'superuser', 'requests'].includes(sub)) {
      if (!advPerms.isSuperuser(interaction.user.id)) {
        return interaction.reply({
          content: '❌ Only superusers can manage permissions.',
          ephemeral: true
        });
      }
    }

    switch (sub) {
      case 'view': return handleView(interaction);
      case 'check': return handleCheck(interaction);
      case 'grant': return handleGrant(interaction);
      case 'revoke': return handleRevoke(interaction);
      case 'superuser': return handleSuperuser(interaction);
      case 'list': return handleList(interaction);
      case 'requests': return handleRequests(interaction);
    }
  },

  // Export for other commands to use
  isSuperuser: advPerms.isSuperuser,
  hasPermission: advPerms.hasPermission,
  PERMISSION_LEVELS: advPerms.PERMISSION_LEVELS
};

async function handleView(interaction) {
  const superusers = advPerms.getAllSuperusers();

  const hardcodedList = superusers.hardcoded.map(id => `<@${id}> (hardcoded)`).join('\n') || 'None';
  const dynamicList = superusers.dynamic.map(id => `<@${id}>`).join('\n') || 'None';

  const embed = new EmbedBuilder()
    .setTitle('🔐 Permission Configuration')
    .setColor(0x3498DB)
    .addFields(
      { name: '👑 Hardcoded Superusers', value: hardcodedList, inline: false },
      { name: '⭐ Dynamic Superusers', value: dynamicList, inline: false },
      {
        name: '📊 Permission Levels', value:
          '`BOT_DEVELOPER` (6) - Bot configuration\n' +
          '`SUPERUSER` (5) - Full access\n' +
          '`HR` (4) - Fire, investigations\n' +
          '`ADMIN` (3) - Server lockdown, void cases\n' +
          '`SENIOR_MOD` (2) - Ban, mass-role\n' +
          '`MODERATOR` (1) - Warn, mute, kick\n' +
          '`USER` (0) - Basic commands',
        inline: false
      }
    )
    .setFooter({ text: 'Use /permissions list to see command details' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCheck(interaction) {
  const user = interaction.options.getUser('user');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  const level = advPerms.getUserPermissionLevel(member || user.id);
  const levelName = Object.entries(advPerms.PERMISSION_LEVELS)
    .find(([name, val]) => val === level)?.[0] || 'USER';

  const isSuperuser = advPerms.isSuperuser(user.id);
  const isBotDev = advPerms.isBotDeveloper(user.id);
  const isHardcoded = advPerms.isHardcodedSuperuser(user.id);

  // Get granted permissions
  const grants = advPerms.getUserPermissions(interaction.guild.id, user.id);
  const grantsList = grants.length > 0
    ? grants.map(g => `• \`${g.permission_value}\` (${g.permission_type})`).join('\n')
    : 'None';

  // Get accessible commands
  const accessible = advPerms.getAccessibleCommands(member || user.id);
  const accessibleList = accessible.slice(0, 10).map(c => `\`/${c.command}\``).join(', ');

  const embed = new EmbedBuilder()
    .setTitle(`🔐 Permissions: ${user.tag}`)
    .setColor(isSuperuser ? 0xFFD700 : level >= 3 ? 0x00FF00 : 0x3498DB)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: '📊 Permission Level', value: `**${levelName}** (${level})`, inline: true },
      {
        name: '👑 Status', value:
          isBotDev ? '🔧 Bot Developer' :
            isHardcoded ? '👑 Hardcoded Superuser' :
              isSuperuser ? '⭐ Dynamic Superuser' :
                '👤 Regular User',
        inline: true
      },
      { name: '🎫 Granted Permissions', value: grantsList.substring(0, 1000), inline: false },
      { name: '✅ Can Access', value: accessibleList.substring(0, 1000) + (accessible.length > 10 ? '...' : ''), inline: false }
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleGrant(interaction) {
  const type = interaction.options.getString('type');
  const value = interaction.options.getString('value');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');

  if (!user && !role) {
    return interaction.reply({ content: '❌ You must specify either a user or a role.', ephemeral: true });
  }

  // Validate level grants
  if (type === 'level') {
    if (!advPerms.PERMISSION_LEVELS[value]) {
      return interaction.reply({ content: `❌ Invalid level: ${value}`, ephemeral: true });
    }
    if (value === 'BOT_DEVELOPER') {
      return interaction.reply({ content: '❌ Cannot grant BOT_DEVELOPER level.', ephemeral: true });
    }
  }

  const targetId = user ? user.id : role.id;
  const targetTag = user ? user.tag : role.name;
  const targetType = user ? 'user' : 'role';

  const result = advPerms.grantPermission(
    interaction.guild.id,
    targetId,
    targetTag,
    type,
    value,
    interaction.user.id,
    interaction.user.tag,
    reason
  );

  if (result.success) {
    const typeLabel = type === 'level' ? 'level' : type === 'category' ? 'category' : 'command';
    const valueLabel = type === 'command' ? `\`/${value}\`` : `**${value}**`;
    const targetLabel = user ? user.tag : `@${role.name}`;
    return interaction.reply({
      content: `✅ Granted ${typeLabel} ${valueLabel} to ${targetLabel}.\nReason: ${reason}`,
      ephemeral: true
    });
  }
  return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
}

async function handleRevoke(interaction) {
  const type = interaction.options.getString('type');
  const value = interaction.options.getString('value');
  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');

  if (!user && !role) {
    return interaction.reply({ content: '❌ You must specify either a user or a role.', ephemeral: true });
  }

  const targetId = user ? user.id : role.id;
  const targetLabel = user ? user.tag : `@${role.name}`;

  const result = advPerms.revokePermission(
    interaction.guild.id,
    targetId,
    type,
    value
  );

  if (result.success) {
    const typeLabel = type === 'level' ? 'level' : type === 'category' ? 'category' : 'command';
    const valueLabel = type === 'command' ? `\`/${value}\`` : `**${value}**`;
    return interaction.reply({
      content: `✅ Revoked ${typeLabel} ${valueLabel} from ${targetLabel}.`,
      ephemeral: true
    });
  }
  return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
}

async function handleSuperuser(interaction) {
  const action = interaction.options.getString('action');
  const user = interaction.options.getUser('user');

  if (action === 'list') {
    const superusers = advPerms.getAllSuperusers();

    const embed = new EmbedBuilder()
      .setTitle('👑 Superusers')
      .setColor(0xFFD700)
      .addFields(
        { name: '🔒 Hardcoded (Cannot Remove)', value: superusers.hardcoded.map(id => `<@${id}>`).join('\n') || 'None', inline: true },
        { name: '⭐ Dynamic', value: superusers.dynamic.map(id => `<@${id}>`).join('\n') || 'None', inline: true }
      )
      .setFooter({ text: `Total: ${superusers.all.length}` });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (!user) {
    return interaction.reply({ content: '❌ You must specify a user.', ephemeral: true });
  }

  if (action === 'add') {
    const result = advPerms.addSuperuser(user.id, user.tag, interaction.user.id, interaction.user.tag);
    if (result.success) {
      return interaction.reply({ content: `✅ Added ${user.tag} as a superuser.`, ephemeral: true });
    }
    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
  }

  if (action === 'remove') {
    const result = advPerms.removeSuperuser(user.id, interaction.user.id);
    if (result.success) {
      return interaction.reply({ content: `✅ Removed ${user.tag} from superusers.`, ephemeral: true });
    }
    return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
  }
}

async function handleList(interaction) {
  const restrictions = advPerms.COMMAND_RESTRICTIONS;
  const levels = advPerms.PERMISSION_LEVELS;

  // Group by level
  const byLevel = {};
  for (const [cmd, info] of Object.entries(restrictions)) {
    const level = info.level;
    if (!byLevel[level]) byLevel[level] = [];
    byLevel[level].push(`\`/${cmd}\``);
  }

  const fields = Object.entries(levels)
    .sort((a, b) => b[1] - a[1]) // Sort by level descending
    .map(([name, val]) => ({
      name: `${val === 6 ? '🔧' : val === 5 ? '👑' : val >= 3 ? '🛡️' : '⚔️'} ${name} (${val})`,
      value: byLevel[name]?.join(', ') || '*No commands*',
      inline: false
    }));

  const embed = new EmbedBuilder()
    .setTitle('📋 Command Permission Levels')
    .setColor(0x3498DB)
    .addFields(fields.slice(0, 6))
    .setFooter({ text: 'Permissions flow down - higher levels have access to lower level commands' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRequests(interaction) {
  const requests = advPerms.getPendingRequests(interaction.guild.id);

  if (requests.length === 0) {
    return interaction.reply({ content: '✅ No pending permission requests.', ephemeral: true });
  }

  const list = requests.map(r =>
    `**${r.request_id}**: <@${r.user_id}> requests \`${r.permission_value}\`\n` +
    `└ Reason: ${r.reason || 'None'} | <t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>`
  ).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('📨 Pending Permission Requests')
    .setColor(0xF39C12)
    .setDescription(list.substring(0, 4000))
    .setFooter({ text: `${requests.length} pending` });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

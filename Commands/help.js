/**
 * /help - Display available commands
 * Shows only commands the user has access to
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserPermissionLevel, hasPermission, PERMISSION_LEVELS, isSuperuser, isBotDeveloper } = require('../utils/advancedPermissions');

const COMMAND_CATEGORIES = {
  'Moderation': [
    { name: '/warn', description: 'Issue a warning', level: 'MODERATOR' },
    { name: '/mute', description: 'Mute (timeout) a user', level: 'MODERATOR' },
    { name: '/unmute', description: 'Remove mute from a user', level: 'MODERATOR' },
    { name: '/kick', description: 'Kick a user', level: 'MODERATOR' },
    { name: '/ban', description: 'Ban a user', level: 'SENIOR_MOD' },
    { name: '/unban', description: 'Unban a user', level: 'SENIOR_MOD' }
  ],
  'Case Management': [
    { name: '/case view', description: 'View a case', level: 'MODERATOR' },
    { name: '/case edit', description: 'Edit a case', level: 'MODERATOR' },
    { name: '/case delete', description: 'Delete a case', level: 'SENIOR_MOD' },
    { name: '/case void', description: 'Void a case', level: 'ADMIN' },
    { name: '/case restore', description: 'Restore a deleted case', level: 'ADMIN' }
  ],
  'History': [
    { name: '/view-history', description: 'View user moderation history', level: 'MODERATOR' },
    { name: '/deleted-history', description: 'View deleted cases', level: 'SENIOR_MOD' }
  ],
  'Role Management': [
    { name: '/role add', description: 'Add a role to user', level: 'MODERATOR' },
    { name: '/role remove', description: 'Remove a role from user', level: 'MODERATOR' },
    { name: '/mass-role', description: 'Bulk role management', level: 'SENIOR_MOD' },
    { name: '/autorole', description: 'Manage government positions', level: 'MODERATOR' },
    { name: '/fire', description: 'Remove all roles from user', level: 'HR' }
  ],
  'Investigations': [
    { name: '/investigation open', description: 'Open an investigation', level: 'HR' },
    { name: '/investigation close', description: 'Close an investigation', level: 'HR' },
    { name: '/investigation view', description: 'View investigation details', level: 'SENIOR_MOD' },
    { name: '/investigation list', description: 'List open investigations', level: 'SENIOR_MOD' }
  ],
  'Lockdown': [
    { name: '/lockdown channel', description: 'Lock a channel', level: 'MODERATOR' },
    { name: '/lockdown server', description: 'Lock entire server', level: 'ADMIN' },
    { name: '/lockdown status', description: 'View lockdown status', level: 'MODERATOR' }
  ],
  'Permissions': [
    { name: '/permission request', description: 'Request command access', level: 'USER' },
    { name: '/permission list', description: 'View your permissions', level: 'USER' },
    { name: '/permission grant', description: 'Grant permissions', level: 'SUPERUSER' },
    { name: '/permission revoke', description: 'Revoke permissions', level: 'SUPERUSER' },
    { name: '/superuser', description: 'Manage superusers', level: 'SUPERUSER' }
  ],
  'Global Moderation': [
    { name: '/global ban', description: 'Ban across all servers', level: 'SUPERUSER' },
    { name: '/global unban', description: 'Unban across all servers', level: 'SUPERUSER' },
    { name: '/global kick', description: 'Kick from all servers', level: 'SUPERUSER' },
    { name: '/global mute', description: 'Mute across all servers', level: 'SUPERUSER' }
  ],
  'Utility': [
    { name: '/ping', description: 'Check bot latency', level: 'USER' },
    { name: '/help', description: 'Show this help menu', level: 'USER' },
    { name: '/info', description: 'Bot info & superusers', level: 'USER' }
  ],
  'Setup': [
    { name: '/setup utils', description: 'Configure bot settings', level: 'BOT_DEVELOPER' }
  ]
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display available commands')
    .addStringOption(opt =>
      opt.setName('category')
        .setDescription('Command category')
        .addChoices(
          { name: 'All Commands', value: 'all' },
          { name: 'Moderation', value: 'Moderation' },
          { name: 'Case Management', value: 'Case Management' },
          { name: 'History', value: 'History' },
          { name: 'Staff Management', value: 'Staff Management' },
          { name: 'Investigations', value: 'Investigations' },
          { name: 'Utility', value: 'Utility' }
        )),

  async execute(interaction) {
    const category = interaction.options.getString('category') || 'all';
    const userLevel = getUserPermissionLevel(interaction.member);
    const userLevelName = Object.keys(PERMISSION_LEVELS).find(k => PERMISSION_LEVELS[k] === userLevel) || 'USER';

    const embed = new EmbedBuilder()
      .setTitle('📚 Government Utilities Help')
      .setColor(0x3498DB)
      .setFooter({ text: `Your permission level: ${userLevelName}` })
      .setTimestamp();

    if (category === 'all') {
      // Show all categories with accessible commands only
      for (const [catName, commands] of Object.entries(COMMAND_CATEGORIES)) {
        const availableCommands = commands
          .filter(cmd => {
            const cmdName = cmd.name.replace('/', '').split(' ')[0];
            const result = hasPermission(interaction.member, cmdName);
            return result.allowed;
          })
          .map(cmd => `\`${cmd.name}\` - ${cmd.description}`)
          .join('\n');
        
        if (availableCommands) {
          embed.addFields({ name: `📁 ${catName}`, value: availableCommands, inline: false });
        }
      }
    } else {
      // Show specific category with access indicators
      const commands = COMMAND_CATEGORIES[category];
      if (commands) {
        const commandList = commands
          .map(cmd => {
            const cmdName = cmd.name.replace('/', '').split(' ')[0];
            const result = hasPermission(interaction.member, cmdName);
            const prefix = result.allowed ? '✅' : '🔒';
            return `${prefix} \`${cmd.name}\` - ${cmd.description} (${cmd.level})`;
          })
          .join('\n');
        
        embed.setTitle(`📁 ${category}`);
        embed.setDescription(commandList);
      }
    }

    // Permission level legend
    embed.addFields({
      name: '🔑 Permission Levels',
      value: '`USER` → `MODERATOR` → `SENIOR_MOD` → `ADMIN` → `HR` → `SUPERUSER` → `BOT_DEVELOPER`',
      inline: false
    });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

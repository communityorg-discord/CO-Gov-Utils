/**
 * Command Wrapper Utility
 * Provides permission checking, logging, and DM notifications for all commands
 */

const { EmbedBuilder } = require('discord.js');
const { 
  hasPermission, 
  logCommand, 
  dmSuperusers, 
  dmUser,
  buildPermissionDeniedEmbed,
  COMMAND_RESTRICTIONS
} = require('./advancedPermissions');

/**
 * Check command permission and return result
 */
function checkPermission(interaction, commandName, subcommand = null) {
  const result = hasPermission(interaction.member, commandName, subcommand);
  return result;
}

/**
 * Log a command execution
 */
function logCommandExecution(interaction, commandName, subcommand, targetId, targetTag, options, result) {
  logCommand(
    interaction.guild?.id || 'DM',
    interaction.user.id,
    interaction.user.tag,
    commandName,
    subcommand,
    targetId,
    targetTag,
    options,
    result
  );
}

/**
 * Send moderation action notification to user
 */
async function notifyUser(client, userId, action, guildName, reason, caseId, moderator, extraFields = []) {
  const actionColors = {
    warn: 0xF39C12,
    mute: 0xE67E22,
    unmute: 0x2ECC71,
    kick: 0xE74C3C,
    ban: 0xC0392B,
    unban: 0x27AE60
  };

  const actionTitles = {
    warn: '⚠️ You Have Been Warned',
    mute: '🔇 You Have Been Muted',
    unmute: '🔊 You Have Been Unmuted',
    kick: '👢 You Have Been Kicked',
    ban: '🔨 You Have Been Banned',
    unban: '✅ You Have Been Unbanned'
  };

  const embed = new EmbedBuilder()
    .setTitle(actionTitles[action] || `Moderation Action: ${action}`)
    .setColor(actionColors[action] || 0x3498DB)
    .setDescription(`A moderation action has been taken against you in **${guildName}**`)
    .addFields(
      { name: 'Action', value: action.toUpperCase(), inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: true },
      { name: 'Case ID', value: caseId || 'N/A', inline: true },
      { name: 'Moderator', value: moderator, inline: true },
      ...extraFields
    )
    .setTimestamp();

  return dmUser(client, userId, embed);
}

/**
 * Notify superusers about a moderation action
 */
async function notifySuperusers(client, action, guildName, targetTag, targetId, moderatorTag, reason, caseId, extraFields = []) {
  const embed = new EmbedBuilder()
    .setTitle(`📋 Moderation Log: ${action.toUpperCase()}`)
    .setColor(0x3498DB)
    .addFields(
      { name: 'Server', value: guildName, inline: true },
      { name: 'Target', value: `${targetTag} (${targetId})`, inline: true },
      { name: 'Moderator', value: moderatorTag, inline: true },
      { name: 'Action', value: action.toUpperCase(), inline: true },
      { name: 'Case ID', value: caseId || 'N/A', inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: false },
      ...extraFields
    )
    .setTimestamp();

  return dmSuperusers(client, embed);
}

/**
 * Build a standardized moderation result embed
 */
function buildModActionEmbed(action, target, caseId, reason, moderator, extraFields = []) {
  const actionColors = {
    warn: 0xF39C12,
    mute: 0xE67E22,
    unmute: 0x2ECC71,
    kick: 0xE74C3C,
    ban: 0xC0392B,
    unban: 0x27AE60
  };

  const actionEmojis = {
    warn: '⚠️',
    mute: '🔇',
    unmute: '🔊',
    kick: '👢',
    ban: '🔨',
    unban: '✅'
  };

  return new EmbedBuilder()
    .setTitle(`${actionEmojis[action] || '📋'} ${action.charAt(0).toUpperCase() + action.slice(1)} Applied`)
    .setColor(actionColors[action] || 0x3498DB)
    .addFields(
      { name: 'User', value: `${target} (${target.tag || target.username})`, inline: true },
      { name: 'Case ID', value: caseId || 'N/A', inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: false },
      ...extraFields
    )
    .setFooter({ text: `Actioned by ${moderator}` })
    .setTimestamp();
}

/**
 * Get command description for help
 */
function getCommandDescription(commandName) {
  const restriction = COMMAND_RESTRICTIONS[commandName];
  return restriction?.description || 'No description';
}

/**
 * Get required level for command
 */
function getRequiredLevel(commandName, subcommand = null) {
  const fullCommand = subcommand ? `${commandName} ${subcommand}` : commandName;
  const restriction = COMMAND_RESTRICTIONS[fullCommand] || COMMAND_RESTRICTIONS[commandName];
  return restriction?.level || 'USER';
}

module.exports = {
  checkPermission,
  logCommandExecution,
  notifyUser,
  notifySuperusers,
  buildModActionEmbed,
  getCommandDescription,
  getRequiredLevel,
  buildPermissionDeniedEmbed
};

/**
 * Permission System for CO Government Utilities
 * Handles role-based access control for moderation commands
 */

require('dotenv').config();

/**
 * Parse comma-separated IDs from environment
 */
function parseIds(envKey) {
  const val = process.env[envKey];
  if (!val || !val.trim()) return [];
  return val.split(',').map(id => id.trim()).filter(Boolean);
}

// Permission levels (higher = more access)
const PERMISSION_LEVELS = {
  USER: 0,
  MODERATOR: 1,
  SENIOR_MOD: 2,
  ADMIN: 3,
  HR: 4,
  SUPERUSER: 5
};

// Load role IDs from environment
const SUPERUSER_IDS = parseIds('SUPERUSER_IDS');
const MODERATOR_ROLE_IDS = parseIds('MODERATOR_ROLE_IDS');
const SENIOR_MOD_ROLE_IDS = parseIds('SENIOR_MOD_ROLE_IDS');
const ADMIN_ROLE_IDS = parseIds('ADMIN_ROLE_IDS');
const HR_ROLE_IDS = parseIds('HR_ROLE_IDS');

/**
 * Get user's permission level
 */
function getPermissionLevel(member) {
  const userId = member.user?.id || member.id;
  
  // Check superuser first
  if (SUPERUSER_IDS.includes(userId)) {
    return PERMISSION_LEVELS.SUPERUSER;
  }
  
  // Check roles (highest level wins)
  const roleIds = member.roles?.cache?.map(r => r.id) || [];
  
  if (HR_ROLE_IDS.some(id => roleIds.includes(id))) {
    return PERMISSION_LEVELS.HR;
  }
  
  if (ADMIN_ROLE_IDS.some(id => roleIds.includes(id))) {
    return PERMISSION_LEVELS.ADMIN;
  }
  
  if (SENIOR_MOD_ROLE_IDS.some(id => roleIds.includes(id))) {
    return PERMISSION_LEVELS.SENIOR_MOD;
  }
  
  if (MODERATOR_ROLE_IDS.some(id => roleIds.includes(id))) {
    return PERMISSION_LEVELS.MODERATOR;
  }
  
  return PERMISSION_LEVELS.USER;
}

/**
 * Check if user has minimum permission level
 */
function hasPermission(member, requiredLevel) {
  const userLevel = getPermissionLevel(member);
  return userLevel >= requiredLevel;
}

/**
 * Check if user is superuser
 */
function isSuperuser(member) {
  const userId = member.user?.id || member.id;
  return SUPERUSER_IDS.includes(userId);
}

/**
 * Check if user can perform action on target
 */
function canModerate(moderator, target) {
  // Superusers can moderate anyone except other superusers
  if (isSuperuser(moderator)) {
    return !isSuperuser(target);
  }
  
  const modLevel = getPermissionLevel(moderator);
  const targetLevel = getPermissionLevel(target);
  
  // Can only moderate users with lower permission level
  return modLevel > targetLevel;
}

/**
 * Command permission requirements
 */
const COMMAND_PERMISSIONS = {
  // Moderation commands
  'warn': PERMISSION_LEVELS.MODERATOR,
  'mute': PERMISSION_LEVELS.MODERATOR,
  'unmute': PERMISSION_LEVELS.MODERATOR,
  'kick': PERMISSION_LEVELS.MODERATOR,
  'ban': PERMISSION_LEVELS.SENIOR_MOD,
  
  // Case management
  'case view': PERMISSION_LEVELS.MODERATOR,
  'case edit': PERMISSION_LEVELS.SENIOR_MOD,
  'case delete': PERMISSION_LEVELS.ADMIN,
  'case void': PERMISSION_LEVELS.ADMIN,
  'case restore': PERMISSION_LEVELS.ADMIN,
  
  // History
  'view-history': PERMISSION_LEVELS.MODERATOR,
  'deleted-history': PERMISSION_LEVELS.SENIOR_MOD,
  
  // Staff management
  'autorole assign': PERMISSION_LEVELS.HR,
  'autorole remove': PERMISSION_LEVELS.HR,
  'fire': PERMISSION_LEVELS.HR,
  
  // Investigations
  'investigation open': PERMISSION_LEVELS.ADMIN,
  'investigation close': PERMISSION_LEVELS.ADMIN,
  'investigation view': PERMISSION_LEVELS.SENIOR_MOD
};

/**
 * Check if user can use a command
 */
function canUseCommand(member, command) {
  const required = COMMAND_PERMISSIONS[command];
  if (required === undefined) return true; // No restriction
  return hasPermission(member, required);
}

/**
 * Get permission level name
 */
function getLevelName(level) {
  const names = Object.entries(PERMISSION_LEVELS).find(([, v]) => v === level);
  return names ? names[0] : 'UNKNOWN';
}

/**
 * Build permission denied embed
 */
function buildPermissionDeniedEmbed(command, requiredLevel) {
  const { EmbedBuilder } = require('discord.js');
  
  return new EmbedBuilder()
    .setTitle('🚫 Permission Denied')
    .setColor(0xE74C3C)
    .setDescription(`You do not have permission to use this command.`)
    .addFields(
      { name: 'Command', value: `\`/${command}\``, inline: true },
      { name: 'Required Level', value: getLevelName(requiredLevel), inline: true }
    )
    .setTimestamp();
}

module.exports = {
  PERMISSION_LEVELS,
  getPermissionLevel,
  hasPermission,
  isSuperuser,
  canModerate,
  canUseCommand,
  getLevelName,
  buildPermissionDeniedEmbed,
  COMMAND_PERMISSIONS
};

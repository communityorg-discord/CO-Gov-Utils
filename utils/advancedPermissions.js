/**
 * Advanced Permissions System
 * Handles superusers, permission grants, requests, and command access control
 */

const { query, queryOne, execute } = require('./database');
const { EmbedBuilder } = require('discord.js');

// Hardcoded IDs - cannot be removed
const BOT_DEVELOPER_ID = '723199054514749450';
const HARDCODED_SUPERUSERS = ['723199054514749450', '415922272956710912'];

// Command categories and their commands
const COMMAND_CATEGORIES = {
  MODERATION: ['warn', 'mute', 'unmute', 'kick', 'ban', 'unban'],
  CASE_MANAGEMENT: ['case', 'view-history', 'deleted-history'],
  ROLE_MANAGEMENT: ['role', 'mass-role', 'autorole', 'fire'],
  INVESTIGATIONS: ['investigation'],
  LOCKDOWN: ['lockdown'],
  GLOBAL_MODERATION: ['global'],
  PERMISSIONS: ['permission', 'superuser'],
  SETUP: ['setup'],
  UTILITY: ['ping', 'help', 'info']
};

// Commands restricted to specific permission levels
const COMMAND_RESTRICTIONS = {
  'setup': { level: 'BOT_DEVELOPER', description: 'Bot configuration' },
  'superuser': { level: 'SUPERUSER', description: 'Superuser management' },
  'global': { level: 'SUPERUSER', description: 'Global moderation' },
  'permission grant': { level: 'SUPERUSER', description: 'Grant permissions' },
  'permission revoke': { level: 'SUPERUSER', description: 'Revoke permissions' },
  'permission approve': { level: 'SUPERUSER', description: 'Approve requests' },
  'permission deny': { level: 'SUPERUSER', description: 'Deny requests' },
  'case void': { level: 'ADMIN', description: 'Void cases permanently' },
  'case restore': { level: 'ADMIN', description: 'Restore deleted cases' },
  'lockdown server': { level: 'ADMIN', description: 'Server-wide lockdown' },
  'lockdown unlock-server': { level: 'ADMIN', description: 'Unlock server' },
  'fire': { level: 'HR', description: 'Remove all roles from user' },
  'investigation': { level: 'HR', description: 'Manage investigations' },
  'notes': { level: 'HR', description: 'Staff notes on users' },
  'mass-role': { level: 'SENIOR_MOD', description: 'Bulk role management' },
  'ban': { level: 'SENIOR_MOD', description: 'Ban users' },
  'unban': { level: 'SENIOR_MOD', description: 'Unban users' },
  'softban': { level: 'SENIOR_MOD', description: 'Softban users (clear messages)' },
  'deleted-history': { level: 'SENIOR_MOD', description: 'View deleted cases' },
  'case delete': { level: 'SENIOR_MOD', description: 'Delete cases' },
  'case edit': { level: 'SENIOR_MOD', description: 'Edit cases (mods can edit own)', allowOwnCase: true },
  'autorole': { level: 'SENIOR_MOD', description: 'Auto-role assignment' },
  'lockdown channel': { level: 'SENIOR_MOD', description: 'Channel lockdown' },
  'lockdown unlock-channel': { level: 'SENIOR_MOD', description: 'Unlock channel' },
  'lockdown status': { level: 'SENIOR_MOD', description: 'View lockdown status' },
  'watchlist': { level: 'SENIOR_MOD', description: 'User watchlist management' },
  'nickname': { level: 'SENIOR_MOD', description: 'Nickname management' },
  'raid-mode': { level: 'ADMIN', description: 'Emergency raid mode' },
  'backup': { level: 'ADMIN', description: 'Server backup/restore' },
  'sticky': { level: 'MODERATOR', description: 'Sticky messages' },
  'warn': { level: 'MODERATOR', description: 'Warn users' },
  'mute': { level: 'MODERATOR', description: 'Mute users' },
  'unmute': { level: 'MODERATOR', description: 'Unmute users' },
  'kick': { level: 'MODERATOR', description: 'Kick users' },
  'role': { level: 'MODERATOR', description: 'Role management' },
  'case view': { level: 'MODERATOR', description: 'View cases' },
  'view-history': { level: 'MODERATOR', description: 'View user history' },
  'invite-tracker': { level: 'MODERATOR', description: 'Invite tracking' },
  'server-stats': { level: 'MODERATOR', description: 'Server statistics' },
  'channel-stats': { level: 'MODERATOR', description: 'Channel statistics' },
  'audit-log': { level: 'MODERATOR', description: 'Search audit logs' },
  'activity': { level: 'MODERATOR', description: 'User activity stats' },
  'leaderboard': { level: 'MODERATOR', description: 'Activity leaderboards' },
  'modstats': { level: 'SENIOR_MOD', description: 'Moderator statistics' },
  'massban': { level: 'SUPERUSER', description: 'Mass ban users' },
  'filter': { level: 'SUPERUSER', description: 'Word filters' },
  'office': { level: 'MODERATOR', description: 'Office management' },
  'vc': { level: 'MODERATOR', description: 'Voice channel controls' },
  'permission request': { level: 'USER', description: 'Request permissions' },
  'permission list': { level: 'USER', description: 'View own permissions' },
  'ping': { level: 'USER', description: 'Check bot latency' },
  'help': { level: 'USER', description: 'View help' },
  'info': { level: 'USER', description: 'View bot info' },
  'staff add': { level: 'ADMIN', description: 'Create staff account' },
  'staff link': { level: 'ADMIN', description: 'Link Discord to email' },
  'staff unlink': { level: 'ADMIN', description: 'Unlink Discord from email' },
  'staff list': { level: 'SENIOR_MOD', description: 'View all staff' },
  'staff info': { level: 'MODERATOR', description: 'View staff info' }
};

// Permission levels (numeric for comparison)
const PERMISSION_LEVELS = {
  USER: 0,
  MODERATOR: 1,
  SENIOR_MOD: 2,
  ADMIN: 3,
  HR: 4,
  SUPERUSER: 5,
  BOT_DEVELOPER: 6
};

/**
 * Check if user is the bot developer
 */
function isBotDeveloper(userId) {
  return userId === BOT_DEVELOPER_ID;
}

/**
 * Check if moderator can moderate target (hierarchy check)
 */
function canModerate(moderator, target) {
  // Superusers/Bot Developer can moderate anyone
  if (isSuperuser(moderator.id || moderator.user?.id)) return true;
  if (isBotDeveloper(moderator.id || moderator.user?.id)) return true;

  // Can't moderate yourself
  const modId = moderator.id || moderator.user?.id;
  const targetId = target.id || target.user?.id;
  if (modId === targetId) return false;

  // Can't moderate superusers or bot developer
  if (isSuperuser(targetId)) return false;
  if (isBotDeveloper(targetId)) return false;

  // Check role hierarchy
  if (moderator.roles?.highest && target.roles?.highest) {
    return moderator.roles.highest.position > target.roles.highest.position;
  }

  return true;
}

/**
 * Check if user is a hardcoded superuser
 */
function isHardcodedSuperuser(userId) {
  return HARDCODED_SUPERUSERS.includes(userId);
}

/**
 * Check if user is any superuser (hardcoded or dynamic)
 */
function isSuperuser(userId) {
  if (isHardcodedSuperuser(userId)) return true;

  const dynamic = queryOne('SELECT * FROM superusers WHERE user_id = ?', [userId]);
  return !!dynamic;
}

/**
 * Get all superusers
 */
function getAllSuperusers() {
  const dynamic = query('SELECT * FROM superusers');
  return {
    hardcoded: HARDCODED_SUPERUSERS,
    dynamic: dynamic.map(s => s.user_id),
    all: [...new Set([...HARDCODED_SUPERUSERS, ...dynamic.map(s => s.user_id)])]
  };
}

/**
 * Add a superuser
 */
function addSuperuser(userId, userTag, addedBy, addedByTag) {
  if (isHardcodedSuperuser(userId)) {
    return { success: false, error: 'User is already a hardcoded superuser' };
  }

  try {
    execute(`
      INSERT INTO superusers (user_id, user_tag, added_by, added_by_tag)
      VALUES (?, ?, ?, ?)
    `, [userId, userTag, addedBy, addedByTag]);
    return { success: true };
  } catch (e) {
    if (e.message.includes('UNIQUE constraint')) {
      return { success: false, error: 'User is already a superuser' };
    }
    return { success: false, error: e.message };
  }
}

/**
 * Remove a superuser
 */
function removeSuperuser(userId, removedBy) {
  if (isHardcodedSuperuser(userId)) {
    return { success: false, error: 'Cannot remove hardcoded superusers' };
  }

  const existing = queryOne('SELECT * FROM superusers WHERE user_id = ?', [userId]);
  if (!existing) {
    return { success: false, error: 'User is not a superuser' };
  }

  execute('DELETE FROM superusers WHERE user_id = ?', [userId]);
  return { success: true };
}

/**
 * Get user's permission level
 */
function getUserPermissionLevel(member) {
  const userId = typeof member === 'string' ? member : member.id || member.user?.id;

  if (isBotDeveloper(userId)) return PERMISSION_LEVELS.BOT_DEVELOPER;
  if (isSuperuser(userId)) return PERMISSION_LEVELS.SUPERUSER;

  // Check role-based permissions if member object provided
  if (member && member.roles) {
    const roleNames = member.roles.cache?.map(r => r.name.toLowerCase()) || [];

    if (roleNames.some(r => r.includes('hr') || r.includes('human resources'))) {
      return PERMISSION_LEVELS.HR;
    }
    if (roleNames.some(r => r.includes('admin') || r.includes('administrator'))) {
      return PERMISSION_LEVELS.ADMIN;
    }
    if (roleNames.some(r => r.includes('senior') && r.includes('mod'))) {
      return PERMISSION_LEVELS.SENIOR_MOD;
    }
    if (roleNames.some(r => r.includes('mod') || r.includes('moderator'))) {
      return PERMISSION_LEVELS.MODERATOR;
    }
  }

  return PERMISSION_LEVELS.USER;
}

/**
 * Check if user has permission for a command
 */
function hasPermission(member, commandName, subcommand = null) {
  const userId = typeof member === 'string' ? member : member.id || member.user?.id;
  const guildId = member.guild?.id;

  // Bot developer has access to everything
  if (isBotDeveloper(userId)) return { allowed: true, reason: 'Bot Developer' };

  // Superusers have access to everything except BOT_DEVELOPER restricted commands
  const fullCommand = subcommand ? `${commandName} ${subcommand}` : commandName;
  const restriction = COMMAND_RESTRICTIONS[fullCommand] || COMMAND_RESTRICTIONS[commandName];

  if (restriction?.level === 'BOT_DEVELOPER') {
    return { allowed: false, reason: 'This command is restricted to the Bot Developer' };
  }

  if (isSuperuser(userId)) return { allowed: true, reason: 'Superuser' };

  // Check for explicit permission grants
  if (guildId) {
    // Check command grant (user)
    const commandGrant = queryOne(`
      SELECT * FROM permission_grants 
      WHERE guild_id = ? AND user_id = ? 
      AND permission_type = 'command' AND permission_value = ?
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    `, [guildId, userId, fullCommand]);

    if (commandGrant) {
      return { allowed: true, reason: 'Granted command permission' };
    }

    // Check category grant (user)
    const categoryGrant = queryOne(`
      SELECT * FROM permission_grants 
      WHERE guild_id = ? AND user_id = ? 
      AND permission_type = 'category' AND permission_value = ?
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    `, [guildId, userId, getCategoryForCommand(commandName)]);

    if (categoryGrant) {
      return { allowed: true, reason: 'Granted category permission' };
    }

    // Check level grant (user)
    const levelGrant = queryOne(`
      SELECT * FROM permission_grants 
      WHERE guild_id = ? AND user_id = ? 
      AND permission_type = 'level'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    `, [guildId, userId]);

    if (levelGrant) {
      const grantedLevel = PERMISSION_LEVELS[levelGrant.permission_value] || 0;
      const requiredLevel = restriction ? PERMISSION_LEVELS[restriction.level] : PERMISSION_LEVELS.USER;
      if (grantedLevel >= requiredLevel) {
        return { allowed: true, reason: `Granted ${levelGrant.permission_value} level` };
      }
    }

    // Check role grants (if member has roles)
    if (member && member.roles && member.roles.cache) {
      const roleIds = member.roles.cache.map(r => r.id);
      for (const roleId of roleIds) {
        // Check command grant for role
        const roleCommandGrant = queryOne(`
          SELECT * FROM permission_grants 
          WHERE guild_id = ? AND user_id = ? 
          AND permission_type = 'command' AND permission_value = ?
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        `, [guildId, roleId, fullCommand]);
        if (roleCommandGrant) return { allowed: true, reason: 'Role has command permission' };

        // Check level grant for role
        const roleLevelGrant = queryOne(`
          SELECT * FROM permission_grants 
          WHERE guild_id = ? AND user_id = ? 
          AND permission_type = 'level'
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        `, [guildId, roleId]);
        if (roleLevelGrant) {
          const grantedLevel = PERMISSION_LEVELS[roleLevelGrant.permission_value] || 0;
          const requiredLevel = restriction ? PERMISSION_LEVELS[restriction.level] : PERMISSION_LEVELS.USER;
          if (grantedLevel >= requiredLevel) {
            return { allowed: true, reason: `Role has ${roleLevelGrant.permission_value} level` };
          }
        }
      }
    }
  }

  // Check role-based permission level
  const userLevel = getUserPermissionLevel(member);
  const requiredLevel = restriction ? PERMISSION_LEVELS[restriction.level] : PERMISSION_LEVELS.USER;

  if (userLevel >= requiredLevel) {
    return { allowed: true, reason: 'Role-based permission' };
  }

  return {
    allowed: false,
    reason: `Requires ${restriction?.level || 'USER'} permission level`,
    canRequest: true,
    requiredLevel: restriction?.level || 'USER'
  };
}

/**
 * Get category for a command
 */
function getCategoryForCommand(commandName) {
  for (const [category, commands] of Object.entries(COMMAND_CATEGORIES)) {
    if (commands.includes(commandName)) return category;
  }
  return 'UTILITY';
}

/**
 * Grant permission to a user
 */
function grantPermission(guildId, userId, userTag, type, value, grantedBy, grantedByTag, reason, expiresAt = null) {
  try {
    execute(`
      INSERT OR REPLACE INTO permission_grants 
      (guild_id, user_id, user_tag, permission_type, permission_value, granted_by, granted_by_tag, reason, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [guildId, userId, userTag, type, value, grantedBy, grantedByTag, reason, expiresAt]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Revoke permission from a user
 */
function revokePermission(guildId, userId, type, value) {
  const existing = queryOne(`
    SELECT * FROM permission_grants 
    WHERE guild_id = ? AND user_id = ? AND permission_type = ? AND permission_value = ?
  `, [guildId, userId, type, value]);

  if (!existing) {
    return { success: false, error: 'Permission grant not found' };
  }

  execute(`
    DELETE FROM permission_grants 
    WHERE guild_id = ? AND user_id = ? AND permission_type = ? AND permission_value = ?
  `, [guildId, userId, type, value]);

  return { success: true };
}

/**
 * Get user's permissions
 */
function getUserPermissions(guildId, userId) {
  return query(`
    SELECT * FROM permission_grants 
    WHERE guild_id = ? AND user_id = ?
    AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY created_at DESC
  `, [guildId, userId]);
}

/**
 * Create permission request
 */
function createPermissionRequest(guildId, userId, userTag, type, value, reason) {
  const requestId = `REQ-${Date.now().toString(36).toUpperCase()}`;

  // Check if already has permission
  const existing = queryOne(`
    SELECT * FROM permission_grants 
    WHERE guild_id = ? AND user_id = ? AND permission_type = ? AND permission_value = ?
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `, [guildId, userId, type, value]);

  if (existing) {
    return { success: false, error: 'You already have this permission' };
  }

  // Check for pending request
  const pending = queryOne(`
    SELECT * FROM permission_requests 
    WHERE guild_id = ? AND user_id = ? AND permission_type = ? AND permission_value = ? AND status = 'pending'
  `, [guildId, userId, type, value]);

  if (pending) {
    return { success: false, error: 'You already have a pending request for this permission' };
  }

  execute(`
    INSERT INTO permission_requests (request_id, guild_id, user_id, user_tag, permission_type, permission_value, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [requestId, guildId, userId, userTag, type, value, reason]);

  return { success: true, requestId };
}

/**
 * Get pending permission requests
 */
function getPendingRequests(guildId) {
  return query(`
    SELECT * FROM permission_requests 
    WHERE guild_id = ? AND status = 'pending'
    ORDER BY created_at ASC
  `, [guildId]);
}

/**
 * Get permission request by ID
 */
function getPermissionRequest(requestId) {
  return queryOne('SELECT * FROM permission_requests WHERE request_id = ?', [requestId]);
}

/**
 * Review permission request
 */
function reviewPermissionRequest(requestId, status, reviewedBy, reviewedByTag, reviewReason) {
  const request = getPermissionRequest(requestId);
  if (!request) {
    return { success: false, error: 'Request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Request has already been reviewed' };
  }

  execute(`
    UPDATE permission_requests 
    SET status = ?, reviewed_by = ?, reviewed_by_tag = ?, review_reason = ?, reviewed_at = datetime('now')
    WHERE request_id = ?
  `, [status, reviewedBy, reviewedByTag, reviewReason, requestId]);

  // If approved, grant the permission
  if (status === 'approved') {
    grantPermission(
      request.guild_id,
      request.user_id,
      request.user_tag,
      request.permission_type,
      request.permission_value,
      reviewedBy,
      reviewedByTag,
      `Approved request: ${reviewReason || request.reason}`
    );
  }

  return { success: true, request };
}

/**
 * Log command usage
 */
function logCommand(guildId, userId, userTag, commandName, subcommand, targetId, targetTag, options, result) {
  execute(`
    INSERT INTO command_log (guild_id, user_id, user_tag, command_name, subcommand, target_id, target_tag, options, result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [guildId, userId, userTag, commandName, subcommand, targetId, targetTag, JSON.stringify(options), result]);
}

/**
 * Get commands user can access
 */
function getAccessibleCommands(member) {
  const accessible = [];

  for (const [command, restriction] of Object.entries(COMMAND_RESTRICTIONS)) {
    const result = hasPermission(member, command.split(' ')[0], command.split(' ')[1]);
    if (result.allowed) {
      accessible.push({ command, ...restriction });
    }
  }

  return accessible;
}

/**
 * Build permission denied embed with request option
 */
function buildPermissionDeniedEmbed(commandName, requiredLevel, canRequest = true) {
  const embed = new EmbedBuilder()
    .setTitle('⛔ Permission Denied')
    .setColor(0xE74C3C)
    .setDescription(`You do not have permission to use \`/${commandName}\``)
    .addFields(
      { name: 'Required Level', value: requiredLevel, inline: true }
    )
    .setTimestamp();

  if (canRequest) {
    embed.addFields({
      name: 'Request Access',
      value: `Use \`/permission request command:${commandName}\` to request access`
    });
  }

  return embed;
}

/**
 * DM superusers about an action
 */
async function dmSuperusers(client, embed) {
  const superusers = getAllSuperusers();

  for (const userId of superusers.all) {
    try {
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [embed] });
    } catch (e) {
      // User may have DMs disabled
    }
  }
}

/**
 * DM a user about an action taken on them
 */
async function dmUser(client, userId, embed) {
  try {
    const user = await client.users.fetch(userId);
    await user.send({ embeds: [embed] });
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Could not DM user' };
  }
}

module.exports = {
  BOT_DEVELOPER_ID,
  HARDCODED_SUPERUSERS,
  COMMAND_CATEGORIES,
  COMMAND_RESTRICTIONS,
  PERMISSION_LEVELS,
  isBotDeveloper,
  canModerate,
  isHardcodedSuperuser,
  isSuperuser,
  getAllSuperusers,
  addSuperuser,
  removeSuperuser,
  getUserPermissionLevel,
  hasPermission,
  getCategoryForCommand,
  grantPermission,
  revokePermission,
  getUserPermissions,
  createPermissionRequest,
  getPendingRequests,
  getPermissionRequest,
  reviewPermissionRequest,
  logCommand,
  getAccessibleCommands,
  buildPermissionDeniedEmbed,
  dmSuperusers,
  dmUser
};

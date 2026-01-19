/**
 * Case Management System
 * Handles creation, retrieval, editing, and deletion of moderation cases
 */

const { query, queryOne, execute } = require('./database');

const CASE_PREFIX = process.env.CASE_PREFIX || 'CASE';

/**
 * Generate next case ID for a guild (or global)
 */
function generateCaseId(guildId, isGlobal = false) {
  const prefix = isGlobal ? 'GLOBAL' : CASE_PREFIX;
  const counterId = isGlobal ? 'GLOBAL' : guildId;
  
  // Get or create counter for guild/global
  let counter = queryOne('SELECT current_number FROM case_counters WHERE guild_id = ?', [counterId]);
  
  if (!counter) {
    execute('INSERT INTO case_counters (guild_id, current_number) VALUES (?, ?)', [counterId, 0]);
    counter = { current_number: 0 };
  }
  
  const nextNumber = counter.current_number + 1;
  execute('UPDATE case_counters SET current_number = ? WHERE guild_id = ?', [nextNumber, counterId]);
  
  return `${prefix}-${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Create a new case
 */
function createCase(data) {
  const {
    guildId,
    globalCase = false,
    userId,
    userTag,
    moderatorId,
    moderatorTag,
    actionType,
    reason,
    evidence,
    duration,
    points
  } = data;
  
  const caseId = generateCaseId(guildId, globalCase);
  const isGlobal = globalCase ? 1 : 0;
  
  execute(`
    INSERT INTO cases (
      case_id, guild_id, global_case, user_id, user_tag, moderator_id, moderator_tag,
      action_type, reason, evidence, duration, points, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `, [caseId, guildId, isGlobal, userId, userTag, moderatorId, moderatorTag, actionType, reason, evidence, duration, points || 1]);
  
  return getCase(caseId);
}

/**
 * Get a case by ID
 */
function getCase(caseId) {
  return queryOne('SELECT * FROM cases WHERE case_id = ?', [caseId]);
}

/**
 * Get all active cases for a user in a guild
 */
function getUserCases(guildId, userId, includeDeleted = false) {
  if (includeDeleted) {
    return query(
      'SELECT * FROM cases WHERE guild_id = ? AND user_id = ? AND voided_at IS NULL ORDER BY created_at DESC',
      [guildId, userId]
    );
  }
  return query(
    'SELECT * FROM cases WHERE guild_id = ? AND user_id = ? AND status = ? ORDER BY created_at DESC',
    [guildId, userId, 'active']
  );
}

/**
 * Get deleted cases for a user
 */
function getDeletedCases(guildId, userId) {
  return query(
    'SELECT * FROM cases WHERE guild_id = ? AND user_id = ? AND deleted_at IS NOT NULL AND voided_at IS NULL ORDER BY deleted_at DESC',
    [guildId, userId]
  );
}

/**
 * Get all cases in a guild (with filters)
 */
function getGuildCases(guildId, filters = {}) {
  let sql = 'SELECT * FROM cases WHERE guild_id = ?';
  const params = [guildId];
  
  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  
  if (filters.actionType) {
    sql += ' AND action_type = ?';
    params.push(filters.actionType);
  }
  
  if (filters.moderatorId) {
    sql += ' AND moderator_id = ?';
    params.push(filters.moderatorId);
  }
  
  if (!filters.includeVoided) {
    sql += ' AND voided_at IS NULL';
  }
  
  sql += ' ORDER BY created_at DESC';
  
  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }
  
  return query(sql, params);
}

/**
 * Edit a case
 */
function editCase(caseId, editorId, editorTag, changes, editReason) {
  const currentCase = getCase(caseId);
  if (!currentCase) return null;
  
  // Log each change
  for (const [field, newValue] of Object.entries(changes)) {
    const oldValue = currentCase[field];
    
    execute(`
      INSERT INTO case_edits (case_id, editor_id, editor_tag, field_changed, old_value, new_value, edit_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [caseId, editorId, editorTag, field, String(oldValue), String(newValue), editReason]);
  }
  
  // Build update query
  const fields = Object.keys(changes);
  const values = Object.values(changes);
  
  if (fields.length > 0) {
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    execute(
      `UPDATE cases SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?`,
      [...values, caseId]
    );
  }
  
  return getCase(caseId);
}

/**
 * Get case edit history
 */
function getCaseEdits(caseId) {
  return query('SELECT * FROM case_edits WHERE case_id = ? ORDER BY created_at DESC', [caseId]);
}

/**
 * Soft delete a case (still visible in deleted-history)
 */
function deleteCase(caseId, deletedBy) {
  execute(`
    UPDATE cases 
    SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE case_id = ?
  `, [deletedBy, caseId]);
  
  return getCase(caseId);
}

/**
 * Void a case (completely hidden)
 */
function voidCase(caseId, voidedBy, voidReason) {
  execute(`
    UPDATE cases 
    SET status = 'voided', voided_at = CURRENT_TIMESTAMP, voided_by = ?, void_reason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE case_id = ?
  `, [voidedBy, voidReason, caseId]);
  
  return getCase(caseId);
}

/**
 * Restore a deleted case
 */
function restoreCase(caseId) {
  execute(`
    UPDATE cases 
    SET status = 'active', deleted_at = NULL, deleted_by = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE case_id = ? AND voided_at IS NULL
  `, [caseId]);
  
  return getCase(caseId);
}

/**
 * Get total warn points for a user
 */
function getUserWarnPoints(guildId, userId) {
  const result = queryOne(`
    SELECT COALESCE(SUM(points), 0) as total_points
    FROM cases 
    WHERE guild_id = ? AND user_id = ? AND action_type = 'warn' AND status = 'active'
  `, [guildId, userId]);
  
  return result?.total_points || 0;
}

/**
 * Get case statistics for a guild
 */
function getGuildStats(guildId) {
  return queryOne(`
    SELECT 
      COUNT(*) as total_cases,
      SUM(CASE WHEN action_type = 'warn' THEN 1 ELSE 0 END) as warns,
      SUM(CASE WHEN action_type = 'mute' THEN 1 ELSE 0 END) as mutes,
      SUM(CASE WHEN action_type = 'kick' THEN 1 ELSE 0 END) as kicks,
      SUM(CASE WHEN action_type = 'ban' THEN 1 ELSE 0 END) as bans,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) as deleted
    FROM cases 
    WHERE guild_id = ? AND voided_at IS NULL
  `, [guildId]);
}

module.exports = {
  generateCaseId,
  createCase,
  getCase,
  getUserCases,
  getDeletedCases,
  getGuildCases,
  editCase,
  getCaseEdits,
  deleteCase,
  voidCase,
  restoreCase,
  getUserWarnPoints,
  getGuildStats
};

/**
 * Nickname Lock Manager
 * Enforces locked nicknames across servers and changes
 */

const { execute, query, queryOne } = require('./database');

// Initialize nickname lock table
function initNicknameTable() {
    try {
        execute(`
      CREATE TABLE IF NOT EXISTS nickname_locks (
        user_id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        locked_by TEXT NOT NULL,
        locked_by_tag TEXT,
        locked_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        console.log('[NicknameManager] ✓ Table initialized');
    } catch (e) {
        console.error('[NicknameManager] Table init failed:', e.message);
    }
}

/**
 * Lock a nickname for a user (global)
 */
function lockNickname(userId, nickname, lockedBy, lockedByTag) {
    try {
        execute(`
      INSERT OR REPLACE INTO nickname_locks (user_id, nickname, locked_by, locked_by_tag)
      VALUES (?, ?, ?, ?)
    `, [userId, nickname, lockedBy, lockedByTag]);
        return { success: true };
    } catch (e) {
        console.error('[NicknameManager] Lock failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Unlock a nickname
 */
function unlockNickname(userId) {
    try {
        const result = execute('DELETE FROM nickname_locks WHERE user_id = ?', [userId]);
        return { success: result.changes > 0 };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Get locked nickname for a user
 */
function getLockedNickname(userId) {
    try {
        const lock = queryOne('SELECT * FROM nickname_locks WHERE user_id = ?', [userId]);
        return lock || null;
    } catch (e) {
        return null;
    }
}

/**
 * Get all locked nicknames
 */
function getAllLockedNicknames() {
    try {
        return query('SELECT * FROM nickname_locks ORDER BY locked_at DESC');
    } catch (e) {
        return [];
    }
}

/**
 * Handle member join - enforce nickname
 */
async function handleMemberJoin(member) {
    const lock = getLockedNickname(member.id);
    if (!lock) return false;

    try {
        await member.setNickname(lock.nickname, 'Enforcing locked nickname');
        console.log(`[NicknameManager] Enforced nickname "${lock.nickname}" for ${member.user.tag} on join`);
        return true;
    } catch (e) {
        console.error(`[NicknameManager] Failed to enforce nickname for ${member.user.tag}:`, e.message);
        return false;
    }
}

/**
 * Handle nickname change - revert if locked
 */
async function handleNicknameChange(oldMember, newMember) {
    // Only check if nickname changed
    if (oldMember.nickname === newMember.nickname) return false;

    const lock = getLockedNickname(newMember.id);
    if (!lock) return false;

    // If new nickname doesn't match locked, revert it
    if (newMember.nickname !== lock.nickname) {
        try {
            await newMember.setNickname(lock.nickname, 'Enforcing locked nickname - reverting change');
            console.log(`[NicknameManager] Reverted nickname change for ${newMember.user.tag} back to "${lock.nickname}"`);
            return true;
        } catch (e) {
            console.error(`[NicknameManager] Failed to revert nickname for ${newMember.user.tag}:`, e.message);
        }
    }

    return false;
}

/**
 * Apply locked nickname across all guilds
 */
async function enforceNicknameGlobally(client, userId, nickname) {
    let success = 0;
    let failed = 0;

    for (const [, guild] of client.guilds.cache) {
        try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;

            await member.setNickname(nickname, 'Global nickname enforcement');
            success++;

            // Rate limit protection
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            failed++;
        }
    }

    return { success, failed };
}

// Initialize on load
initNicknameTable();

module.exports = {
    lockNickname,
    unlockNickname,
    getLockedNickname,
    getAllLockedNicknames,
    handleMemberJoin,
    handleNicknameChange,
    enforceNicknameGlobally
};

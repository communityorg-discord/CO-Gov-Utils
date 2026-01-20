/**
 * Staff Manager
 * Manages staff accounts linking Discord IDs to emails for dashboard access
 */

const { query, queryOne, execute } = require('./database');
const { getUserPermissionLevel, PERMISSION_LEVELS } = require('./advancedPermissions');

/**
 * Link a Discord account to an email
 */
function linkAccount(discordId, email, displayName, linkedBy) {
    try {
        execute(`
            INSERT OR REPLACE INTO staff_accounts 
            (discord_id, email, display_name, linked_at, linked_by)
            VALUES (?, ?, ?, datetime('now'), ?)
        `, [discordId, email.toLowerCase(), displayName, linkedBy]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Unlink a Discord account
 */
function unlinkAccount(discordId) {
    const existing = getStaffByDiscordId(discordId);
    if (!existing) {
        return { success: false, error: 'Account not linked' };
    }

    execute('DELETE FROM staff_accounts WHERE discord_id = ?', [discordId]);
    return { success: true, email: existing.email };
}

/**
 * Get staff account by Discord ID
 */
function getStaffByDiscordId(discordId) {
    return queryOne('SELECT * FROM staff_accounts WHERE discord_id = ?', [discordId]);
}

/**
 * Get staff account by email
 */
function getStaffByEmail(email) {
    return queryOne('SELECT * FROM staff_accounts WHERE email = ?', [email.toLowerCase()]);
}

/**
 * Get all staff accounts
 */
function getAllStaff() {
    return query('SELECT * FROM staff_accounts ORDER BY linked_at DESC');
}

/**
 * Verify email and get permissions
 * Used by dashboard to check if email is linked and get permission level
 */
function verifyEmailAndGetPermissions(email, member = null) {
    const staff = getStaffByEmail(email);

    if (!staff) {
        return { success: false, error: 'Email not linked to any Discord account' };
    }

    // Get permission level
    let permissionLevel = PERMISSION_LEVELS.USER;
    if (member) {
        permissionLevel = getUserPermissionLevel(member);
    }

    return {
        success: true,
        discordId: staff.discord_id,
        email: staff.email,
        displayName: staff.display_name,
        permissionLevel,
        permissionName: Object.keys(PERMISSION_LEVELS).find(k => PERMISSION_LEVELS[k] === permissionLevel)
    };
}

/**
 * Update staff display name
 */
function updateDisplayName(discordId, displayName) {
    execute('UPDATE staff_accounts SET display_name = ? WHERE discord_id = ?', [displayName, discordId]);
}

module.exports = {
    linkAccount,
    unlinkAccount,
    getStaffByDiscordId,
    getStaffByEmail,
    getAllStaff,
    verifyEmailAndGetPermissions,
    updateDisplayName
};

/**
 * Word Filter Manager
 * Manage blocked words/phrases with auto-actions
 */

const { execute, query, queryOne } = require('./database');

// Initialize filter table
function initFilterTable() {
    try {
        execute(`
      CREATE TABLE IF NOT EXISTS word_filters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        pattern TEXT NOT NULL,
        is_regex BOOLEAN DEFAULT 0,
        action TEXT DEFAULT 'delete',
        created_by TEXT,
        created_by_tag TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, pattern)
      )
    `);
        execute('CREATE INDEX IF NOT EXISTS idx_filter_guild ON word_filters(guild_id)');
        console.log('[WordFilter] ✓ Table initialized');
    } catch (e) {
        console.error('[WordFilter] Table init failed:', e.message);
    }
}

/**
 * Add a word/phrase to filter
 */
function addFilter(guildId, pattern, action = 'delete', isRegex = false, createdBy, createdByTag) {
    try {
        execute(`
      INSERT INTO word_filters (guild_id, pattern, action, is_regex, created_by, created_by_tag)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [guildId, pattern.toLowerCase(), action, isRegex ? 1 : 0, createdBy, createdByTag]);
        return { success: true };
    } catch (e) {
        if (e.message.includes('UNIQUE')) {
            return { success: false, error: 'Pattern already exists' };
        }
        return { success: false, error: e.message };
    }
}

/**
 * Remove a filter
 */
function removeFilter(guildId, pattern) {
    try {
        const result = execute('DELETE FROM word_filters WHERE guild_id = ? AND pattern = ?', [guildId, pattern.toLowerCase()]);
        return { success: result.changes > 0 };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Remove filter by ID
 */
function removeFilterById(guildId, id) {
    try {
        const result = execute('DELETE FROM word_filters WHERE guild_id = ? AND id = ?', [guildId, id]);
        return { success: result.changes > 0 };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Get all filters for a guild
 */
function getFilters(guildId) {
    try {
        return query('SELECT * FROM word_filters WHERE guild_id = ? ORDER BY created_at DESC', [guildId]);
    } catch (e) {
        return [];
    }
}

/**
 * Check if message matches any filter
 * Returns: { matched: boolean, filter: object|null, action: string|null }
 */
function checkMessage(guildId, content) {
    try {
        const filters = getFilters(guildId);
        const lowerContent = content.toLowerCase();

        for (const filter of filters) {
            let matched = false;

            if (filter.is_regex) {
                try {
                    const regex = new RegExp(filter.pattern, 'gi');
                    matched = regex.test(content);
                } catch (e) {
                    // Invalid regex, skip
                }
            } else {
                // Simple word/phrase match
                matched = lowerContent.includes(filter.pattern);
            }

            if (matched) {
                return {
                    matched: true,
                    filter: filter,
                    action: filter.action
                };
            }
        }

        return { matched: false, filter: null, action: null };
    } catch (e) {
        return { matched: false, filter: null, action: null };
    }
}

/**
 * Test a message against filters (dry run)
 */
function testMessage(guildId, content) {
    return checkMessage(guildId, content);
}

/**
 * Handle filtered message
 */
async function handleFilteredMessage(message, filter, client) {
    const action = filter.action;

    try {
        switch (action) {
            case 'delete':
                await message.delete();
                break;

            case 'warn':
                await message.delete();
                // Create warn case
                try {
                    const caseManager = require('./caseManager');
                    await caseManager.createCase({
                        guildId: message.guild.id,
                        userId: message.author.id,
                        userTag: message.author.tag,
                        moderatorId: client.user.id,
                        moderatorTag: client.user.tag,
                        action: 'WARN',
                        reason: `[AutoMod] Triggered word filter: ${filter.pattern}`
                    });
                } catch (e) { }
                break;

            case 'mute':
                await message.delete();
                // 10 minute mute
                try {
                    const member = message.member;
                    if (member) {
                        await member.timeout(10 * 60 * 1000, `[AutoMod] Triggered word filter: ${filter.pattern}`);
                    }
                } catch (e) { }
                break;

            case 'log':
                // Just log, don't delete
                break;
        }

        return true;
    } catch (e) {
        return false;
    }
}

// Initialize on load
initFilterTable();

module.exports = {
    addFilter,
    removeFilter,
    removeFilterById,
    getFilters,
    checkMessage,
    testMessage,
    handleFilteredMessage
};

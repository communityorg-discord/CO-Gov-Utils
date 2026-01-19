/**
 * Activity Tracker
 * Track user messages and voice time for analytics
 */

const { execute, query, queryOne } = require('./database');

// Initialize activity table
function initActivityTable() {
    try {
        execute(`
      CREATE TABLE IF NOT EXISTS user_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        message_count INTEGER DEFAULT 0,
        voice_minutes INTEGER DEFAULT 0,
        UNIQUE(guild_id, user_id, date)
      )
    `);
        execute('CREATE INDEX IF NOT EXISTS idx_activity_guild ON user_activity(guild_id)');
        execute('CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity(user_id)');
        execute('CREATE INDEX IF NOT EXISTS idx_activity_date ON user_activity(date)');
        console.log('[ActivityTracker] ✓ Table initialized');
    } catch (e) {
        console.error('[ActivityTracker] Table init failed:', e.message);
    }
}

/**
 * Get today's date string
 */
function getToday() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Increment message count for a user
 */
function trackMessage(guildId, userId) {
    try {
        const date = getToday();
        execute(`
      INSERT INTO user_activity (guild_id, user_id, date, message_count, voice_minutes)
      VALUES (?, ?, ?, 1, 0)
      ON CONFLICT(guild_id, user_id, date) 
      DO UPDATE SET message_count = message_count + 1
    `, [guildId, userId, date]);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Add voice minutes for a user
 */
function trackVoice(guildId, userId, minutes) {
    try {
        const date = getToday();
        execute(`
      INSERT INTO user_activity (guild_id, user_id, date, message_count, voice_minutes)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(guild_id, user_id, date) 
      DO UPDATE SET voice_minutes = voice_minutes + ?
    `, [guildId, userId, date, minutes, minutes]);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Get user's activity stats
 */
function getUserActivity(guildId, userId, days = 30) {
    try {
        const stats = queryOne(`
      SELECT 
        SUM(message_count) as total_messages,
        SUM(voice_minutes) as total_voice,
        COUNT(DISTINCT date) as active_days
      FROM user_activity
      WHERE guild_id = ? AND user_id = ?
      AND date >= date('now', '-' || ? || ' days')
    `, [guildId, userId, days]);

        const daily = query(`
      SELECT date, message_count, voice_minutes
      FROM user_activity
      WHERE guild_id = ? AND user_id = ?
      AND date >= date('now', '-7 days')
      ORDER BY date DESC
    `, [guildId, userId]);

        return {
            totalMessages: stats?.total_messages || 0,
            totalVoice: stats?.total_voice || 0,
            activeDays: stats?.active_days || 0,
            daily
        };
    } catch (e) {
        return { totalMessages: 0, totalVoice: 0, activeDays: 0, daily: [] };
    }
}

/**
 * Get channel activity stats
 */
function getChannelActivity(guildId, days = 7) {
    // Note: This would need message tracking per channel
    // For now return guild-wide stats
    return getGuildActivity(guildId, days);
}

/**
 * Get guild-wide activity stats
 */
function getGuildActivity(guildId, days = 30) {
    try {
        const stats = queryOne(`
      SELECT 
        SUM(message_count) as total_messages,
        SUM(voice_minutes) as total_voice,
        COUNT(DISTINCT user_id) as unique_users
      FROM user_activity
      WHERE guild_id = ?
      AND date >= date('now', '-' || ? || ' days')
    `, [guildId, days]);

        const daily = query(`
      SELECT date, SUM(message_count) as messages, SUM(voice_minutes) as voice
      FROM user_activity
      WHERE guild_id = ?
      AND date >= date('now', '-7 days')
      GROUP BY date
      ORDER BY date DESC
    `, [guildId]);

        return {
            totalMessages: stats?.total_messages || 0,
            totalVoice: stats?.total_voice || 0,
            uniqueUsers: stats?.unique_users || 0,
            daily
        };
    } catch (e) {
        return { totalMessages: 0, totalVoice: 0, uniqueUsers: 0, daily: [] };
    }
}

/**
 * Get top users by messages
 */
function getTopMessagers(guildId, days = 30, limit = 10) {
    try {
        return query(`
      SELECT user_id, SUM(message_count) as total
      FROM user_activity
      WHERE guild_id = ?
      AND date >= date('now', '-' || ? || ' days')
      GROUP BY user_id
      ORDER BY total DESC
      LIMIT ?
    `, [guildId, days, limit]);
    } catch (e) {
        return [];
    }
}

/**
 * Get top users by voice time
 */
function getTopVoice(guildId, days = 30, limit = 10) {
    try {
        return query(`
      SELECT user_id, SUM(voice_minutes) as total
      FROM user_activity
      WHERE guild_id = ?
      AND date >= date('now', '-' || ? || ' days')
      GROUP BY user_id
      ORDER BY total DESC
      LIMIT ?
    `, [guildId, days, limit]);
    } catch (e) {
        return [];
    }
}

// Voice session tracking (in memory)
const voiceSessions = new Map();

/**
 * Handle voice state update
 */
function handleVoiceStateUpdate(oldState, newState) {
    const guildId = newState.guild.id;
    const userId = newState.member?.id;
    if (!userId) return;

    const key = `${guildId}:${userId}`;

    // User joined voice
    if (!oldState.channel && newState.channel) {
        voiceSessions.set(key, Date.now());
    }
    // User left voice
    else if (oldState.channel && !newState.channel) {
        const joinTime = voiceSessions.get(key);
        if (joinTime) {
            const minutes = Math.floor((Date.now() - joinTime) / 60000);
            if (minutes > 0) {
                trackVoice(guildId, userId, minutes);
            }
            voiceSessions.delete(key);
        }
    }
}

// Initialize on load
initActivityTable();

/**
 * Get current active voice session time for a user
 */
function getCurrentSessionTime(guildId, userId) {
    const key = `${guildId}:${userId}`;
    const joinTime = voiceSessions.get(key);
    if (joinTime) {
        return Math.floor((Date.now() - joinTime) / 60000);
    }
    return 0;
}

module.exports = {
    trackMessage,
    trackVoice,
    getUserActivity,
    getChannelActivity,
    getGuildActivity,
    getTopMessagers,
    getTopVoice,
    handleVoiceStateUpdate,
    getCurrentSessionTime
};

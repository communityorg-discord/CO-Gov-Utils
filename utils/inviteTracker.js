/**
 * Invite Tracker Manager
 * Track which invites users join from
 */

const { execute, query, queryOne } = require('./database');
const { EmbedBuilder } = require('discord.js');

// Cache invites in memory for comparison
const inviteCache = new Map();

// Initialize invite tracking table
function initInviteTable() {
    try {
        execute(`
      CREATE TABLE IF NOT EXISTS invite_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_tag TEXT,
        invite_code TEXT,
        inviter_id TEXT,
        inviter_tag TEXT,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        execute('CREATE INDEX IF NOT EXISTS idx_invite_guild ON invite_tracking(guild_id)');
        execute('CREATE INDEX IF NOT EXISTS idx_invite_inviter ON invite_tracking(inviter_id)');
        console.log('[InviteTracker] ✓ Table initialized');
    } catch (e) {
        console.error('[InviteTracker] Table init failed:', e.message);
    }
}

/**
 * Cache all invites for a guild
 */
async function cacheGuildInvites(guild) {
    try {
        const invites = await guild.invites.fetch();
        const inviteData = new Map();

        for (const [code, invite] of invites) {
            inviteData.set(code, {
                code,
                uses: invite.uses,
                inviterId: invite.inviter?.id,
                inviterTag: invite.inviter?.tag
            });
        }

        inviteCache.set(guild.id, inviteData);
        return inviteData;
    } catch (e) {
        console.error(`[InviteTracker] Failed to cache invites for ${guild.id}:`, e.message);
        return null;
    }
}

/**
 * Find which invite was used when a member joins
 */
async function trackMemberJoin(member) {
    const guild = member.guild;

    try {
        // Get old cached invites
        const oldInvites = inviteCache.get(guild.id) || new Map();

        // Fetch new invites
        const newInvites = await guild.invites.fetch();

        // Find the invite that was used (uses increased by 1)
        let usedInvite = null;

        for (const [code, invite] of newInvites) {
            const oldInvite = oldInvites.get(code);
            if (oldInvite && invite.uses > oldInvite.uses) {
                usedInvite = {
                    code,
                    inviterId: invite.inviter?.id,
                    inviterTag: invite.inviter?.tag
                };
                break;
            }
            // New invite that wasn't in cache
            if (!oldInvite && invite.uses > 0) {
                usedInvite = {
                    code,
                    inviterId: invite.inviter?.id,
                    inviterTag: invite.inviter?.tag
                };
            }
        }

        // Update cache
        await cacheGuildInvites(guild);

        // Record join
        if (usedInvite) {
            execute(`
        INSERT INTO invite_tracking (guild_id, user_id, user_tag, invite_code, inviter_id, inviter_tag)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
                guild.id,
                member.id,
                member.user.tag,
                usedInvite.code,
                usedInvite.inviterId,
                usedInvite.inviterTag
            ]);
        }

        return usedInvite;

    } catch (e) {
        console.error('[InviteTracker] Track join failed:', e.message);
        return null;
    }
}

/**
 * Get inviter stats for a user
 */
function getInviterStats(guildId, userId) {
    try {
        const total = queryOne(
            'SELECT COUNT(*) as count FROM invite_tracking WHERE guild_id = ? AND inviter_id = ?',
            [guildId, userId]
        )?.count || 0;

        // Get recent invites
        const recent = query(`
      SELECT user_tag, joined_at FROM invite_tracking 
      WHERE guild_id = ? AND inviter_id = ?
      ORDER BY joined_at DESC LIMIT 10
    `, [guildId, userId]);

        return { total, recent };
    } catch (e) {
        return { total: 0, recent: [] };
    }
}

/**
 * Get who invited a user
 */
function getInvitedBy(guildId, userId) {
    try {
        return queryOne(`
      SELECT * FROM invite_tracking 
      WHERE guild_id = ? AND user_id = ?
      ORDER BY joined_at DESC LIMIT 1
    `, [guildId, userId]);
    } catch (e) {
        return null;
    }
}

/**
 * Get invite leaderboard
 */
function getInviteLeaderboard(guildId, limit = 10) {
    try {
        return query(`
      SELECT inviter_id, inviter_tag, COUNT(*) as invite_count
      FROM invite_tracking
      WHERE guild_id = ? AND inviter_id IS NOT NULL
      GROUP BY inviter_id
      ORDER BY invite_count DESC
      LIMIT ?
    `, [guildId, limit]);
    } catch (e) {
        return [];
    }
}

/**
 * Get recent joins with invite info
 */
function getRecentJoins(guildId, limit = 10) {
    try {
        return query(`
      SELECT * FROM invite_tracking
      WHERE guild_id = ?
      ORDER BY joined_at DESC
      LIMIT ?
    `, [guildId, limit]);
    } catch (e) {
        return [];
    }
}

// Initialize on load
initInviteTable();

module.exports = {
    cacheGuildInvites,
    trackMemberJoin,
    getInviterStats,
    getInvitedBy,
    getInviteLeaderboard,
    getRecentJoins,
    inviteCache
};

/**
 * Watchlist Manager
 * Flag users for monitoring, auto-alert when they join/message
 */

const { execute, query, queryOne } = require('./database');
const { EmbedBuilder } = require('discord.js');

// Initialize watchlist table
function initWatchlistTable() {
    try {
        execute(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_tag TEXT,
        reason TEXT,
        alert_on_join INTEGER DEFAULT 1,
        alert_on_message INTEGER DEFAULT 1,
        added_by TEXT NOT NULL,
        added_by_tag TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, user_id)
      )
    `);
        execute('CREATE INDEX IF NOT EXISTS idx_watchlist_guild ON watchlist(guild_id)');
        execute('CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id)');
        console.log('[WatchlistManager] ✓ Table initialized');
    } catch (e) {
        console.error('[WatchlistManager] Table init failed:', e.message);
    }
}

/**
 * Add user to watchlist
 */
function addToWatchlist(guildId, userId, userTag, reason, addedBy, addedByTag, options = {}) {
    try {
        const result = execute(`
      INSERT OR REPLACE INTO watchlist 
      (guild_id, user_id, user_tag, reason, alert_on_join, alert_on_message, added_by, added_by_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            guildId, userId, userTag, reason,
            options.alertOnJoin !== false ? 1 : 0,
            options.alertOnMessage !== false ? 1 : 0,
            addedBy, addedByTag
        ]);

        return { success: true };
    } catch (e) {
        console.error('[WatchlistManager] Add failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Remove user from watchlist
 */
function removeFromWatchlist(guildId, userId) {
    try {
        const result = execute(`
      DELETE FROM watchlist WHERE guild_id = ? AND user_id = ?
    `, [guildId, userId]);

        return { success: result.changes > 0 };
    } catch (e) {
        console.error('[WatchlistManager] Remove failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Check if user is on watchlist
 */
function isOnWatchlist(guildId, userId) {
    try {
        const entry = queryOne(`
      SELECT * FROM watchlist WHERE guild_id = ? AND user_id = ?
    `, [guildId, userId]);
        return entry || null;
    } catch (e) {
        return null;
    }
}

/**
 * Check if user is on watchlist (any guild)
 */
function isOnAnyWatchlist(userId) {
    try {
        return query(`
      SELECT * FROM watchlist WHERE user_id = ?
    `, [userId]);
    } catch (e) {
        return [];
    }
}

/**
 * Get all watchlist entries for a guild
 */
function getGuildWatchlist(guildId) {
    try {
        return query(`
      SELECT * FROM watchlist WHERE guild_id = ?
      ORDER BY added_at DESC
    `, [guildId]);
    } catch (e) {
        return [];
    }
}

/**
 * Get watchlist count for guild
 */
function getWatchlistCount(guildId) {
    try {
        const result = queryOne(`
      SELECT COUNT(*) as count FROM watchlist WHERE guild_id = ?
    `, [guildId]);
        return result?.count || 0;
    } catch (e) {
        return 0;
    }
}

/**
 * Send alert to audit log channel
 */
async function sendWatchlistAlert(client, guildId, type, userId, userTag, entry, extraDetails = {}) {
    try {
        // Get audit log channel from setup
        const setupFile = require('path').join(__dirname, '..', 'config', 'setup.json');
        const fs = require('fs');

        let auditChannelId = null;
        if (fs.existsSync(setupFile)) {
            const setup = JSON.parse(fs.readFileSync(setupFile, 'utf8'));
            auditChannelId = setup[guildId]?.auditLogChannel;
        }

        if (!auditChannelId) {
            console.log(`[Watchlist] No audit channel configured for guild ${guildId}`);
            return;
        }

        const channel = await client.channels.fetch(auditChannelId).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🚨 WATCHLIST ALERT: ${type.toUpperCase()}`)
            .setColor(0xFF0000)
            .setTimestamp();

        if (type === 'join') {
            embed.setDescription(`**A watchlisted user has joined the server!**`)
                .addFields(
                    { name: '👤 User', value: `<@${userId}>\n${userTag}\n\`${userId}\``, inline: true },
                    { name: '⚠️ Reason on Watchlist', value: entry.reason || 'No reason provided', inline: true },
                    { name: '📅 Added to Watchlist', value: `<t:${Math.floor(new Date(entry.added_at).getTime() / 1000)}:R>`, inline: true },
                    { name: '👮 Added By', value: entry.added_by_tag || 'Unknown', inline: true }
                );
        } else if (type === 'message') {
            embed.setDescription(`**A watchlisted user sent a message!**`)
                .addFields(
                    { name: '👤 User', value: `<@${userId}>\n${userTag}`, inline: true },
                    { name: '📍 Channel', value: `<#${extraDetails.channelId}>`, inline: true },
                    { name: '⚠️ Reason on Watchlist', value: entry.reason || 'No reason provided', inline: false }
                );

            if (extraDetails.messageContent) {
                embed.addFields({
                    name: '💬 Message',
                    value: extraDetails.messageContent.substring(0, 500) + (extraDetails.messageContent.length > 500 ? '...' : ''),
                    inline: false
                });
            }
        }

        await channel.send({ embeds: [embed] });
        console.log(`[Watchlist] Alert sent for ${userId} (${type})`);

    } catch (e) {
        console.error('[Watchlist] Alert failed:', e.message);
    }
}

/**
 * Handle member join event
 */
async function handleMemberJoin(member, client) {
    const entry = isOnWatchlist(member.guild.id, member.id);
    if (entry && entry.alert_on_join) {
        await sendWatchlistAlert(client, member.guild.id, 'join', member.id, member.user.tag, entry);
    }
}

/**
 * Handle message event - call sparingly (check first)
 */
async function handleMessage(message, client) {
    if (message.author.bot) return;

    const entry = isOnWatchlist(message.guild.id, message.author.id);
    if (entry && entry.alert_on_message) {
        await sendWatchlistAlert(client, message.guild.id, 'message', message.author.id, message.author.tag, entry, {
            channelId: message.channel.id,
            messageContent: message.content
        });
    }
}

// Initialize on load
initWatchlistTable();

module.exports = {
    addToWatchlist,
    removeFromWatchlist,
    isOnWatchlist,
    isOnAnyWatchlist,
    getGuildWatchlist,
    getWatchlistCount,
    sendWatchlistAlert,
    handleMemberJoin,
    handleMessage
};

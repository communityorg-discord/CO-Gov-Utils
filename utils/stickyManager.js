/**
 * Sticky Messages Manager
 * Messages that stay at the bottom of a channel
 */

const { execute, query, queryOne } = require('./database');
const { EmbedBuilder } = require('discord.js');

// Track message cooldowns to avoid spam
const cooldowns = new Map();
const COOLDOWN_MS = 5000; // 5 seconds between reposts

// Initialize sticky table
function initStickyTable() {
    try {
        execute(`
      CREATE TABLE IF NOT EXISTS sticky_messages (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embed_data TEXT,
        last_message_id TEXT,
        created_by TEXT NOT NULL,
        created_by_tag TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        execute('CREATE INDEX IF NOT EXISTS idx_sticky_guild ON sticky_messages(guild_id)');
        console.log('[StickyManager] ✓ Table initialized');
    } catch (e) {
        console.error('[StickyManager] Table init failed:', e.message);
    }
}

/**
 * Set a sticky message for a channel
 */
function setSticky(channelId, guildId, content, createdBy, createdByTag, embedData = null) {
    try {
        execute(`
      INSERT OR REPLACE INTO sticky_messages 
      (channel_id, guild_id, content, embed_data, created_by, created_by_tag)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [channelId, guildId, content, embedData ? JSON.stringify(embedData) : null, createdBy, createdByTag]);

        return { success: true };
    } catch (e) {
        console.error('[StickyManager] Set failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Remove sticky from a channel
 */
function removeSticky(channelId) {
    try {
        const result = execute('DELETE FROM sticky_messages WHERE channel_id = ?', [channelId]);
        return { success: result.changes > 0 };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Get sticky for a channel
 */
function getSticky(channelId) {
    try {
        return queryOne('SELECT * FROM sticky_messages WHERE channel_id = ?', [channelId]);
    } catch (e) {
        return null;
    }
}

/**
 * Get all stickies for a guild
 */
function getGuildStickies(guildId) {
    try {
        return query('SELECT * FROM sticky_messages WHERE guild_id = ?', [guildId]);
    } catch (e) {
        return [];
    }
}

/**
 * Update the last message ID for a sticky
 */
function updateStickyMessageId(channelId, messageId) {
    try {
        execute('UPDATE sticky_messages SET last_message_id = ? WHERE channel_id = ?', [messageId, channelId]);
    } catch (e) {
        // Non-critical
    }
}

/**
 * Handle a message in a channel with a sticky
 * Called from messageCreate event
 */
async function handleMessage(message) {
    if (message.author.bot) return;

    const sticky = getSticky(message.channel.id);
    if (!sticky) return;

    // Check cooldown
    const lastPost = cooldowns.get(message.channel.id);
    if (lastPost && Date.now() - lastPost < COOLDOWN_MS) {
        return; // Still in cooldown
    }

    try {
        // Delete old sticky message
        if (sticky.last_message_id) {
            try {
                const oldMsg = await message.channel.messages.fetch(sticky.last_message_id);
                await oldMsg.delete();
            } catch (e) {
                // Old message might be deleted already
            }
        }

        // Create new sticky message
        const embed = new EmbedBuilder()
            .setTitle('📌 Sticky Message')
            .setDescription(sticky.content)
            .setColor(0xFFD700)
            .setFooter({ text: 'This message will stay at the bottom of the channel' });

        const newMsg = await message.channel.send({ embeds: [embed] });

        // Save new message ID
        updateStickyMessageId(message.channel.id, newMsg.id);
        cooldowns.set(message.channel.id, Date.now());

    } catch (e) {
        console.error('[StickyManager] Repost failed:', e.message);
    }
}

/**
 * Post initial sticky message
 */
async function postSticky(channel, content) {
    try {
        const embed = new EmbedBuilder()
            .setTitle('📌 Sticky Message')
            .setDescription(content)
            .setColor(0xFFD700)
            .setFooter({ text: 'This message will stay at the bottom of the channel' });

        const msg = await channel.send({ embeds: [embed] });
        updateStickyMessageId(channel.id, msg.id);
        cooldowns.set(channel.id, Date.now());

        return { success: true, messageId: msg.id };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Initialize on load
initStickyTable();

module.exports = {
    setSticky,
    removeSticky,
    getSticky,
    getGuildStickies,
    handleMessage,
    postSticky
};

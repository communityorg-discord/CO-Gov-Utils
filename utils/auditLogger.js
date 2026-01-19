/**
 * Audit Logger Utility
 * Sends action logs to the configured audit log channel
 */

const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const SETUP_FILE = path.join(__dirname, '..', 'config', 'setup.json');

/**
 * Get the audit log channel ID for a guild
 */
function getAuditChannelId(guildId) {
    try {
        if (fs.existsSync(SETUP_FILE)) {
            const setup = JSON.parse(fs.readFileSync(SETUP_FILE, 'utf8'));
            return setup[guildId]?.auditLogChannel || null;
        }
    } catch (e) { }
    return null;
}

/**
 * Send an audit log embed
 */
async function sendAuditLog(client, guildId, embed) {
    try {
        const channelId = getAuditChannelId(guildId);
        if (!channelId) return false;

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return false;

        await channel.send({ embeds: [embed] });
        return true;
    } catch (e) {
        console.error('[AuditLogger] Failed to send:', e.message);
        return false;
    }
}

/**
 * Log watchlist action
 */
async function logWatchlistAction(client, guildId, action, targetUser, staffUser, reason = null) {
    const colors = { add: 0xE74C3C, remove: 0x2ECC71 };
    const titles = { add: '👁️ User Added to Watchlist', remove: '✅ User Removed from Watchlist' };

    const embed = new EmbedBuilder()
        .setTitle(titles[action] || '👁️ Watchlist Action')
        .setColor(colors[action] || 0x3498DB)
        .addFields(
            { name: '👤 User', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
            { name: '👮 Staff', value: staffUser.tag, inline: true }
        )
        .setTimestamp();

    if (reason) {
        embed.addFields({ name: '⚠️ Reason', value: reason, inline: false });
    }

    return sendAuditLog(client, guildId, embed);
}

/**
 * Log staff note action
 */
async function logNoteAction(client, guildId, action, targetUser, staffUser, noteId = null, noteContent = null) {
    const colors = { add: 0x3498DB, delete: 0xE74C3C };
    const titles = { add: '📝 Staff Note Added', delete: '🗑️ Staff Note Deleted' };

    const embed = new EmbedBuilder()
        .setTitle(titles[action] || '📝 Note Action')
        .setColor(colors[action] || 0x3498DB)
        .addFields(
            { name: '👤 Target User', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
            { name: '✍️ Staff', value: staffUser.tag, inline: true }
        )
        .setTimestamp();

    if (noteId) {
        embed.addFields({ name: '🔢 Note ID', value: `#${noteId}`, inline: true });
    }

    if (noteContent && action === 'add') {
        embed.addFields({ name: '📄 Note', value: noteContent.substring(0, 500), inline: false });
    }

    return sendAuditLog(client, guildId, embed);
}

/**
 * Log nickname action
 */
async function logNicknameAction(client, guildId, action, targetUser, staffUser, details = {}) {
    const colors = {
        set: 0x3498DB,
        reset: 0x95A5A6,
        lock: 0xE74C3C,
        unlock: 0x2ECC71,
        mass: 0x9B59B6,
        global: 0x9B59B6
    };
    const titles = {
        set: '✏️ Nickname Changed',
        reset: '↩️ Nickname Reset',
        lock: '🔒 Nickname Locked',
        unlock: '🔓 Nickname Unlocked',
        mass: '📝 Mass Nickname Change',
        global: '🌐 Global Nickname Set'
    };

    const embed = new EmbedBuilder()
        .setTitle(titles[action] || '✏️ Nickname Action')
        .setColor(colors[action] || 0x3498DB)
        .addFields(
            { name: '👤 Target', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
            { name: '👮 Staff', value: staffUser.tag, inline: true }
        )
        .setTimestamp();

    if (details.oldNick) {
        embed.addFields({ name: '📝 Old', value: details.oldNick, inline: true });
    }
    if (details.newNick) {
        embed.addFields({ name: '📝 New', value: details.newNick, inline: true });
    }
    if (details.lockedNick) {
        embed.addFields({ name: '🔒 Locked To', value: details.lockedNick, inline: true });
    }

    return sendAuditLog(client, guildId, embed);
}

/**
 * Log sticky message action
 */
async function logStickyAction(client, guildId, action, channel, staffUser, content = null) {
    const colors = { set: 0xFFD700, remove: 0xE74C3C };
    const titles = { set: '📌 Sticky Message Set', remove: '📌 Sticky Message Removed' };

    const embed = new EmbedBuilder()
        .setTitle(titles[action] || '📌 Sticky Action')
        .setColor(colors[action] || 0xFFD700)
        .addFields(
            { name: '📍 Channel', value: `<#${channel.id}>`, inline: true },
            { name: '👮 Staff', value: staffUser.tag, inline: true }
        )
        .setTimestamp();

    if (content && action === 'set') {
        embed.addFields({ name: '📄 Content', value: content.substring(0, 300), inline: false });
    }

    return sendAuditLog(client, guildId, embed);
}

/**
 * Log raid mode action
 */
async function logRaidModeAction(client, guildId, action, level, staffUser, duration = null) {
    const colors = { enable: 0xFF0000, disable: 0x2ECC71 };
    const titles = { enable: '🚨 RAID MODE ENABLED', disable: '✅ RAID MODE DISABLED' };

    const embed = new EmbedBuilder()
        .setTitle(titles[action] || '🛡️ Raid Mode Action')
        .setColor(colors[action] || 0xFF0000)
        .addFields(
            { name: '👮 Staff', value: staffUser.tag, inline: true },
            { name: '🛡️ Level', value: String(level), inline: true }
        )
        .setTimestamp();

    if (duration && action === 'enable') {
        embed.addFields({ name: '⏱️ Duration', value: duration, inline: true });
    }

    return sendAuditLog(client, guildId, embed);
}

/**
 * Log softban action
 */
async function logSoftbanAction(client, guildId, targetUser, staffUser, reason, daysDeleted) {
    const embed = new EmbedBuilder()
        .setTitle('🔨 User Softbanned')
        .setColor(0xF39C12)
        .addFields(
            { name: '👤 User', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
            { name: '👮 Moderator', value: staffUser.tag, inline: true },
            { name: '🗑️ Messages Deleted', value: `${daysDeleted} day(s)`, inline: true },
            { name: '📝 Reason', value: reason, inline: false }
        )
        .setTimestamp();

    return sendAuditLog(client, guildId, embed);
}

/**
 * Log backup action
 */
async function logBackupAction(client, guildId, action, staffUser, details = {}) {
    const colors = { create: 0x3498DB, restore: 0xF39C12, delete: 0xE74C3C };
    const titles = {
        create: '💾 Backup Created',
        restore: '📂 Backup Restored',
        delete: '🗑️ Backup Deleted'
    };

    const embed = new EmbedBuilder()
        .setTitle(titles[action] || '💾 Backup Action')
        .setColor(colors[action] || 0x3498DB)
        .addFields({ name: '👮 Staff', value: staffUser.tag, inline: true })
        .setTimestamp();

    if (details.backupId) {
        embed.addFields({ name: '🔢 Backup ID', value: details.backupId, inline: true });
    }
    if (details.components) {
        embed.addFields({ name: '📦 Components', value: details.components, inline: false });
    }

    return sendAuditLog(client, guildId, embed);
}

/**
 * Generic audit log for any action
 */
async function logAction(client, guildId, title, color, fields, footer = null) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .addFields(fields)
        .setTimestamp();

    if (footer) {
        embed.setFooter({ text: footer });
    }

    return sendAuditLog(client, guildId, embed);
}

module.exports = {
    getAuditChannelId,
    sendAuditLog,
    logWatchlistAction,
    logNoteAction,
    logNicknameAction,
    logStickyAction,
    logRaidModeAction,
    logSoftbanAction,
    logBackupAction,
    logAction
};

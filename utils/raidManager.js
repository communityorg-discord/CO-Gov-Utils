/**
 * Raid Mode Manager
 * Emergency mode: auto-kick new accounts, increase verification
 */

const { execute, queryOne } = require('./database');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Initialize raid mode table
function initRaidTable() {
    try {
        execute(`
      CREATE TABLE IF NOT EXISTS raid_mode (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        enabled_by TEXT,
        enabled_by_tag TEXT,
        enabled_at DATETIME,
        expires_at DATETIME,
        original_verification TEXT
      )
    `);
        console.log('[RaidManager] ✓ Table initialized');
    } catch (e) {
        console.error('[RaidManager] Table init failed:', e.message);
    }
}

/**
 * Get raid mode status for a guild
 */
function getRaidStatus(guildId) {
    try {
        const state = queryOne('SELECT * FROM raid_mode WHERE guild_id = ?', [guildId]);
        if (!state) return { enabled: false, level: 0 };

        // Check if expired
        if (state.expires_at && new Date() > new Date(state.expires_at)) {
            disableRaidMode(guildId);
            return { enabled: false, level: 0, expired: true };
        }

        return {
            enabled: state.enabled === 1,
            level: state.level,
            enabledBy: state.enabled_by,
            enabledByTag: state.enabled_by_tag,
            enabledAt: state.enabled_at,
            expiresAt: state.expires_at
        };
    } catch (e) {
        return { enabled: false, level: 0 };
    }
}

/**
 * Enable raid mode
 */
async function enableRaidMode(guild, level, duration, enabledBy, enabledByTag) {
    try {
        const expiresAt = duration ? new Date(Date.now() + duration).toISOString() : null;

        // Store original verification level
        const originalVerification = guild.verificationLevel;

        execute(`
      INSERT OR REPLACE INTO raid_mode 
      (guild_id, enabled, level, enabled_by, enabled_by_tag, enabled_at, expires_at, original_verification)
      VALUES (?, 1, ?, ?, ?, datetime('now'), ?, ?)
    `, [guild.id, level, enabledBy, enabledByTag, expiresAt, String(originalVerification)]);

        // Apply raid mode effects
        await applyRaidEffects(guild, level);

        // Schedule auto-disable if duration set
        if (duration) {
            setTimeout(async () => {
                const status = getRaidStatus(guild.id);
                if (status.enabled) {
                    await disableRaidModeWithRestore(guild);
                    await sendRaidAlert(guild, 'expired', level);
                }
            }, duration);
        }

        return { success: true };
    } catch (e) {
        console.error('[RaidManager] Enable failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Apply raid mode effects based on level
 */
async function applyRaidEffects(guild, level) {
    try {
        // Level 1: Set verification to High
        if (level >= 1) {
            await guild.setVerificationLevel(3); // High
        }

        // Level 2: Set verification to Highest
        if (level >= 2) {
            await guild.setVerificationLevel(4); // Highest
        }

        // Level 3: Could add channel lockdown here
        // (implementation depends on your lockdown system)

        console.log(`[RaidManager] Applied level ${level} effects to ${guild.name}`);
    } catch (e) {
        console.error('[RaidManager] Apply effects failed:', e.message);
    }
}

/**
 * Disable raid mode
 */
function disableRaidMode(guildId) {
    try {
        execute('UPDATE raid_mode SET enabled = 0 WHERE guild_id = ?', [guildId]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Disable raid mode and restore settings
 */
async function disableRaidModeWithRestore(guild) {
    try {
        const state = queryOne('SELECT * FROM raid_mode WHERE guild_id = ?', [guild.id]);

        // Restore original verification
        if (state?.original_verification) {
            await guild.setVerificationLevel(parseInt(state.original_verification));
        }

        disableRaidMode(guild.id);
        console.log(`[RaidManager] Disabled raid mode for ${guild.name}`);

        return { success: true };
    } catch (e) {
        console.error('[RaidManager] Disable failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Handle member join during raid mode
 */
async function handleMemberJoin(member, client) {
    const status = getRaidStatus(member.guild.id);
    if (!status.enabled) return false;

    const accountAge = Date.now() - member.user.createdTimestamp;
    const accountDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));

    let action = null;

    // Level 1: Alert on new accounts < 7 days, timeout < 3 days
    if (status.level >= 1) {
        if (accountDays < 3) {
            try {
                await member.timeout(10 * 60 * 1000, 'Raid mode: Account too new'); // 10 min timeout
                action = 'timeout';
            } catch (e) { }
        }
    }

    // Level 2: Kick accounts < 7 days
    if (status.level >= 2 && accountDays < 7) {
        try {
            await member.kick('Raid mode: Account too new');
            action = 'kick';
        } catch (e) { }
    }

    // Level 3: Ban accounts < 30 days
    if (status.level >= 3 && accountDays < 30) {
        try {
            await member.ban({ reason: 'Raid mode: Account too new', deleteMessageDays: 1 });
            action = 'ban';
        } catch (e) { }
    }

    // Send alert
    if (action) {
        await sendJoinAlert(member, status.level, accountDays, action, client);
    }

    return action !== null;
}

/**
 * Send raid mode alert to audit log
 */
async function sendRaidAlert(guild, type, level) {
    try {
        const setupFile = path.join(__dirname, '..', 'config', 'setup.json');
        let auditChannelId = null;

        if (fs.existsSync(setupFile)) {
            const setup = JSON.parse(fs.readFileSync(setupFile, 'utf8'));
            auditChannelId = setup[guild.id]?.auditLogChannel;
        }

        if (!auditChannelId) return;

        const channel = await guild.channels.fetch(auditChannelId).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🚨 Raid Mode ${type === 'enabled' ? 'ENABLED' : type === 'disabled' ? 'DISABLED' : 'EXPIRED'}`)
            .setColor(type === 'enabled' ? 0xFF0000 : 0x2ECC71)
            .setDescription(type === 'enabled'
                ? `**Level ${level}** raid protection is now active!`
                : 'Raid mode has been deactivated. Normal operations resumed.')
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) { }
}

/**
 * Send join action alert
 */
async function sendJoinAlert(member, level, accountDays, action, client) {
    try {
        const setupFile = path.join(__dirname, '..', 'config', 'setup.json');
        let auditChannelId = null;

        if (fs.existsSync(setupFile)) {
            const setup = JSON.parse(fs.readFileSync(setupFile, 'utf8'));
            auditChannelId = setup[member.guild.id]?.auditLogChannel;
        }

        if (!auditChannelId) return;

        const channel = await client.channels.fetch(auditChannelId).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🛡️ Raid Mode Action: ${action.toUpperCase()}`)
            .setColor(action === 'ban' ? 0xFF0000 : action === 'kick' ? 0xE74C3C : 0xF39C12)
            .addFields(
                { name: '👤 User', value: `${member.user.tag}\n\`${member.id}\``, inline: true },
                { name: '📅 Account Age', value: `${accountDays} days`, inline: true },
                { name: '⚠️ Action', value: action, inline: true }
            )
            .setFooter({ text: `Raid Mode Level ${level}` })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) { }
}

/**
 * Parse duration string (e.g., "30m", "1h", "2h30m")
 */
function parseDuration(str) {
    if (!str) return null;

    const match = str.match(/^(\d+)(m|h|d)?$/i);
    if (!match) return null;

    const num = parseInt(match[1]);
    const unit = (match[2] || 'm').toLowerCase();

    switch (unit) {
        case 'm': return num * 60 * 1000;
        case 'h': return num * 60 * 60 * 1000;
        case 'd': return num * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

// Initialize on load
initRaidTable();

module.exports = {
    getRaidStatus,
    enableRaidMode,
    disableRaidMode,
    disableRaidModeWithRestore,
    handleMemberJoin,
    sendRaidAlert,
    parseDuration
};

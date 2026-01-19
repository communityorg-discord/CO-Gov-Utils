/**
 * Server Backup Manager
 * Comprehensive backup system like Xenon - with message backup
 */

const { execute, query, queryOne } = require('./database');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Initialize backup table
function initBackupTable() {
    try {
        execute(`
      CREATE TABLE IF NOT EXISTS server_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_id TEXT UNIQUE NOT NULL,
        guild_id TEXT NOT NULL,
        guild_name TEXT,
        created_by TEXT NOT NULL,
        created_by_tag TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        components TEXT,
        file_path TEXT,
        size_bytes INTEGER,
        message_count INTEGER DEFAULT 0
      )
    `);
        execute('CREATE INDEX IF NOT EXISTS idx_backup_guild ON server_backups(guild_id)');
        console.log('[BackupManager] ✓ Table initialized');
    } catch (e) {
        console.error('[BackupManager] Table init failed:', e.message);
    }
}

/**
 * Generate unique backup ID
 */
function generateBackupId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

/**
 * Create a full server backup
 */
async function createBackup(guild, createdBy, createdByTag, options = {}) {
    const backupId = generateBackupId();
    const backupData = {
        id: backupId,
        guildId: guild.id,
        guildName: guild.name,
        createdAt: new Date().toISOString(),
        createdBy,
        createdByTag,
        components: [],
        data: {}
    };

    try {
        // 1. Guild Settings
        if (options.settings !== false) {
            backupData.components.push('settings');
            backupData.data.settings = {
                name: guild.name,
                icon: guild.iconURL({ size: 4096 }),
                banner: guild.bannerURL({ size: 4096 }),
                splash: guild.splashURL({ size: 4096 }),
                description: guild.description,
                verificationLevel: guild.verificationLevel,
                defaultMessageNotifications: guild.defaultMessageNotifications,
                explicitContentFilter: guild.explicitContentFilter,
                afkChannel: guild.afkChannelId,
                afkTimeout: guild.afkTimeout,
                systemChannel: guild.systemChannelId,
                rulesChannel: guild.rulesChannelId,
                publicUpdatesChannel: guild.publicUpdatesChannelId
            };
        }

        // 2. Roles
        if (options.roles !== false) {
            backupData.components.push('roles');
            backupData.data.roles = [];

            for (const [, role] of guild.roles.cache) {
                if (role.managed || role.id === guild.id) continue; // Skip bot/integration roles and @everyone

                backupData.data.roles.push({
                    name: role.name,
                    color: role.color,
                    hoist: role.hoist,
                    position: role.position,
                    permissions: role.permissions.bitfield.toString(),
                    mentionable: role.mentionable
                });
            }

            // Sort by position (highest first for proper restoration)
            backupData.data.roles.sort((a, b) => b.position - a.position);
        }

        // 3. Channels
        if (options.channels !== false) {
            backupData.components.push('channels');
            backupData.data.channels = [];
            backupData.data.categories = [];

            for (const [, channel] of guild.channels.cache) {
                const channelData = {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    position: channel.position,
                    parentId: channel.parentId,
                    topic: channel.topic,
                    nsfw: channel.nsfw,
                    bitrate: channel.bitrate,
                    userLimit: channel.userLimit,
                    rateLimitPerUser: channel.rateLimitPerUser,
                    permissionOverwrites: []
                };

                // Get permission overwrites
                for (const [, overwrite] of channel.permissionOverwrites.cache) {
                    channelData.permissionOverwrites.push({
                        id: overwrite.id,
                        type: overwrite.type,
                        allow: overwrite.allow.bitfield.toString(),
                        deny: overwrite.deny.bitfield.toString()
                    });
                }

                if (channel.type === 4) { // Category
                    backupData.data.categories.push(channelData);
                } else {
                    backupData.data.channels.push(channelData);
                }
            }
        }

        // 4. Emojis
        if (options.emojis !== false) {
            backupData.components.push('emojis');
            backupData.data.emojis = [];

            for (const [, emoji] of guild.emojis.cache) {
                backupData.data.emojis.push({
                    name: emoji.name,
                    url: emoji.url,
                    animated: emoji.animated
                });
            }
        }

        // 5. Bans
        if (options.bans !== false) {
            backupData.components.push('bans');
            backupData.data.bans = [];

            try {
                const bans = await guild.bans.fetch();
                for (const [, ban] of bans) {
                    backupData.data.bans.push({
                        id: ban.user.id,
                        tag: ban.user.tag,
                        reason: ban.reason
                    });
                }
            } catch (e) {
                console.log('[BackupManager] Could not fetch bans');
            }
        }

        // 6. Members (nicknames, roles)
        if (options.members !== false) {
            backupData.components.push('members');
            backupData.data.members = [];

            const members = await guild.members.fetch();
            for (const [, member] of members) {
                if (member.user.bot) continue;

                backupData.data.members.push({
                    id: member.id,
                    tag: member.user.tag,
                    nickname: member.nickname,
                    roles: member.roles.cache
                        .filter(r => r.id !== guild.id && !r.managed)
                        .map(r => r.name)
                });
            }
        }

        // 7. Messages (if enabled - expensive operation)
        if (options.messages === true) {
            backupData.components.push('messages');
            backupData.data.messages = {};
            let totalMessages = 0;
            const messageLimit = options.messageLimit || 100;

            for (const [, channel] of guild.channels.cache) {
                if (channel.type !== 0) continue; // Only text channels

                try {
                    const messages = await channel.messages.fetch({ limit: messageLimit });
                    backupData.data.messages[channel.id] = [];

                    for (const [, msg] of messages) {
                        backupData.data.messages[channel.id].push({
                            author: msg.author.tag,
                            authorId: msg.author.id,
                            content: msg.content,
                            embeds: msg.embeds.map(e => e.toJSON()),
                            attachments: msg.attachments.map(a => ({ name: a.name, url: a.url })),
                            createdAt: msg.createdAt.toISOString(),
                            pinned: msg.pinned
                        });
                        totalMessages++;
                    }
                } catch (e) {
                    // Channel might not be accessible
                }
            }

            backupData.messageCount = totalMessages;
        }

        // Save to file
        const fileName = `${backupId}.json`;
        const filePath = path.join(BACKUP_DIR, fileName);
        const jsonData = JSON.stringify(backupData, null, 2);
        fs.writeFileSync(filePath, jsonData);

        // Save to database
        execute(`
      INSERT INTO server_backups 
      (backup_id, guild_id, guild_name, created_by, created_by_tag, components, file_path, size_bytes, message_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            backupId,
            guild.id,
            guild.name,
            createdBy,
            createdByTag,
            backupData.components.join(','),
            filePath,
            jsonData.length,
            backupData.messageCount || 0
        ]);

        return {
            success: true,
            backupId,
            components: backupData.components,
            size: jsonData.length,
            messageCount: backupData.messageCount || 0
        };

    } catch (error) {
        console.error('[BackupManager] Create failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get backup info
 */
function getBackup(backupId) {
    try {
        return queryOne('SELECT * FROM server_backups WHERE backup_id = ?', [backupId]);
    } catch (e) {
        return null;
    }
}

/**
 * Get backup data from file
 */
function getBackupData(backupId) {
    try {
        const backup = getBackup(backupId);
        if (!backup || !backup.file_path) return null;

        if (!fs.existsSync(backup.file_path)) return null;

        const data = JSON.parse(fs.readFileSync(backup.file_path, 'utf8'));
        return data;
    } catch (e) {
        console.error('[BackupManager] Read failed:', e.message);
        return null;
    }
}

/**
 * List backups for a guild
 */
function getGuildBackups(guildId) {
    try {
        return query('SELECT * FROM server_backups WHERE guild_id = ? ORDER BY created_at DESC', [guildId]);
    } catch (e) {
        return [];
    }
}

/**
 * Delete a backup
 */
function deleteBackup(backupId, guildId) {
    try {
        const backup = queryOne('SELECT * FROM server_backups WHERE backup_id = ? AND guild_id = ?', [backupId, guildId]);
        if (!backup) return { success: false, error: 'Backup not found' };

        // Delete file
        if (backup.file_path && fs.existsSync(backup.file_path)) {
            fs.unlinkSync(backup.file_path);
        }

        // Delete from database
        execute('DELETE FROM server_backups WHERE backup_id = ? AND guild_id = ?', [backupId, guildId]);

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Restore a backup (partial restore)
 */
async function restoreBackup(guild, backupId, options = {}) {
    const backupData = getBackupData(backupId);
    if (!backupData) {
        return { success: false, error: 'Backup not found or corrupted' };
    }

    const results = {
        roles: { created: 0, failed: 0 },
        channels: { created: 0, failed: 0 },
        categories: { created: 0, failed: 0 },
        settings: false,
        emojis: { created: 0, failed: 0 },
        bans: { created: 0, failed: 0 }
    };

    try {
        // 1. Restore Settings
        if (options.settings && backupData.data.settings) {
            try {
                await guild.edit({
                    name: backupData.data.settings.name,
                    description: backupData.data.settings.description,
                    verificationLevel: backupData.data.settings.verificationLevel,
                    defaultMessageNotifications: backupData.data.settings.defaultMessageNotifications,
                    explicitContentFilter: backupData.data.settings.explicitContentFilter
                });
                results.settings = true;
            } catch (e) {
                console.error('[BackupManager] Settings restore failed:', e.message);
            }
        }

        // 2. Restore Roles
        if (options.roles && backupData.data.roles) {
            for (const roleData of backupData.data.roles) {
                try {
                    await guild.roles.create({
                        name: roleData.name,
                        color: roleData.color,
                        hoist: roleData.hoist,
                        permissions: BigInt(roleData.permissions),
                        mentionable: roleData.mentionable
                    });
                    results.roles.created++;
                    await new Promise(r => setTimeout(r, 500)); // Rate limit
                } catch (e) {
                    results.roles.failed++;
                }
            }
        }

        // 3. Restore Categories first
        if (options.channels && backupData.data.categories) {
            const categoryMap = new Map();

            for (const catData of backupData.data.categories) {
                try {
                    const category = await guild.channels.create({
                        name: catData.name,
                        type: 4 // Category
                    });
                    categoryMap.set(catData.id, category.id);
                    results.categories.created++;
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    results.categories.failed++;
                }
            }

            // 4. Restore Channels
            for (const chanData of backupData.data.channels) {
                try {
                    const createOptions = {
                        name: chanData.name,
                        type: chanData.type,
                        topic: chanData.topic,
                        nsfw: chanData.nsfw,
                        rateLimitPerUser: chanData.rateLimitPerUser
                    };

                    if (chanData.parentId && categoryMap.has(chanData.parentId)) {
                        createOptions.parent = categoryMap.get(chanData.parentId);
                    }

                    if (chanData.type === 2) { // Voice
                        createOptions.bitrate = chanData.bitrate;
                        createOptions.userLimit = chanData.userLimit;
                    }

                    await guild.channels.create(createOptions);
                    results.channels.created++;
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    results.channels.failed++;
                }
            }
        }

        // 5. Restore Bans
        if (options.bans && backupData.data.bans) {
            for (const banData of backupData.data.bans) {
                try {
                    await guild.members.ban(banData.id, { reason: `[Backup Restore] ${banData.reason || 'No reason'}` });
                    results.bans.created++;
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    results.bans.failed++;
                }
            }
        }

        return { success: true, results };

    } catch (error) {
        console.error('[BackupManager] Restore failed:', error);
        return { success: false, error: error.message, results };
    }
}

/**
 * Get backup count for a guild
 */
function getBackupCount(guildId) {
    try {
        const result = queryOne('SELECT COUNT(*) as count FROM server_backups WHERE guild_id = ?', [guildId]);
        return result?.count || 0;
    } catch (e) {
        return 0;
    }
}

// Initialize on load
initBackupTable();

module.exports = {
    createBackup,
    getBackup,
    getBackupData,
    getGuildBackups,
    deleteBackup,
    restoreBackup,
    getBackupCount,
    generateBackupId
};

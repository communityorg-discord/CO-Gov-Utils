/**
 * Admin API Server
 * Express server providing API endpoints for the admin dashboard
 */

const express = require('express');
const cors = require('cors');

// API Configuration
const API_CONFIG = {
    port: 3003,
    apiKey: 'usgrp-admin-2026-secure-key-x7k9m2p4'
};

// Imports
const { query, queryOne } = require('./database');
const { getGuildCases, getCase, createCase, editCase, deleteCase, voidCase, restoreCase, getUserCases, getGuildStats } = require('./caseManager');
const { getStats: getTicketStats, loadTickets } = require('./ticketManager');
const { getGuildActivity, getTopMessagers, getTopVoice, getUserActivity } = require('./activityTracker');
const { getAllStaff, getStaffByEmail, getStaffByDiscordId, linkAccount, unlinkAccount } = require('./staffManager');
const { getUserPermissionLevel, isSuperuser, PERMISSION_LEVELS, hasPermission } = require('./advancedPermissions');

let discordClient = null;

/**
 * Initialize API with Discord client reference
 */
function initAdminApi(client) {
    discordClient = client;

    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());

    // API key authentication
    app.use((req, res, next) => {
        const apiKey = req.headers['x-admin-key'];
        if (apiKey !== API_CONFIG.apiKey) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
        next();
    });

    // ========================================
    // AUTH ENDPOINTS
    // ========================================

    // Login - verify email and get permissions
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { email } = req.body;
            const staff = getStaffByEmail(email);

            if (!staff) {
                return res.status(401).json({ error: 'Email not linked' });
            }

            // Get permission level from Discord
            let permissionLevel = PERMISSION_LEVELS.MODERATOR; // Default
            let permissionName = 'MODERATOR';

            if (discordClient) {
                const guild = discordClient.guilds.cache.first();
                if (guild) {
                    try {
                        const member = await guild.members.fetch(staff.discord_id);
                        permissionLevel = getUserPermissionLevel(member);
                        permissionName = Object.keys(PERMISSION_LEVELS).find(k => PERMISSION_LEVELS[k] === permissionLevel);
                    } catch (e) {
                        // Member not in guild, use default
                    }
                }
            }

            res.json({
                success: true,
                discordId: staff.discord_id,
                email: staff.email,
                displayName: staff.display_name,
                permissionLevel,
                permissionName
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // STATS ENDPOINTS
    // ========================================

    app.get('/api/stats', (req, res) => {
        try {
            const guild = discordClient?.guilds.cache.first();
            const guildId = guild?.id || '0';

            const caseStats = getGuildStats(guildId) || {};
            const ticketStats = getTicketStats() || {};
            const activityStats = getGuildActivity(guildId, 30) || {};
            const staffCount = getAllStaff().length;

            res.json({
                cases: {
                    total: caseStats.total_cases || 0,
                    warns: caseStats.warns || 0,
                    mutes: caseStats.mutes || 0,
                    kicks: caseStats.kicks || 0,
                    bans: caseStats.bans || 0,
                    active: caseStats.active || 0
                },
                tickets: {
                    total: ticketStats.total || 0,
                    open: ticketStats.open || 0,
                    closed: ticketStats.closed || 0
                },
                activity: {
                    messages: activityStats.totalMessages || 0,
                    voiceMinutes: activityStats.totalVoice || 0,
                    uniqueUsers: activityStats.uniqueUsers || 0
                },
                staff: staffCount,
                members: guild?.memberCount || 0
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // USER ENDPOINTS
    // ========================================

    app.get('/api/users/:id', async (req, res) => {
        try {
            const userId = req.params.id;
            const guild = discordClient?.guilds.cache.first();
            const guildId = guild?.id || '0';

            let userInfo = { id: userId };

            // Try to get Discord user info
            if (discordClient) {
                try {
                    const user = await discordClient.users.fetch(userId);
                    userInfo = {
                        id: user.id,
                        username: user.username,
                        displayName: user.displayName,
                        avatar: user.displayAvatarURL(),
                        bot: user.bot
                    };

                    // Get member info if in guild
                    if (guild) {
                        try {
                            const member = await guild.members.fetch(userId);
                            userInfo.nickname = member.nickname;
                            userInfo.roles = member.roles.cache.map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
                            userInfo.joinedAt = member.joinedAt;
                            userInfo.permissionLevel = getUserPermissionLevel(member);
                        } catch (e) {
                            userInfo.inGuild = false;
                        }
                    }
                } catch (e) {
                    // User not found
                }
            }

            // Get cases
            const cases = getUserCases(guildId, userId, true);

            // Get activity
            const activity = getUserActivity(guildId, userId, 30);

            res.json({
                user: userInfo,
                cases: cases.slice(0, 20),
                caseCount: cases.length,
                activity
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/users/:id/cases', (req, res) => {
        try {
            const userId = req.params.id;
            const guild = discordClient?.guilds.cache.first();
            const guildId = guild?.id || '0';

            const cases = getUserCases(guildId, userId, true);
            res.json(cases);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // CASES ENDPOINTS
    // ========================================

    app.get('/api/cases', (req, res) => {
        try {
            const guild = discordClient?.guilds.cache.first();
            const guildId = guild?.id || '0';

            const { status, actionType, limit = 50 } = req.query;

            const cases = getGuildCases(guildId, {
                status,
                actionType,
                limit: parseInt(limit)
            });

            res.json(cases);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/cases/:id', (req, res) => {
        try {
            const caseData = getCase(req.params.id);
            if (!caseData) {
                return res.status(404).json({ error: 'Case not found' });
            }
            res.json(caseData);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/cases', async (req, res) => {
        try {
            const { userId, actionType, reason, evidence, duration, points, moderatorId } = req.body;
            const guild = discordClient?.guilds.cache.first();
            const guildId = guild?.id || '0';

            // Get moderator info
            let moderatorTag = 'Dashboard';
            if (discordClient && moderatorId) {
                try {
                    const mod = await discordClient.users.fetch(moderatorId);
                    moderatorTag = mod.username;
                } catch (e) { }
            }

            // Get user info
            let userTag = 'Unknown';
            if (discordClient) {
                try {
                    const user = await discordClient.users.fetch(userId);
                    userTag = user.username;
                } catch (e) { }
            }

            const newCase = createCase({
                guildId,
                userId,
                userTag,
                moderatorId: moderatorId || 'dashboard',
                moderatorTag,
                actionType,
                reason,
                evidence,
                duration,
                points
            });

            res.json({ success: true, case: newCase });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.patch('/api/cases/:id', (req, res) => {
        try {
            const { editorId, editorTag, changes, editReason } = req.body;
            const updated = editCase(req.params.id, editorId, editorTag, changes, editReason);
            if (!updated) {
                return res.status(404).json({ error: 'Case not found' });
            }
            res.json({ success: true, case: updated });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.delete('/api/cases/:id', (req, res) => {
        try {
            const { deletedBy } = req.body;
            const deleted = deleteCase(req.params.id, deletedBy);
            res.json({ success: true, case: deleted });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // ACTIVITY ENDPOINTS
    // ========================================

    app.get('/api/activity/daily', (req, res) => {
        try {
            const guild = discordClient?.guilds.cache.first();
            const guildId = guild?.id || '0';
            const days = parseInt(req.query.days) || 7;

            const activity = getGuildActivity(guildId, days);
            res.json(activity);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/activity/top', async (req, res) => {
        try {
            const guild = discordClient?.guilds.cache.first();
            const guildId = guild?.id || '0';
            const days = parseInt(req.query.days) || 30;
            const limit = parseInt(req.query.limit) || 10;

            const topMessagers = getTopMessagers(guildId, days, limit);
            const topVoice = getTopVoice(guildId, days, limit);

            // Enrich with usernames
            const enriched = async (list) => {
                return Promise.all(list.map(async (item) => {
                    let username = item.user_id;
                    if (discordClient) {
                        try {
                            const user = await discordClient.users.fetch(item.user_id);
                            username = user.username;
                        } catch (e) { }
                    }
                    return { ...item, username };
                }));
            };

            res.json({
                messagers: await enriched(topMessagers),
                voice: await enriched(topVoice)
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // STAFF ENDPOINTS
    // ========================================

    app.get('/api/staff', (req, res) => {
        try {
            const staff = getAllStaff();
            res.json(staff);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/staff/:id', (req, res) => {
        try {
            const staff = getStaffByDiscordId(req.params.id);
            if (!staff) {
                return res.status(404).json({ error: 'Staff not found' });
            }
            res.json(staff);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // TICKETS ENDPOINTS
    // ========================================

    app.get('/api/tickets', async (req, res) => {
        try {
            const tickets = loadTickets() || [];

            // Enrich with usernames
            const enriched = await Promise.all(tickets.map(async (ticket) => {
                let user_tag = ticket.user_id;
                if (discordClient) {
                    try {
                        const user = await discordClient.users.fetch(ticket.user_id);
                        user_tag = user.username;
                    } catch (e) { }
                }
                let claimed_by_tag = null;
                if (ticket.claimed_by && discordClient) {
                    try {
                        const claimer = await discordClient.users.fetch(ticket.claimed_by);
                        claimed_by_tag = claimer.username;
                    } catch (e) { }
                }
                return { ...ticket, user_tag, claimed_by_tag };
            }));

            res.json(enriched);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/tickets/:id/claim', (req, res) => {
        try {
            const { claimedBy } = req.body;
            const tickets = loadTickets() || [];
            const ticket = tickets.find(t => t.id === req.params.id);
            if (!ticket) {
                return res.status(404).json({ error: 'Ticket not found' });
            }
            ticket.claimed_by = claimedBy;
            // Save would go here if ticketManager has a save function
            res.json({ success: true, ticket });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/tickets/:id/close', (req, res) => {
        try {
            const tickets = loadTickets() || [];
            const ticket = tickets.find(t => t.id === req.params.id);
            if (!ticket) {
                return res.status(404).json({ error: 'Ticket not found' });
            }
            ticket.status = 'closed';
            ticket.closed_at = new Date().toISOString();
            res.json({ success: true, ticket });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // GOVERNMENT OFFICIALS ENDPOINT
    // ========================================

    app.get('/api/government', async (req, res) => {
        try {
            const fs = require('fs');
            const path = require('path');

            // Read from Economy bot's government_members.json
            const govPath = path.join(__dirname, '../../CO-Economy-Bot/config/economy/government_members.json');

            if (!fs.existsSync(govPath)) {
                return res.json({ officials: [], lastUpdated: null });
            }

            const data = JSON.parse(fs.readFileSync(govPath, 'utf8'));
            const officials = [];

            for (const [key, member] of Object.entries(data.members || {})) {
                if (member.status === 'active') {
                    // Try to get username from Discord
                    let username = null;
                    let avatar = null;

                    if (discordClient) {
                        try {
                            const user = await discordClient.users.fetch(member.userId);
                            username = user.username;
                            avatar = user.displayAvatarURL();
                        } catch (e) { }
                    }

                    officials.push({
                        govId: member.govId,
                        discordId: member.userId,
                        username,
                        avatar,
                        position: member.currentPosition,
                        positionKey: member.currentPositionKey,
                        assignedAt: member.positions?.[member.positions.length - 1]?.assignedAt,
                        registeredAt: member.registeredAt
                    });
                }
            }

            // Sort by position importance (president first, etc)
            const positionOrder = ['president', 'vicePresident', 'whiteHouseChiefOfStaff', 'secretaryOfState', 'secretaryOfTreasury', 'secretaryOfDefense', 'attorneyGeneral'];
            officials.sort((a, b) => {
                const aIdx = positionOrder.indexOf(a.positionKey);
                const bIdx = positionOrder.indexOf(b.positionKey);
                if (aIdx === -1 && bIdx === -1) return a.position.localeCompare(b.position);
                if (aIdx === -1) return 1;
                if (bIdx === -1) return -1;
                return aIdx - bIdx;
            });

            res.json({
                officials,
                totalActive: officials.length,
                lastUpdated: data.lastUpdated
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ========================================
    // START SERVER
    // ========================================

    app.listen(API_CONFIG.port, () => {
        console.log(`[Admin API] ✓ Running on port ${API_CONFIG.port}`);
    });

    return app;
}

module.exports = { initAdminApi, API_CONFIG };

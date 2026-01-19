/**
 * Ticket Manager - Help Desk Ticket System
 * Handles ticket creation, claiming, transcripts
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

// Configuration
const CONFIG = {
    PANEL_CHANNEL: '1459402926098485350',
    TICKET_CATEGORY: '1462343891452825631',
    TRANSCRIPT_CHANNEL: '1459403142914379827',
    GENERAL_SUPPORT_ROLE: '1462292229035921617',
    TICKET_ADMIN_ROLE: '1459399925824749703',
    BOT_DEVELOPER_ROLE: '1459399918652494041'
};

const DATA_FILE = path.join(__dirname, '..', 'data', 'tickets.json');

// Ticket types with prefixes for channel naming
const TICKET_TYPES = {
    general: { name: 'General Support', emoji: '🎫', color: 0x3498DB, role: CONFIG.GENERAL_SUPPORT_ROLE, prefix: 'support' },
    bot: { name: 'Bot/Bug Issue', emoji: '🤖', color: 0x9B59B6, role: CONFIG.BOT_DEVELOPER_ROLE, prefix: 'bug' },
    government: { name: 'Government Issue', emoji: '🏛️', color: 0x27AE60, role: CONFIG.GENERAL_SUPPORT_ROLE, prefix: 'government' }
};

// Load/save tickets data
function loadTickets() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) { }
    return { tickets: {}, counters: { general: 0, bot: 0, government: 0 } };
}

function saveTickets(data) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/**
 * Check if user already has a ticket of this type open
 */
function hasOpenTicket(userId, type) {
    const data = loadTickets();
    return Object.values(data.tickets).some(t => t.userId === userId && t.type === type);
}

/**
 * Priority levels
 */
const PRIORITY_LEVELS = {
    low: { name: 'Low', emoji: '⬇️', color: 0x7F8C8D },
    medium: { name: 'Medium', emoji: '➡️', color: 0xF39C12 },
    high: { name: 'High', emoji: '⬆️', color: 0xE67E22 },
    urgent: { name: 'Urgent', emoji: '🚨', color: 0xE74C3C }
};

/**
 * Create a new ticket
 */
async function createTicket(guild, user, type) {
    const data = loadTickets();
    const typeInfo = TICKET_TYPES[type] || TICKET_TYPES.general;

    // Check for existing ticket of same type
    if (hasOpenTicket(user.id, type)) {
        return { ok: false, error: `You already have a ${typeInfo.name} ticket open!` };
    }

    // Initialize counters if missing
    if (!data.counters) data.counters = { general: 0, bot: 0, government: 0 };
    if (!data.counters[type]) data.counters[type] = 0;

    data.counters[type]++;
    const ticketNum = String(data.counters[type]).padStart(3, '0');
    const ticketId = `${typeInfo.prefix.toUpperCase()}-${ticketNum}`;
    const channelName = `${typeInfo.prefix}-${ticketNum}`;

    try {
        // Create private channel
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: CONFIG.TICKET_CATEGORY,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: CONFIG.TICKET_ADMIN_ROLE, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
                { id: typeInfo.role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ],
            reason: `Ticket ${ticketId} created by ${user.tag}`
        });

        // Store ticket data
        data.tickets[channel.id] = {
            id: ticketId,
            channelId: channel.id,
            userId: user.id,
            userTag: user.tag,
            type,
            typeName: typeInfo.name,
            createdAt: new Date().toISOString(),
            claimedBy: null,
            claimedByTag: null,
            status: 'open',
            priority: 'medium',
            notes: []
        };
        saveTickets(data);

        // Send welcome embed with buttons
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        const embed = new EmbedBuilder()
            .setTitle(`${typeInfo.emoji} ${ticketId}`)
            .setColor(typeInfo.color)
            .setDescription(`Thank you for creating a ticket, <@${user.id}>!\n\nPlease describe your issue below and a staff member will assist you shortly.`)
            .addFields(
                { name: '📋 Type', value: typeInfo.name, inline: true },
                { name: '👤 Created By', value: user.tag, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setFooter({ text: 'Staff: Use the buttons below to manage this ticket' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket:claim:${channel.id}`)
                .setLabel('Claim Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🙋'),
            new ButtonBuilder()
                .setCustomId(`ticket:log:${channel.id}`)
                .setLabel('Log & Close')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('📝')
        );

        await channel.send({
            content: `<@${user.id}> | <@&${typeInfo.role}> <@&${CONFIG.TICKET_ADMIN_ROLE}>`,
            embeds: [embed],
            components: [row]
        });

        return { ok: true, channel, ticketId };
    } catch (error) {
        console.error('[Tickets] Create error:', error);
        return { ok: false, error: error.message };
    }
}

/**
 * Claim a ticket
 */
async function claimTicket(channel, claimer) {
    const data = loadTickets();
    const ticket = data.tickets[channel.id];

    if (!ticket) return { ok: false, error: 'This is not a ticket channel' };
    if (ticket.claimedBy) return { ok: false, error: `Already claimed by <@${ticket.claimedBy}>` };

    try {
        // Update permissions - only claimer, ticket owner, and admins can send
        await channel.permissionOverwrites.edit(CONFIG.GENERAL_SUPPORT_ROLE, { SendMessages: false });
        await channel.permissionOverwrites.edit(CONFIG.BOT_DEVELOPER_ROLE, { SendMessages: false });
        await channel.permissionOverwrites.edit(claimer.id, {
            ViewChannel: true,
            SendMessages: true,
            ManageMessages: true
        });

        ticket.claimedBy = claimer.id;
        ticket.claimedByTag = claimer.user.tag;
        ticket.status = 'claimed';
        saveTickets(data);

        // Update buttons
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket:unclaim:${channel.id}`)
                .setLabel('Unclaim')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('↩️'),
            new ButtonBuilder()
                .setCustomId(`ticket:log:${channel.id}`)
                .setLabel('Log & Close')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('📝')
        );

        const embed = new EmbedBuilder()
            .setTitle('🙋 Ticket Claimed')
            .setColor(0x27AE60)
            .setDescription(`This ticket has been claimed by <@${claimer.id}>.`)
            .setTimestamp();

        await channel.send({ embeds: [embed], components: [row] });

        return { ok: true };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

/**
 * Unclaim a ticket
 */
async function unclaimTicket(channel, member) {
    const data = loadTickets();
    const ticket = data.tickets[channel.id];

    if (!ticket) return { ok: false, error: 'This is not a ticket channel' };
    if (!ticket.claimedBy) return { ok: false, error: 'This ticket is not claimed' };

    // Only claimer or ticket admins can unclaim
    const isAdmin = member.roles.cache.has(CONFIG.TICKET_ADMIN_ROLE);
    if (ticket.claimedBy !== member.id && !isAdmin) {
        return { ok: false, error: 'Only the claimer or Ticket Admins can unclaim' };
    }

    try {
        const typeInfo = TICKET_TYPES[ticket.type] || TICKET_TYPES.general;

        // Restore permissions
        await channel.permissionOverwrites.edit(typeInfo.role, { SendMessages: true });
        await channel.permissionOverwrites.delete(ticket.claimedBy).catch(() => { });

        const previousClaimer = ticket.claimedBy;
        ticket.claimedBy = null;
        ticket.claimedByTag = null;
        ticket.status = 'open';
        saveTickets(data);

        // Update buttons
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket:claim:${channel.id}`)
                .setLabel('Claim Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🙋'),
            new ButtonBuilder()
                .setCustomId(`ticket:log:${channel.id}`)
                .setLabel('Log & Close')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('📝')
        );

        const embed = new EmbedBuilder()
            .setTitle('↩️ Ticket Unclaimed')
            .setColor(0xF39C12)
            .setDescription(`<@${previousClaimer}>'s claim has been released. Ticket is now available.`)
            .setTimestamp();

        await channel.send({ embeds: [embed], components: [row] });

        return { ok: true };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

/**
 * Generate HTML transcript and close ticket
 */
async function logAndCloseTicket(channel, closer, client) {
    const data = loadTickets();
    const ticket = data.tickets[channel.id];

    if (!ticket) return { ok: false, error: 'This is not a ticket channel' };

    try {
        // Fetch all messages
        const messages = await channel.messages.fetch({ limit: 100 });
        const sortedMessages = [...messages.values()].reverse();

        // Generate HTML transcript
        const html = generateHTMLTranscript(ticket, sortedMessages);

        // Save transcript file
        const transcriptDir = path.join(__dirname, '..', 'transcripts');
        if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true });

        const filename = `${ticket.id}-${Date.now()}.html`;
        const filepath = path.join(transcriptDir, filename);
        fs.writeFileSync(filepath, html);

        // Send to transcript channel
        const transcriptChannel = await client.channels.fetch(CONFIG.TRANSCRIPT_CHANNEL);
        if (transcriptChannel) {
            const embed = new EmbedBuilder()
                .setTitle(`📝 Ticket Closed: ${ticket.id}`)
                .setColor(0x7F8C8D)
                .addFields(
                    { name: '👤 Created By', value: `<@${ticket.userId}>\n${ticket.userTag}`, inline: true },
                    { name: '📋 Type', value: ticket.typeName, inline: true },
                    { name: '🙋 Claimed By', value: ticket.claimedByTag || 'Unclaimed', inline: true },
                    { name: '📅 Created', value: `<t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:F>`, inline: true },
                    { name: '❌ Closed By', value: `<@${closer.id}>`, inline: true },
                    { name: '💬 Messages', value: String(sortedMessages.length), inline: true }
                )
                .setTimestamp();

            const { AttachmentBuilder } = require('discord.js');
            const attachment = new AttachmentBuilder(filepath, { name: filename });

            await transcriptChannel.send({ embeds: [embed], files: [attachment] });
        }

        // Delete ticket from data
        delete data.tickets[channel.id];
        saveTickets(data);

        // Send closing message
        const closeEmbed = new EmbedBuilder()
            .setTitle('🔒 Ticket Closed')
            .setColor(0xE74C3C)
            .setDescription('This ticket has been logged and will be deleted in 5 seconds.')
            .setTimestamp();

        await channel.send({ embeds: [closeEmbed] });

        // Delete channel after delay
        setTimeout(async () => {
            try {
                await channel.delete(`Ticket ${ticket.id} closed by ${closer.user.tag}`);
            } catch (e) { }
        }, 5000);

        return { ok: true, ticketId: ticket.id };
    } catch (error) {
        console.error('[Tickets] Log error:', error);
        return { ok: false, error: error.message };
    }
}

/**
 * Generate HTML transcript
 */
function generateHTMLTranscript(ticket, messages) {
    const messagesHTML = messages.map(msg => {
        const time = msg.createdAt.toLocaleString();
        const content = escapeHtml(msg.content) || '<em>No text content</em>';
        const attachments = msg.attachments.size > 0
            ? `<div class="attachments">${msg.attachments.map(a => `📎 ${a.name}`).join(', ')}</div>`
            : '';

        return `
    <div class="message">
      <div class="avatar">${msg.author.username.charAt(0).toUpperCase()}</div>
      <div class="content">
        <span class="author">${escapeHtml(msg.author.username)}</span>
        <span class="timestamp">${time}</span>
        <div class="text">${content}</div>
        ${attachments}
      </div>
    </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Ticket Transcript - ${ticket.id}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #36393f; color: #dcddde; margin: 0; padding: 20px; }
    .header { background: linear-gradient(135deg, #5865f2, #3498db); padding: 25px; border-radius: 8px; margin-bottom: 20px; }
    .header h1 { color: #fff; margin: 0 0 15px 0; font-size: 24px; }
    .header p { margin: 5px 0; color: rgba(255,255,255,0.9); }
    .messages { background: #2f3136; border-radius: 8px; padding: 15px; }
    .message { padding: 12px; border-bottom: 1px solid #40444b; display: flex; gap: 15px; }
    .message:last-child { border-bottom: none; }
    .message:hover { background: #32353b; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: #5865f2; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; flex-shrink: 0; }
    .content { flex-grow: 1; min-width: 0; }
    .author { font-weight: 600; color: #fff; }
    .timestamp { font-size: 12px; color: #72767d; margin-left: 8px; }
    .text { margin-top: 5px; word-wrap: break-word; white-space: pre-wrap; }
    .attachments { margin-top: 5px; color: #00b0f4; font-size: 13px; }
    .footer { margin-top: 20px; text-align: center; color: #72767d; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📝 Ticket Transcript</h1>
    <p><strong>Ticket ID:</strong> ${ticket.id}</p>
    <p><strong>Created By:</strong> ${ticket.userTag} (${ticket.userId})</p>
    <p><strong>Type:</strong> ${ticket.typeName}</p>
    <p><strong>Created:</strong> ${new Date(ticket.createdAt).toLocaleString()}</p>
    <p><strong>Claimed By:</strong> ${ticket.claimedByTag || 'Unclaimed'}</p>
  </div>
  <div class="messages">${messagesHTML}</div>
  <div class="footer">Generated by USGRP Utilities • ${new Date().toLocaleString()}</div>
</body>
</html>`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>');
}

/**
 * Check if user is staff (can use ticket buttons)
 */
function isStaff(member) {
    return member.roles.cache.has(CONFIG.GENERAL_SUPPORT_ROLE) ||
        member.roles.cache.has(CONFIG.TICKET_ADMIN_ROLE) ||
        member.roles.cache.has(CONFIG.BOT_DEVELOPER_ROLE);
}

/**
 * Get ticket data
 */
function getTicket(channelId) {
    const data = loadTickets();
    return data.tickets[channelId] || null;
}

/**
 * Set ticket priority
 */
async function setPriority(channel, priority) {
    const data = loadTickets();
    const ticket = data.tickets[channel.id];
    if (!ticket) return { ok: false, error: 'Not a ticket channel' };

    const priorityInfo = PRIORITY_LEVELS[priority];
    if (!priorityInfo) return { ok: false, error: 'Invalid priority' };

    ticket.priority = priority;
    saveTickets(data);

    const embed = new EmbedBuilder()
        .setTitle(`${priorityInfo.emoji} Priority Updated`)
        .setColor(priorityInfo.color)
        .setDescription(`Ticket priority set to **${priorityInfo.name}**`)
        .setTimestamp();

    await channel.send({ embeds: [embed] });
    return { ok: true };
}

/**
 * Add internal note (staff only)
 */
function addNote(channelId, authorId, authorTag, content) {
    const data = loadTickets();
    const ticket = data.tickets[channelId];
    if (!ticket) return { ok: false, error: 'Not a ticket channel' };

    if (!ticket.notes) ticket.notes = [];
    ticket.notes.push({
        authorId,
        authorTag,
        content,
        timestamp: new Date().toISOString()
    });
    saveTickets(data);
    return { ok: true };
}

/**
 * Get all notes for a ticket
 */
function getNotes(channelId) {
    const data = loadTickets();
    const ticket = data.tickets[channelId];
    return ticket?.notes || [];
}

/**
 * Transfer ticket to another staff member
 */
async function transferTicket(channel, currentClaimer, newClaimer) {
    const data = loadTickets();
    const ticket = data.tickets[channel.id];
    if (!ticket) return { ok: false, error: 'Not a ticket channel' };
    if (!ticket.claimedBy) return { ok: false, error: 'Ticket is not claimed' };

    // Only current claimer or admins can transfer
    const isAdmin = currentClaimer.roles.cache.has(CONFIG.TICKET_ADMIN_ROLE);
    if (ticket.claimedBy !== currentClaimer.id && !isAdmin) {
        return { ok: false, error: 'Only claimer or admins can transfer' };
    }

    try {
        // Remove old claimer permissions
        await channel.permissionOverwrites.delete(ticket.claimedBy).catch(() => { });

        // Add new claimer permissions
        await channel.permissionOverwrites.edit(newClaimer.id, {
            ViewChannel: true,
            SendMessages: true,
            ManageMessages: true
        });

        const oldClaimer = ticket.claimedBy;
        ticket.claimedBy = newClaimer.id;
        ticket.claimedByTag = newClaimer.user?.tag || newClaimer.tag;
        saveTickets(data);

        const embed = new EmbedBuilder()
            .setTitle('🔄 Ticket Transferred')
            .setColor(0x3498DB)
            .setDescription(`Ticket transferred from <@${oldClaimer}> to <@${newClaimer.id}>`)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

/**
 * Rename ticket channel
 */
async function renameTicket(channel, newName) {
    const ticket = getTicket(channel.id);
    if (!ticket) return { ok: false, error: 'Not a ticket channel' };

    const safeName = newName.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 50);
    try {
        await channel.setName(safeName);
        return { ok: true, newName: safeName };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

/**
 * Get ticket statistics
 */
function getStats() {
    const data = loadTickets();
    const tickets = Object.values(data.tickets);

    // Count by type
    const byType = { general: 0, bot: 0, government: 0 };
    // Count by status
    const byStatus = { open: 0, claimed: 0 };
    // Count by priority
    const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
    // Staff stats
    const staffClaims = {};

    for (const ticket of tickets) {
        byType[ticket.type] = (byType[ticket.type] || 0) + 1;
        byStatus[ticket.status] = (byStatus[ticket.status] || 0) + 1;
        byPriority[ticket.priority || 'medium'] = (byPriority[ticket.priority || 'medium'] || 0) + 1;
        if (ticket.claimedBy) {
            staffClaims[ticket.claimedBy] = {
                count: (staffClaims[ticket.claimedBy]?.count || 0) + 1,
                tag: ticket.claimedByTag
            };
        }
    }

    // Get historical stats from transcripts if they exist
    const transcriptDir = path.join(__dirname, '..', 'transcripts');
    let totalClosed = 0;
    try {
        if (fs.existsSync(transcriptDir)) {
            totalClosed = fs.readdirSync(transcriptDir).filter(f => f.endsWith('.html')).length;
        }
    } catch (e) { }

    return {
        open: tickets.length,
        totalClosed,
        byType,
        byStatus,
        byPriority,
        staffClaims,
        counters: data.counters || {}
    };
}

/**
 * Search tickets/transcripts
 */
function searchTickets(query) {
    const data = loadTickets();
    const results = [];
    const queryLower = query.toLowerCase();

    // Search open tickets
    for (const ticket of Object.values(data.tickets)) {
        if (ticket.id.toLowerCase().includes(queryLower) ||
            ticket.userTag.toLowerCase().includes(queryLower) ||
            ticket.userId === query) {
            results.push({ ...ticket, source: 'open' });
        }
    }

    // Search transcript filenames
    const transcriptDir = path.join(__dirname, '..', 'transcripts');
    try {
        if (fs.existsSync(transcriptDir)) {
            const files = fs.readdirSync(transcriptDir).filter(f => f.endsWith('.html'));
            for (const file of files) {
                if (file.toLowerCase().includes(queryLower)) {
                    results.push({
                        id: file.replace('.html', '').split('-').slice(0, 2).join('-'),
                        file,
                        path: path.join(transcriptDir, file),
                        source: 'transcript'
                    });
                }
            }
        }
    } catch (e) { }

    return results.slice(0, 10); // Limit results
}

module.exports = {
    CONFIG,
    TICKET_TYPES,
    PRIORITY_LEVELS,
    createTicket,
    claimTicket,
    unclaimTicket,
    logAndCloseTicket,
    isStaff,
    getTicket,
    hasOpenTicket,
    setPriority,
    addNote,
    getNotes,
    transferTicket,
    renameTicket,
    getStats,
    searchTickets,
    loadTickets,
    saveTickets
};


/**
 * AutoMod Manager for USGRP
 * Handles automatic moderation rules for abuse prevention
 */

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'automod_config.json');
const LOG_FILE = path.join(__dirname, '..', 'config', 'automod_log.json');

// Default configuration
const DEFAULT_CONFIG = {
  enabled: true,
  logChannelId: '1462299339173920828', // Default log channel for automod

  // Word filters
  filters: {
    slurs: {
      enabled: true,
      action: 'delete_mute', // Severe action for hate speech
      words: [
        // Racial slurs
        'nigger', 'nigga', 'negro', 'coon', 'spic', 'wetback', 'beaner',
        'chink', 'gook', 'slant', 'paki', 'towelhead', 'camel jockey',
        'kike', 'heeb', 'hymie',
        // Homophobic slurs
        'faggot', 'fag', 'dyke', 'homo', 'queer', 'tranny',
        // Other slurs
        'retard', 'retarded', 'tard'
      ],
      exemptRoles: [],
      exemptChannels: []
    },
    spam: {
      enabled: true,
      action: 'delete_warn',
      maxMessages: 5, // Max messages in timeframe
      timeframeSeconds: 5,
      maxMentions: 5, // Max mentions per message
      maxEmojis: 10, // Max emojis per message
      exemptRoles: [],
      exemptChannels: []
    },
    links: {
      enabled: true,
      action: 'delete_warn',
      allowedDomains: ['discord.gg', 'discord.com', 'discordapp.com', 'tenor.com', 'giphy.com', 'imgur.com', 'youtube.com', 'youtu.be', 'roblox.com'],
      blockInvites: true,
      // Spam/phishing domain patterns
      blockedPatterns: [
        'free-nitro', 'freenitro', 'nitro-gift', 'steam-gift', 'steamgift',
        'discord-gift', 'discordgift', 'claim-reward', 'free-robux', 'freerobux',
        'bit.ly', 'tinyurl', 'shorturl', 't.co', 'goo.gl', 'is.gd', 'v.gd',
        'dsc.gg', 'linktr.ee', 'grabify', 'iplogger', 'blasze.tk',
        'robux-generator', 'vbucks-generator', 'free-vbucks'
      ],
      exemptRoles: [],
      exemptChannels: []
    },
    caps: {
      enabled: true,
      action: 'warn',
      threshold: 0.7, // 70% caps
      minLength: 10, // Minimum message length to check
      exemptRoles: [],
      exemptChannels: []
    },
    duplicates: {
      enabled: true,
      action: 'delete_warn',
      threshold: 3, // Same message X times
      timeframeMinutes: 5,
      exemptRoles: [],
      exemptChannels: []
    }
  },

  // Economy abuse prevention
  economyProtection: {
    enabled: true,
    maxTransactionsPerHour: 50,
    maxTransferAmount: 100000,
    suspiciousPatterns: true,
    alertOnLargeTransfers: 10000
  },

  // Raid protection
  raidProtection: {
    enabled: true,
    joinThreshold: 10, // Users joining in timeframe
    joinTimeframeSeconds: 60,
    action: 'lockdown', // lockdown, kick_new, alert
    autoLockdownMinutes: 15
  },

  // Rule breaking detection
  ruleDetection: {
    enabled: true,
    // Detect metagaming (OOC info in RP)
    metagaming: {
      enabled: false, // Disabled - too aggressive
      action: 'warn',
      patterns: ['dm me', 'check dms'],
      exemptChannels: [] // OOC channels auto-detected
    },
    // Detect powergaming (forcing actions)
    powergaming: {
      enabled: true,
      action: 'warn',
      patterns: ['kills you', 'shoots you dead', 'you die', 'you are dead', 'you cant do anything', 'no roll']
    },
    // Detect fail RP
    failrp: {
      enabled: false, // Disabled - too aggressive for casual RP
      action: 'warn',
      patterns: ['lmao', 'rofl'],
      exemptChannels: [] // OOC channels auto-detected
    },
    // Detect advertising
    advertising: {
      enabled: true,
      action: 'delete_warn',
      patterns: ['join my server', 'check out my', 'sub to my', 'follow my', 'discord.gg/', 'twitch.tv/', 'youtube.com/c/']
    },
    // Detect begging
    begging: {
      enabled: true,
      action: 'warn',
      patterns: ['give me money', 'can i have money', 'free money', 'give me cash', 'gimme money', 'pls give', 'plz give']
    }
  },

  // Punishment escalation
  escalation: {
    enabled: true,
    warnThreshold: 3, // Warnings before escalation
    muteThreshold: 2, // Mutes before escalation
    muteDurations: [5, 15, 60, 1440], // Minutes: 5min, 15min, 1hr, 24hr
    autoBanAfterMutes: 4
  }
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch (err) {
    console.error('[AutoMod] Config load error:', err.message);
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error('[AutoMod] Config save error:', err.message);
    return false;
  }
}

function loadLog() {
  const defaultLog = { actions: [], userWarnings: {}, userMutes: {}, recentMessages: {}, duplicateMessages: {} };
  try {
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      if (!content || content.trim().length === 0) {
        return defaultLog;
      }
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('[AutoMod] Log corrupted, resetting:', err.message);
    // Reset corrupted file
    try {
      fs.writeFileSync(LOG_FILE, JSON.stringify(defaultLog, null, 2));
    } catch (e) { /* ignore */ }
  }
  return defaultLog;
}

function saveLog(log) {
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Write to temp file first, then rename (atomic write)
    const tempFile = LOG_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(log, null, 2));
    fs.renameSync(tempFile, LOG_FILE);
  } catch (err) {
    console.error('[AutoMod] Log save error:', err.message);
  }
}

/**
 * Check if channel is an OOC (out of character) channel
 */
function isOOCChannel(channel) {
  const name = channel.name?.toLowerCase() || '';
  const oocPatterns = ['ooc', 'out-of-character', 'off-topic', 'general-chat', 'lounge', 'hangout', 'chill', 'memes', 'media', 'bot-commands', 'bot-spam'];
  return oocPatterns.some(pattern => name.includes(pattern));
}

/**
 * Check message against all filters
 */
async function checkMessage(message, client) {
  if (message.author.bot) return null;
  if (!message.guild) return null;

  const config = loadConfig();
  if (!config.enabled) return null;

  // Auto-exempt OOC channels from RP rule checks
  if (isOOCChannel(message.channel)) {
    // Only check serious violations in OOC (slurs, spam, links)
    // Skip metagaming, failrp, powergaming checks
    const violations = [];

    if (config.filters.slurs?.enabled) {
      const slurCheck = checkSlurs(message, config.filters.slurs);
      if (slurCheck) violations.push(slurCheck);
    }

    if (config.filters.spam?.enabled) {
      const spamCheck = checkSpam(message, config.filters.spam);
      if (spamCheck) violations.push(spamCheck);
    }

    if (violations.length === 0) return null;

    const severity = { 'warn': 1, 'delete': 2, 'delete_warn': 3, 'mute': 4, 'delete_mute': 5, 'kick': 6, 'ban': 7 };
    violations.sort((a, b) => (severity[b.action] || 0) - (severity[a.action] || 0));
    const violation = violations[0];
    await executeAction(message, violation, config, client);
    return violation;
  }

  const violations = [];

  // Check slurs/hate speech
  if (config.filters.slurs && config.filters.slurs.enabled) {
    const slurCheck = checkSlurs(message, config.filters.slurs);
    if (slurCheck) violations.push(slurCheck);
  }

  // Check spam
  if (config.filters.spam && config.filters.spam.enabled) {
    const spamCheck = checkSpam(message, config.filters.spam);
    if (spamCheck) violations.push(spamCheck);
  }

  // Check rule breaking (RP rules)
  if (config.ruleDetection && config.ruleDetection.enabled) {
    const ruleCheck = checkRuleBreaking(message, config.ruleDetection);
    if (ruleCheck) violations.push(ruleCheck);
  }

  // Check links
  if (config.filters.links.enabled) {
    const linkCheck = checkLinks(message, config.filters.links);
    if (linkCheck) violations.push(linkCheck);
  }

  // Check caps
  if (config.filters.caps.enabled) {
    const capsCheck = checkCaps(message, config.filters.caps);
    if (capsCheck) violations.push(capsCheck);
  }

  // Check duplicates
  if (config.filters.duplicates.enabled) {
    const dupCheck = checkDuplicates(message, config.filters.duplicates);
    if (dupCheck) violations.push(dupCheck);
  }

  if (violations.length === 0) return null;

  // Get most severe violation
  const severity = { 'warn': 1, 'delete': 2, 'delete_warn': 3, 'mute': 4, 'delete_mute': 5, 'kick': 6, 'ban': 7 };
  violations.sort((a, b) => (severity[b.action] || 0) - (severity[a.action] || 0));

  const violation = violations[0];
  await executeAction(message, violation, config, client);

  return violation;
}

function checkSlurs(message, filter) {
  if (isExempt(message, filter)) return null;

  const content = message.content.toLowerCase();
  for (const word of filter.words) {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
    if (regex.test(content)) {
      return {
        type: 'slur',
        action: filter.action,
        reason: 'Slur/hate speech detected'
      };
    }
  }
  return null;
}

function checkRuleBreaking(message, ruleConfig) {
  const content = message.content.toLowerCase();
  const channelId = message.channel.id;

  // Check metagaming
  if (ruleConfig.metagaming && ruleConfig.metagaming.enabled) {
    if (!ruleConfig.metagaming.exemptChannels?.includes(channelId)) {
      for (const pattern of ruleConfig.metagaming.patterns) {
        if (content.includes(pattern.toLowerCase())) {
          return {
            type: 'metagaming',
            action: ruleConfig.metagaming.action,
            reason: 'Possible metagaming detected - use OOC channels for out-of-character discussion'
          };
        }
      }
    }
  }

  // Check powergaming
  if (ruleConfig.powergaming && ruleConfig.powergaming.enabled) {
    for (const pattern of ruleConfig.powergaming.patterns) {
      if (content.includes(pattern.toLowerCase())) {
        return {
          type: 'powergaming',
          action: ruleConfig.powergaming.action,
          reason: 'Possible powergaming detected - do not force actions on other players'
        };
      }
    }
  }

  // Check fail RP (only in RP channels)
  if (ruleConfig.failrp && ruleConfig.failrp.enabled) {
    if (!ruleConfig.failrp.exemptChannels?.includes(channelId)) {
      for (const pattern of ruleConfig.failrp.patterns) {
        // Match whole words only for short patterns
        const regex = pattern.length <= 3
          ? new RegExp(`\\b${escapeRegex(pattern)}\\b`, 'i')
          : new RegExp(escapeRegex(pattern), 'i');
        if (regex.test(content)) {
          return {
            type: 'failrp',
            action: ruleConfig.failrp.action,
            reason: 'Possible FailRP detected - stay in character in RP channels'
          };
        }
      }
    }
  }

  // Check advertising
  if (ruleConfig.advertising && ruleConfig.advertising.enabled) {
    for (const pattern of ruleConfig.advertising.patterns) {
      if (content.includes(pattern.toLowerCase())) {
        return {
          type: 'advertising',
          action: ruleConfig.advertising.action,
          reason: 'Advertising/self-promotion detected'
        };
      }
    }
  }

  // Check begging
  if (ruleConfig.begging && ruleConfig.begging.enabled) {
    for (const pattern of ruleConfig.begging.patterns) {
      if (content.includes(pattern.toLowerCase())) {
        return {
          type: 'begging',
          action: ruleConfig.begging.action,
          reason: 'Begging for in-game currency detected'
        };
      }
    }
  }

  return null;
}

function checkSpam(message, filter) {
  if (isExempt(message, filter)) return null;

  const log = loadLog();
  const userId = message.author.id;
  const now = Date.now();

  // Initialize user's recent messages
  if (!log.recentMessages[userId]) {
    log.recentMessages[userId] = [];
  }

  // Clean old messages
  const cutoff = now - (filter.timeframeSeconds * 1000);
  log.recentMessages[userId] = log.recentMessages[userId].filter(t => t > cutoff);

  // Add current message
  log.recentMessages[userId].push(now);
  saveLog(log);

  // Check message count
  if (log.recentMessages[userId].length > filter.maxMessages) {
    return {
      type: 'spam',
      action: filter.action,
      reason: `Spam detected (${log.recentMessages[userId].length} messages in ${filter.timeframeSeconds}s)`
    };
  }

  // Check mentions
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount > filter.maxMentions) {
    return {
      type: 'mention_spam',
      action: filter.action,
      reason: `Mass mentions detected (${mentionCount} mentions)`
    };
  }

  // Check emojis
  const emojiCount = (message.content.match(/<a?:\w+:\d+>|[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  if (emojiCount > filter.maxEmojis) {
    return {
      type: 'emoji_spam',
      action: filter.action,
      reason: `Emoji spam detected (${emojiCount} emojis)`
    };
  }

  return null;
}

function checkLinks(message, filter) {
  if (isExempt(message, filter)) return null;

  const urlRegex = /https?:\/\/[^\s]+/gi;
  const urls = message.content.match(urlRegex);

  if (!urls) return null;

  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      const fullUrl = url.toLowerCase();

      // Check blocked patterns (spam/phishing)
      if (filter.blockedPatterns && filter.blockedPatterns.length > 0) {
        for (const pattern of filter.blockedPatterns) {
          if (fullUrl.includes(pattern.toLowerCase()) || domain.includes(pattern.toLowerCase())) {
            return {
              type: 'spam_link',
              action: 'delete_mute', // More severe for spam links
              reason: `Spam/phishing link detected (${pattern})`
            };
          }
        }
      }

      // Check Discord invites
      if (filter.blockInvites && (domain.includes('discord.gg') || fullUrl.includes('discord.com/invite'))) {
        return {
          type: 'invite_link',
          action: filter.action,
          reason: 'Discord invite link detected'
        };
      }

      // Check allowed domains
      const isAllowed = filter.allowedDomains.some(d => domain.includes(d.toLowerCase()));
      if (!isAllowed) {
        return {
          type: 'external_link',
          action: filter.action,
          reason: `External link detected (${domain})`
        };
      }
    } catch (e) {
      // Invalid URL, skip
    }
  }

  return null;
}

function checkCaps(message, filter) {
  if (isExempt(message, filter)) return null;

  const content = message.content.replace(/[^a-zA-Z]/g, '');
  if (content.length < filter.minLength) return null;

  const capsCount = (content.match(/[A-Z]/g) || []).length;
  const capsRatio = capsCount / content.length;

  if (capsRatio > filter.threshold) {
    return {
      type: 'excessive_caps',
      action: filter.action,
      reason: `Excessive caps detected (${Math.round(capsRatio * 100)}%)`
    };
  }

  return null;
}

function checkDuplicates(message, filter) {
  if (isExempt(message, filter)) return null;

  const log = loadLog();
  const key = `${message.author.id}_${message.content.toLowerCase().trim()}`;
  const now = Date.now();

  if (!log.duplicateMessages) log.duplicateMessages = {};
  if (!log.duplicateMessages[key]) log.duplicateMessages[key] = [];

  // Clean old
  const cutoff = now - (filter.timeframeMinutes * 60 * 1000);
  log.duplicateMessages[key] = log.duplicateMessages[key].filter(t => t > cutoff);

  log.duplicateMessages[key].push(now);
  saveLog(log);

  if (log.duplicateMessages[key].length >= filter.threshold) {
    return {
      type: 'duplicate',
      action: filter.action,
      reason: `Duplicate message detected (${log.duplicateMessages[key].length} times)`
    };
  }

  return null;
}

function isExempt(message, filter) {
  // Global AutoMod Exempt role - only this role bypasses automod
  const AUTOMOD_EXEMPT_ROLE = '1462341119370072230';

  // Check for AutoMod Exempt role first
  if (message.member?.roles.cache.has(AUTOMOD_EXEMPT_ROLE)) return true;

  // Check filter-specific exempt roles
  if (filter.exemptRoles && filter.exemptRoles.length > 0) {
    const hasExemptRole = message.member?.roles.cache.some(r => filter.exemptRoles.includes(r.id));
    if (hasExemptRole) return true;
  }

  // Check exempt channels
  if (filter.exemptChannels && filter.exemptChannels.length > 0) {
    if (filter.exemptChannels.includes(message.channel.id)) return true;
  }

  // Note: Admins are NOT automatically exempt - must have AutoMod Exempt role
  return false;
}

async function executeAction(message, violation, config, client) {
  const log = loadLog();
  const userId = message.author.id;

  // Log the action
  log.actions.push({
    type: violation.type,
    action: violation.action,
    userId,
    username: message.author.username,
    channelId: message.channel.id,
    messageContent: message.content.substring(0, 200),
    reason: violation.reason,
    timestamp: new Date().toISOString()
  });

  // Track warnings
  if (!log.userWarnings[userId]) log.userWarnings[userId] = 0;
  if (!log.userMutes[userId]) log.userMutes[userId] = 0;

  try {
    // Execute based on action type
    switch (violation.action) {
      case 'delete':
        await message.delete().catch(() => { });
        break;

      case 'warn':
        log.userWarnings[userId]++;
        await sendWarning(message, violation);
        break;

      case 'delete_warn':
        await message.delete().catch(() => { });
        log.userWarnings[userId]++;
        await sendWarning(message, violation);
        break;

      case 'mute':
        log.userMutes[userId]++;
        await executeMute(message, violation, config, log.userMutes[userId]);
        break;

      case 'delete_mute':
        await message.delete().catch(() => { });
        log.userMutes[userId]++;
        await executeMute(message, violation, config, log.userMutes[userId]);
        break;

      case 'kick':
        await message.delete().catch(() => { });
        await message.member?.kick(violation.reason).catch(() => { });
        break;

      case 'ban':
        await message.delete().catch(() => { });
        await message.member?.ban({ reason: violation.reason }).catch(() => { });
        break;
    }

    // Check escalation
    if (config.escalation.enabled) {
      if (log.userWarnings[userId] >= config.escalation.warnThreshold) {
        // Escalate to mute
        log.userMutes[userId]++;
        await executeMute(message, { ...violation, reason: 'Escalated: Too many warnings' }, config, log.userMutes[userId]);
        log.userWarnings[userId] = 0; // Reset warnings
      }

      if (log.userMutes[userId] >= config.escalation.autoBanAfterMutes) {
        // Escalate to ban
        await message.member?.ban({ reason: 'AutoMod: Too many violations' }).catch(() => { });
      }
    }

    // Log to mod channel
    await logToModChannel(message, violation, config, client);

  } catch (error) {
    console.error('[AutoMod] Action error:', error);
  }

  saveLog(log);
}

async function sendWarning(message, violation) {
  try {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ AutoMod Warning')
      .setDescription(`Your message was flagged for: **${violation.reason}**`)
      .setColor(0xFFCC00)
      .addFields(
        { name: '📋 Rule Violated', value: violation.type.replace('_', ' ').toUpperCase(), inline: true },
        { name: '⚠️ Action', value: 'Warning issued', inline: true }
      )
      .setFooter({ text: 'Repeated violations may result in mute or ban' })
      .setTimestamp();

    await message.channel.send({ content: `<@${message.author.id}>`, embeds: [embed] })
      .then(msg => setTimeout(() => msg.delete().catch(() => { }), 10000));
  } catch (e) {
    // Ignore send errors
  }
}

async function executeMute(message, violation, config, muteCount) {
  try {
    const durations = config.escalation.muteDurations || [5, 15, 60, 1440];
    const durationIndex = Math.min(muteCount - 1, durations.length - 1);
    const duration = durations[durationIndex] * 60 * 1000; // Convert to ms

    await message.member?.timeout(duration, violation.reason);

    const embed = new EmbedBuilder()
      .setTitle('🔇 AutoMod Mute')
      .setDescription(`You have been muted for: **${violation.reason}**`)
      .setColor(0xFF6600)
      .addFields(
        { name: '⏱️ Duration', value: `${durations[durationIndex]} minutes`, inline: true },
        { name: '📊 Mute Count', value: `${muteCount}`, inline: true }
      )
      .setFooter({ text: 'Further violations will result in longer mutes or bans' })
      .setTimestamp();

    await message.author.send({ embeds: [embed] }).catch(() => { });
  } catch (e) {
    console.error('[AutoMod] Mute error:', e.message);
  }
}

async function logToModChannel(message, violation, config, client) {
  if (!config.logChannelId) return;

  try {
    const channel = await client.channels.fetch(config.logChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🛡️ AutoMod Action')
      .setColor(0xFF0000)
      .addFields(
        { name: '👤 User', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
        { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
        { name: '⚠️ Violation', value: violation.type.replace('_', ' '), inline: true },
        { name: '🔨 Action', value: violation.action.replace('_', ' + '), inline: true },
        { name: '📝 Reason', value: violation.reason, inline: false },
        { name: '💬 Message', value: message.content.substring(0, 500) || '[No text]', inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (e) {
    // Ignore log errors
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get user violation stats
 */
function getUserStats(userId) {
  const log = loadLog();
  return {
    warnings: log.userWarnings[userId] || 0,
    mutes: log.userMutes[userId] || 0,
    recentActions: log.actions.filter(a => a.userId === userId).slice(-10)
  };
}

/**
 * Reset user violations
 */
function resetUserStats(userId) {
  const log = loadLog();
  log.userWarnings[userId] = 0;
  log.userMutes[userId] = 0;
  saveLog(log);
}

/**
 * Update config
 */
function updateConfig(updates) {
  const config = loadConfig();
  const newConfig = { ...config, ...updates };
  return saveConfig(newConfig);
}

/**
 * Add word to filter
 */
function addFilterWord(filterType, word) {
  const config = loadConfig();
  if (!config.filters[filterType]) return false;

  const lowerWord = word.toLowerCase();
  if (!config.filters[filterType].words.includes(lowerWord)) {
    config.filters[filterType].words.push(lowerWord);
    return saveConfig(config);
  }
  return true;
}

/**
 * Remove word from filter
 */
function removeFilterWord(filterType, word) {
  const config = loadConfig();
  if (!config.filters[filterType]) return false;

  const lowerWord = word.toLowerCase();
  const index = config.filters[filterType].words.indexOf(lowerWord);
  if (index > -1) {
    config.filters[filterType].words.splice(index, 1);
    return saveConfig(config);
  }
  return true;
}

module.exports = {
  checkMessage,
  loadConfig,
  saveConfig,
  updateConfig,
  getUserStats,
  resetUserStats,
  addFilterWord,
  removeFilterWord,
  DEFAULT_CONFIG
};

/**
 * USGRP Utilities Bot
 * AutoMod, Moderation & Staff Management
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Initialize database
const { initDatabase } = require('./utils/database');

// AutoMod Manager
let autoModManager;
try {
  autoModManager = require('./utils/autoModManager');
} catch (e) {
  console.log('[AutoMod] Manager not loaded:', e.message);
  autoModManager = null;
}

// Bot configuration
const BOT_NAME = process.env.BOT_NAME || 'USGRP Utilities';
const BOT_VERSION = process.env.BOT_VERSION || '2.0.0';

// Create Discord client
// NOTE: Server Members Intent and Message Content Intent must be enabled in Discord Developer Portal
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,      // PRIVILEGED - Enable in Developer Portal
    GatewayIntentBits.GuildMessages,     // For message events
    GatewayIntentBits.MessageContent,    // PRIVILEGED - For AutoMod content scanning
    GatewayIntentBits.GuildModeration,   // For ban/unban events
    GatewayIntentBits.GuildVoiceStates,  // For voice channel join/leave/move
    GatewayIntentBits.GuildInvites       // For invite create/delete
  ]
});

// Command collection
client.commands = new Collection();

/**
 * Load commands
 */
function loadCommands() {
  const commandsPath = path.join(__dirname, 'Commands');

  if (!fs.existsSync(commandsPath)) {
    console.log('[Commands] Commands folder not found');
    return;
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    try {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);

      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`[Commands] ✓ Loaded: ${command.data.name}`);
      }
    } catch (error) {
      console.error(`[Commands] ✗ Failed to load ${file}:`, error.message);
    }
  }

  console.log(`[Commands] Loaded ${client.commands.size} commands`);
}

/**
 * Handle slash commands
 */
async function handleCommand(interaction) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
    console.log(`[Commands] /${interaction.commandName} by ${interaction.user.tag}`);
  } catch (error) {
    console.error(`[Commands] Error in /${interaction.commandName}:`, error);

    const errorMsg = { content: '❌ An error occurred.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMsg).catch(() => { });
    } else {
      await interaction.reply(errorMsg).catch(() => { });
    }
  }
}

/**
 * Handle autocomplete
 */
async function handleAutocomplete(interaction) {
  const command = client.commands.get(interaction.commandName);
  if (!command || !command.autocomplete) {
    return interaction.respond([]).catch(() => { });
  }

  try {
    await command.autocomplete(interaction);
  } catch (error) {
    console.error(`[Autocomplete] Error:`, error);
    await interaction.respond([]).catch(() => { });
  }
}

/**
 * Handle buttons
 */
async function handleButton(interaction) {
  const customId = interaction.customId;

  // Setup wizard buttons
  if (customId.startsWith('setup:')) {
    const setupCmd = client.commands.get('setup');
    if (setupCmd && setupCmd.handleButton) {
      return setupCmd.handleButton(interaction);
    }
  }

  // Permission buttons
  if (customId.startsWith('perm:')) {
    const permCmd = client.commands.get('permission');
    if (permCmd && permCmd.handleButton) {
      return permCmd.handleButton(interaction);
    }
  }

  // Fire confirmation
  if (customId.startsWith('fire:')) {
    const fireCmd = client.commands.get('fire');
    if (fireCmd && fireCmd.handleButton) {
      return fireCmd.handleButton(interaction);
    }
  }

  // DM buttons
  if (customId.startsWith('dm:')) {
    const dmCmd = client.commands.get('dm');
    if (dmCmd && dmCmd.handleButton) {
      return dmCmd.handleButton(interaction);
    }
  }

  // Ticket buttons
  if (customId.startsWith('ticket:')) {
    const ticketCmd = client.commands.get('ticket');
    if (ticketCmd && ticketCmd.handleButton) {
      return ticketCmd.handleButton(interaction);
    }
  }

  // Office buttons
  if (customId.startsWith('office_')) {
    const officeManager = require('./utils/officeManager');
    return officeManager.handleButton(interaction, client);
  }

  // VC buttons
  if (customId.startsWith('vc:')) {
    const vcCmd = client.commands.get('vc');
    if (vcCmd && vcCmd.handleButton) {
      return vcCmd.handleButton(interaction);
    }
  }

  // Task board buttons
  if (customId.startsWith('task:')) {
    const taskCmd = client.commands.get('task');
    if (taskCmd && taskCmd.handleButton) {
      return taskCmd.handleButton(interaction);
    }
  }

  // Speaking queue buttons
  if (customId.startsWith('queue:')) {
    const queueCmd = client.commands.get('queue');
    if (queueCmd && queueCmd.handleButton) {
      return queueCmd.handleButton(interaction);
    }
  }

  console.log(`[Buttons] Unhandled: ${customId}`);
}

/**
 * Handle select menus
 */
async function handleSelectMenu(interaction) {
  const customId = interaction.customId;

  // Setup wizard select menus
  if (customId.startsWith('setup:')) {
    const setupCmd = client.commands.get('setup');
    if (setupCmd && setupCmd.handleSelectMenu) {
      return setupCmd.handleSelectMenu(interaction);
    }
  }

  // Ticket select menus
  if (customId.startsWith('ticket:')) {
    const ticketCmd = client.commands.get('ticket');
    if (ticketCmd && ticketCmd.handleSelectMenu) {
      return ticketCmd.handleSelectMenu(interaction);
    }
  }

  // Office select menus
  if (customId.startsWith('office_')) {
    const officeManager = require('./utils/officeManager');
    return officeManager.handleSelectMenu(interaction, client);
  }

  // VC select menus
  if (customId.startsWith('vc:')) {
    const vcCmd = client.commands.get('vc');
    if (vcCmd && vcCmd.handleSelectMenu) {
      return vcCmd.handleSelectMenu(interaction);
    }
  }

  console.log(`[SelectMenu] Unhandled: ${customId}`);
}

// ============================================================
// EVENT HANDLERS
// ============================================================

client.once('ready', async () => {
  console.log('═'.repeat(50));
  console.log(`${BOT_NAME} v${BOT_VERSION}`);
  console.log('═'.repeat(50));
  console.log(`Logged in as: ${client.user.tag}`);
  console.log(`Guilds: ${client.guilds.cache.size}`);
  console.log(`Commands: ${client.commands.size}`);
  console.log('═'.repeat(50));

  // Initialize database
  try {
    initDatabase();

    // Run table creation
    const { initTables } = require('./scripts/db-init');
    initTables();

    console.log('[Database] ✓ Ready');
  } catch (error) {
    console.error('[Database] ✗ Error:', error.message);
  }

  // Set status
  client.user.setPresence({
    activities: [{ name: '/help | Moderation', type: 3 }],
    status: 'online'
  });

  // Initialize invite cache for all guilds
  try {
    const inviteTracker = require('./utils/inviteTracker');
    for (const [, guild] of client.guilds.cache) {
      await inviteTracker.cacheGuildInvites(guild);
    }
    console.log('[InviteTracker] ✓ Cached invites for all guilds');
  } catch (e) {
    console.error('[InviteTracker] Cache failed:', e.message);
  }

  // Initialize office waiting room panel
  try {
    const officeManager = require('./utils/officeManager');
    for (const [guildId] of client.guilds.cache) {
      await officeManager.initializePanel(client, guildId);
    }
    console.log('[OfficeManager] ✓ Waiting room panel ready');
  } catch (e) {
    console.error('[OfficeManager] Panel init failed:', e.message);
  }

  // Start recording download server
  try {
    const recordingServer = require('./utils/recordingServer');
    await recordingServer.start();
    console.log('[RecordingServer] ✓ Download server started');
  } catch (e) {
    console.error('[RecordingServer] Failed to start:', e.message);
  }

  // Start Admin API server
  try {
    const { initAdminApi } = require('./utils/adminApi');
    initAdminApi(client);
  } catch (e) {
    console.error('[Admin API] Failed to start:', e.message);
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      return handleAutocomplete(interaction);
    }

    if (interaction.isChatInputCommand()) {
      return handleCommand(interaction);
    }

    if (interaction.isButton()) {
      return handleButton(interaction);
    }

    if (interaction.isAnySelectMenu()) {
      return handleSelectMenu(interaction);
    }

    // Handle modal submits
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'vc:status_modal') {
        const status = interaction.fields.getTextInputValue('status_text') || '';
        const channel = interaction.member.voice?.channel;
        if (channel) {
          try {
            await channel.setStatus(status);
            return interaction.reply({ content: status ? `✅ Set status: ${status}` : '✅ Cleared status', ephemeral: true });
          } catch (e) {
            return interaction.reply({ content: '❌ Failed to set status (may not be supported).', ephemeral: true });
          }
        }
        return interaction.reply({ content: '❌ Join a VC first.', ephemeral: true });
      }
    }

  } catch (error) {
    console.error('[Interaction] Error:', error);
  }
});

// AutoMod message handler
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Track message activity
  try {
    const activityTracker = require('./utils/activityTracker');
    activityTracker.trackMessage(message.guild.id, message.author.id);
  } catch (e) { /* Activity not critical */ }

  // AutoMod check
  if (autoModManager) {
    try {
      await autoModManager.checkMessage(message, client);
    } catch (error) {
      console.error('[AutoMod] Error checking message:', error.message);
    }
  }

  // Word filter check
  try {
    const wordFilter = require('./utils/wordFilter');
    const filterResult = wordFilter.checkMessage(message.guild.id, message.content);
    if (filterResult.matched) {
      await wordFilter.handleFilteredMessage(message, filterResult.filter, client);
      return; // Stop processing if filtered
    }
  } catch (e) { /* Filter not critical */ }

  // Sticky message check
  try {
    const stickyManager = require('./utils/stickyManager');
    await stickyManager.handleMessage(message);
  } catch (e) { /* Sticky not critical */ }
});

// Voice state update - track voice time and office management
client.on('voiceStateUpdate', async (oldState, newState) => {
  // Track voice activity
  try {
    const activityTracker = require('./utils/activityTracker');
    activityTracker.handleVoiceStateUpdate(oldState, newState);
  } catch (e) {
    console.error('[VoiceState] Activity tracking error:', e.message);
  }

  // Office manager voice protection
  try {
    const officeManager = require('./utils/officeManager');
    await officeManager.handleVoiceUpdate(oldState, newState, client);
  } catch (e) {
    console.error('[VoiceState] Office manager error:', e.message);
  }
});

// ============================================================
// COMPREHENSIVE LOGGING - All events to log channel
// ============================================================

const modLogger = require('./utils/modLogger');

// Message events
client.on('messageDelete', message => {
  modLogger.logMessageDelete(client, message).catch(() => { });
});

client.on('messageDeleteBulk', (messages, channel) => {
  modLogger.logMessageBulkDelete(client, messages, channel).catch(() => { });
});

client.on('messageUpdate', (oldMessage, newMessage) => {
  if (oldMessage.partial) return; // Can't log if we don't have old content
  modLogger.logMessageEdit(client, oldMessage, newMessage).catch(() => { });
});

// Member events
client.on('guildMemberAdd', async member => {
  modLogger.logMemberJoin(client, member).catch(() => { });

  // Track which invite was used and send welcome message
  try {
    const inviteTracker = require('./utils/inviteTracker');
    const { EmbedBuilder } = require('discord.js');
    const usedInvite = await inviteTracker.trackMemberJoin(member);

    // Build join method string
    let joinMethod = 'an invite link';
    if (usedInvite) {
      if (usedInvite.inviterTag) {
        joinMethod = `an invite from **${usedInvite.inviterTag}**`;
      } else {
        joinMethod = `invite code \`${usedInvite.code}\``;
      }
    }

    // Send welcome DM
    try {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`👋 Welcome to ${member.guild.name}!`)
        .setColor(0x2ECC71)
        .setDescription(`You joined via ${joinMethod}.\n\nTo get started, run \`/citizen start\` in the server!`)
        .setThumbnail(member.guild.iconURL({ size: 256 }))
        .setFooter({ text: member.guild.name })
        .setTimestamp();

      await member.send({ embeds: [welcomeEmbed] });
    } catch (e) { /* DMs disabled */ }
  } catch (e) { /* Invite tracking not critical */ }

  // Raid mode check (runs first - may kick/ban)
  try {
    const raidManager = require('./utils/raidManager');
    const actioned = await raidManager.handleMemberJoin(member, client);
    if (actioned) return; // Don't run other checks if raid mode actioned
  } catch (e) { /* Raid not critical */ }

  // Watchlist check
  try {
    const watchlistManager = require('./utils/watchlistManager');
    await watchlistManager.handleMemberJoin(member, client);
  } catch (e) { /* Watchlist not critical */ }

  // Nickname lock enforcement
  try {
    const nicknameLockManager = require('./utils/nicknameLockManager');
    await nicknameLockManager.handleMemberJoin(member);
  } catch (e) { /* Nickname lock not critical */ }
});

client.on('guildMemberRemove', member => {
  modLogger.logMemberLeave(client, member).catch(() => { });
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  modLogger.logMemberUpdate(client, oldMember, newMember).catch(() => { });

  // Nickname lock enforcement - revert if locked nickname changed
  try {
    const nicknameLockManager = require('./utils/nicknameLockManager');
    await nicknameLockManager.handleNicknameChange(oldMember, newMember);
  } catch (e) { /* Nickname lock not critical */ }
});

// Voice events
client.on('voiceStateUpdate', (oldState, newState) => {
  modLogger.logVoiceStateUpdate(client, oldState, newState).catch(() => { });

  // Track voice activity
  try {
    const activityTracker = require('./utils/activityTracker');
    activityTracker.handleVoiceStateUpdate(oldState, newState);
  } catch (e) { /* Voice tracking not critical */ }

  // Office protection - auto-kick unauthorized
  try {
    const officeManager = require('./utils/officeManager');
    officeManager.handleVoiceUpdate(oldState, newState, client);
  } catch (e) { /* Office not critical */ }

  // Voice recording - announce joins/leaves during active recording
  try {
    const voiceRecorder = require('./utils/voiceRecorder');
    voiceRecorder.handleVoiceStateChange(oldState, newState);
  } catch (e) { /* Recording announcements not critical */ }
});

// Channel events
client.on('channelCreate', channel => {
  modLogger.logChannelCreate(client, channel).catch(() => { });
});

client.on('channelDelete', channel => {
  modLogger.logChannelDelete(client, channel).catch(() => { });
});

client.on('channelUpdate', (oldChannel, newChannel) => {
  modLogger.logChannelUpdate(client, oldChannel, newChannel).catch(() => { });
});

// Role events
client.on('roleCreate', role => {
  modLogger.logRoleCreate(client, role).catch(() => { });
});

client.on('roleDelete', role => {
  modLogger.logRoleDelete(client, role).catch(() => { });
});

client.on('roleUpdate', (oldRole, newRole) => {
  modLogger.logRoleUpdate(client, oldRole, newRole).catch(() => { });
});

// Thread events
client.on('threadCreate', thread => {
  modLogger.logThreadCreate(client, thread).catch(() => { });
});

client.on('threadDelete', thread => {
  modLogger.logThreadDelete(client, thread).catch(() => { });
});

// Invite events
client.on('inviteCreate', invite => {
  modLogger.logInviteCreate(client, invite).catch(() => { });
});

client.on('inviteDelete', invite => {
  modLogger.logInviteDelete(client, invite).catch(() => { });
});

// Ban events
client.on('guildBanAdd', ban => {
  modLogger.logGuildBanAdd(client, ban).catch(() => { });
});

client.on('guildBanRemove', ban => {
  modLogger.logGuildBanRemove(client, ban).catch(() => { });
});

// Server events
client.on('guildUpdate', (oldGuild, newGuild) => {
  modLogger.logGuildUpdate(client, oldGuild, newGuild).catch(() => { });
});

console.log('[Logging] ✓ Event loggers registered');

// Error handling
client.on('error', error => console.error('[Client] Error:', error));
process.on('unhandledRejection', error => console.error('[Process] Unhandled:', error));

process.on('SIGINT', () => {
  console.log('\n[Shutdown] Shutting down...');
  const { closeDatabase } = require('./utils/database');
  closeDatabase();
  client.destroy();
  process.exit(0);
});

// ============================================================
// STARTUP
// ============================================================

console.log('[Startup] Loading commands...');
loadCommands();

console.log('[Startup] Connecting to Discord...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('[Startup] Login failed:', error.message);
  process.exit(1);
});


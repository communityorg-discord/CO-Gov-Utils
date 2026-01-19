/**
 * /global-ban, /global-unban, /global-kick, /global-mute
 * Global moderation commands that sync across all servers
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const caseManager = require('../utils/caseManager');
const { hasPermission, buildPermissionDeniedEmbed, isSuperuser } = require('../utils/advancedPermissions');
const { logModAction, logAudit } = require('../utils/modLogger');
const { execute, query, queryOne } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('global')
    .setDescription('Global moderation commands')
    .addSubcommand(sub =>
      sub.setName('ban')
        .setDescription('Ban a user across all servers')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to globally ban')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for global ban')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('unban')
        .setDescription('Unban a user across all servers')
        .addStringOption(opt =>
          opt.setName('user-id')
            .setDescription('User ID to globally unban')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for global unban')))
    .addSubcommand(sub =>
      sub.setName('kick')
        .setDescription('Kick a user from all servers')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to globally kick')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for global kick')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('mute')
        .setDescription('Mute a user across all servers')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('User to globally mute')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('duration')
            .setDescription('Duration (e.g., 1h, 30m, 1d)')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for global mute')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all global bans'))
    .addSubcommand(sub =>
      sub.setName('check')
        .setDescription('Check if a user is globally banned')
        .addStringOption(opt =>
          opt.setName('user-id')
            .setDescription('User ID to check')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('carryover')
        .setDescription('Apply all global bans to this server')),

  async execute(interaction) {
    // Global commands require SUPERUSER
    if (!isSuperuser(interaction.member)) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed('global moderation', PERMISSION_LEVELS.SUPERUSER)],
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'ban':
        return globalBan(interaction);
      case 'unban':
        return globalUnban(interaction);
      case 'kick':
        return globalKick(interaction);
      case 'mute':
        return globalMute(interaction);
      case 'list':
        return globalList(interaction);
      case 'check':
        return globalCheck(interaction);
      case 'carryover':
        return globalCarryover(interaction);
    }
  }
};

function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)([mhdw])$/i);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers = { m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return value * multipliers[unit];
}

async function globalBan(interaction) {
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');

  await interaction.deferReply();

  try {
    // Create global case
    const caseData = caseManager.createCase({
      guildId: 'GLOBAL',
      globalCase: true,
      userId: target.id,
      userTag: target.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      actionType: 'global_ban',
      reason
    });

    // Record in global bans table
    execute(`
      INSERT OR REPLACE INTO global_bans (user_id, user_tag, banned_by, banned_by_tag, reason, case_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [target.id, target.tag, interaction.user.id, interaction.user.tag, reason, caseData.case_id]);

    // Ban from all guilds the bot is in
    const results = { success: [], failed: [] };

    for (const guild of interaction.client.guilds.cache.values()) {
      try {
        await guild.members.ban(target.id, { reason: `[GLOBAL BAN] ${reason} | Case: ${caseData.case_id}` });
        results.success.push(guild.name);
      } catch (e) {
        results.failed.push(guild.name);
      }
    }

    // DM the user
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🌐 Global Ban Notice')
        .setColor(0xE74C3C)
        .setDescription(`You have been globally banned from all servers using CO Government Utilities.`)
        .addFields(
          { name: 'Reason', value: reason, inline: false },
          { name: 'Case ID', value: caseData.case_id, inline: true }
        )
        .setTimestamp();
      await target.send({ embeds: [dmEmbed] });
    } catch (e) { }

    logAudit('GLOBAL', 'GLOBAL_BAN', interaction.user.id, interaction.user.tag, target.id, target.tag, {
      reason,
      caseId: caseData.case_id,
      serversAffected: results.success.length
    });

    const embed = new EmbedBuilder()
      .setTitle('🌐 Global Ban Executed')
      .setColor(0xE74C3C)
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Case ID', value: caseData.case_id, inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Servers Banned', value: `${results.success.length}`, inline: true },
        { name: 'Failed', value: `${results.failed.length}`, inline: true }
      )
      .setFooter({ text: `Executed by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Global Ban] Error:', error);
    return interaction.editReply({ content: '❌ Global ban failed.' });
  }
}

async function globalUnban(interaction) {
  const userId = interaction.options.getString('user-id');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  if (!/^\d{17,19}$/.test(userId)) {
    return interaction.reply({ content: '❌ Invalid user ID.', ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const globalBan = queryOne('SELECT * FROM global_bans WHERE user_id = ?', [userId]);

    if (!globalBan) {
      return interaction.editReply({ content: '❌ This user is not globally banned.' });
    }

    // Create case
    const caseData = caseManager.createCase({
      guildId: 'GLOBAL',
      globalCase: true,
      userId: userId,
      userTag: globalBan.user_tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      actionType: 'global_unban',
      reason
    });

    // Remove from global bans
    execute('DELETE FROM global_bans WHERE user_id = ?', [userId]);

    // Unban from all guilds
    const results = { success: [], failed: [] };

    for (const guild of interaction.client.guilds.cache.values()) {
      try {
        await guild.members.unban(userId, `[GLOBAL UNBAN] ${reason}`);
        results.success.push(guild.name);
      } catch (e) {
        results.failed.push(guild.name);
      }
    }

    logAudit('GLOBAL', 'GLOBAL_UNBAN', interaction.user.id, interaction.user.tag, userId, globalBan.user_tag, {
      reason,
      caseId: caseData.case_id,
      serversAffected: results.success.length
    });

    const embed = new EmbedBuilder()
      .setTitle('🌐 Global Unban Executed')
      .setColor(0x27AE60)
      .addFields(
        { name: 'User', value: `${globalBan.user_tag} (${userId})`, inline: true },
        { name: 'Case ID', value: caseData.case_id, inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Servers Unbanned', value: `${results.success.length}`, inline: true }
      )
      .setFooter({ text: `Executed by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Global Unban] Error:', error);
    return interaction.editReply({ content: '❌ Global unban failed.' });
  }
}

async function globalKick(interaction) {
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');

  await interaction.deferReply();

  try {
    const caseData = caseManager.createCase({
      guildId: 'GLOBAL',
      globalCase: true,
      userId: target.id,
      userTag: target.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      actionType: 'global_kick',
      reason
    });

    const results = { success: [], failed: [] };

    for (const guild of interaction.client.guilds.cache.values()) {
      try {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (member) {
          await member.kick(`[GLOBAL KICK] ${reason} | Case: ${caseData.case_id}`);
          results.success.push(guild.name);
        }
      } catch (e) {
        results.failed.push(guild.name);
      }
    }

    // DM the user
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🌐 Global Kick Notice')
        .setColor(0xF39C12)
        .setDescription(`You have been kicked from all servers using CO Government Utilities.`)
        .addFields(
          { name: 'Reason', value: reason, inline: false },
          { name: 'Case ID', value: caseData.case_id, inline: true }
        )
        .setTimestamp();
      await target.send({ embeds: [dmEmbed] });
    } catch (e) { }

    logAudit('GLOBAL', 'GLOBAL_KICK', interaction.user.id, interaction.user.tag, target.id, target.tag, {
      reason,
      caseId: caseData.case_id,
      serversAffected: results.success.length
    });

    const embed = new EmbedBuilder()
      .setTitle('🌐 Global Kick Executed')
      .setColor(0xF39C12)
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Case ID', value: caseData.case_id, inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Servers Kicked', value: `${results.success.length}`, inline: true }
      )
      .setFooter({ text: `Executed by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Global Kick] Error:', error);
    return interaction.editReply({ content: '❌ Global kick failed.' });
  }
}

async function globalMute(interaction) {
  const target = interaction.options.getUser('user');
  const durationStr = interaction.options.getString('duration');
  const reason = interaction.options.getString('reason');

  const duration = parseDuration(durationStr);
  if (!duration) {
    return interaction.reply({ content: '❌ Invalid duration. Use format: 30m, 1h, 1d, 1w', ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const caseData = caseManager.createCase({
      guildId: 'GLOBAL',
      globalCase: true,
      userId: target.id,
      userTag: target.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      actionType: 'global_mute',
      reason,
      duration: durationStr
    });

    // Record global mute
    execute(`
      INSERT OR REPLACE INTO global_mutes (user_id, user_tag, muted_by, reason, duration_ms, expires_at, case_id)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+' || ? || ' seconds'), ?)
    `, [target.id, target.tag, interaction.user.id, reason, duration, Math.floor(duration / 1000), caseData.case_id]);

    const results = { success: [], failed: [] };

    for (const guild of interaction.client.guilds.cache.values()) {
      try {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (member) {
          await member.timeout(duration, `[GLOBAL MUTE] ${reason} | Case: ${caseData.case_id}`);
          results.success.push(guild.name);
        }
      } catch (e) {
        results.failed.push(guild.name);
      }
    }

    // DM the user
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🌐 Global Mute Notice')
        .setColor(0xF39C12)
        .setDescription(`You have been muted across all servers using CO Government Utilities.`)
        .addFields(
          { name: 'Duration', value: durationStr, inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Case ID', value: caseData.case_id, inline: true }
        )
        .setTimestamp();
      await target.send({ embeds: [dmEmbed] });
    } catch (e) { }

    logAudit('GLOBAL', 'GLOBAL_MUTE', interaction.user.id, interaction.user.tag, target.id, target.tag, {
      reason,
      duration: durationStr,
      caseId: caseData.case_id,
      serversAffected: results.success.length
    });

    const embed = new EmbedBuilder()
      .setTitle('🌐 Global Mute Executed')
      .setColor(0xF39C12)
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
        { name: 'Duration', value: durationStr, inline: true },
        { name: 'Case ID', value: caseData.case_id, inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Servers Muted', value: `${results.success.length}`, inline: true }
      )
      .setFooter({ text: `Executed by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Global Mute] Error:', error);
    return interaction.editReply({ content: '❌ Global mute failed.' });
  }
}

async function globalList(interaction) {
  const bans = query('SELECT * FROM global_bans ORDER BY banned_at DESC LIMIT 25');

  if (bans.length === 0) {
    return interaction.reply({ content: '📋 No global bans found.', ephemeral: true });
  }

  const list = bans.map(b => `• **${b.user_tag}** (${b.user_id}) - ${b.reason?.slice(0, 50) || 'No reason'}`).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🌐 Global Ban List')
    .setColor(0xE74C3C)
    .setDescription(list)
    .setFooter({ text: `${bans.length} global ban(s)` })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function globalCheck(interaction) {
  const userId = interaction.options.getString('user-id');

  if (!/^\d{17,19}$/.test(userId)) {
    return interaction.reply({ content: '❌ Invalid user ID.', ephemeral: true });
  }

  const ban = queryOne('SELECT * FROM global_bans WHERE user_id = ?', [userId]);
  const mute = queryOne('SELECT * FROM global_mutes WHERE user_id = ? AND expires_at > datetime("now")', [userId]);

  const embed = new EmbedBuilder()
    .setTitle(`🌐 Global Status: ${userId}`)
    .setColor(ban ? 0xE74C3C : (mute ? 0xF39C12 : 0x27AE60))
    .addFields(
      { name: 'Global Ban', value: ban ? `✅ Banned (Case: ${ban.case_id})` : '❌ Not banned', inline: false },
      { name: 'Global Mute', value: mute ? `✅ Muted until ${mute.expires_at} (Case: ${mute.case_id})` : '❌ Not muted', inline: false }
    )
    .setTimestamp();

  if (ban) {
    embed.addFields(
      { name: 'Ban Reason', value: ban.reason || 'No reason', inline: false },
      { name: 'Banned By', value: ban.banned_by_tag, inline: true }
    );
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function globalCarryover(interaction) {
  await interaction.deferReply();

  try {
    const bans = query('SELECT * FROM global_bans');

    if (bans.length === 0) {
      return interaction.editReply({ content: '📋 No global bans to apply.' });
    }

    let applied = 0;
    let alreadyBanned = 0;
    let failed = 0;

    for (const ban of bans) {
      try {
        // Check if already banned
        const existingBan = await interaction.guild.bans.fetch(ban.user_id).catch(() => null);
        if (existingBan) {
          alreadyBanned++;
          continue;
        }

        await interaction.guild.members.ban(ban.user_id, {
          reason: `[GBAN CARRYOVER] ${ban.reason || 'Global ban'} | Original Case: ${ban.case_id || 'N/A'}`
        });
        applied++;
        await new Promise(r => setTimeout(r, 300)); // Rate limit
      } catch (e) {
        failed++;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🌐 Global Ban Carryover Complete')
      .setColor(0x27AE60)
      .setDescription(`Applied global bans to **${interaction.guild.name}**`)
      .addFields(
        { name: '✅ Applied', value: String(applied), inline: true },
        { name: '⏭️ Already Banned', value: String(alreadyBanned), inline: true },
        { name: '❌ Failed', value: String(failed), inline: true },
        { name: '📋 Total Global Bans', value: String(bans.length), inline: true }
      )
      .setFooter({ text: `Executed by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Global Carryover] Error:', error);
    return interaction.editReply({ content: '❌ Carryover failed.' });
  }
}

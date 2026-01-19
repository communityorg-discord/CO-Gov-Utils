/**
 * /lockdown - Lock channels or entire server
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { hasPermission, buildPermissionDeniedEmbed } = require('../utils/advancedPermissions');
const { logAudit } = require('../utils/modLogger');
const { execute, query, queryOne } = require('../utils/database');
const { getGuildConfig } = require('./setup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Lock channels or server')
    .addSubcommand(sub =>
      sub.setName('channel')
        .setDescription('Lock the current channel')
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for lockdown')))
    .addSubcommand(sub =>
      sub.setName('unlock-channel')
        .setDescription('Unlock the current channel'))
    .addSubcommand(sub =>
      sub.setName('server')
        .setDescription('Lock the entire server')
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for server lockdown')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('unlock-server')
        .setDescription('Unlock the entire server'))
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Check lockdown status')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    const permCheck = hasPermission(interaction.member, 'lockdown', subcommand);
    if (!permCheck.allowed) {
      return interaction.reply({
        embeds: [buildPermissionDeniedEmbed(`lockdown ${subcommand}`, permCheck.requiredLevel || 'MODERATOR', permCheck.canRequest)],
        ephemeral: true
      });
    }

    switch (subcommand) {
      case 'channel':
        return lockChannel(interaction);
      case 'unlock-channel':
        return unlockChannel(interaction);
      case 'server':
        return lockServer(interaction);
      case 'unlock-server':
        return unlockServer(interaction);
      case 'status':
        return lockdownStatus(interaction);
    }
  }
};

async function lockChannel(interaction) {
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const channel = interaction.channel;
  const config = getGuildConfig(interaction.guild.id);
  const memberRoleId = config.memberRoleId;

  await interaction.deferReply();

  try {
    // Store original permissions
    const originalPerms = channel.permissionOverwrites.cache.get(interaction.guild.id);
    
    execute(`
      INSERT OR REPLACE INTO lockdown_state (guild_id, channel_id, locked_by, reason, original_perms)
      VALUES (?, ?, ?, ?, ?)
    `, [interaction.guild.id, channel.id, interaction.user.id, reason, JSON.stringify(originalPerms?.deny?.toArray() || [])]);

    // Lock the channel
    await channel.permissionOverwrites.edit(interaction.guild.id, {
      SendMessages: false,
      AddReactions: false
    }, { reason: `Lockdown by ${interaction.user.tag}: ${reason}` });

    logAudit(interaction.guild.id, 'CHANNEL_LOCK', interaction.user.id, interaction.user.tag, null, null, {
      channelId: channel.id,
      channelName: channel.name,
      reason
    });

    const embed = new EmbedBuilder()
      .setTitle('🔒 Channel Locked')
      .setColor(0xE74C3C)
      .setDescription(`This channel has been locked.`)
      .addFields(
        { name: 'Channel', value: `${channel}`, inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setFooter({ text: `Locked by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Lockdown] Channel lock error:', error);
    return interaction.editReply({ content: '❌ Failed to lock channel.' });
  }
}

async function unlockChannel(interaction) {
  const channel = interaction.channel;

  await interaction.deferReply();

  try {
    // Remove lockdown record
    execute('DELETE FROM lockdown_state WHERE guild_id = ? AND channel_id = ?', [interaction.guild.id, channel.id]);

    // Unlock the channel
    await channel.permissionOverwrites.edit(interaction.guild.id, {
      SendMessages: null,
      AddReactions: null
    }, { reason: `Unlock by ${interaction.user.tag}` });

    logAudit(interaction.guild.id, 'CHANNEL_UNLOCK', interaction.user.id, interaction.user.tag, null, null, {
      channelId: channel.id,
      channelName: channel.name
    });

    const embed = new EmbedBuilder()
      .setTitle('🔓 Channel Unlocked')
      .setColor(0x27AE60)
      .setDescription(`This channel has been unlocked.`)
      .setFooter({ text: `Unlocked by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Lockdown] Channel unlock error:', error);
    return interaction.editReply({ content: '❌ Failed to unlock channel.' });
  }
}

async function lockServer(interaction) {
  const reason = interaction.options.getString('reason');

  await interaction.deferReply();

  try {
    const channels = interaction.guild.channels.cache.filter(c => 
      c.type === ChannelType.GuildText && c.permissionsFor(interaction.guild.id)?.has(PermissionFlagsBits.ViewChannel)
    );

    let locked = 0;
    let failed = 0;

    // Record server lockdown
    execute(`
      INSERT OR REPLACE INTO lockdown_state (guild_id, channel_id, locked_by, reason, is_server_lockdown)
      VALUES (?, 'server', ?, ?, 1)
    `, [interaction.guild.id, interaction.user.id, reason]);

    for (const channel of channels.values()) {
      try {
        // Store original state
        execute(`
          INSERT OR REPLACE INTO lockdown_state (guild_id, channel_id, locked_by, reason, is_server_lockdown)
          VALUES (?, ?, ?, ?, 1)
        `, [interaction.guild.id, channel.id, interaction.user.id, reason]);

        await channel.permissionOverwrites.edit(interaction.guild.id, {
          SendMessages: false,
          AddReactions: false
        }, { reason: `Server lockdown: ${reason}` });
        locked++;
      } catch (e) {
        failed++;
      }
    }

    logAudit(interaction.guild.id, 'SERVER_LOCK', interaction.user.id, interaction.user.tag, null, null, {
      reason,
      channelsLocked: locked,
      channelsFailed: failed
    });

    const embed = new EmbedBuilder()
      .setTitle('🔒 SERVER LOCKDOWN ACTIVE')
      .setColor(0xE74C3C)
      .setDescription(`The server has been locked down.`)
      .addFields(
        { name: 'Reason', value: reason, inline: false },
        { name: 'Channels Locked', value: `${locked}`, inline: true },
        { name: 'Failed', value: `${failed}`, inline: true }
      )
      .setFooter({ text: `Locked by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Lockdown] Server lock error:', error);
    return interaction.editReply({ content: '❌ Failed to lock server.' });
  }
}

async function unlockServer(interaction) {
  await interaction.deferReply();

  try {
    const channels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);

    let unlocked = 0;
    let failed = 0;

    for (const channel of channels.values()) {
      try {
        await channel.permissionOverwrites.edit(interaction.guild.id, {
          SendMessages: null,
          AddReactions: null
        }, { reason: `Server unlock by ${interaction.user.tag}` });
        unlocked++;
      } catch (e) {
        failed++;
      }
    }

    // Clear lockdown records
    execute('DELETE FROM lockdown_state WHERE guild_id = ?', [interaction.guild.id]);

    logAudit(interaction.guild.id, 'SERVER_UNLOCK', interaction.user.id, interaction.user.tag, null, null, {
      channelsUnlocked: unlocked,
      channelsFailed: failed
    });

    const embed = new EmbedBuilder()
      .setTitle('🔓 Server Unlocked')
      .setColor(0x27AE60)
      .setDescription(`The server lockdown has been lifted.`)
      .addFields(
        { name: 'Channels Unlocked', value: `${unlocked}`, inline: true },
        { name: 'Failed', value: `${failed}`, inline: true }
      )
      .setFooter({ text: `Unlocked by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[Lockdown] Server unlock error:', error);
    return interaction.editReply({ content: '❌ Failed to unlock server.' });
  }
}

async function lockdownStatus(interaction) {
  const lockedChannels = query(
    'SELECT * FROM lockdown_state WHERE guild_id = ? AND channel_id != ?',
    [interaction.guild.id, 'server']
  );

  const serverLock = queryOne(
    'SELECT * FROM lockdown_state WHERE guild_id = ? AND channel_id = ?',
    [interaction.guild.id, 'server']
  );

  const embed = new EmbedBuilder()
    .setTitle('🔒 Lockdown Status')
    .setColor(serverLock ? 0xE74C3C : (lockedChannels.length > 0 ? 0xF39C12 : 0x27AE60))
    .addFields(
      { name: 'Server Lockdown', value: serverLock ? `✅ Active (by <@${serverLock.locked_by}>)` : '❌ Inactive', inline: false }
    )
    .setTimestamp();

  if (lockedChannels.length > 0) {
    const channelList = lockedChannels.slice(0, 10).map(l => `<#${l.channel_id}>`).join('\n');
    embed.addFields({
      name: `Locked Channels (${lockedChannels.length})`,
      value: channelList + (lockedChannels.length > 10 ? `\n...and ${lockedChannels.length - 10} more` : ''),
      inline: false
    });
  } else {
    embed.addFields({ name: 'Locked Channels', value: 'None', inline: false });
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

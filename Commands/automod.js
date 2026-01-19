/**
 * /automod - AutoMod Configuration Command
 * Manage automatic moderation rules for USGRP
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const autoModManager = require('../utils/autoModManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure automatic moderation')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('View AutoMod status and configuration'))
    .addSubcommand(sub => sub
      .setName('enable')
      .setDescription('Enable AutoMod'))
    .addSubcommand(sub => sub
      .setName('disable')
      .setDescription('Disable AutoMod'))
    .addSubcommand(sub => sub
      .setName('setlog')
      .setDescription('Set the moderation log channel')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel for AutoMod logs')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('filter')
      .setDescription('Configure a filter')
      .addStringOption(opt => opt
        .setName('type')
        .setDescription('Filter type')
        .setRequired(true)
        .addChoices(
          { name: 'Profanity', value: 'profanity' },
          { name: 'Slurs', value: 'slurs' },
          { name: 'Spam', value: 'spam' },
          { name: 'Links', value: 'links' },
          { name: 'Caps', value: 'caps' },
          { name: 'Duplicates', value: 'duplicates' }
        ))
      .addBooleanOption(opt => opt
        .setName('enabled')
        .setDescription('Enable or disable this filter')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('addword')
      .setDescription('Add a word to a filter')
      .addStringOption(opt => opt
        .setName('filter')
        .setDescription('Filter to add word to')
        .setRequired(true)
        .addChoices(
          { name: 'Profanity', value: 'profanity' },
          { name: 'Slurs', value: 'slurs' }
        ))
      .addStringOption(opt => opt
        .setName('word')
        .setDescription('Word to add')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('removeword')
      .setDescription('Remove a word from a filter')
      .addStringOption(opt => opt
        .setName('filter')
        .setDescription('Filter to remove word from')
        .setRequired(true)
        .addChoices(
          { name: 'Profanity', value: 'profanity' },
          { name: 'Slurs', value: 'slurs' }
        ))
      .addStringOption(opt => opt
        .setName('word')
        .setDescription('Word to remove')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('userstats')
      .setDescription('View a user\'s violation stats')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to check')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('resetuser')
      .setDescription('Reset a user\'s violation count')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to reset')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('exempt')
      .setDescription('Add role/channel exemption')
      .addStringOption(opt => opt
        .setName('filter')
        .setDescription('Filter to exempt from')
        .setRequired(true)
        .addChoices(
          { name: 'Profanity', value: 'profanity' },
          { name: 'Spam', value: 'spam' },
          { name: 'Links', value: 'links' },
          { name: 'Caps', value: 'caps' }
        ))
      .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Role to exempt'))
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to exempt')))
    .addSubcommand(sub => sub
      .setName('bypass')
      .setDescription('Grant or revoke AutoMod Exempt role for a user')
      .addUserOption(opt => opt
        .setName('user')
        .setDescription('User to grant/revoke bypass')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('action')
        .setDescription('Grant or revoke')
        .setRequired(true)
        .addChoices(
          { name: 'Grant Bypass', value: 'grant' },
          { name: 'Revoke Bypass', value: 'revoke' }
        ))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'status': return handleStatus(interaction);
      case 'enable': return handleEnable(interaction);
      case 'disable': return handleDisable(interaction);
      case 'setlog': return handleSetLog(interaction);
      case 'filter': return handleFilter(interaction);
      case 'addword': return handleAddWord(interaction);
      case 'removeword': return handleRemoveWord(interaction);
      case 'userstats': return handleUserStats(interaction);
      case 'resetuser': return handleResetUser(interaction);
      case 'exempt': return handleExempt(interaction);
      case 'bypass': return handleBypass(interaction);
    }
  }
};

async function handleStatus(interaction) {
  const config = autoModManager.loadConfig();

  const filterStatus = Object.entries(config.filters).map(([name, filter]) => {
    const status = filter.enabled ? '✅' : '❌';
    return `${status} **${name.charAt(0).toUpperCase() + name.slice(1)}**: ${filter.action}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🛡️ AutoMod Configuration')
    .setColor(config.enabled ? 0x00FF00 : 0xFF0000)
    .addFields(
      { name: '📊 Status', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: '📋 Log Channel', value: config.logChannelId ? `<#${config.logChannelId}>` : 'Not set', inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '🔍 Filters', value: filterStatus, inline: false },
      { name: '🚨 Raid Protection', value: config.raidProtection.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: '💰 Economy Protection', value: config.economyProtection.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: '📈 Escalation', value: config.escalation.enabled ? '✅ Enabled' : '❌ Disabled', inline: true }
    )
    .setFooter({ text: 'Use /automod <subcommand> to configure' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleEnable(interaction) {
  autoModManager.updateConfig({ enabled: true });
  return interaction.reply({
    content: '✅ AutoMod has been **enabled**.',
    ephemeral: true
  });
}

async function handleDisable(interaction) {
  autoModManager.updateConfig({ enabled: false });
  return interaction.reply({
    content: '❌ AutoMod has been **disabled**.',
    ephemeral: true
  });
}

async function handleSetLog(interaction) {
  const channel = interaction.options.getChannel('channel');
  autoModManager.updateConfig({ logChannelId: channel.id });
  return interaction.reply({
    content: `✅ AutoMod logs will be sent to ${channel}.`,
    ephemeral: true
  });
}

async function handleFilter(interaction) {
  const filterType = interaction.options.getString('type');
  const enabled = interaction.options.getBoolean('enabled');

  const config = autoModManager.loadConfig();
  if (!config.filters[filterType]) {
    return interaction.reply({
      content: '❌ Invalid filter type.',
      ephemeral: true
    });
  }

  config.filters[filterType].enabled = enabled;
  autoModManager.saveConfig(config);

  return interaction.reply({
    content: `✅ Filter **${filterType}** has been ${enabled ? 'enabled' : 'disabled'}.`,
    ephemeral: true
  });
}

async function handleAddWord(interaction) {
  const filterType = interaction.options.getString('filter');
  const word = interaction.options.getString('word');

  const success = autoModManager.addFilterWord(filterType, word);

  if (success) {
    return interaction.reply({
      content: `✅ Added "${word}" to the ${filterType} filter.`,
      ephemeral: true
    });
  } else {
    return interaction.reply({
      content: '❌ Failed to add word to filter.',
      ephemeral: true
    });
  }
}

async function handleRemoveWord(interaction) {
  const filterType = interaction.options.getString('filter');
  const word = interaction.options.getString('word');

  const success = autoModManager.removeFilterWord(filterType, word);

  if (success) {
    return interaction.reply({
      content: `✅ Removed "${word}" from the ${filterType} filter.`,
      ephemeral: true
    });
  } else {
    return interaction.reply({
      content: '❌ Failed to remove word from filter.',
      ephemeral: true
    });
  }
}

async function handleUserStats(interaction) {
  const user = interaction.options.getUser('user');
  const stats = autoModManager.getUserStats(user.id);

  const recentActions = stats.recentActions.length > 0
    ? stats.recentActions.map(a => `• ${a.type}: ${a.reason} (<t:${Math.floor(new Date(a.timestamp).getTime() / 1000)}:R>)`).join('\n')
    : 'No recent violations';

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ AutoMod Stats: ${user.tag}`)
    .setColor(stats.warnings + stats.mutes > 0 ? 0xFF6600 : 0x00FF00)
    .addFields(
      { name: '⚠️ Warnings', value: stats.warnings.toString(), inline: true },
      { name: '🔇 Mutes', value: stats.mutes.toString(), inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '📜 Recent Violations', value: recentActions.substring(0, 1024), inline: false }
    )
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleResetUser(interaction) {
  const user = interaction.options.getUser('user');
  autoModManager.resetUserStats(user.id);

  return interaction.reply({
    content: `✅ Reset violation stats for ${user.tag}.`,
    ephemeral: true
  });
}

async function handleExempt(interaction) {
  const filterType = interaction.options.getString('filter');
  const role = interaction.options.getRole('role');
  const channel = interaction.options.getChannel('channel');

  if (!role && !channel) {
    return interaction.reply({
      content: '❌ You must specify either a role or channel to exempt.',
      ephemeral: true
    });
  }

  const config = autoModManager.loadConfig();
  if (!config.filters[filterType]) {
    return interaction.reply({
      content: '❌ Invalid filter type.',
      ephemeral: true
    });
  }

  const results = [];

  if (role) {
    if (!config.filters[filterType].exemptRoles) {
      config.filters[filterType].exemptRoles = [];
    }
    if (!config.filters[filterType].exemptRoles.includes(role.id)) {
      config.filters[filterType].exemptRoles.push(role.id);
      results.push(`Role ${role.name}`);
    }
  }

  if (channel) {
    if (!config.filters[filterType].exemptChannels) {
      config.filters[filterType].exemptChannels = [];
    }
    if (!config.filters[filterType].exemptChannels.includes(channel.id)) {
      config.filters[filterType].exemptChannels.push(channel.id);
      results.push(`Channel #${channel.name}`);
    }
  }

  autoModManager.saveConfig(config);

  if (results.length > 0) {
    return interaction.reply({
      content: `✅ Added exemption to ${filterType} filter: ${results.join(', ')}`,
      ephemeral: true
    });
  } else {
    return interaction.reply({
      content: '⚠️ These exemptions already exist.',
      ephemeral: true
    });
  }
}

// AutoMod Exempt role ID
const AUTOMOD_EXEMPT_ROLE = '1462341119370072230';

async function handleBypass(interaction) {
  const user = interaction.options.getUser('user');
  const action = interaction.options.getString('action');

  try {
    const member = await interaction.guild.members.fetch(user.id);

    if (action === 'grant') {
      if (member.roles.cache.has(AUTOMOD_EXEMPT_ROLE)) {
        return interaction.reply({
          content: `⚠️ ${user} already has the AutoMod Exempt role.`,
          ephemeral: true
        });
      }

      await member.roles.add(AUTOMOD_EXEMPT_ROLE, `AutoMod bypass granted by ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setTitle('✅ AutoMod Bypass Granted')
        .setColor(0x27AE60)
        .setDescription(`${user} is now exempt from all AutoMod filters.`)
        .addFields(
          { name: '👤 User', value: `${user.tag}`, inline: true },
          { name: '👮 Granted By', value: `${interaction.user.tag}`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (action === 'revoke') {
      if (!member.roles.cache.has(AUTOMOD_EXEMPT_ROLE)) {
        return interaction.reply({
          content: `⚠️ ${user} doesn't have the AutoMod Exempt role.`,
          ephemeral: true
        });
      }

      await member.roles.remove(AUTOMOD_EXEMPT_ROLE, `AutoMod bypass revoked by ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setTitle('❌ AutoMod Bypass Revoked')
        .setColor(0xE74C3C)
        .setDescription(`${user} is no longer exempt from AutoMod filters.`)
        .addFields(
          { name: '👤 User', value: `${user.tag}`, inline: true },
          { name: '👮 Revoked By', value: `${interaction.user.tag}`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (error) {
    console.error('[AutoMod] Bypass error:', error);
    return interaction.reply({
      content: `❌ Failed to modify bypass: ${error.message}`,
      ephemeral: true
    });
  }
}


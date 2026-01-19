/**
 * /setup utils - Interactive setup wizard for bot configuration
 * Replaces manual .env configuration
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder } = require('discord.js');
const { isBotDeveloper, BOT_DEVELOPER_ID } = require('../utils/advancedPermissions');
const { execute, query, queryOne } = require('../utils/database');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'guild_config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveConfig(config) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getGuildConfig(guildId) {
  const config = loadConfig();
  return config[guildId] || {};
}

function setGuildConfig(guildId, data) {
  const config = loadConfig();
  config[guildId] = { ...config[guildId], ...data };
  saveConfig(config);
  return config[guildId];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup wizard for bot configuration')
    .addSubcommand(sub =>
      sub.setName('utils')
        .setDescription('Run the interactive setup wizard'))
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View current configuration'))
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Reset configuration for this server')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Only Bot Developer can run setup
    if (!isBotDeveloper(interaction.user.id)) {
      const embed = new EmbedBuilder()
        .setTitle('⛔ Access Denied')
        .setColor(0xE74C3C)
        .setDescription('This command is restricted to the **Bot Developer** only.')
        .addFields({ name: 'Bot Developer', value: `<@${BOT_DEVELOPER_ID}>` })
        .setTimestamp();
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    switch (subcommand) {
      case 'utils':
        return startSetupWizard(interaction);
      case 'view':
        return viewConfig(interaction);
      case 'reset':
        return resetConfig(interaction);
    }
  },

  async handleButton(interaction) {
    const [, action, ...params] = interaction.customId.split(':');

    switch (action) {
      case 'start':
        return showStep1(interaction);
      case 'step1':
        return handleStep1(interaction);
      case 'step2':
        return handleStep2(interaction);
      case 'step3':
        return handleStep3(interaction);
      case 'step4':
        return handleStep4(interaction);
      case 'step5':
        return handleStep5(interaction);
      case 'finish':
        return finishSetup(interaction);
      case 'cancel':
        return cancelSetup(interaction);
      case 'create-muted':
        return createMutedRole(interaction);
      case 'create-member':
        return createMemberRole(interaction);
    }
  },

  async handleSelectMenu(interaction) {
    const [, action] = interaction.customId.split(':');

    switch (action) {
      case 'member-role':
        return saveMemberRole(interaction);
      case 'muted-role':
        return saveMutedRole(interaction);
      case 'mod-log':
        return saveModLog(interaction);
      case 'case-log':
        return saveCaseLog(interaction);
      case 'approval-channel':
        return saveApprovalChannel(interaction);
    }
  },

  getGuildConfig,
  setGuildConfig
};

async function startSetupWizard(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Government Utilities Setup Wizard')
    .setColor(0x3498DB)
    .setDescription('Welcome to the setup wizard! This will configure all necessary roles and channels for the moderation system.')
    .addFields(
      { name: '📋 What will be configured:', value: 
        '• **Member Role** - Base role for all members\n' +
        '• **Muted Role** - Auto-created if needed during mute\n' +
        '• **Moderation Log Channel** - Where mod actions are logged\n' +
        '• **Case Log Channel** - Public case records (optional)\n' +
        '• **Approval Channel** - Permission requests (required)', inline: false },
      { name: '⏱️ Estimated Time', value: '~2 minutes', inline: true },
      { name: '📊 Current Status', value: config.setupComplete ? '✅ Configured' : '❌ Not configured', inline: true }
    )
    .setFooter({ text: 'Click Start to begin setup' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:start')
      .setLabel('Start Setup')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId('setup:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function showStep1(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle('Step 1/4: Member Role')
    .setColor(0x3498DB)
    .setDescription('Select or create the **Member** role. This is the base role that all members should have.')
    .addFields(
      { name: 'Current Setting', value: config.memberRoleId ? `<@&${config.memberRoleId}>` : 'Not set', inline: true }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('setup:member-role')
      .setPlaceholder('Select existing Member role')
      .setMinValues(1)
      .setMaxValues(1)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:create-member')
      .setLabel('Create New Role')
      .setStyle(ButtonStyle.Success)
      .setEmoji('➕'),
    new ButtonBuilder()
      .setCustomId('setup:step2')
      .setLabel('Skip / Next')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function saveMemberRole(interaction) {
  const roleId = interaction.values[0];
  setGuildConfig(interaction.guild.id, { memberRoleId: roleId });

  return showStep2(interaction);
}

async function createMemberRole(interaction) {
  await interaction.deferUpdate();

  try {
    const role = await interaction.guild.roles.create({
      name: 'Member',
      color: 0x3498DB,
      reason: 'Setup wizard - Member role'
    });

    setGuildConfig(interaction.guild.id, { memberRoleId: role.id });
    return showStep2(interaction);
  } catch (error) {
    return interaction.followUp({ content: '❌ Failed to create role. Check bot permissions.', ephemeral: true });
  }
}

async function handleStep1(interaction) {
  return showStep2(interaction);
}

async function showStep2(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle('Step 2/4: Muted Role (Optional)')
    .setColor(0x3498DB)
    .setDescription('Select the **Muted** role. If you skip this, a role will be automatically created when someone is first muted.')
    .addFields(
      { name: 'Current Setting', value: config.mutedRoleId ? `<@&${config.mutedRoleId}>` : 'Auto-create on first mute', inline: true }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('setup:muted-role')
      .setPlaceholder('Select existing Muted role')
      .setMinValues(1)
      .setMaxValues(1)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:create-muted')
      .setLabel('Create Now')
      .setStyle(ButtonStyle.Success)
      .setEmoji('➕'),
    new ButtonBuilder()
      .setCustomId('setup:step3')
      .setLabel('Skip (Auto-create)')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function saveMutedRole(interaction) {
  const roleId = interaction.values[0];
  setGuildConfig(interaction.guild.id, { mutedRoleId: roleId });

  return showStep3(interaction);
}

async function createMutedRole(interaction) {
  await interaction.deferUpdate();

  try {
    const role = await interaction.guild.roles.create({
      name: 'Muted',
      color: 0x7F8C8D,
      reason: 'Setup wizard - Muted role'
    });

    // Set permissions on all channels
    for (const channel of interaction.guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
        await channel.permissionOverwrites.edit(role, {
          SendMessages: false,
          AddReactions: false,
          Speak: false
        }).catch(() => {});
      }
    }

    setGuildConfig(interaction.guild.id, { mutedRoleId: role.id });
    return showStep3(interaction);
  } catch (error) {
    return interaction.followUp({ content: '❌ Failed to create role. Check bot permissions.', ephemeral: true });
  }
}

async function handleStep2(interaction) {
  return showStep3(interaction);
}

async function showStep3(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle('Step 3/4: Moderation Log Channel')
    .setColor(0x3498DB)
    .setDescription('Select the channel where **moderation actions** will be logged. This is required for proper audit trails.')
    .addFields(
      { name: 'Current Setting', value: config.modLogChannelId ? `<#${config.modLogChannelId}>` : 'Not set', inline: true }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('setup:mod-log')
      .setPlaceholder('Select moderation log channel')
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:step4')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function saveModLog(interaction) {
  const channelId = interaction.values[0];
  setGuildConfig(interaction.guild.id, { modLogChannelId: channelId });

  return showStep4(interaction);
}

async function handleStep3(interaction) {
  return showStep4(interaction);
}

async function showStep4(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle('Step 4/5: Public Case Log (Optional)')
    .setColor(0x3498DB)
    .setDescription('Select a channel for **public case records**. This is optional but useful for transparency.')
    .addFields(
      { name: 'Current Setting', value: config.caseLogChannelId ? `<#${config.caseLogChannelId}>` : 'Not set', inline: true }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('setup:case-log')
      .setPlaceholder('Select public case log channel')
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:step5')
      .setLabel('Skip / Next')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function saveCaseLog(interaction) {
  const channelId = interaction.values[0];
  setGuildConfig(interaction.guild.id, { caseLogChannelId: channelId });

  return showStep5(interaction);
}

async function handleStep4(interaction) {
  return showStep5(interaction);
}

async function showStep5(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle('Step 5/5: Approval Channel')
    .setColor(0x3498DB)
    .setDescription('Select a channel for **permission requests**. This is where approval requests will be sent for superusers to review.')
    .addFields(
      { name: 'Current Setting', value: config.approvalChannelId ? `<#${config.approvalChannelId}>` : 'Not set', inline: true }
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('setup:approval-channel')
      .setPlaceholder('Select approval channel')
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:finish')
      .setLabel('Skip / Finish')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.update({ embeds: [embed], components: [row1, row2] });
}

async function saveApprovalChannel(interaction) {
  const channelId = interaction.values[0];
  setGuildConfig(interaction.guild.id, { approvalChannelId: channelId });

  return finishSetup(interaction);
}

async function handleStep5(interaction) {
  return finishSetup(interaction);
}

async function finishSetup(interaction) {
  setGuildConfig(interaction.guild.id, { setupComplete: true, setupAt: new Date().toISOString() });

  const config = getGuildConfig(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle('✅ Setup Complete!')
    .setColor(0x27AE60)
    .setDescription('The Government Utilities bot is now configured for this server.')
    .addFields(
      { name: 'Member Role', value: config.memberRoleId ? `<@&${config.memberRoleId}>` : 'Not set', inline: true },
      { name: 'Muted Role', value: config.mutedRoleId ? `<@&${config.mutedRoleId}>` : 'Auto-create', inline: true },
      { name: 'Mod Log', value: config.modLogChannelId ? `<#${config.modLogChannelId}>` : 'Not set', inline: true },
      { name: 'Case Log', value: config.caseLogChannelId ? `<#${config.caseLogChannelId}>` : 'Not set', inline: true },
      { name: 'Approval Channel', value: config.approvalChannelId ? `<#${config.approvalChannelId}>` : 'Not set', inline: true }
    )
    .setFooter({ text: 'Use /setup view to see config anytime' })
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });
}

async function cancelSetup(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('❌ Setup Cancelled')
    .setColor(0xE74C3C)
    .setDescription('Setup wizard has been cancelled. Run `/setup utils` to start again.');

  await interaction.update({ embeds: [embed], components: [] });
}

async function viewConfig(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Current Configuration')
    .setColor(0x3498DB)
    .addFields(
      { name: 'Setup Complete', value: config.setupComplete ? '✅ Yes' : '❌ No', inline: true },
      { name: 'Member Role', value: config.memberRoleId ? `<@&${config.memberRoleId}>` : 'Not set', inline: true },
      { name: 'Muted Role', value: config.mutedRoleId ? `<@&${config.mutedRoleId}>` : 'Auto-create', inline: true },
      { name: 'Mod Log', value: config.modLogChannelId ? `<#${config.modLogChannelId}>` : 'Not set', inline: true },
      { name: 'Case Log', value: config.caseLogChannelId ? `<#${config.caseLogChannelId}>` : 'Not set', inline: true },
      { name: 'Approval Channel', value: config.approvalChannelId ? `<#${config.approvalChannelId}>` : 'Not set', inline: true }
    )
    .setTimestamp();

  if (config.setupAt) {
    embed.setFooter({ text: `Last configured: ${new Date(config.setupAt).toLocaleString()}` });
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function resetConfig(interaction) {
  const config = loadConfig();
  delete config[interaction.guild.id];
  saveConfig(config);

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setTitle('🔄 Configuration Reset')
      .setColor(0xF39C12)
      .setDescription('Server configuration has been reset. Run `/setup utils` to reconfigure.')
    ],
    ephemeral: true
  });
}

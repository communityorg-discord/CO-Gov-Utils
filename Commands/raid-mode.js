/**
 * /raid-mode - Emergency Raid Protection
 * Auto-kick/ban new accounts, increase verification during raids
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const raidManager = require('../utils/raidManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raid-mode')
        .setDescription('Emergency raid protection mode')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub
            .setName('enable')
            .setDescription('Enable raid mode')
            .addIntegerOption(opt => opt
                .setName('level')
                .setDescription('Protection level (1-3)')
                .setRequired(true)
                .addChoices(
                    { name: 'Level 1 - Alert + Timeout new accounts', value: 1 },
                    { name: 'Level 2 - Kick accounts < 7 days', value: 2 },
                    { name: 'Level 3 - Ban accounts < 30 days', value: 3 }
                ))
            .addStringOption(opt => opt
                .setName('duration')
                .setDescription('Auto-disable after (e.g., 30m, 1h, 2h)')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('disable')
            .setDescription('Disable raid mode'))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('Check raid mode status')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'raid-mode');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'enable': return handleEnable(interaction);
            case 'disable': return handleDisable(interaction);
            case 'status': return handleStatus(interaction);
        }
    }
};

async function handleEnable(interaction) {
    const level = interaction.options.getInteger('level');
    const durationStr = interaction.options.getString('duration');

    const duration = durationStr ? raidManager.parseDuration(durationStr) : null;

    // Check if already enabled
    const current = raidManager.getRaidStatus(interaction.guild.id);
    if (current.enabled) {
        return interaction.reply({
            content: `⚠️ Raid mode is already enabled at Level ${current.level}`,
            ephemeral: true
        });
    }

    await interaction.deferReply();

    const result = await raidManager.enableRaidMode(
        interaction.guild,
        level,
        duration,
        interaction.user.id,
        interaction.user.tag
    );

    if (!result.success) {
        return interaction.editReply({ content: `❌ Failed to enable raid mode: ${result.error}` });
    }

    // Send alert to audit log
    await raidManager.sendRaidAlert(interaction.guild, 'enabled', level);

    const levelDescriptions = {
        1: '• Alert on new members\n• Timeout accounts < 3 days old\n• High verification level',
        2: '• All Level 1 protections\n• Kick accounts < 7 days old\n• Highest verification level',
        3: '• All Level 2 protections\n• Ban accounts < 30 days old\n• Maximum protection'
    };

    const embed = new EmbedBuilder()
        .setTitle('🚨 RAID MODE ENABLED')
        .setColor(0xFF0000)
        .setDescription(`**Level ${level}** raid protection is now active!`)
        .addFields(
            { name: '🛡️ Active Protections', value: levelDescriptions[level], inline: false },
            { name: '👮 Enabled By', value: interaction.user.tag, inline: true },
            { name: '⏱️ Duration', value: durationStr || 'Until manually disabled', inline: true }
        )
        .setFooter({ text: 'New members with young accounts will be actioned automatically' })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function handleDisable(interaction) {
    const current = raidManager.getRaidStatus(interaction.guild.id);

    if (!current.enabled) {
        return interaction.reply({ content: '❌ Raid mode is not currently enabled.', ephemeral: true });
    }

    await interaction.deferReply();

    const result = await raidManager.disableRaidModeWithRestore(interaction.guild);

    if (!result.success) {
        return interaction.editReply({ content: `❌ Failed to disable raid mode: ${result.error}` });
    }

    // Send alert to audit log
    await raidManager.sendRaidAlert(interaction.guild, 'disabled', current.level);

    const embed = new EmbedBuilder()
        .setTitle('✅ RAID MODE DISABLED')
        .setColor(0x2ECC71)
        .setDescription('Raid protection has been deactivated. Normal operations resumed.')
        .addFields(
            { name: '👮 Disabled By', value: interaction.user.tag, inline: true },
            { name: '⏱️ Was Active For', value: formatDuration(new Date() - new Date(current.enabledAt)), inline: true }
        )
        .setFooter({ text: 'Verification level has been restored' })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function handleStatus(interaction) {
    const status = raidManager.getRaidStatus(interaction.guild.id);

    if (!status.enabled) {
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Raid Mode Status')
            .setColor(0x2ECC71)
            .setDescription('Raid mode is **NOT** currently active.')
            .addFields(
                { name: 'Server Status', value: '✅ Normal Operations', inline: false }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🚨 Raid Mode Status: ACTIVE')
        .setColor(0xFF0000)
        .setDescription(`**Level ${status.level}** protection is active!`)
        .addFields(
            { name: '👮 Enabled By', value: status.enabledByTag || 'Unknown', inline: true },
            { name: '📅 Started', value: `<t:${Math.floor(new Date(status.enabledAt).getTime() / 1000)}:R>`, inline: true }
        )
        .setTimestamp();

    if (status.expiresAt) {
        embed.addFields({
            name: '⏱️ Expires',
            value: `<t:${Math.floor(new Date(status.expiresAt).getTime() / 1000)}:R>`,
            inline: true
        });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

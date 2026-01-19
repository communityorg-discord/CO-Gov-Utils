/**
 * /backup - Server Backup Command
 * Create, restore, and manage server backups
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const backupManager = require('../utils/backupManager');
const auditLogger = require('../utils/auditLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Manage server backups')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub
            .setName('create')
            .setDescription('Create a server backup')
            .addBooleanOption(opt => opt
                .setName('messages')
                .setDescription('Include messages (slower)'))
            .addIntegerOption(opt => opt
                .setName('message_limit')
                .setDescription('Messages per channel (default 100, max 500)')
                .setMinValue(10)
                .setMaxValue(500)))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List all backups for this server'))
        .addSubcommand(sub => sub
            .setName('info')
            .setDescription('View backup details')
            .addStringOption(opt => opt
                .setName('id')
                .setDescription('Backup ID')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('restore')
            .setDescription('Restore from a backup')
            .addStringOption(opt => opt
                .setName('id')
                .setDescription('Backup ID')
                .setRequired(true))
            .addBooleanOption(opt => opt
                .setName('roles')
                .setDescription('Restore roles'))
            .addBooleanOption(opt => opt
                .setName('channels')
                .setDescription('Restore channels'))
            .addBooleanOption(opt => opt
                .setName('settings')
                .setDescription('Restore server settings'))
            .addBooleanOption(opt => opt
                .setName('bans')
                .setDescription('Restore bans')))
        .addSubcommand(sub => sub
            .setName('delete')
            .setDescription('Delete a backup')
            .addStringOption(opt => opt
                .setName('id')
                .setDescription('Backup ID')
                .setRequired(true))),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'backup');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'create': return handleCreate(interaction);
            case 'list': return handleList(interaction);
            case 'info': return handleInfo(interaction);
            case 'restore': return handleRestore(interaction);
            case 'delete': return handleDelete(interaction);
        }
    }
};

async function handleCreate(interaction) {
    const includeMessages = interaction.options.getBoolean('messages') || false;
    const messageLimit = interaction.options.getInteger('message_limit') || 100;

    await interaction.deferReply();

    const embed = new EmbedBuilder()
        .setTitle('💾 Creating Backup...')
        .setColor(0x3498DB)
        .setDescription('Please wait, this may take a while...')
        .addFields(
            { name: '📦 Including', value: `Settings, Roles, Channels, Emojis, Bans, Members${includeMessages ? ', Messages' : ''}`, inline: false }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const result = await backupManager.createBackup(
        interaction.guild,
        interaction.user.id,
        interaction.user.tag,
        {
            messages: includeMessages,
            messageLimit
        }
    );

    if (!result.success) {
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('❌ Backup Failed')
                    .setColor(0xE74C3C)
                    .setDescription(`Error: ${result.error}`)
                    .setTimestamp()
            ]
        });
    }

    // Log to audit channel
    await auditLogger.logBackupAction(interaction.client, interaction.guild.id, 'create', interaction.user, {
        backupId: result.backupId,
        components: result.components.join(', ')
    });

    const successEmbed = new EmbedBuilder()
        .setTitle('✅ Backup Created Successfully')
        .setColor(0x2ECC71)
        .setDescription(`Your backup is ready! Save the ID to restore later.`)
        .addFields(
            { name: '🔢 Backup ID', value: `\`${result.backupId}\``, inline: true },
            { name: '📦 Components', value: result.components.join(', '), inline: true },
            { name: '📊 Size', value: formatBytes(result.size), inline: true }
        )
        .setFooter({ text: 'Use /backup restore to restore this backup' })
        .setTimestamp();

    if (result.messageCount > 0) {
        successEmbed.addFields({ name: '💬 Messages', value: String(result.messageCount), inline: true });
    }

    return interaction.editReply({ embeds: [successEmbed] });
}

async function handleList(interaction) {
    const backups = backupManager.getGuildBackups(interaction.guild.id);

    if (backups.length === 0) {
        return interaction.reply({ content: '📋 No backups found for this server.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('💾 Server Backups')
        .setColor(0x3498DB)
        .setFooter({ text: `Total: ${backups.length} backup(s)` })
        .setTimestamp();

    let description = '';
    for (const backup of backups.slice(0, 10)) {
        const date = new Date(backup.created_at).toLocaleDateString();
        const time = new Date(backup.created_at).toLocaleTimeString();
        description += `**\`${backup.backup_id}\`** - ${date} ${time}\n`;
        description += `└ ${backup.components} • ${formatBytes(backup.size_bytes)}\n`;
        description += `  *by ${backup.created_by_tag}*\n\n`;
    }

    if (backups.length > 10) {
        description += `\n*... and ${backups.length - 10} more*`;
    }

    embed.setDescription(description);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleInfo(interaction) {
    const backupId = interaction.options.getString('id').toUpperCase();
    const backup = backupManager.getBackup(backupId);

    if (!backup) {
        return interaction.reply({ content: '❌ Backup not found.', ephemeral: true });
    }

    if (backup.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ This backup belongs to a different server.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`💾 Backup: ${backupId}`)
        .setColor(0x3498DB)
        .addFields(
            { name: '🏷️ Server', value: backup.guild_name, inline: true },
            { name: '📅 Created', value: `<t:${Math.floor(new Date(backup.created_at).getTime() / 1000)}:R>`, inline: true },
            { name: '👤 Created By', value: backup.created_by_tag, inline: true },
            { name: '📦 Components', value: backup.components || 'Unknown', inline: false },
            { name: '📊 Size', value: formatBytes(backup.size_bytes), inline: true }
        )
        .setTimestamp();

    if (backup.message_count > 0) {
        embed.addFields({ name: '💬 Messages', value: String(backup.message_count), inline: true });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRestore(interaction) {
    const backupId = interaction.options.getString('id').toUpperCase();
    const backup = backupManager.getBackup(backupId);

    if (!backup) {
        return interaction.reply({ content: '❌ Backup not found.', ephemeral: true });
    }

    // Get restore options
    const restoreRoles = interaction.options.getBoolean('roles') ?? false;
    const restoreChannels = interaction.options.getBoolean('channels') ?? false;
    const restoreSettings = interaction.options.getBoolean('settings') ?? false;
    const restoreBans = interaction.options.getBoolean('bans') ?? false;

    if (!restoreRoles && !restoreChannels && !restoreSettings && !restoreBans) {
        return interaction.reply({
            content: '❌ Please specify at least one component to restore (roles, channels, settings, or bans).',
            ephemeral: true
        });
    }

    // Warning confirmation
    const warningEmbed = new EmbedBuilder()
        .setTitle('⚠️ Restore Confirmation')
        .setColor(0xF39C12)
        .setDescription(`You are about to restore from backup \`${backupId}\`.\n\n**This will create new roles/channels, not delete existing ones.**`)
        .addFields(
            {
                name: '📦 Will Restore', value: [
                    restoreSettings && '✅ Settings',
                    restoreRoles && '✅ Roles',
                    restoreChannels && '✅ Channels',
                    restoreBans && '✅ Bans'
                ].filter(Boolean).join('\n') || 'Nothing selected', inline: false
            }
        )
        .setFooter({ text: 'This action cannot be undone!' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`backup_restore_confirm_${backupId}`)
            .setLabel('Confirm Restore')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('backup_restore_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.reply({ embeds: [warningEmbed], components: [row], ephemeral: true });

    try {
        const filter = i => i.user.id === interaction.user.id;
        const buttonInteraction = await msg.awaitMessageComponent({ filter, time: 30000 });

        if (buttonInteraction.customId === 'backup_restore_cancel') {
            return buttonInteraction.update({
                embeds: [new EmbedBuilder().setTitle('❌ Restore Cancelled').setColor(0x95A5A6)],
                components: []
            });
        }

        await buttonInteraction.update({
            embeds: [new EmbedBuilder().setTitle('⏳ Restoring...').setColor(0x3498DB).setDescription('Please wait...')],
            components: []
        });

        const result = await backupManager.restoreBackup(interaction.guild, backupId, {
            roles: restoreRoles,
            channels: restoreChannels,
            settings: restoreSettings,
            bans: restoreBans
        });

        if (!result.success) {
            return buttonInteraction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ Restore Failed')
                        .setColor(0xE74C3C)
                        .setDescription(`Error: ${result.error}`)
                ]
            });
        }

        // Log to audit channel
        await auditLogger.logBackupAction(interaction.client, interaction.guild.id, 'restore', interaction.user, {
            backupId,
            components: [restoreSettings && 'settings', restoreRoles && 'roles', restoreChannels && 'channels', restoreBans && 'bans'].filter(Boolean).join(', ')
        });

        const resultEmbed = new EmbedBuilder()
            .setTitle('✅ Restore Complete')
            .setColor(0x2ECC71)
            .setDescription(`Backup \`${backupId}\` has been restored.`)
            .addFields(
                { name: '🎭 Roles', value: `Created: ${result.results.roles.created} | Failed: ${result.results.roles.failed}`, inline: true },
                { name: '📁 Channels', value: `Created: ${result.results.channels.created} | Failed: ${result.results.channels.failed}`, inline: true },
                { name: '⚙️ Settings', value: result.results.settings ? '✅ Restored' : '⏭️ Skipped', inline: true }
            )
            .setTimestamp();

        return buttonInteraction.editReply({ embeds: [resultEmbed] });

    } catch (e) {
        return interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('⏰ Timed Out').setColor(0x95A5A6).setDescription('Restore cancelled - no response.')],
            components: []
        });
    }
}

async function handleDelete(interaction) {
    const backupId = interaction.options.getString('id').toUpperCase();
    const backup = backupManager.getBackup(backupId);

    if (!backup) {
        return interaction.reply({ content: '❌ Backup not found.', ephemeral: true });
    }

    if (backup.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ This backup belongs to a different server.', ephemeral: true });
    }

    const result = backupManager.deleteBackup(backupId, interaction.guild.id);

    if (result.success) {
        // Log to audit channel
        await auditLogger.logBackupAction(interaction.client, interaction.guild.id, 'delete', interaction.user, { backupId });

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🗑️ Backup Deleted')
                    .setColor(0x2ECC71)
                    .setDescription(`Backup \`${backupId}\` has been permanently deleted.`)
                    .setTimestamp()
            ],
            ephemeral: true
        });
    }

    return interaction.reply({ content: `❌ Failed to delete: ${result.error}`, ephemeral: true });
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { linkAccount, unlinkAccount, getAllStaff, getStaffByDiscordId } = require('../utils/staffManager');
const { createMailAccount } = require('../utils/mailIntegration');
const { hasPermission } = require('../utils/advancedPermissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staff')
        .setDescription('Manage staff accounts')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Create mail account and link Discord')
                .addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true))
                .addStringOption(opt => opt.setName('password').setDescription('Password for mail account').setRequired(true))
                .addStringOption(opt => opt.setName('email').setDescription('Email prefix (before @usgrp.xyz)').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('link')
                .setDescription('Link existing email to Discord')
                .addUserOption(opt => opt.setName('user').setDescription('User to link').setRequired(true))
                .addStringOption(opt => opt.setName('email').setDescription('Email address').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('unlink')
                .setDescription('Unlink Discord from email')
                .addUserOption(opt => opt.setName('user').setDescription('User to unlink').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('View all staff accounts')
        )
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('View staff account info')
                .addUserOption(opt => opt.setName('user').setDescription('User to view').setRequired(true))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // Permission check
        const perm = hasPermission(interaction.member, 'staff', subcommand);
        if (!perm.allowed && !['list', 'info'].includes(subcommand)) {
            return interaction.reply({
                content: `⛔ You need ADMIN permission to use this command.`,
                ephemeral: true
            });
        }

        switch (subcommand) {
            case 'add': {
                await interaction.deferReply({ ephemeral: true });

                const user = interaction.options.getUser('user');
                const password = interaction.options.getString('password');
                const emailPrefix = interaction.options.getString('email') || user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
                const email = `${emailPrefix}@usgrp.xyz`;

                // Check if already linked
                const existing = getStaffByDiscordId(user.id);
                if (existing) {
                    return interaction.editReply({
                        content: `⚠️ ${user.username} is already linked to \`${existing.email}\``
                    });
                }

                // Create mail account
                const mailResult = await createMailAccount(email, password);
                if (!mailResult.success && !mailResult.message?.includes('already exists')) {
                    return interaction.editReply({
                        content: `❌ Failed to create mail account: ${mailResult.error}`
                    });
                }

                // Link account with password
                const linkResult = linkAccount(user.id, email, user.displayName, interaction.user.id, password);
                if (!linkResult.success) {
                    return interaction.editReply({
                        content: `❌ Failed to link account: ${linkResult.error}`
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle('✅ Staff Account Created')
                    .setColor(0x27AE60)
                    .addFields(
                        { name: 'User', value: `${user}`, inline: true },
                        { name: 'Email', value: `\`${email}\``, inline: true },
                        { name: 'Password', value: `\`${password}\``, inline: true }
                    )
                    .addFields(
                        { name: 'Access', value: '• Mail: https://mail.usgrp.xyz\n• Dashboard: https://admin.usgrp.xyz' }
                    )
                    .setFooter({ text: `Created by ${interaction.user.username}` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

                // Try to DM the user
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('🎉 Your USGRP Staff Account')
                        .setColor(0x3498DB)
                        .setDescription('Your staff account has been created!')
                        .addFields(
                            { name: 'Email', value: `\`${email}\``, inline: true },
                            { name: 'Password', value: `\`${password}\``, inline: true }
                        )
                        .addFields(
                            { name: 'Webmail', value: 'https://mail.usgrp.xyz' },
                            { name: 'Admin Dashboard', value: 'https://admin.usgrp.xyz' }
                        )
                        .setFooter({ text: 'Please change your password after first login' });

                    await user.send({ embeds: [dmEmbed] });
                } catch (e) {
                    // DMs disabled
                }
                break;
            }

            case 'link': {
                const user = interaction.options.getUser('user');
                let email = interaction.options.getString('email').toLowerCase();

                // Add domain if not present
                if (!email.includes('@')) {
                    email = `${email}@usgrp.xyz`;
                }

                const result = linkAccount(user.id, email, user.displayName, interaction.user.id);

                if (!result.success) {
                    return interaction.reply({
                        content: `❌ ${result.error}`,
                        ephemeral: true
                    });
                }

                await interaction.reply({
                    content: `✅ Linked ${user} to \`${email}\``,
                    ephemeral: true
                });
                break;
            }

            case 'unlink': {
                const user = interaction.options.getUser('user');
                const result = unlinkAccount(user.id);

                if (!result.success) {
                    return interaction.reply({
                        content: `❌ ${result.error}`,
                        ephemeral: true
                    });
                }

                await interaction.reply({
                    content: `✅ Unlinked ${user} from \`${result.email}\``,
                    ephemeral: true
                });
                break;
            }

            case 'list': {
                const staff = getAllStaff();

                if (staff.length === 0) {
                    return interaction.reply({
                        content: 'No staff accounts linked yet.',
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle('📋 Staff Accounts')
                    .setColor(0x3498DB)
                    .setDescription(
                        staff.map((s, i) =>
                            `${i + 1}. <@${s.discord_id}> → \`${s.email}\``
                        ).join('\n')
                    )
                    .setFooter({ text: `${staff.length} staff accounts` })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
                break;
            }

            case 'info': {
                const user = interaction.options.getUser('user');
                const staff = getStaffByDiscordId(user.id);

                if (!staff) {
                    return interaction.reply({
                        content: `❌ ${user.username} is not linked to any email.`,
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`👤 ${user.username}`)
                    .setColor(0x3498DB)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'Discord ID', value: staff.discord_id, inline: true },
                        { name: 'Email', value: staff.email, inline: true },
                        { name: 'Linked', value: `<t:${Math.floor(new Date(staff.linked_at).getTime() / 1000)}:R>`, inline: true }
                    );

                await interaction.reply({ embeds: [embed], ephemeral: true });
                break;
            }
        }
    }
};

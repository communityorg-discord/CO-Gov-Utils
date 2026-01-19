/**
 * /softban - Soft Ban Command
 * Ban and immediately unban to clear messages without keeping user banned
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const caseManager = require('../utils/caseManager');
const auditLogger = require('../utils/auditLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Ban and immediately unban a user to clear their messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt
            .setName('user')
            .setDescription('User to softban')
            .setRequired(true))
        .addIntegerOption(opt => opt
            .setName('days')
            .setDescription('Days of messages to delete (1-7)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(7))
        .addStringOption(opt => opt
            .setName('reason')
            .setDescription('Reason for softban')
            .setRequired(false)),

    async execute(interaction) {
        // Permission check
        const perm = advPerms.hasPermission(interaction.member, 'softban');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const days = interaction.options.getInteger('days') || 7;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Can't softban yourself
        if (user.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot softban yourself.', ephemeral: true });
        }

        // Can't softban bot
        if (user.id === interaction.client.user.id) {
            return interaction.reply({ content: '❌ I cannot softban myself.', ephemeral: true });
        }

        // Check if user is in server
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        // Check hierarchy if member exists
        if (member) {
            if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                return interaction.reply({ content: '❌ You cannot softban someone with equal or higher role.', ephemeral: true });
            }
            if (!member.bannable) {
                return interaction.reply({ content: '❌ I cannot ban this user. Check my permissions and role hierarchy.', ephemeral: true });
            }
        }

        await interaction.deferReply();

        try {
            // Step 1: Ban the user
            await interaction.guild.members.ban(user.id, {
                deleteMessageDays: days,
                reason: `[Softban] ${reason} | By: ${interaction.user.tag}`
            });

            // Step 2: Immediately unban
            await interaction.guild.members.unban(user.id, `Softban complete - auto-unban | By: ${interaction.user.tag}`);

            // Create case
            const caseResult = await caseManager.createCase({
                guildId: interaction.guild.id,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                userId: user.id,
                userTag: user.tag,
                action: 'SOFTBAN',
                reason: reason,
                duration: null,
                evidence: `Deleted ${days} day(s) of messages`
            });

            const embed = new EmbedBuilder()
                .setTitle('🔨 User Softbanned')
                .setColor(0xF39C12)
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: '👤 User', value: `${user.tag}\n\`${user.id}\``, inline: true },
                    { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: '🗑️ Messages Deleted', value: `${days} day(s)`, inline: true },
                    { name: '📝 Reason', value: reason, inline: false }
                )
                .setFooter({ text: `Case: ${caseResult.caseId || 'N/A'}` })
                .setTimestamp();

            // Log to audit channel
            await auditLogger.logSoftbanAction(interaction.client, interaction.guild.id, user, interaction.user, reason, days);

            // Try to DM the user
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle(`🔨 You were softbanned from ${interaction.guild.name}`)
                    .setColor(0xF39C12)
                    .setDescription('You have been temporarily banned and immediately unbanned. Your recent messages were deleted.')
                    .addFields(
                        { name: '📝 Reason', value: reason, inline: false },
                        { name: 'ℹ️ Note', value: 'You can rejoin the server immediately.', inline: false }
                    )
                    .setTimestamp();

                await user.send({ embeds: [dmEmbed] });
            } catch (e) {
                // User has DMs disabled
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[Softban] Error:', error);
            return interaction.editReply({ content: `❌ Failed to softban: ${error.message}` });
        }
    }
};

/**
 * /massban - Mass Ban Command (Superuser Only)
 * Ban multiple users at once for raid cleanup
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const auditLogger = require('../utils/auditLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('massban')
        .setDescription('Ban multiple users at once (superuser only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub
            .setName('ids')
            .setDescription('Ban by user IDs')
            .addStringOption(opt => opt
                .setName('users')
                .setDescription('Space or comma separated user IDs')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Ban reason')))
        .addSubcommand(sub => sub
            .setName('recent')
            .setDescription('Ban users who joined recently with young accounts')
            .addIntegerOption(opt => opt
                .setName('joined_minutes')
                .setDescription('Joined within X minutes (default 30)')
                .setMinValue(1)
                .setMaxValue(1440))
            .addIntegerOption(opt => opt
                .setName('account_days')
                .setDescription('Account younger than X days (default 7)')
                .setMinValue(1)
                .setMaxValue(90))
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('Ban reason'))),

    async execute(interaction) {
        // Superuser only
        if (!advPerms.isSuperuser(interaction.user.id)) {
            return interaction.reply({ content: '❌ This command is restricted to superusers.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'ids': return handleIds(interaction);
            case 'recent': return handleRecent(interaction);
        }
    }
};

async function handleIds(interaction) {
    const idsString = interaction.options.getString('users');
    const reason = interaction.options.getString('reason') || 'Mass ban by superuser';

    // Parse IDs (space, comma, or newline separated)
    const ids = idsString.split(/[,\s\n]+/).filter(id => /^\d{17,19}$/.test(id.trim()));

    if (ids.length === 0) {
        return interaction.reply({ content: '❌ No valid user IDs found.', ephemeral: true });
    }

    if (ids.length > 100) {
        return interaction.reply({ content: '❌ Maximum 100 users per mass ban.', ephemeral: true });
    }

    await interaction.deferReply();

    let banned = 0;
    let failed = 0;
    const failedIds = [];

    for (const id of ids) {
        try {
            await interaction.guild.members.ban(id, {
                reason: `[MassBan] ${reason} | By: ${interaction.user.tag}`
            });
            banned++;
            await new Promise(r => setTimeout(r, 300)); // Rate limit
        } catch (e) {
            failed++;
            failedIds.push(id);
        }
    }

    // Log to audit
    await auditLogger.logAction(interaction.client, interaction.guild.id,
        '🔨 Mass Ban Executed', 0xFF0000, [
        { name: '👮 Superuser', value: interaction.user.tag, inline: true },
        { name: '✅ Banned', value: String(banned), inline: true },
        { name: '❌ Failed', value: String(failed), inline: true },
        { name: '📝 Reason', value: reason, inline: false }
    ]);

    const embed = new EmbedBuilder()
        .setTitle('🔨 Mass Ban Complete')
        .setColor(banned > 0 ? 0x2ECC71 : 0xE74C3C)
        .addFields(
            { name: '✅ Banned', value: String(banned), inline: true },
            { name: '❌ Failed', value: String(failed), inline: true },
            { name: '📝 Reason', value: reason, inline: false }
        )
        .setTimestamp();

    if (failedIds.length > 0 && failedIds.length <= 10) {
        embed.addFields({ name: '❌ Failed IDs', value: failedIds.join('\n'), inline: false });
    }

    return interaction.editReply({ embeds: [embed] });
}

async function handleRecent(interaction) {
    const joinedMinutes = interaction.options.getInteger('joined_minutes') || 30;
    const accountDays = interaction.options.getInteger('account_days') || 7;
    const reason = interaction.options.getString('reason') || `Raid cleanup - New accounts joined in last ${joinedMinutes}m`;

    await interaction.deferReply();

    const now = Date.now();
    const joinCutoff = now - (joinedMinutes * 60 * 1000);
    const accountCutoff = now - (accountDays * 24 * 60 * 60 * 1000);

    // Find matching members
    const members = await interaction.guild.members.fetch();
    const targets = members.filter(m => {
        if (m.user.bot) return false;
        if (m.joinedTimestamp > joinCutoff && m.user.createdTimestamp > accountCutoff) return true;
        return false;
    });

    if (targets.size === 0) {
        return interaction.editReply({ content: '✅ No users match the criteria.' });
    }

    // Confirm
    const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Confirm Mass Ban')
        .setColor(0xF39C12)
        .setDescription(`Found **${targets.size}** user(s) matching criteria:\n- Joined within ${joinedMinutes} minutes\n- Account younger than ${accountDays} days`)
        .addFields(
            { name: '⚠️ Warning', value: 'Reply with `confirm` within 30 seconds to proceed.', inline: false }
        );

    await interaction.editReply({ embeds: [confirmEmbed] });

    try {
        const filter = m => m.author.id === interaction.user.id && m.content.toLowerCase() === 'confirm';
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });

        if (collected.size === 0) {
            return interaction.followUp({ content: '❌ Cancelled - no confirmation received.', ephemeral: true });
        }

        // Delete confirmation message
        collected.first()?.delete().catch(() => { });

        let banned = 0;
        for (const [, member] of targets) {
            try {
                await member.ban({ reason: `[MassBan] ${reason} | By: ${interaction.user.tag}` });
                banned++;
                await new Promise(r => setTimeout(r, 300));
            } catch (e) { }
        }

        // Log to audit
        await auditLogger.logAction(interaction.client, interaction.guild.id,
            '🔨 Mass Ban - Raid Cleanup', 0xFF0000, [
            { name: '👮 Superuser', value: interaction.user.tag, inline: true },
            { name: '✅ Banned', value: String(banned), inline: true },
            { name: '🎯 Targeted', value: String(targets.size), inline: true },
            { name: '📝 Criteria', value: `Joined <${joinedMinutes}m, Account <${accountDays}d`, inline: false }
        ]);

        return interaction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🔨 Mass Ban Complete')
                    .setColor(0x2ECC71)
                    .setDescription(`Banned **${banned}** of **${targets.size}** targeted users.`)
                    .setTimestamp()
            ]
        });

    } catch (e) {
        return interaction.followUp({ content: '❌ Cancelled - timed out.', ephemeral: true });
    }
}

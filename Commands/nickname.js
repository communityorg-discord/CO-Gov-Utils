/**
 * /nickname - Nickname Management Command
 * Force/reset nicknames for individual users or mass operations
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const nicknameLockManager = require('../utils/nicknameLockManager');
const auditLogger = require('../utils/auditLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nickname')
        .setDescription('Manage user nicknames')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Set a user\'s nickname')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to rename')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('name')
                .setDescription('New nickname (leave empty to reset)')
                .setMaxLength(32)))
        .addSubcommand(sub => sub
            .setName('reset')
            .setDescription('Reset a user\'s nickname to their username')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to reset')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('lock')
            .setDescription('Lock a nickname (persists across servers and prevents changes)')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to lock nickname for')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('name')
                .setDescription('Nickname to lock')
                .setMaxLength(32)
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('unlock')
            .setDescription('Remove a nickname lock')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to unlock')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('list-locks')
            .setDescription('List all locked nicknames'))
        .addSubcommand(sub => sub
            .setName('mass')
            .setDescription('Add prefix/suffix to all members with a role')
            .addRoleOption(opt => opt
                .setName('role')
                .setDescription('Role to target')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('prefix')
                .setDescription('Prefix to add')
                .setMaxLength(10))
            .addStringOption(opt => opt
                .setName('suffix')
                .setDescription('Suffix to add')
                .setMaxLength(10)))
        .addSubcommand(sub => sub
            .setName('global')
            .setDescription('Set nickname across all shared servers')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to rename globally')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('name')
                .setDescription('New nickname')
                .setMaxLength(32)
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('sanitize')
            .setDescription('Remove special characters from all nicknames')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'nickname');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'set': return handleSet(interaction);
            case 'reset': return handleReset(interaction);
            case 'lock': return handleLock(interaction);
            case 'unlock': return handleUnlock(interaction);
            case 'list-locks': return handleListLocks(interaction);
            case 'mass': return handleMass(interaction);
            case 'global': return handleGlobal(interaction);
            case 'sanitize': return handleSanitize(interaction);
        }
    }
};

async function handleSet(interaction) {
    const user = interaction.options.getUser('user');
    const name = interaction.options.getString('name') || null;

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
        return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
    }

    if (member.roles.highest.position >= interaction.member.roles.highest.position && !advPerms.isSuperuser(interaction.user.id)) {
        return interaction.reply({ content: '❌ Cannot modify nickname of user with equal or higher role.', ephemeral: true });
    }

    const oldNick = member.nickname || member.user.username;

    try {
        await member.setNickname(name, `Set by ${interaction.user.tag}`);

        const embed = new EmbedBuilder()
            .setTitle('✏️ Nickname Changed')
            .setColor(0x3498DB)
            .addFields(
                { name: '👤 User', value: user.tag, inline: true },
                { name: '📝 Old', value: oldNick, inline: true },
                { name: '📝 New', value: name || user.username, inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
        return interaction.reply({ content: `❌ Failed to change nickname: ${e.message}`, ephemeral: true });
    }
}

async function handleReset(interaction) {
    const user = interaction.options.getUser('user');

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
        return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
    }

    const oldNick = member.nickname;
    if (!oldNick) {
        return interaction.reply({ content: '❌ User doesn\'t have a nickname set.', ephemeral: true });
    }

    try {
        await member.setNickname(null, `Reset by ${interaction.user.tag}`);
        return interaction.reply({ content: `✅ Reset ${user.tag}'s nickname from "${oldNick}"`, ephemeral: true });
    } catch (e) {
        return interaction.reply({ content: `❌ Failed to reset nickname: ${e.message}`, ephemeral: true });
    }
}

async function handleLock(interaction) {
    const user = interaction.options.getUser('user');
    const name = interaction.options.getString('name');

    await interaction.deferReply({ ephemeral: true });

    const result = nicknameLockManager.lockNickname(user.id, name, interaction.user.id, interaction.user.tag);

    if (!result.success) {
        return interaction.editReply({ content: `❌ Failed to lock nickname: ${result.error}` });
    }

    const enforceResult = await nicknameLockManager.enforceNicknameGlobally(interaction.client, user.id, name);

    const embed = new EmbedBuilder()
        .setTitle('🔒 Nickname Locked')
        .setColor(0xE74C3C)
        .setDescription('This nickname will persist across all servers and cannot be changed by the user.')
        .addFields(
            { name: '👤 User', value: `${user.tag}\n\`${user.id}\``, inline: true },
            { name: '📝 Locked Nickname', value: name, inline: true },
            { name: '👮 Locked By', value: interaction.user.tag, inline: true },
            { name: '✅ Applied To', value: `${enforceResult.success} server(s)`, inline: true }
        )
        .setFooter({ text: 'Use /nickname unlock to remove this lock' })
        .setTimestamp();

    // Log to audit channel
    await auditLogger.logNicknameAction(interaction.client, interaction.guild.id, 'lock', user, interaction.user, { lockedNick: name });

    return interaction.editReply({ embeds: [embed] });
}

async function handleUnlock(interaction) {
    const user = interaction.options.getUser('user');

    const existing = nicknameLockManager.getLockedNickname(user.id);
    if (!existing) {
        return interaction.reply({ content: `❌ ${user.tag} doesn't have a locked nickname.`, ephemeral: true });
    }

    const result = nicknameLockManager.unlockNickname(user.id);

    if (result.success) {
        // Log to audit channel
        await auditLogger.logNicknameAction(interaction.client, interaction.guild.id, 'unlock', user, interaction.user, { lockedNick: existing.nickname });

        const embed = new EmbedBuilder()
            .setTitle('🔓 Nickname Unlocked')
            .setColor(0x2ECC71)
            .addFields(
                { name: '👤 User', value: user.tag, inline: true },
                { name: '📝 Was Locked To', value: existing.nickname, inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return interaction.reply({ content: '❌ Failed to unlock nickname.', ephemeral: true });
}

async function handleListLocks(interaction) {
    const locks = nicknameLockManager.getAllLockedNicknames();

    if (locks.length === 0) {
        return interaction.reply({ content: '🔓 No locked nicknames.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('🔒 Locked Nicknames')
        .setColor(0xE74C3C)
        .setFooter({ text: `Total: ${locks.length}` })
        .setTimestamp();

    let description = '';
    for (const lock of locks.slice(0, 15)) {
        const date = new Date(lock.locked_at).toLocaleDateString();
        description += `<@${lock.user_id}> → **${lock.nickname}**\n`;
        description += `└ Locked by ${lock.locked_by_tag} • ${date}\n\n`;
    }

    if (locks.length > 15) {
        description += `*... and ${locks.length - 15} more*`;
    }

    embed.setDescription(description);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleMass(interaction) {
    const role = interaction.options.getRole('role');
    const prefix = interaction.options.getString('prefix') || '';
    const suffix = interaction.options.getString('suffix') || '';

    if (!prefix && !suffix) {
        return interaction.reply({ content: '❌ You must specify a prefix or suffix.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const members = role.members;
    let success = 0;
    let failed = 0;

    for (const [, member] of members) {
        if (member.user.bot) continue;
        if (member.roles.highest.position >= interaction.member.roles.highest.position) continue;

        try {
            const baseName = member.nickname || member.user.username;
            const newName = `${prefix}${baseName}${suffix}`.substring(0, 32);
            await member.setNickname(newName, `Mass nickname by ${interaction.user.tag}`);
            success++;

            if (success % 5 === 0) await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            failed++;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('📝 Mass Nickname Complete')
        .setColor(success > failed ? 0x2ECC71 : 0xE74C3C)
        .addFields(
            { name: '🎭 Role', value: role.name, inline: true },
            { name: '✅ Success', value: String(success), inline: true },
            { name: '❌ Failed', value: String(failed), inline: true },
            { name: '📝 Format', value: `${prefix || ''}[name]${suffix || ''}`, inline: false }
        )
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function handleGlobal(interaction) {
    if (!advPerms.isSuperuser(interaction.user.id)) {
        return interaction.reply({ content: '❌ Only superusers can set global nicknames.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const name = interaction.options.getString('name');

    await interaction.deferReply({ ephemeral: true });

    let success = 0;
    let failed = 0;
    const guilds = [];

    for (const [, guild] of interaction.client.guilds.cache) {
        try {
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) continue;

            await member.setNickname(name, `Global nickname by ${interaction.user.tag}`);
            success++;
            guilds.push(guild.name);

            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            failed++;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🌐 Global Nickname Set')
        .setColor(0x9B59B6)
        .addFields(
            { name: '👤 User', value: user.tag, inline: true },
            { name: '📝 Nickname', value: name, inline: true },
            { name: '✅ Success', value: String(success), inline: true },
            { name: '🏷️ Servers', value: guilds.slice(0, 5).join(', ') + (guilds.length > 5 ? '...' : '') || 'None', inline: false }
        )
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function handleSanitize(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const sanitizeRegex = /[\u0300-\u036f\u0489\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;
    const nonAsciiRegex = /[^\x00-\x7F]/g;

    let sanitized = 0;
    let skipped = 0;

    const members = await interaction.guild.members.fetch();

    for (const [, member] of members) {
        if (member.user.bot) continue;
        if (member.roles.highest.position >= interaction.member.roles.highest.position) continue;

        const nick = member.nickname || member.user.username;
        const cleaned = nick
            .normalize('NFD')
            .replace(sanitizeRegex, '')
            .replace(nonAsciiRegex, '')
            .trim();

        if (cleaned !== nick && cleaned.length >= 2) {
            try {
                await member.setNickname(cleaned, `Sanitized by ${interaction.user.tag}`);
                sanitized++;
                if (sanitized % 5 === 0) await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                skipped++;
            }
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🧹 Nickname Sanitization Complete')
        .setColor(0x2ECC71)
        .addFields(
            { name: '✅ Sanitized', value: String(sanitized), inline: true },
            { name: '⏭️ Skipped', value: String(skipped), inline: true }
        )
        .setFooter({ text: 'Removed zalgo and special unicode characters' })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

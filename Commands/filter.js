/**
 * /filter - Word Filter Command (Superuser Only)
 * Manage word/phrase filters with auto-actions
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const wordFilter = require('../utils/wordFilter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Manage word filters (superuser only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a word/phrase to filter')
            .addStringOption(opt => opt
                .setName('pattern')
                .setDescription('Word or phrase to filter')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('action')
                .setDescription('Action to take')
                .setRequired(true)
                .addChoices(
                    { name: 'Delete message', value: 'delete' },
                    { name: 'Delete + Warn', value: 'warn' },
                    { name: 'Delete + Mute (10m)', value: 'mute' },
                    { name: 'Log only', value: 'log' }
                ))
            .addBooleanOption(opt => opt
                .setName('regex')
                .setDescription('Treat as regex pattern')))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a filter')
            .addStringOption(opt => opt
                .setName('pattern')
                .setDescription('Pattern to remove')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List all filters'))
        .addSubcommand(sub => sub
            .setName('test')
            .setDescription('Test a message against filters')
            .addStringOption(opt => opt
                .setName('message')
                .setDescription('Message to test')
                .setRequired(true))),

    async execute(interaction) {
        // Superuser only
        if (!advPerms.isSuperuser(interaction.user.id)) {
            return interaction.reply({ content: '❌ This command is restricted to superusers.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'add': return handleAdd(interaction);
            case 'remove': return handleRemove(interaction);
            case 'list': return handleList(interaction);
            case 'test': return handleTest(interaction);
        }
    }
};

async function handleAdd(interaction) {
    const pattern = interaction.options.getString('pattern');
    const action = interaction.options.getString('action');
    const isRegex = interaction.options.getBoolean('regex') || false;

    // Validate regex if specified
    if (isRegex) {
        try {
            new RegExp(pattern);
        } catch (e) {
            return interaction.reply({ content: '❌ Invalid regex pattern.', ephemeral: true });
        }
    }

    const result = wordFilter.addFilter(
        interaction.guild.id,
        pattern,
        action,
        isRegex,
        interaction.user.id,
        interaction.user.tag
    );

    if (result.success) {
        const actionNames = { delete: 'Delete', warn: 'Delete + Warn', mute: 'Delete + Mute', log: 'Log Only' };

        const embed = new EmbedBuilder()
            .setTitle('✅ Filter Added')
            .setColor(0x2ECC71)
            .addFields(
                { name: '📝 Pattern', value: `\`${pattern}\``, inline: true },
                { name: '⚡ Action', value: actionNames[action], inline: true },
                { name: '🔧 Type', value: isRegex ? 'Regex' : 'Text', inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return interaction.reply({ content: `❌ Failed to add filter: ${result.error}`, ephemeral: true });
}

async function handleRemove(interaction) {
    const pattern = interaction.options.getString('pattern');

    const result = wordFilter.removeFilter(interaction.guild.id, pattern);

    if (result.success) {
        return interaction.reply({ content: `✅ Filter removed: \`${pattern}\``, ephemeral: true });
    }

    return interaction.reply({ content: '❌ Filter not found.', ephemeral: true });
}

async function handleList(interaction) {
    const filters = wordFilter.getFilters(interaction.guild.id);

    if (filters.length === 0) {
        return interaction.reply({ content: '📋 No filters configured.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('📋 Word Filters')
        .setColor(0x3498DB)
        .setFooter({ text: `Total: ${filters.length} filter(s)` })
        .setTimestamp();

    const actionEmojis = { delete: '🗑️', warn: '⚠️', mute: '🔇', log: '📝' };
    let description = '';

    for (const filter of filters.slice(0, 20)) {
        const emoji = actionEmojis[filter.action] || '❓';
        const type = filter.is_regex ? '[Regex]' : '';
        description += `${emoji} \`${filter.pattern}\` ${type}\n`;
    }

    if (filters.length > 20) {
        description += `\n*... and ${filters.length - 20} more*`;
    }

    embed.setDescription(description);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleTest(interaction) {
    const message = interaction.options.getString('message');

    const result = wordFilter.testMessage(interaction.guild.id, message);

    if (result.matched) {
        const embed = new EmbedBuilder()
            .setTitle('⚠️ Filter Triggered')
            .setColor(0xE74C3C)
            .addFields(
                { name: '📝 Pattern', value: `\`${result.filter.pattern}\``, inline: true },
                { name: '⚡ Action', value: result.action, inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return interaction.reply({ content: '✅ Message passed all filters.', ephemeral: true });
}

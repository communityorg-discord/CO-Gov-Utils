/**
 * Suggest Command
 * Allows users to submit feature suggestions and bug reports
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createSuggestion, getSuggestion, getSuggestions, updateSuggestionStatus } = require('../utils/statusManager');
const { getUserPermissionLevel, PERMISSION_LEVELS } = require('../utils/advancedPermissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Submit a suggestion or bug report')
        .addSubcommand(sub =>
            sub.setName('feature')
                .setDescription('Suggest a new feature')
                .addStringOption(opt =>
                    opt.setName('title')
                        .setDescription('Brief title for your suggestion')
                        .setRequired(true)
                        .setMaxLength(100))
                .addStringOption(opt =>
                    opt.setName('description')
                        .setDescription('Detailed description of your suggestion')
                        .setRequired(true)
                        .setMaxLength(1000)))
        .addSubcommand(sub =>
            sub.setName('bug')
                .setDescription('Report a bug')
                .addStringOption(opt =>
                    opt.setName('title')
                        .setDescription('Brief title for the bug')
                        .setRequired(true)
                        .setMaxLength(100))
                .addStringOption(opt =>
                    opt.setName('description')
                        .setDescription('Describe the bug and how to reproduce it')
                        .setRequired(true)
                        .setMaxLength(1000))
                .addStringOption(opt =>
                    opt.setName('severity')
                        .setDescription('How severe is this bug?')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Low - Minor inconvenience', value: 'low' },
                            { name: 'Medium - Affects functionality', value: 'medium' },
                            { name: 'High - Major feature broken', value: 'high' },
                            { name: 'Critical - System unusable', value: 'critical' }
                        )))
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View a suggestion')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Suggestion ID (e.g., SUG-ABC123)')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List recent suggestions')
                .addStringOption(opt =>
                    opt.setName('type')
                        .setDescription('Filter by type')
                        .addChoices(
                            { name: 'All', value: 'all' },
                            { name: 'Features', value: 'feature' },
                            { name: 'Bugs', value: 'bug' }
                        ))
                .addStringOption(opt =>
                    opt.setName('status')
                        .setDescription('Filter by status')
                        .addChoices(
                            { name: 'All', value: 'all' },
                            { name: 'Pending', value: 'pending' },
                            { name: 'Approved', value: 'approved' },
                            { name: 'In Progress', value: 'in-progress' },
                            { name: 'Completed', value: 'completed' },
                            { name: 'Rejected', value: 'rejected' }
                        )))
        .addSubcommand(sub =>
            sub.setName('respond')
                .setDescription('[ADMIN] Respond to a suggestion')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Suggestion ID')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('status')
                        .setDescription('New status')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Approved', value: 'approved' },
                            { name: 'In Progress', value: 'in-progress' },
                            { name: 'Completed', value: 'completed' },
                            { name: 'Rejected', value: 'rejected' }
                        ))
                .addStringOption(opt =>
                    opt.setName('response')
                        .setDescription('Your response message')
                        .setRequired(false)
                        .setMaxLength(500))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'feature':
                    return await handleSubmit(interaction, 'feature');
                case 'bug':
                    return await handleSubmit(interaction, 'bug');
                case 'view':
                    return await handleView(interaction);
                case 'list':
                    return await handleList(interaction);
                case 'respond':
                    return await handleRespond(interaction);
                default:
                    return interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
            }
        } catch (error) {
            console.error('[Suggest] Error:', error);
            return interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }
};

async function handleSubmit(interaction, type) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const severity = interaction.options.getString('severity') || null;

    const result = createSuggestion({
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        title,
        description,
        type,
        severity
    });

    const embed = new EmbedBuilder()
        .setColor(type === 'feature' ? 0x3FB950 : 0xF85149)
        .setTitle(`${type === 'feature' ? '✨' : '🐛'} ${type === 'feature' ? 'Feature Suggestion' : 'Bug Report'} Submitted`)
        .setDescription(`Your ${type === 'feature' ? 'suggestion' : 'bug report'} has been recorded.`)
        .addFields(
            { name: 'ID', value: `\`${result.suggestionId}\``, inline: true },
            { name: 'Status', value: '⏳ Pending Review', inline: true },
            { name: 'Title', value: title },
            { name: 'Description', value: description.substring(0, 500) }
        )
        .setFooter({ text: 'View all suggestions at status.usgrp.xyz/suggestions' })
        .setTimestamp();

    if (severity) {
        embed.addFields({ name: 'Severity', value: severity.charAt(0).toUpperCase() + severity.slice(1), inline: true });
    }

    return interaction.reply({ embeds: [embed] });
}

async function handleView(interaction) {
    const id = interaction.options.getString('id');
    const suggestion = getSuggestion(id);

    if (!suggestion) {
        return interaction.reply({ content: `❌ Suggestion \`${id}\` not found.`, ephemeral: true });
    }

    const statusEmojis = {
        pending: '⏳',
        approved: '✅',
        'in-progress': '🔄',
        completed: '✓',
        rejected: '❌'
    };

    const embed = new EmbedBuilder()
        .setColor(suggestion.type === 'feature' ? 0x3FB950 : 0xF85149)
        .setTitle(`${suggestion.type === 'feature' ? '✨' : '🐛'} ${suggestion.title}`)
        .setDescription(suggestion.description)
        .addFields(
            { name: 'ID', value: `\`${suggestion.suggestion_id}\``, inline: true },
            { name: 'Status', value: `${statusEmojis[suggestion.status] || ''} ${suggestion.status}`, inline: true },
            { name: 'Type', value: suggestion.type, inline: true },
            { name: 'Submitted By', value: suggestion.user_tag || 'Unknown', inline: true },
            { name: 'Votes', value: `👍 ${suggestion.upvotes} / 👎 ${suggestion.downvotes}`, inline: true }
        )
        .setTimestamp(new Date(suggestion.created_at));

    if (suggestion.severity) {
        embed.addFields({ name: 'Severity', value: suggestion.severity, inline: true });
    }

    if (suggestion.admin_response) {
        embed.addFields({
            name: '📋 Admin Response',
            value: suggestion.admin_response
        });
    }

    return interaction.reply({ embeds: [embed] });
}

async function handleList(interaction) {
    const type = interaction.options.getString('type') || 'all';
    const status = interaction.options.getString('status') || 'all';

    const filters = {
        type: type === 'all' ? null : type,
        status: status === 'all' ? null : status,
        limit: 10
    };

    const suggestions = getSuggestions(filters);

    if (suggestions.length === 0) {
        return interaction.reply({
            content: '📭 No suggestions found matching your filters.',
            ephemeral: true
        });
    }

    const statusEmojis = {
        pending: '⏳',
        approved: '✅',
        'in-progress': '🔄',
        completed: '✓',
        rejected: '❌'
    };

    const embed = new EmbedBuilder()
        .setColor(0xD4A84B)
        .setTitle('📋 Recent Suggestions')
        .setDescription(suggestions.map((s, i) => {
            const emoji = s.type === 'feature' ? '✨' : '🐛';
            const statusEmoji = statusEmojis[s.status] || '';
            return `${i + 1}. ${emoji} **${s.title}**\n   \`${s.suggestion_id}\` • ${statusEmoji} ${s.status} • 👍 ${s.upvotes}`;
        }).join('\n\n'))
        .setFooter({ text: 'Use /suggest view <id> for details • status.usgrp.xyz/suggestions' })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleRespond(interaction) {
    // Check permissions - need ADMIN or higher
    const permLevel = getUserPermissionLevel(interaction.member);
    if (permLevel < PERMISSION_LEVELS.ADMIN) {
        return interaction.reply({
            content: '❌ You need Admin permissions to respond to suggestions.',
            ephemeral: true
        });
    }

    const id = interaction.options.getString('id');
    const status = interaction.options.getString('status');
    const response = interaction.options.getString('response');

    const suggestion = getSuggestion(id);
    if (!suggestion) {
        return interaction.reply({ content: `❌ Suggestion \`${id}\` not found.`, ephemeral: true });
    }

    updateSuggestionStatus(
        id,
        status,
        response,
        interaction.user.id,
        interaction.user.tag
    );

    const statusEmojis = {
        approved: '✅',
        'in-progress': '🔄',
        completed: '✓',
        rejected: '❌'
    };

    const embed = new EmbedBuilder()
        .setColor(status === 'rejected' ? 0xF85149 : 0x3FB950)
        .setTitle(`${statusEmojis[status]} Suggestion Updated`)
        .addFields(
            { name: 'ID', value: `\`${id}\``, inline: true },
            { name: 'New Status', value: status, inline: true },
            { name: 'Title', value: suggestion.title }
        )
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp();

    if (response) {
        embed.addFields({ name: 'Response', value: response });
    }

    return interaction.reply({ embeds: [embed] });
}

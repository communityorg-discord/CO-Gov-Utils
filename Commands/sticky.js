/**
 * /sticky - Sticky Messages Command
 * Pin a message that stays at the bottom of a channel
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const stickyManager = require('../utils/stickyManager');
const auditLogger = require('../utils/auditLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticky')
        .setDescription('Manage sticky messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Set a sticky message for this channel')
            .addStringOption(opt => opt
                .setName('message')
                .setDescription('Message content')
                .setRequired(true)
                .setMaxLength(2000)))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove the sticky message from this channel'))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List all sticky messages in this server')),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'sticky');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'set': return handleSet(interaction);
            case 'remove': return handleRemove(interaction);
            case 'list': return handleList(interaction);
        }
    }
};

async function handleSet(interaction) {
    const message = interaction.options.getString('message');
    const channel = interaction.channel;

    // Check for existing sticky
    const existing = stickyManager.getSticky(channel.id);

    // Set the sticky in database
    const result = stickyManager.setSticky(
        channel.id,
        interaction.guild.id,
        message,
        interaction.user.id,
        interaction.user.tag
    );

    if (!result.success) {
        return interaction.reply({ content: `❌ Failed to set sticky: ${result.error}`, ephemeral: true });
    }

    // Delete old sticky message if exists
    if (existing?.last_message_id) {
        try {
            const oldMsg = await channel.messages.fetch(existing.last_message_id);
            await oldMsg.delete();
        } catch (e) { }
    }

    // Post the sticky message
    const postResult = await stickyManager.postSticky(channel, message);

    const embed = new EmbedBuilder()
        .setTitle('📌 Sticky Message Set')
        .setColor(0xFFD700)
        .addFields(
            { name: '📍 Channel', value: `<#${channel.id}>`, inline: true },
            { name: '✍️ Set By', value: interaction.user.tag, inline: true },
            { name: '📄 Content', value: message.substring(0, 500) + (message.length > 500 ? '...' : ''), inline: false }
        )
        .setFooter({ text: 'The message will stay at the bottom of the channel' })
        .setTimestamp();

    // Log to audit channel
    await auditLogger.logStickyAction(interaction.client, interaction.guild.id, 'set', channel, interaction.user, message);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRemove(interaction) {
    const channel = interaction.channel;

    const existing = stickyManager.getSticky(channel.id);
    if (!existing) {
        return interaction.reply({ content: '❌ No sticky message in this channel.', ephemeral: true });
    }

    // Delete the sticky message
    if (existing.last_message_id) {
        try {
            const msg = await channel.messages.fetch(existing.last_message_id);
            await msg.delete();
        } catch (e) { }
    }

    // Remove from database
    const result = stickyManager.removeSticky(channel.id);

    if (result.success) {
        // Log to audit channel
        await auditLogger.logStickyAction(interaction.client, interaction.guild.id, 'remove', channel, interaction.user);

        return interaction.reply({ content: '✅ Sticky message removed.', ephemeral: true });
    }

    return interaction.reply({ content: '❌ Failed to remove sticky.', ephemeral: true });
}

async function handleList(interaction) {
    const stickies = stickyManager.getGuildStickies(interaction.guild.id);

    if (stickies.length === 0) {
        return interaction.reply({ content: '📌 No sticky messages in this server.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('📌 Sticky Messages')
        .setColor(0xFFD700)
        .setFooter({ text: `Total: ${stickies.length}` })
        .setTimestamp();

    let description = '';
    for (const sticky of stickies.slice(0, 15)) {
        const date = new Date(sticky.created_at).toLocaleDateString();
        description += `<#${sticky.channel_id}>\n`;
        description += `└ ${sticky.content.substring(0, 50)}${sticky.content.length > 50 ? '...' : ''}\n`;
        description += `  *by ${sticky.created_by_tag} • ${date}*\n\n`;
    }

    if (stickies.length > 15) {
        description += `*... and ${stickies.length - 15} more*`;
    }

    embed.setDescription(description);

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

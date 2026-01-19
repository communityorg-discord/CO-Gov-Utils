/**
 * /notes - Staff Notes Command
 * Private staff notes on users, separate from cases
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const advPerms = require('../utils/advancedPermissions');
const notesManager = require('../utils/notesManager');
const auditLogger = require('../utils/auditLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('notes')
        .setDescription('Manage private staff notes on users')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a note to a user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to add note to')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('note')
                .setDescription('Note content')
                .setRequired(true)
                .setMaxLength(1000)))
        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('View notes for a user')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to view notes for')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('delete')
            .setDescription('Delete a note')
            .addIntegerOption(opt => opt
                .setName('id')
                .setDescription('Note ID to delete')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('search')
            .setDescription('Search notes')
            .addStringOption(opt => opt
                .setName('query')
                .setDescription('Search term')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('recent')
            .setDescription('View recent notes')
            .addIntegerOption(opt => opt
                .setName('limit')
                .setDescription('Number of notes to show (max 25)')
                .setMinValue(1)
                .setMaxValue(25))),

    async execute(interaction) {
        const perm = advPerms.hasPermission(interaction.member, 'notes');
        if (!perm.allowed) {
            return interaction.reply({ content: `❌ ${perm.reason}`, ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'add': return handleAdd(interaction);
            case 'view': return handleView(interaction);
            case 'delete': return handleDelete(interaction);
            case 'search': return handleSearch(interaction);
            case 'recent': return handleRecent(interaction);
        }
    }
};

async function handleAdd(interaction) {
    const user = interaction.options.getUser('user');
    const note = interaction.options.getString('note');

    const result = notesManager.addNote(
        interaction.guild.id,
        user.id,
        user.tag,
        note,
        interaction.user.id,
        interaction.user.tag
    );

    if (result.success) {
        // Log to audit channel
        await auditLogger.logNoteAction(interaction.client, interaction.guild.id, 'add', user, interaction.user, result.noteId, note);

        const embed = new EmbedBuilder()
            .setTitle('📝 Note Added')
            .setColor(0x3498DB)
            .addFields(
                { name: '👤 User', value: `${user.tag}\n\`${user.id}\``, inline: true },
                { name: '✍️ Author', value: interaction.user.tag, inline: true },
                { name: '🔢 Note ID', value: `#${result.noteId}`, inline: true },
                { name: '📄 Note', value: note.substring(0, 1000), inline: false }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return interaction.reply({ content: `❌ Failed to add note: ${result.error}`, ephemeral: true });
}

async function handleView(interaction) {
    const user = interaction.options.getUser('user');
    const notes = notesManager.getUserNotes(interaction.guild.id, user.id);

    if (notes.length === 0) {
        return interaction.reply({ content: `📝 No notes found for ${user.tag}`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`📝 Notes for ${user.tag}`)
        .setColor(0x3498DB)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: `Total: ${notes.length} note(s)` })
        .setTimestamp();

    // Add up to 10 notes as fields
    const displayNotes = notes.slice(0, 10);
    for (const note of displayNotes) {
        const date = new Date(note.created_at).toLocaleDateString();
        embed.addFields({
            name: `#${note.id} • ${note.author_tag} • ${date}`,
            value: note.note.substring(0, 250) + (note.note.length > 250 ? '...' : ''),
            inline: false
        });
    }

    if (notes.length > 10) {
        embed.setDescription(`*Showing 10 of ${notes.length} notes*`);
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleDelete(interaction) {
    const noteId = interaction.options.getInteger('id');

    // Get the note first to check it exists
    const note = notesManager.getNoteById(noteId);
    if (!note) {
        return interaction.reply({ content: '❌ Note not found.', ephemeral: true });
    }

    // Only allow deletion by author or superusers
    if (note.author_id !== interaction.user.id && !advPerms.isSuperuser(interaction.user.id)) {
        return interaction.reply({ content: '❌ You can only delete your own notes.', ephemeral: true });
    }

    const result = notesManager.deleteNote(noteId, interaction.guild.id);

    if (result.success) {
        // Log to audit channel
        await auditLogger.logNoteAction(interaction.client, interaction.guild.id, 'delete',
            { tag: note.user_tag, id: note.user_id }, interaction.user, noteId);

        return interaction.reply({ content: `✅ Note #${noteId} deleted.`, ephemeral: true });
    }

    return interaction.reply({ content: `❌ Failed to delete note.`, ephemeral: true });
}

async function handleSearch(interaction) {
    const query = interaction.options.getString('query');
    const notes = notesManager.searchNotes(interaction.guild.id, query);

    if (notes.length === 0) {
        return interaction.reply({ content: `🔍 No notes found matching "${query}"`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results: "${query}"`)
        .setColor(0x9B59B6)
        .setFooter({ text: `Found ${notes.length} note(s)` })
        .setTimestamp();

    const displayNotes = notes.slice(0, 10);
    for (const note of displayNotes) {
        const date = new Date(note.created_at).toLocaleDateString();
        embed.addFields({
            name: `#${note.id} • <@${note.user_id}> • ${date}`,
            value: note.note.substring(0, 200) + (note.note.length > 200 ? '...' : ''),
            inline: false
        });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRecent(interaction) {
    const limit = interaction.options.getInteger('limit') || 10;
    const notes = notesManager.getRecentNotes(interaction.guild.id, limit);

    if (notes.length === 0) {
        return interaction.reply({ content: '📝 No notes in this server yet.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('📝 Recent Notes')
        .setColor(0x2ECC71)
        .setFooter({ text: `Showing ${notes.length} note(s)` })
        .setTimestamp();

    for (const note of notes) {
        const date = new Date(note.created_at).toLocaleDateString();
        embed.addFields({
            name: `#${note.id} • <@${note.user_id}> (by ${note.author_tag})`,
            value: `${date}: ${note.note.substring(0, 150)}${note.note.length > 150 ? '...' : ''}`,
            inline: false
        });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

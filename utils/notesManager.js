/**
 * Staff Notes Manager
 * Private staff notes on users - separate from cases
 */

const { execute, query, queryOne } = require('./database');

// Initialize notes table
function initNotesTable() {
    try {
        execute(`
      CREATE TABLE IF NOT EXISTS staff_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_tag TEXT,
        note TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_tag TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        execute('CREATE INDEX IF NOT EXISTS idx_notes_guild_user ON staff_notes(guild_id, user_id)');
        console.log('[NotesManager] ✓ Table initialized');
    } catch (e) {
        console.error('[NotesManager] Table init failed:', e.message);
    }
}

/**
 * Add a note to a user
 */
function addNote(guildId, userId, userTag, note, authorId, authorTag) {
    try {
        const result = execute(`
      INSERT INTO staff_notes (guild_id, user_id, user_tag, note, author_id, author_tag)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [guildId, userId, userTag, note, authorId, authorTag]);

        return { success: true, noteId: result.lastInsertRowid };
    } catch (e) {
        console.error('[NotesManager] Add failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Get all notes for a user
 */
function getUserNotes(guildId, userId) {
    try {
        return query(`
      SELECT * FROM staff_notes 
      WHERE guild_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `, [guildId, userId]);
    } catch (e) {
        console.error('[NotesManager] Get notes failed:', e.message);
        return [];
    }
}

/**
 * Get a specific note by ID
 */
function getNoteById(noteId) {
    try {
        return queryOne('SELECT * FROM staff_notes WHERE id = ?', [noteId]);
    } catch (e) {
        return null;
    }
}

/**
 * Delete a note
 */
function deleteNote(noteId, guildId) {
    try {
        const result = execute(`
      DELETE FROM staff_notes WHERE id = ? AND guild_id = ?
    `, [noteId, guildId]);

        return { success: result.changes > 0 };
    } catch (e) {
        console.error('[NotesManager] Delete failed:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Get note count for a user
 */
function getNoteCount(guildId, userId) {
    try {
        const result = queryOne(`
      SELECT COUNT(*) as count FROM staff_notes 
      WHERE guild_id = ? AND user_id = ?
    `, [guildId, userId]);
        return result?.count || 0;
    } catch (e) {
        return 0;
    }
}

/**
 * Get all notes by a specific author
 */
function getNotesByAuthor(guildId, authorId) {
    try {
        return query(`
      SELECT * FROM staff_notes 
      WHERE guild_id = ? AND author_id = ?
      ORDER BY created_at DESC
    `, [guildId, authorId]);
    } catch (e) {
        return [];
    }
}

/**
 * Search notes
 */
function searchNotes(guildId, searchTerm) {
    try {
        return query(`
      SELECT * FROM staff_notes 
      WHERE guild_id = ? AND note LIKE ?
      ORDER BY created_at DESC
      LIMIT 50
    `, [guildId, `%${searchTerm}%`]);
    } catch (e) {
        return [];
    }
}

/**
 * Get recent notes for the guild
 */
function getRecentNotes(guildId, limit = 10) {
    try {
        return query(`
      SELECT * FROM staff_notes 
      WHERE guild_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [guildId, limit]);
    } catch (e) {
        return [];
    }
}

// Initialize on load
initNotesTable();

module.exports = {
    addNote,
    getUserNotes,
    getNoteById,
    deleteNote,
    getNoteCount,
    getNotesByAuthor,
    searchNotes,
    getRecentNotes
};

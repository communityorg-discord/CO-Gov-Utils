/**
 * Status Portal Manager
 * Manages changelogs, suggestions, incidents, roadmap for the status portal
 */

const { execute, query, queryOne } = require('./database');

// Initialize tables
function initStatusTables() {
    // Changelogs
    execute(`
        CREATE TABLE IF NOT EXISTS changelogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            system TEXT NOT NULL,
            version TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT,
            changes_added TEXT,
            changes_changed TEXT,
            changes_fixed TEXT,
            changes_removed TEXT,
            changes_security TEXT,
            author_id TEXT,
            author_name TEXT,
            pinned INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Suggestions/Bug Reports
    execute(`
        CREATE TABLE IF NOT EXISTS suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            suggestion_id TEXT UNIQUE,
            user_id TEXT NOT NULL,
            user_tag TEXT,
            title TEXT NOT NULL,
            description TEXT,
            type TEXT DEFAULT 'feature',
            severity TEXT,
            status TEXT DEFAULT 'pending',
            upvotes INTEGER DEFAULT 0,
            downvotes INTEGER DEFAULT 0,
            admin_response TEXT,
            responded_by TEXT,
            responded_by_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME
        )
    `);

    // Suggestion Votes
    execute(`
        CREATE TABLE IF NOT EXISTS suggestion_votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            suggestion_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            vote_type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(suggestion_id, user_id)
        )
    `);

    // Services (for status monitoring)
    execute(`
        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT DEFAULT '🖥️',
            url TEXT,
            status TEXT DEFAULT 'operational',
            uptime_24h REAL DEFAULT 100,
            uptime_7d REAL DEFAULT 100,
            uptime_30d REAL DEFAULT 100,
            last_check DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Incidents
    execute(`
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            status TEXT DEFAULT 'investigating',
            severity TEXT DEFAULT 'minor',
            affected_services TEXT,
            message TEXT,
            scheduled_start DATETIME,
            scheduled_end DATETIME,
            resolved_at DATETIME,
            created_by TEXT,
            created_by_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Incident Updates
    execute(`
        CREATE TABLE IF NOT EXISTS incident_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id TEXT NOT NULL,
            status TEXT,
            message TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Roadmap Items
    execute(`
        CREATE TABLE IF NOT EXISTS roadmap_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            system TEXT,
            quarter TEXT,
            status TEXT DEFAULT 'planned',
            progress INTEGER DEFAULT 0,
            suggestion_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insert default services if none exist
    const existingServices = query('SELECT COUNT(*) as count FROM services');
    if (existingServices[0].count === 0) {
        execute(`INSERT INTO services (service_id, name, description, icon, status) VALUES (?, ?, ?, ?, ?)`,
            ['gov-utils', 'Gov Utils Bot', 'Moderation & administration bot', '🤖', 'operational']);
        execute(`INSERT INTO services (service_id, name, description, icon, status) VALUES (?, ?, ?, ?, ?)`,
            ['economy-bot', 'Economy Bot', 'Economy, banking & government systems', '💰', 'operational']);
        execute(`INSERT INTO services (service_id, name, description, icon, status) VALUES (?, ?, ?, ?, ?)`,
            ['admin-dashboard', 'Admin Dashboard', 'Staff administration portal', '🖥️', 'operational']);
        execute(`INSERT INTO services (service_id, name, description, icon, status) VALUES (?, ?, ?, ?, ?)`,
            ['webmail', 'Webmail', 'Email service for usgrp.xyz', '📧', 'operational']);
        execute(`INSERT INTO services (service_id, name, description, icon, status) VALUES (?, ?, ?, ?, ?)`,
            ['status-portal', 'Status Portal', 'System status & community portal', '📊', 'operational']);
    }

    console.log('[StatusManager] Tables initialized');
}

// ============ CHANGELOGS ============

function createChangelog({ system, version, title, content, changes, authorId, authorName }) {
    const result = execute(`
        INSERT INTO changelogs (system, version, title, content, changes_added, changes_changed, changes_fixed, changes_removed, changes_security, author_id, author_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        system,
        version,
        title,
        content || '',
        JSON.stringify(changes?.added || []),
        JSON.stringify(changes?.changed || []),
        JSON.stringify(changes?.fixed || []),
        JSON.stringify(changes?.removed || []),
        JSON.stringify(changes?.security || []),
        authorId,
        authorName
    ]);
    return { success: true, id: result.lastInsertRowid };
}

function getChangelogs(system = null, limit = 50) {
    let sql = 'SELECT * FROM changelogs';
    const params = [];

    if (system) {
        sql += ' WHERE system = ?';
        params.push(system);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const results = query(sql, params);
    return results.map(row => ({
        ...row,
        changes: {
            added: JSON.parse(row.changes_added || '[]'),
            changed: JSON.parse(row.changes_changed || '[]'),
            fixed: JSON.parse(row.changes_fixed || '[]'),
            removed: JSON.parse(row.changes_removed || '[]'),
            security: JSON.parse(row.changes_security || '[]'),
        }
    }));
}

function deleteChangelog(id) {
    execute('DELETE FROM changelogs WHERE id = ?', [id]);
    return { success: true };
}

// ============ SUGGESTIONS ============

function createSuggestion({ userId, userTag, title, description, type = 'feature', severity = null }) {
    const suggestionId = `SUG-${Date.now().toString(36).toUpperCase()}`;
    execute(`
        INSERT INTO suggestions (suggestion_id, user_id, user_tag, title, description, type, severity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [suggestionId, userId, userTag, title, description, type, severity]);
    return { success: true, suggestionId };
}

function getSuggestions(filters = {}) {
    let sql = 'SELECT * FROM suggestions WHERE 1=1';
    const params = [];

    if (filters.type) {
        sql += ' AND type = ?';
        params.push(filters.type);
    }
    if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
    }

    sql += ' ORDER BY created_at DESC';
    if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
    }

    return query(sql, params);
}

function getSuggestion(suggestionId) {
    return queryOne('SELECT * FROM suggestions WHERE suggestion_id = ?', [suggestionId]);
}

function updateSuggestionStatus(suggestionId, status, adminResponse = null, respondedBy = null, respondedByName = null) {
    execute(`
        UPDATE suggestions 
        SET status = ?, admin_response = COALESCE(?, admin_response), responded_by = COALESCE(?, responded_by), 
            responded_by_name = COALESCE(?, responded_by_name), updated_at = datetime('now')
        WHERE suggestion_id = ?
    `, [status, adminResponse, respondedBy, respondedByName, suggestionId]);
    return { success: true };
}

function voteSuggestion(suggestionId, userId, voteType) {
    // Check existing vote
    const existing = queryOne('SELECT * FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?', [suggestionId, visitorId]);

    if (existing) {
        if (existing.vote_type === voteType) {
            // Remove vote
            execute('DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?', [suggestionId, userId]);
            execute(`UPDATE suggestions SET ${voteType === 'up' ? 'upvotes = upvotes - 1' : 'downvotes = downvotes - 1'} WHERE suggestion_id = ?`, [suggestionId]);
        } else {
            // Change vote
            execute('UPDATE suggestion_votes SET vote_type = ? WHERE suggestion_id = ? AND user_id = ?', [voteType, suggestionId, userId]);
            if (voteType === 'up') {
                execute('UPDATE suggestions SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE suggestion_id = ?', [suggestionId]);
            } else {
                execute('UPDATE suggestions SET downvotes = downvotes + 1, upvotes = upvotes - 1 WHERE suggestion_id = ?', [suggestionId]);
            }
        }
    } else {
        // New vote
        execute('INSERT INTO suggestion_votes (suggestion_id, user_id, vote_type) VALUES (?, ?, ?)', [suggestionId, userId, voteType]);
        execute(`UPDATE suggestions SET ${voteType === 'up' ? 'upvotes = upvotes + 1' : 'downvotes = downvotes + 1'} WHERE suggestion_id = ?`, [suggestionId]);
    }

    return { success: true };
}

// ============ SERVICES ============

function getServices() {
    return query('SELECT * FROM services ORDER BY name');
}

function updateServiceStatus(serviceId, status) {
    execute('UPDATE services SET status = ?, last_check = datetime("now") WHERE service_id = ?', [status, serviceId]);
    return { success: true };
}

// ============ INCIDENTS ============

function createIncident({ title, severity, affectedServices, message, scheduledStart, scheduledEnd, createdBy, createdByName }) {
    const incidentId = `INC-${Date.now().toString(36).toUpperCase()}`;
    const status = scheduledStart ? 'scheduled' : 'investigating';

    execute(`
        INSERT INTO incidents (incident_id, title, status, severity, affected_services, message, scheduled_start, scheduled_end, created_by, created_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [incidentId, title, status, severity, JSON.stringify(affectedServices || []), message, scheduledStart, scheduledEnd, createdBy, createdByName]);

    // Add initial update
    execute('INSERT INTO incident_updates (incident_id, status, message, created_by) VALUES (?, ?, ?, ?)',
        [incidentId, status, message, createdBy]);

    return { success: true, incidentId };
}

function getIncidents(includeResolved = false) {
    let sql = 'SELECT * FROM incidents';
    if (!includeResolved) {
        sql += ' WHERE status != "resolved"';
    }
    sql += ' ORDER BY created_at DESC';

    const incidents = query(sql);
    return incidents.map(inc => ({
        ...inc,
        affectedServices: JSON.parse(inc.affected_services || '[]'),
        updates: query('SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at DESC', [inc.incident_id])
    }));
}

function updateIncident(incidentId, { status, message, createdBy }) {
    execute('UPDATE incidents SET status = ? WHERE incident_id = ?', [status, incidentId]);

    if (status === 'resolved') {
        execute('UPDATE incidents SET resolved_at = datetime("now") WHERE incident_id = ?', [incidentId]);
    }

    execute('INSERT INTO incident_updates (incident_id, status, message, created_by) VALUES (?, ?, ?, ?)',
        [incidentId, status, message, createdBy]);

    return { success: true };
}

// ============ ROADMAP ============

function getRoadmapItems() {
    return query('SELECT * FROM roadmap_items ORDER BY quarter, status DESC');
}

function createRoadmapItem({ title, description, system, quarter, status = 'planned' }) {
    execute(`
        INSERT INTO roadmap_items (title, description, system, quarter, status)
        VALUES (?, ?, ?, ?, ?)
    `, [title, description, system, quarter, status]);
    return { success: true };
}

function updateRoadmapItem(id, { status, progress }) {
    execute('UPDATE roadmap_items SET status = ?, progress = ? WHERE id = ?', [status, progress, id]);
    return { success: true };
}

module.exports = {
    initStatusTables,
    // Changelogs
    createChangelog,
    getChangelogs,
    deleteChangelog,
    // Suggestions
    createSuggestion,
    getSuggestions,
    getSuggestion,
    updateSuggestionStatus,
    voteSuggestion,
    // Services
    getServices,
    updateServiceStatus,
    // Incidents
    createIncident,
    getIncidents,
    updateIncident,
    // Roadmap
    getRoadmapItems,
    createRoadmapItem,
    updateRoadmapItem,
};

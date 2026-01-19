/**
 * Advanced Task Manager
 * Full-featured task tracking with categories, subtasks, comments, time tracking
 */

const { execute, query, queryOne } = require('./database');

// Initialize all task tables
function initTaskTables() {
    try {
        // Main tasks table
        execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        priority TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'open',
        assigned_to TEXT,
        created_by TEXT NOT NULL,
        due_date TEXT,
        estimated_hours REAL DEFAULT 0,
        logged_hours REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        completed_at TEXT,
        completed_by TEXT,
        parent_id INTEGER,
        FOREIGN KEY (parent_id) REFERENCES tasks(id)
      )
    `);

        // Task comments/activity
        execute(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'comment',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

        // Task watchers
        execute(`
      CREATE TABLE IF NOT EXISTS task_watchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        UNIQUE(task_id, user_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

        // Task labels/tags
        execute(`
      CREATE TABLE IF NOT EXISTS task_labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3498DB',
        emoji TEXT DEFAULT '🏷️',
        UNIQUE(guild_id, name)
      )
    `);

        // Task-label association
        execute(`
      CREATE TABLE IF NOT EXISTS task_label_map (
        task_id INTEGER NOT NULL,
        label_id INTEGER NOT NULL,
        PRIMARY KEY (task_id, label_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (label_id) REFERENCES task_labels(id) ON DELETE CASCADE
      )
    `);

        // Time entries
        execute(`
      CREATE TABLE IF NOT EXISTS task_time_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        hours REAL NOT NULL,
        description TEXT,
        logged_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

        execute('CREATE INDEX IF NOT EXISTS idx_tasks_guild ON tasks(guild_id)');
        execute('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
        execute('CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to)');
        execute('CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category)');
        execute('CREATE INDEX IF NOT EXISTS idx_task_comments ON task_comments(task_id)');

        console.log('[TaskManager] ✓ Tables initialized');
    } catch (e) {
        console.error('[TaskManager] Table init failed:', e.message);
    }
}

// ========== TASK CRUD ==========

function createTask(guildId, title, description, createdBy, options = {}) {
    try {
        const {
            priority = 'normal',
            category = 'general',
            dueDate = null,
            estimatedHours = 0,
            parentId = null,
            assignTo = null
        } = options;

        execute(`
      INSERT INTO tasks (guild_id, title, description, category, priority, created_by, due_date, estimated_hours, parent_id, assigned_to, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [guildId, title, description, category, priority, createdBy, dueDate, estimatedHours, parentId, assignTo, assignTo ? 'in_progress' : 'open']);

        const task = queryOne('SELECT last_insert_rowid() as id');
        const taskId = task?.id;

        // Auto-watch creator
        if (taskId) {
            addWatcher(taskId, createdBy);
            addComment(taskId, createdBy, 'Created this task', 'system');
        }

        return { success: true, taskId };
    } catch (e) {
        console.error('[TaskManager] Create error:', e.message);
        return { success: false, error: e.message };
    }
}

function updateTask(taskId, updates) {
    try {
        const allowedFields = ['title', 'description', 'category', 'priority', 'status', 'assigned_to', 'due_date', 'estimated_hours'];
        const setClause = [];
        const params = [];

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                setClause.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (setClause.length === 0) return { success: false, error: 'No valid fields to update' };

        params.push(taskId);
        execute(`UPDATE tasks SET ${setClause.join(', ')} WHERE id = ?`, params);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function assignTask(taskId, userId, assignedBy) {
    try {
        const task = getTask(taskId);
        execute(`UPDATE tasks SET assigned_to = ?, status = 'in_progress', started_at = COALESCE(started_at, ?) WHERE id = ?`,
            [userId, new Date().toISOString(), taskId]);
        addWatcher(taskId, userId);
        addComment(taskId, assignedBy, `Assigned to <@${userId}>`, 'system');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function completeTask(taskId, userId) {
    try {
        execute(`UPDATE tasks SET status = 'done', completed_at = ?, completed_by = ? WHERE id = ?`,
            [new Date().toISOString(), userId, taskId]);
        addComment(taskId, userId, 'Marked as complete ✅', 'system');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function reopenTask(taskId, userId) {
    try {
        execute(`UPDATE tasks SET status = 'in_progress', completed_at = NULL, completed_by = NULL WHERE id = ?`, [taskId]);
        addComment(taskId, userId, 'Reopened this task', 'system');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function deleteTask(taskId) {
    try {
        execute('DELETE FROM tasks WHERE id = ?', [taskId]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function getTask(taskId) {
    const task = queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (task) {
        task.subtasks = getSubtasks(taskId);
        task.comments = getComments(taskId);
        task.watchers = getWatchers(taskId);
        task.labels = getTaskLabels(taskId);
        task.timeEntries = getTimeEntries(taskId);
    }
    return task;
}

function getTasks(guildId, filter = 'all', userId = null) {
    let sql = 'SELECT * FROM tasks WHERE guild_id = ? AND parent_id IS NULL';
    const params = [guildId];

    switch (filter) {
        case 'mine':
            sql += ' AND assigned_to = ?';
            params.push(userId);
            break;
        case 'open':
            sql += " AND status = 'open'";
            break;
        case 'in_progress':
            sql += " AND status = 'in_progress'";
            break;
        case 'done':
            sql += " AND status = 'done'";
            break;
        case 'unassigned':
            sql += " AND assigned_to IS NULL AND status != 'done'";
            break;
        case 'urgent':
            sql += " AND priority = 'urgent' AND status != 'done'";
            break;
        case 'overdue':
            sql += ` AND due_date < date('now') AND status != 'done'`;
            break;
    }

    sql += " ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END, created_at DESC";

    return query(sql, params) || [];
}

function getTaskCounts(guildId) {
    const result = query(`
    SELECT status, COUNT(*) as count FROM tasks
    WHERE guild_id = ? AND parent_id IS NULL
    GROUP BY status
  `, [guildId]) || [];

    const counts = { open: 0, in_progress: 0, done: 0 };
    for (const row of result) {
        counts[row.status] = row.count;
    }
    return counts;
}

function getOverdueTasks(guildId) {
    return query(`
    SELECT * FROM tasks
    WHERE guild_id = ? AND due_date < date('now') AND status != 'done' AND parent_id IS NULL
    ORDER BY due_date ASC
  `, [guildId]) || [];
}

// ========== SUBTASKS ==========

function createSubtask(parentId, title, createdBy) {
    const parent = getTask(parentId);
    if (!parent) return { success: false, error: 'Parent task not found' };

    return createTask(parent.guild_id, title, null, createdBy, { parentId });
}

function getSubtasks(parentId) {
    return query('SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC', [parentId]) || [];
}

function getSubtaskProgress(parentId) {
    const subtasks = getSubtasks(parentId);
    if (subtasks.length === 0) return null;

    const completed = subtasks.filter(t => t.status === 'done').length;
    return {
        total: subtasks.length,
        completed,
        percent: Math.round((completed / subtasks.length) * 100)
    };
}

// ========== COMMENTS ==========

function addComment(taskId, userId, content, type = 'comment') {
    try {
        execute(`INSERT INTO task_comments (task_id, user_id, content, type) VALUES (?, ?, ?, ?)`,
            [taskId, userId, content, type]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function getComments(taskId, limit = 20) {
    return query(`
    SELECT * FROM task_comments WHERE task_id = ?
    ORDER BY created_at DESC LIMIT ?
  `, [taskId, limit]) || [];
}

// ========== WATCHERS ==========

function addWatcher(taskId, userId) {
    try {
        execute(`INSERT OR IGNORE INTO task_watchers (task_id, user_id) VALUES (?, ?)`, [taskId, userId]);
        return { success: true };
    } catch (e) {
        return { success: false };
    }
}

function removeWatcher(taskId, userId) {
    execute('DELETE FROM task_watchers WHERE task_id = ? AND user_id = ?', [taskId, userId]);
}

function getWatchers(taskId) {
    return query('SELECT user_id FROM task_watchers WHERE task_id = ?', [taskId])?.map(r => r.user_id) || [];
}

// ========== LABELS ==========

function createLabel(guildId, name, emoji = '🏷️', color = '#3498DB') {
    try {
        execute(`INSERT INTO task_labels (guild_id, name, emoji, color) VALUES (?, ?, ?, ?)`,
            [guildId, name, emoji, color]);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function getLabels(guildId) {
    return query('SELECT * FROM task_labels WHERE guild_id = ?', [guildId]) || [];
}

function addLabelToTask(taskId, labelId) {
    try {
        execute(`INSERT OR IGNORE INTO task_label_map (task_id, label_id) VALUES (?, ?)`, [taskId, labelId]);
    } catch (e) { }
}

function removeLabelFromTask(taskId, labelId) {
    execute('DELETE FROM task_label_map WHERE task_id = ? AND label_id = ?', [taskId, labelId]);
}

function getTaskLabels(taskId) {
    return query(`
    SELECT l.* FROM task_labels l
    JOIN task_label_map m ON l.id = m.label_id
    WHERE m.task_id = ?
  `, [taskId]) || [];
}

// ========== TIME TRACKING ==========

function logTime(taskId, userId, hours, description = '') {
    try {
        execute(`INSERT INTO task_time_entries (task_id, user_id, hours, description) VALUES (?, ?, ?, ?)`,
            [taskId, userId, hours, description]);
        execute(`UPDATE tasks SET logged_hours = logged_hours + ? WHERE id = ?`, [hours, taskId]);
        addComment(taskId, userId, `Logged ${hours}h: ${description || 'No description'}`, 'time');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function getTimeEntries(taskId) {
    return query('SELECT * FROM task_time_entries WHERE task_id = ? ORDER BY logged_at DESC', [taskId]) || [];
}

function getTotalLoggedTime(taskId) {
    const result = queryOne('SELECT SUM(hours) as total FROM task_time_entries WHERE task_id = ?', [taskId]);
    return result?.total || 0;
}

function getUserTimeThisWeek(guildId, userId) {
    const result = queryOne(`
    SELECT SUM(e.hours) as total
    FROM task_time_entries e
    JOIN tasks t ON e.task_id = t.id
    WHERE t.guild_id = ? AND e.user_id = ?
    AND e.logged_at >= date('now', '-7 days')
  `, [guildId, userId]);
    return result?.total || 0;
}

// ========== ANALYTICS ==========

function getProductivityStats(guildId, days = 7) {
    const completed = queryOne(`
    SELECT COUNT(*) as count FROM tasks
    WHERE guild_id = ? AND status = 'done'
    AND completed_at >= date('now', '-' || ? || ' days')
  `, [guildId, days]);

    const created = queryOne(`
    SELECT COUNT(*) as count FROM tasks
    WHERE guild_id = ? AND created_at >= date('now', '-' || ? || ' days')
  `, [guildId, days]);

    const avgCompletionTime = queryOne(`
    SELECT AVG(julianday(completed_at) - julianday(created_at)) as avg_days
    FROM tasks WHERE guild_id = ? AND status = 'done'
    AND completed_at >= date('now', '-' || ? || ' days')
  `, [guildId, days]);

    return {
        tasksCompleted: completed?.count || 0,
        tasksCreated: created?.count || 0,
        avgDaysToComplete: avgCompletionTime?.avg_days?.toFixed(1) || 0
    };
}

function getTopContributors(guildId, days = 7) {
    return query(`
    SELECT completed_by as user_id, COUNT(*) as count
    FROM tasks
    WHERE guild_id = ? AND status = 'done'
    AND completed_at >= date('now', '-' || ? || ' days')
    GROUP BY completed_by
    ORDER BY count DESC
    LIMIT 5
  `, [guildId, days]) || [];
}

// ========== HELPERS ==========

function getPriorityEmoji(priority) {
    return { urgent: '🔴', high: '🟠', normal: '🔵', low: '⚪' }[priority] || '🔵';
}

function getStatusEmoji(status) {
    return { open: '📭', in_progress: '🔨', done: '✅' }[status] || '📭';
}

function getCategoryEmoji(category) {
    const cats = {
        general: '📋', bug: '🐛', feature: '✨', docs: '📝',
        urgent: '🚨', meeting: '📅', review: '👀', research: '🔬'
    };
    return cats[category] || '📋';
}

// Initialize
initTaskTables();

module.exports = {
    createTask, updateTask, assignTask, completeTask, reopenTask, deleteTask,
    getTask, getTasks, getTaskCounts, getOverdueTasks,
    createSubtask, getSubtasks, getSubtaskProgress,
    addComment, getComments,
    addWatcher, removeWatcher, getWatchers,
    createLabel, getLabels, addLabelToTask, removeLabelFromTask, getTaskLabels,
    logTime, getTimeEntries, getTotalLoggedTime, getUserTimeThisWeek,
    getProductivityStats, getTopContributors,
    getPriorityEmoji, getStatusEmoji, getCategoryEmoji
};

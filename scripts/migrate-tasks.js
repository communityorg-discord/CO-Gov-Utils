/**
 * Migration: Add missing columns to tasks table
 * Run: node scripts/migrate-tasks.js
 */

const db = require('better-sqlite3')('./data/moderation.db');

const migrations = [
  "ALTER TABLE tasks ADD COLUMN category TEXT DEFAULT 'general'",
  "ALTER TABLE tasks ADD COLUMN estimated_hours REAL DEFAULT 0",
  "ALTER TABLE tasks ADD COLUMN logged_hours REAL DEFAULT 0",
  "ALTER TABLE tasks ADD COLUMN started_at TEXT",
  "ALTER TABLE tasks ADD COLUMN parent_id INTEGER REFERENCES tasks(id)"
];

console.log('[Migration] Starting tasks table migration...\n');

for (const sql of migrations) {
  try {
    db.exec(sql);
    console.log('✓', sql);
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('⏭️  Already exists:', sql.match(/ADD COLUMN (\w+)/)[1]);
    } else {
      console.error('✗', e.message);
    }
  }
}

// Create index for category
try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category)");
  console.log('✓ Index idx_tasks_category created');
} catch (e) {
  console.log('⏭️  Index already exists');
}

db.close();
console.log('\n[Migration] Complete.');

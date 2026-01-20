/**
 * Database Initialization for CO Government Utilities
 * Creates all tables for case management and moderation
 */

require('dotenv').config();
const { initDatabase } = require('../utils/database');

const TABLES = {
  // Main cases table
  cases: `
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT UNIQUE NOT NULL,
      guild_id TEXT NOT NULL,
      global_case INTEGER DEFAULT 0,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      moderator_id TEXT NOT NULL,
      moderator_tag TEXT,
      action_type TEXT NOT NULL,
      reason TEXT,
      evidence TEXT,
      duration INTEGER,
      points INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      deleted_at DATETIME,
      deleted_by TEXT,
      voided_at DATETIME,
      voided_by TEXT,
      void_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Case edits history
  case_edits: `
    CREATE TABLE IF NOT EXISTS case_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL,
      editor_id TEXT NOT NULL,
      editor_tag TEXT,
      field_changed TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      edit_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES cases(case_id)
    )
  `,

  // Investigations
  investigations: `
    CREATE TABLE IF NOT EXISTS investigations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT UNIQUE NOT NULL,
      guild_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_tag TEXT,
      investigator_id TEXT NOT NULL,
      investigator_tag TEXT,
      channel_id TEXT,
      reason TEXT,
      status TEXT DEFAULT 'open',
      findings TEXT,
      outcome TEXT,
      roles_removed TEXT,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      closed_by TEXT,
      FOREIGN KEY (case_id) REFERENCES cases(case_id)
    )
  `,

  // Staff assignments
  staff_assignments: `
    CREATE TABLE IF NOT EXISTS staff_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      position_key TEXT NOT NULL,
      position_name TEXT NOT NULL,
      assigned_by TEXT NOT NULL,
      assigned_by_tag TEXT,
      roles_added TEXT,
      status TEXT DEFAULT 'active',
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      removed_at DATETIME,
      removed_by TEXT,
      removal_reason TEXT
    )
  `,

  // Active mutes tracking
  active_mutes: `
    CREATE TABLE IF NOT EXISTS active_mutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES cases(case_id)
    )
  `,

  // Case counter per guild
  case_counters: `
    CREATE TABLE IF NOT EXISTS case_counters (
      guild_id TEXT PRIMARY KEY,
      current_number INTEGER DEFAULT 0
    )
  `,

  // Audit log
  audit_log: `
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT,
      actor_tag TEXT,
      target_id TEXT,
      target_tag TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Global bans
  global_bans: `
    CREATE TABLE IF NOT EXISTS global_bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      user_tag TEXT,
      banned_by TEXT NOT NULL,
      banned_by_tag TEXT,
      reason TEXT,
      case_id TEXT,
      banned_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Global mutes
  global_mutes: `
    CREATE TABLE IF NOT EXISTS global_mutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      user_tag TEXT,
      muted_by TEXT NOT NULL,
      reason TEXT,
      duration_ms INTEGER,
      expires_at DATETIME,
      case_id TEXT,
      muted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Lockdown state
  lockdown_state: `
    CREATE TABLE IF NOT EXISTS lockdown_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      locked_by TEXT,
      reason TEXT,
      original_perms TEXT,
      is_server_lockdown INTEGER DEFAULT 0,
      locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, channel_id)
    )
  `,

  // Superusers (dynamic, not hardcoded)
  superusers: `
    CREATE TABLE IF NOT EXISTS superusers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      user_tag TEXT,
      added_by TEXT NOT NULL,
      added_by_tag TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Permission grants
  permission_grants: `
    CREATE TABLE IF NOT EXISTS permission_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      permission_type TEXT NOT NULL,
      permission_value TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      granted_by_tag TEXT,
      reason TEXT,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, user_id, permission_type, permission_value)
    )
  `,

  // Permission requests
  permission_requests: `
    CREATE TABLE IF NOT EXISTS permission_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      permission_type TEXT NOT NULL,
      permission_value TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_by_tag TEXT,
      review_reason TEXT,
      message_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME
    )
  `,

  // Command log
  command_log: `
    CREATE TABLE IF NOT EXISTS command_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      command_name TEXT NOT NULL,
      subcommand TEXT,
      target_id TEXT,
      target_tag TEXT,
      options TEXT,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Staff accounts (links Discord ID to email for dashboard)
  staff_accounts: `
    CREATE TABLE IF NOT EXISTS staff_accounts (
      discord_id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT,
      permission_level TEXT,
      password TEXT,
      linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      linked_by TEXT
    )
  `
};

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_cases_guild ON cases(guild_id)',
  'CREATE INDEX IF NOT EXISTS idx_cases_user ON cases(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status)',
  'CREATE INDEX IF NOT EXISTS idx_cases_action ON cases(action_type)',
  'CREATE INDEX IF NOT EXISTS idx_case_edits_case ON case_edits(case_id)',
  'CREATE INDEX IF NOT EXISTS idx_investigations_guild ON investigations(guild_id)',
  'CREATE INDEX IF NOT EXISTS idx_investigations_subject ON investigations(subject_id)',
  'CREATE INDEX IF NOT EXISTS idx_staff_guild_user ON staff_assignments(guild_id, user_id)',
  'CREATE INDEX IF NOT EXISTS idx_active_mutes_guild ON active_mutes(guild_id)',
  'CREATE INDEX IF NOT EXISTS idx_active_mutes_expires ON active_mutes(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_audit_log_guild ON audit_log(guild_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)'
];

async function initTables() {
  console.log('[DB Init] Starting database initialization...');

  try {
    const db = initDatabase();

    // Create tables
    for (const [name, sql] of Object.entries(TABLES)) {
      try {
        db.exec(sql);
        console.log(`[DB Init] ✓ Table: ${name}`);
      } catch (err) {
        console.error(`[DB Init] ✗ Table ${name}:`, err.message);
      }
    }

    // Create indexes
    for (const sql of INDEXES) {
      try {
        db.exec(sql);
      } catch (err) {
        // Indexes may exist
      }
    }
    console.log(`[DB Init] ✓ Indexes created`);

    // Migrations - add columns to existing tables
    const migrations = [
      `ALTER TABLE staff_accounts ADD COLUMN password TEXT`,
    ];
    for (const sql of migrations) {
      try {
        db.exec(sql);
        console.log(`[DB Init] ✓ Migration applied`);
      } catch (err) {
        // Column already exists
      }
    }

    console.log('[DB Init] Database initialization complete!');

  } catch (error) {
    console.error('[DB Init] Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  initTables();
}

module.exports = { initTables, TABLES, INDEXES };

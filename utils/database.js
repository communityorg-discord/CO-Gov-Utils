/**
 * Database Manager for CO Government Utilities Bot
 * SQLite-based case management and moderation tracking
 */

const path = require('path');
const fs = require('fs');

let db = null;

/**
 * Initialize SQLite database
 */
function initDatabase() {
  if (db) return db;

  try {
    const Database = require('better-sqlite3');
    const dbPath = process.env.DB_PATH || './data/moderation.db';
    
    // Ensure data directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    
    console.log(`[Database] SQLite connected: ${dbPath}`);
    return db;
  } catch (error) {
    console.error('[Database] Init failed:', error.message);
    throw error;
  }
}

/**
 * Get database instance
 */
function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Run a query
 */
function query(sql, params = []) {
  const database = getDatabase();
  return database.prepare(sql).all(...params);
}

/**
 * Get single row
 */
function queryOne(sql, params = []) {
  const database = getDatabase();
  return database.prepare(sql).get(...params);
}

/**
 * Execute statement (INSERT, UPDATE, DELETE)
 */
function execute(sql, params = []) {
  const database = getDatabase();
  return database.prepare(sql).run(...params);
}

/**
 * Close database
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('[Database] Connection closed');
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  query,
  queryOne,
  execute,
  closeDatabase
};

const Database = require('better-sqlite3');
const config = require('../config');
const path = require('path');
const fs = require('fs');

const dir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;

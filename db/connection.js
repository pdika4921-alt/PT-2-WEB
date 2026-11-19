'use strict';

// Use Node's built-in SQLite (available in Node >= 22) instead of the native
// better-sqlite3 addon. This avoids prebuilt binaries that require GLIBC 2.29+
// and avoids node-gyp/Python compilation on shared hosts such as Hostinger.
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const path = require('path');
const fs = require('fs');

const dir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new DatabaseSync(config.DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Keep the better-sqlite3-compatible API used across the app.
const originalPrepare = db.prepare.bind(db);
const normalize = (args) => args.map((value) => (value === undefined ? null : value));

db.prepare = (sql) => {
  const stmt = originalPrepare(sql);
  return {
    get: (...args) => stmt.get(...normalize(args)),
    all: (...args) => stmt.all(...normalize(args)),
    run: (...args) => stmt.run(...normalize(args))
  };
};

db.transaction = (fn) => (...args) => {
  db.exec('BEGIN');
  try {
    const result = fn(...args);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    throw err;
  }
};

module.exports = db;

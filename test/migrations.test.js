const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const { applyMigrations, createDatabase } = require('../src/data/database');

test('numbered booking migration creates the schema on an empty database', () => {
  const db = createDatabase(':memory:');
  try {
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bookings'").get());
    assert.equal(db.prepare('SELECT filename FROM schema_migrations').get().filename, '001_bookings.sql');
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_active_bookings'").get());
    assert.ok(db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'google_sub'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'oauth_states'").get());
  } finally {
    db.close();
  }
});

test('numbered booking migration preserves existing bookings and is safe to rerun', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL);
      CREATE TABLE lab_slots (id INTEGER PRIMARY KEY);
      CREATE TABLE bookings (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        slot_id INTEGER NOT NULL REFERENCES lab_slots(id),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users (id, email, password_hash) VALUES (1, 'student@example.edu', 'hash');
      INSERT INTO lab_slots (id) VALUES (1);
      INSERT INTO bookings (id, user_id, slot_id) VALUES (1, 1, 1);
    `);

    applyMigrations(db);
    applyMigrations(db);

    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 1);
    assert.equal(db.prepare('SELECT status FROM bookings WHERE id = 1').get().status, 'active');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 2);
  } finally {
    db.close();
  }
});

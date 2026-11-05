const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function createDatabase(filename = path.join(process.cwd(), 'data', 'lab-booking.sqlite')) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS labs (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS lab_slots (
      id INTEGER PRIMARY KEY,
      lab_id INTEGER NOT NULL REFERENCES labs(id),
      starts_at TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      UNIQUE (lab_id, starts_at)
    );
  `);

  const insertLab = db.prepare('INSERT OR IGNORE INTO labs (name) VALUES (?)');
  const findLab = db.prepare('SELECT id FROM labs WHERE name = ?');
  const insertSlot = db.prepare(`
    INSERT OR IGNORE INTO lab_slots (lab_id, starts_at, capacity)
    VALUES (?, ?, ?)
  `);

  const seed = db.transaction(() => {
    const slots = [
      ['Computer Lab 1', '2030-05-01T09:00:00.000Z', 24],
      ['Computer Lab 1', '2030-05-01T13:00:00.000Z', 24],
      ['Electronics Lab', '2030-05-02T10:00:00.000Z', 16],
      ['Networks Lab', '2030-05-03T11:00:00.000Z', 20]
    ];

    for (const [labName, startsAt, capacity] of slots) {
      insertLab.run(labName);
      insertSlot.run(findLab.get(labName).id, startsAt, capacity);
    }
  });
  seed();

  return db;
}

module.exports = { createDatabase };

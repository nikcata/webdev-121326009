const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

function applyMigrations(db, directory = path.join(__dirname, '..', '..', 'migrations')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationFiles = fs.readdirSync(directory)
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();
  const isApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE filename = ?');
  const markApplied = db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)');

  for (const filename of migrationFiles) {
    if (isApplied.get(filename)) continue;
    const sql = fs.readFileSync(path.join(directory, filename), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      markApplied.run(filename);
    })();
  }
}

async function seedPostgres(db) {
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT');
  const slots = [
    ['Computer Lab 1', '2030-05-01T09:00:00.000Z', 24],
    ['Computer Lab 1', '2030-05-01T13:00:00.000Z', 24],
    ['Electronics Lab', '2030-05-02T10:00:00.000Z', 16],
    ['Networks Lab', '2030-05-03T11:00:00.000Z', 20]
  ];
  for (const [labName, startsAt, capacity] of slots) {
    const lab = await db.query(`
      INSERT INTO labs (name) VALUES ($1)
      ON CONFLICT (name) DO NOTHING
      RETURNING id
    `, [labName]);
    let labId = lab.rows[0]?.id;
    if (!labId) {
      const found = await db.query('SELECT id FROM labs WHERE name = $1', [labName]);
      labId = found.rows[0].id;
    }
    await db.query(`
      INSERT INTO lab_slots (lab_id, starts_at, capacity)
      VALUES ($1, $2, $3)
      ON CONFLICT (lab_id, starts_at) DO NOTHING
    `, [labId, startsAt, capacity]);
  }
}

function createDatabase(
  filename = process.env.DATABASE_URL
    ? null
    : (process.env.LAB_BOOKING_DB ?? path.join(process.cwd(), 'data', 'lab-booking.sqlite')),
  connectionString = process.env.DATABASE_URL
) {
  if (filename === null) {
    const pool = new Pool({
      connectionString
    });
    pool.on('error', (error) => console.error('database:', error.message));

    const db = {
      engine: 'postgres',
      async ready() {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            google_sub TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT');
        await pool.query(`
          CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at BIGINT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS labs (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
          );
          CREATE TABLE IF NOT EXISTS lab_slots (
            id SERIAL PRIMARY KEY,
            lab_id INTEGER NOT NULL REFERENCES labs(id),
            starts_at TEXT NOT NULL,
            capacity INTEGER NOT NULL CHECK (capacity > 0),
            reserved_seats INTEGER NOT NULL DEFAULT 0 CHECK (reserved_seats >= 0 AND reserved_seats <= capacity),
            UNIQUE (lab_id, starts_at)
          );
          CREATE TABLE IF NOT EXISTS bookings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            slot_id INTEGER NOT NULL REFERENCES lab_slots(id) ON DELETE CASCADE,
            status TEXT NOT NULL CHECK (status IN ('active', 'cancelled')) DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE UNIQUE INDEX IF NOT EXISTS idx_active_bookings
            ON bookings (user_id, slot_id) WHERE status = 'active';
          CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
            ON users (google_sub) WHERE google_sub IS NOT NULL;
          CREATE TABLE IF NOT EXISTS oauth_states (
            state TEXT PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            flow TEXT NOT NULL CHECK (flow IN ('login', 'link')),
            expires_at BIGINT NOT NULL
          );
        `);
        await seedPostgres(db);
      },
      async query(sql, params = []) {
        return pool.query(sql, params);
      },
      async withTransaction(callback) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await callback(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async health() {
        await pool.query('SELECT 1');
      },
      async close() {
        await pool.end();
      }
    };
    return db;
  }
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
      reserved_seats INTEGER NOT NULL DEFAULT 0 CHECK (reserved_seats >= 0 AND reserved_seats <= capacity),
      UNIQUE (lab_id, starts_at)
    );

  `);
  applyMigrations(db);

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

module.exports = { applyMigrations, createDatabase };

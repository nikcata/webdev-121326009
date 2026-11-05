function createUserRepository(db) {
  const findByEmail = db.prepare(`
    SELECT id, email, password_hash FROM users WHERE email = ?
  `);
  const insert = db.prepare(`
    INSERT INTO users (email, password_hash)
    VALUES (@email, @passwordHash)
    ON CONFLICT(email) DO NOTHING
  `);
  const findById = db.prepare('SELECT id, email FROM users WHERE id = ?');

  return {
    findByEmail(email) {
      return findByEmail.get(email);
    },
    create(email, passwordHash) {
      const result = insert.run({ email, passwordHash });
      if (result.changes === 0) return null;
      return findById.get(result.lastInsertRowid);
    }
  };
}

module.exports = { createUserRepository };

function createUserRepository(db) {
  const findByEmail = db.prepare(`
    SELECT id, email, password_hash, google_sub FROM users WHERE email = ?
  `);
  const insert = db.prepare(`
    INSERT INTO users (email, password_hash)
    VALUES (@email, @passwordHash)
    ON CONFLICT(email) DO NOTHING
  `);
  const findById = db.prepare('SELECT id, email, password_hash, google_sub FROM users WHERE id = ?');
  const findByGoogleSub = db.prepare('SELECT id, email, password_hash, google_sub FROM users WHERE google_sub = ?');
  const linkGoogle = db.prepare(`
    UPDATE users SET google_sub = ?
    WHERE id = ? AND google_sub IS NULL
  `);

  return {
    findByEmail(email) {
      return findByEmail.get(email);
    },
    findById(id) {
      return findById.get(id);
    },
    findByGoogleSub(subject) {
      return findByGoogleSub.get(subject);
    },
    linkGoogle(subject, userId) {
      return linkGoogle.run(subject, userId).changes > 0;
    },
    create(email, passwordHash) {
      const result = insert.run({ email, passwordHash });
      if (result.changes === 0) return null;
      return findById.get(result.lastInsertRowid);
    }
  };
}

module.exports = { createUserRepository };

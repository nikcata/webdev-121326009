function createSessionRepository(db) {
  const insert = db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (?, ?, ?)
  `);
  const findUser = db.prepare(`
    SELECT users.id, users.email
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `);
  const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const removeExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  return {
    create(tokenHash, userId, expiresAt) {
      insert.run(tokenHash, userId, expiresAt);
    },
    findUser(tokenHash, now) {
      return findUser.get(tokenHash, now);
    },
    remove(tokenHash) {
      remove.run(tokenHash);
    },
    removeExpired(now) {
      removeExpired.run(now);
    }
  };
}

module.exports = { createSessionRepository };

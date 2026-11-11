function createOAuthStateRepository(db) {
  const insert = db.prepare(`
    INSERT INTO oauth_states (state, user_id, flow, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  const select = db.prepare(`
    SELECT state, user_id, flow, expires_at
    FROM oauth_states
    WHERE state = ? AND expires_at > ?
  `);
  const remove = db.prepare('DELETE FROM oauth_states WHERE state = ?');
  const consume = db.transaction((state, now) => {
    const record = select.get(state, now);
    remove.run(state);
    return record;
  });

  return {
    create(state, userId, flow, expiresAt) {
      insert.run(state, userId, flow, expiresAt);
    },
    consume(state, now) {
      return consume(state, now);
    }
  };
}

module.exports = { createOAuthStateRepository };

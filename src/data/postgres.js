function query(db, sql, params, client) {
  return (client ?? db).query(sql, params);
}

function createPostgresUserRepository(db) {
  return {
    async findByEmail(email) {
      const result = await query(db, 'SELECT id, email, password_hash, google_sub FROM users WHERE email = $1', [email]);
      return result.rows[0] ?? null;
    },
    async findById(id) {
      const result = await query(db, 'SELECT id, email, password_hash, google_sub FROM users WHERE id = $1', [id]);
      return result.rows[0] ?? null;
    },
    async findByGoogleSub(subject) {
      const result = await query(db, 'SELECT id, email, password_hash, google_sub FROM users WHERE google_sub = $1', [subject]);
      return result.rows[0] ?? null;
    },
    async linkGoogle(subject, userId) {
      const result = await query(db, 'UPDATE users SET google_sub = $1 WHERE id = $2 AND google_sub IS NULL', [subject, userId]);
      return result.rowCount > 0;
    },
    async create(email, passwordHash) {
      const result = await query(db, `
        INSERT INTO users (email, password_hash)
        VALUES ($1, $2)
        ON CONFLICT (email) DO NOTHING
        RETURNING id, email, password_hash, google_sub
      `, [email, passwordHash]);
      return result.rows[0] ?? null;
    },
    async createWithGoogle(email, passwordHash, subject) {
      const result = await query(db, `
        INSERT INTO users (email, password_hash, google_sub)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO NOTHING
        RETURNING id, email, password_hash, google_sub
      `, [email, passwordHash, subject]);
      return result.rows[0] ?? null;
    }
  };
}

function createPostgresSessionRepository(db) {
  return {
    async create(tokenHash, userId, expiresAt) {
      await query(db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, userId, expiresAt]);
    },
    async findUser(tokenHash, now) {
      const result = await query(db, `
        SELECT users.id, users.email
        FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = $1 AND sessions.expires_at > $2
      `, [tokenHash, now]);
      return result.rows[0] ?? null;
    },
    async remove(tokenHash) {
      await query(db, 'DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },
    async removeExpired(now) {
      await query(db, 'DELETE FROM sessions WHERE expires_at <= $1', [now]);
    }
  };
}

function createPostgresOAuthStateRepository(db) {
  return {
    async create(state, userId, flow, expiresAt) {
      await query(db, 'INSERT INTO oauth_states (state, user_id, flow, expires_at) VALUES ($1, $2, $3, $4)', [state, userId, flow, expiresAt]);
    },
    async consume(state, now) {
      return db.withTransaction(async (client) => {
        const result = await client.query('SELECT state, user_id, flow, expires_at FROM oauth_states WHERE state = $1 AND expires_at > $2', [state, now]);
        await client.query('DELETE FROM oauth_states WHERE state = $1', [state]);
        return result.rows[0] ?? null;
      });
    }
  };
}

function createPostgresLabSlotRepository(db) {
  return {
    async listLabs() {
      const result = await query(db, 'SELECT id, name FROM labs ORDER BY name');
      return result.rows;
    },
    async findLabById(id, client) {
      const result = await query(db, 'SELECT id, name FROM labs WHERE id = $1', [id], client);
      return result.rows[0] ?? null;
    },
    async createLab(name) {
      const result = await query(db, 'INSERT INTO labs (name) VALUES ($1) RETURNING id, name', [name]);
      return result.rows[0];
    },
    async listUpcoming(now, client) {
      const result = await query(db, `
        SELECT lab_slots.id, labs.name AS lab_name, lab_slots.starts_at,
          (lab_slots.capacity - lab_slots.reserved_seats) AS available_seats
        FROM lab_slots JOIN labs ON labs.id = lab_slots.lab_id
        WHERE lab_slots.starts_at > $1
        ORDER BY lab_slots.starts_at, labs.name
      `, [now], client);
      return result.rows;
    },
    async findById(id, client) {
      const result = await query(db, `
        SELECT lab_slots.id, labs.name AS lab_name, lab_slots.starts_at,
          lab_slots.capacity, lab_slots.reserved_seats
        FROM lab_slots JOIN labs ON labs.id = lab_slots.lab_id
        WHERE lab_slots.id = $1
        FOR UPDATE
      `, [id], client);
      return result.rows[0] ?? null;
    },
    async create(labId, startsAt, capacity, client) {
      const insert = await query(db, `
        INSERT INTO lab_slots (lab_id, starts_at, capacity)
        VALUES ($1, $2, $3) RETURNING id
      `, [labId, startsAt, capacity], client);
      const result = await query(db, `
        SELECT lab_slots.id, labs.name AS lab_name, lab_slots.starts_at,
          (lab_slots.capacity - lab_slots.reserved_seats) AS available_seats
        FROM lab_slots JOIN labs ON labs.id = lab_slots.lab_id
        WHERE lab_slots.id = $1
      `, [insert.rows[0].id], client);
      return result.rows[0];
    },
    async incrementReservedSeats(id, client) {
      const result = await query(db, `
        UPDATE lab_slots SET reserved_seats = reserved_seats + 1
        WHERE id = $1 AND reserved_seats < capacity
      `, [id], client);
      return result.rowCount > 0;
    },
    async decrementReservedSeats(id, client) {
      const result = await query(db, `
        UPDATE lab_slots SET reserved_seats = reserved_seats - 1
        WHERE id = $1 AND reserved_seats > 0
      `, [id], client);
      return result.rowCount > 0;
    }
  };
}

function createPostgresBookingRepository(db) {
  return {
    async create(userId, slotId, client) {
      const result = await query(db, 'INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2) RETURNING id', [userId, slotId], client);
      return result.rows[0].id;
    },
    async findActive(userId, slotId, client) {
      const result = await query(db, `
        SELECT id FROM bookings
        WHERE user_id = $1 AND slot_id = $2 AND status = 'active'
      `, [userId, slotId], client);
      return result.rows[0] ?? null;
    },
    async findById(id, client) {
      const result = await query(db, 'SELECT id, user_id, slot_id, status FROM bookings WHERE id = $1', [id], client);
      return result.rows[0] ?? null;
    },
    async listForUser(userId) {
      const result = await query(db, `
        SELECT bookings.id, labs.name AS lab_name, lab_slots.starts_at, bookings.status
        FROM bookings
        JOIN lab_slots ON lab_slots.id = bookings.slot_id
        JOIN labs ON labs.id = lab_slots.lab_id
        WHERE bookings.user_id = $1
        ORDER BY lab_slots.starts_at DESC
      `, [userId]);
      return result.rows;
    },
    async cancel(id, client) {
      const result = await query(db, `
        UPDATE bookings SET status = 'cancelled'
        WHERE id = $1 AND status = 'active'
      `, [id], client);
      return result.rowCount > 0;
    }
  };
}

module.exports = {
  createPostgresUserRepository,
  createPostgresSessionRepository,
  createPostgresOAuthStateRepository,
  createPostgresLabSlotRepository,
  createPostgresBookingRepository
};

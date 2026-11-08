function createBookingRepository(db) {
  const create = db.prepare(`
    INSERT INTO bookings (user_id, slot_id)
    VALUES (?, ?)
  `);

  const findActive = db.prepare(`
    SELECT id FROM bookings
    WHERE user_id = ? AND slot_id = ? AND status = 'active'
  `);

  const findById = db.prepare(`
    SELECT id, user_id, slot_id, status FROM bookings
    WHERE id = ?
  `);

  const listForUser = db.prepare(`
    SELECT
      bookings.id,
      labs.name AS lab_name,
      lab_slots.starts_at,
      bookings.status
    FROM bookings
    JOIN lab_slots ON lab_slots.id = bookings.slot_id
    JOIN labs ON labs.id = lab_slots.lab_id
    WHERE bookings.user_id = ?
    ORDER BY lab_slots.starts_at DESC
  `);

  const cancel = db.prepare(`
    UPDATE bookings
    SET status = 'cancelled'
    WHERE id = ? AND status = 'active'
  `);

  return {
    create(userId, slotId) {
      return create.run(userId, slotId).lastInsertRowid;
    },
    findActive(userId, slotId) {
      return findActive.get(userId, slotId);
    },
    findById(id) {
      return findById.get(id);
    },
    listForUser(userId) {
      return listForUser.all(userId);
    },
    cancel(id) {
      return cancel.run(id).changes > 0;
    }
  };
}

module.exports = { createBookingRepository };

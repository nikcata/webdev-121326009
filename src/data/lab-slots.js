function createLabSlotRepository(db) {
  const insertLab = db.prepare('INSERT INTO labs (name) VALUES (?) ON CONFLICT(name) DO NOTHING');
  const findLabId = db.prepare('SELECT id FROM labs WHERE name = ?');
  const insertSlot = db.prepare(`
    INSERT INTO lab_slots (lab_id, starts_at, capacity)
    VALUES (?, ?, ?)
  `);
  const findCreatedSlot = db.prepare(`
    SELECT lab_slots.id, labs.name AS lab_name, lab_slots.starts_at,
      (lab_slots.capacity - lab_slots.reserved_seats) AS available_seats
    FROM lab_slots JOIN labs ON labs.id = lab_slots.lab_id
    WHERE lab_slots.id = ?
  `);
  const listUpcoming = db.prepare(`
    SELECT
      lab_slots.id,
      labs.name AS lab_name,
      lab_slots.starts_at,
      (lab_slots.capacity - lab_slots.reserved_seats) AS available_seats
    FROM lab_slots
    JOIN labs ON labs.id = lab_slots.lab_id
    WHERE lab_slots.starts_at > ?
    ORDER BY lab_slots.starts_at, labs.name
  `);

  const findById = db.prepare(`
    SELECT
      lab_slots.id,
      labs.name AS lab_name,
      lab_slots.starts_at,
      lab_slots.capacity,
      lab_slots.reserved_seats
    FROM lab_slots
    JOIN labs ON labs.id = lab_slots.lab_id
    WHERE lab_slots.id = ?
  `);

  const incrementReservedSeats = db.prepare(`
    UPDATE lab_slots
    SET reserved_seats = reserved_seats + 1
    WHERE id = ? AND reserved_seats < capacity
  `);

  const decrementReservedSeats = db.prepare(`
    UPDATE lab_slots
    SET reserved_seats = reserved_seats - 1
    WHERE id = ? AND reserved_seats > 0
  `);
  const createSlot = db.transaction((labName, startsAt, capacity) => {
    insertLab.run(labName);
    const lab = findLabId.get(labName);
    const result = insertSlot.run(lab.id, startsAt, capacity);
    return findCreatedSlot.get(result.lastInsertRowid);
  }).immediate;

  return {
    listUpcoming(now) {
      return listUpcoming.all(now);
    },
    findById(id) {
      return findById.get(id);
    },
    create(labName, startsAt, capacity) {
      return createSlot(labName, startsAt, capacity);
    },
    incrementReservedSeats(id) {
      return incrementReservedSeats.run(id).changes > 0;
    },
    decrementReservedSeats(id) {
      return decrementReservedSeats.run(id).changes > 0;
    }
  };
}

module.exports = { createLabSlotRepository };

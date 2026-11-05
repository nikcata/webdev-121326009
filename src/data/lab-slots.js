function createLabSlotRepository(db) {
  const listUpcoming = db.prepare(`
    SELECT
      lab_slots.id,
      labs.name AS lab_name,
      lab_slots.starts_at,
      lab_slots.capacity AS available_seats
    FROM lab_slots
    JOIN labs ON labs.id = lab_slots.lab_id
    WHERE lab_slots.starts_at > ?
    ORDER BY lab_slots.starts_at, labs.name
  `);

  return {
    listUpcoming(now) {
      return listUpcoming.all(now);
    }
  };
}

module.exports = { createLabSlotRepository };

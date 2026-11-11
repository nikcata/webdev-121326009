const assert = require('node:assert/strict');
const test = require('node:test');
const { createDatabase } = require('../src/data/database');
const { createBookingRepository } = require('../src/data/bookings');
const { createLabSlotRepository } = require('../src/data/lab-slots');
const { createLabService } = require('../src/services/labs');

function createTestService(db) {
  const labSlots = createLabSlotRepository(db);
  const bookings = createBookingRepository(db);
  return createLabService(db, labSlots, bookings);
}

test('AC-13 service refuses a full slot without writing another booking', () => {
  const db = createDatabase(':memory:');
  try {
    const userId = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('full@example.edu', 'hash').lastInsertRowid;
    const slot = db.prepare('SELECT id FROM lab_slots LIMIT 1').get();
    db.prepare('UPDATE lab_slots SET capacity = 1, reserved_seats = 1 WHERE id = ?').run(slot.id);
    const service = createTestService(db);

    const result = service.bookSlot(userId, slot.id, '2029-01-01T00:00:00.000Z');

    assert.deepEqual(result, { success: false, error: 'FULL' });
    assert.equal(db.prepare('SELECT reserved_seats FROM lab_slots WHERE id = ?').get(slot.id).reserved_seats, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 0);
  } finally {
    db.close();
  }
});

test('AC-17 service refuses to cancel another student booking without changing either record', () => {
  const db = createDatabase(':memory:');
  try {
    const ownerId = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('owner@example.edu', 'hash').lastInsertRowid;
    const otherId = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('other@example.edu', 'hash').lastInsertRowid;
    const slot = db.prepare('SELECT id FROM lab_slots LIMIT 1').get();
    db.prepare('UPDATE lab_slots SET reserved_seats = 1 WHERE id = ?').run(slot.id);
    const bookingId = db.prepare('INSERT INTO bookings (user_id, slot_id) VALUES (?, ?)').run(ownerId, slot.id).lastInsertRowid;
    const service = createTestService(db);

    const result = service.cancelBooking(otherId, bookingId, '2029-01-01T00:00:00.000Z');

    assert.deepEqual(result, { success: false, error: 'FORBIDDEN' });
    assert.equal(db.prepare('SELECT status FROM bookings WHERE id = ?').get(bookingId).status, 'active');
    assert.equal(db.prepare('SELECT reserved_seats FROM lab_slots WHERE id = ?').get(slot.id).reserved_seats, 1);
  } finally {
    db.close();
  }
});

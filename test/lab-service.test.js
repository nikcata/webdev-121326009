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

test('Exercise 4 Postgres lab service covers its transaction branches', async () => {
  const db = {
    engine: 'postgres',
    async withTransaction(callback) {
      return callback({});
    }
  };
  const slots = {
    listUpcoming: async () => [
      { id: 1, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', available_seats: 2 }
    ],
    findById: async () => ({
      id: 1,
      lab_name: 'Lab',
      starts_at: '2030-01-01T10:00:00.000Z',
      capacity: 2,
      reserved_seats: 0
    }),
    create: async () => ({ id: 1, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', available_seats: 2 }),
    incrementReservedSeats: async () => true,
    decrementReservedSeats: async () => true
  };
  const bookings = {
    findActive: async () => null,
    create: async () => 1,
    findById: async () => ({ id: 1, user_id: 1, slot_id: 1, status: 'active' }),
    cancel: async () => true,
    listForUser: async () => [{ id: 1, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', status: 'active' }]
  };
  const service = createLabService(db, slots, bookings);

  assert.equal((await service.listAvailableSlots({ labName: 'Lab' })).length, 1);
  assert.equal((await service.listAvailableSlots({ labName: 'lab' })).length, 1);
  assert.equal((await service.listAvailableSlots({})).length, 1);
  assert.equal((await service.listAvailableSlots({ date: '2030-01-01' })).length, 1);
  assert.equal((await service.listAvailableSlots({ date: '2031-01-01' })).length, 0);
  assert.equal((await service.listAvailableSlots({ labName: 'Other' })).length, 0);
  assert.equal((await service.createSlot({
    labName: 'Lab',
    startsAt: '2030-01-01T10:00:00.000Z',
    capacity: 2
  }, '2029-01-01T00:00:00.000Z')).success, true);
  assert.deepEqual(await service.createSlot({ labName: '', startsAt: '2030-01-01T10:00:00.000Z', capacity: 2 }),
    { success: false, error: 'INVALID_SLOT' });
  assert.deepEqual(await service.createSlot({ labName: 42, startsAt: '2030-01-01T10:00:00.000Z', capacity: 2 }),
    { success: false, error: 'INVALID_SLOT' });
  assert.deepEqual(await service.createSlot({ labName: 'x'.repeat(101), startsAt: '2030-01-01T10:00:00.000Z', capacity: 2 }),
    { success: false, error: 'INVALID_SLOT' });
  assert.deepEqual(await service.createSlot({ labName: 'Lab', startsAt: 42, capacity: 2 }),
    { success: false, error: 'INVALID_SLOT' });
  assert.deepEqual(await service.createSlot({ labName: 'Lab', startsAt: '2030-01-01T10:00:00.000Z', capacity: '2' }),
    { success: false, error: 'INVALID_CAPACITY' });
  assert.deepEqual(await service.createSlot({ labName: 'Lab', startsAt: '2030-01-01T10:00:00.000Z', capacity: 0 }),
    { success: false, error: 'INVALID_CAPACITY' });
  assert.deepEqual(await service.createSlot({ labName: 'Lab', startsAt: 'invalid', capacity: 2 }),
    { success: false, error: 'INVALID_SLOT' });
  assert.deepEqual(await service.createSlot({ labName: 'Lab', startsAt: '2030-01-01T10:00:00Z', capacity: 2 }),
    { success: false, error: 'INVALID_SLOT' });
  assert.deepEqual(await service.createSlot({ labName: 'Lab', startsAt: '2028-01-01T10:00:00.000Z', capacity: 2 }, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'INVALID_SLOT' });
  assert.equal((await service.bookSlot(1, 1, '2029-01-01T00:00:00.000Z')).success, true);
  assert.equal((await service.cancelBooking(1, 1, '2029-01-01T00:00:00.000Z')).success, true);
  assert.equal((await service.listMyBookings(1)).length, 1);

  slots.findById = async () => null;
  assert.deepEqual(await service.bookSlot(1, 999, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'NOT_FOUND' });
  assert.deepEqual(await service.cancelBooking(1, 999, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'NOT_FOUND' });
  bookings.findById = async () => null;
  assert.deepEqual(await service.cancelBooking(1, 999, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'NOT_FOUND' });

  slots.findById = async () => ({ id: 1, lab_name: 'Lab', starts_at: '2000-01-01T10:00:00.000Z', capacity: 2, reserved_seats: 0 });
  assert.deepEqual(await service.bookSlot(1, 1, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'PAST_SLOT' });

  slots.findById = async () => ({ id: 1, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', capacity: 1, reserved_seats: 1 });
  assert.deepEqual(await service.bookSlot(1, 1, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'FULL' });

  slots.findById = async () => ({ id: 1, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', capacity: 2, reserved_seats: 0 });
  bookings.findActive = async () => ({ id: 1 });
  assert.deepEqual(await service.bookSlot(1, 1, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'ALREADY_BOOKED' });

  bookings.findActive = async () => null;
  slots.incrementReservedSeats = async () => false;
  assert.deepEqual(await service.bookSlot(1, 1, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'FULL' });

  slots.incrementReservedSeats = async () => true;
  bookings.findById = async () => ({ id: 1, user_id: 2, slot_id: 1, status: 'active' });
  assert.deepEqual(await service.cancelBooking(1, 1, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'FORBIDDEN' });

  bookings.findById = async () => ({ id: 1, user_id: 1, slot_id: 1, status: 'cancelled' });
  assert.deepEqual(await service.cancelBooking(1, 1, '2029-01-01T00:00:00.000Z'),
    { success: true });

  bookings.findById = async () => ({ id: 1, user_id: 1, slot_id: 1, status: 'active' });
  slots.findById = async () => null;
  assert.deepEqual(await service.cancelBooking(1, 1, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'NOT_FOUND' });

  slots.findById = async () => ({ id: 1, lab_name: 'Lab', starts_at: '2000-01-01T10:00:00.000Z', capacity: 2, reserved_seats: 1 });
  assert.deepEqual(await service.cancelBooking(1, 1, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'PAST_SLOT' });

  slots.findById = async () => ({ id: 1, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', capacity: 2, reserved_seats: 1 });
  bookings.cancel = async () => false;
  assert.deepEqual(await service.cancelBooking(1, 1, '2029-01-01T00:00:00.000Z'),
    { success: true });

  bookings.cancel = async () => true;
  slots.decrementReservedSeats = async () => false;
  await assert.rejects(service.cancelBooking(1, 1, '2029-01-01T00:00:00.000Z'), /Could not release/);

  const duplicateError = Object.assign(new Error('duplicate key'), { code: '23505' });
  const duplicateDb = {
    engine: 'postgres',
    async withTransaction(callback) {
      if (callback) throw duplicateError;
    }
  };
  const duplicateService = createLabService(duplicateDb, slots, bookings);
  assert.deepEqual(await duplicateService.createSlot({
    labName: 'Lab',
    startsAt: '2031-01-01T10:00:00.000Z',
    capacity: 2
  }, '2029-01-01T00:00:00.000Z'), { success: false, error: 'DUPLICATE_SLOT' });
  assert.deepEqual(await duplicateService.bookSlot(1, 1, '2029-01-01T00:00:00.000Z'),
    { success: false, error: 'ALREADY_BOOKED' });

  const unexpectedDb = {
    engine: 'postgres',
    async withTransaction() {
      throw new Error('database unavailable');
    }
  };
  const unexpectedService = createLabService(unexpectedDb, slots, bookings);
  await assert.rejects(unexpectedService.createSlot({
    labName: 'Lab',
    startsAt: '2031-01-01T10:00:00.000Z',
    capacity: 2
  }, '2029-01-01T00:00:00.000Z'), /database unavailable/);
  await assert.rejects(unexpectedService.bookSlot(1, 1, '2029-01-01T00:00:00.000Z'),
    /database unavailable/);
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

test('Exercise 4 lab service covers validation and cancellation branches', () => {
  const db = createDatabase(':memory:');
  try {
    const service = createTestService(db);
    const slot = db.prepare('SELECT id FROM lab_slots LIMIT 1').get();

    assert.equal(service.listAvailableSlots({ labName: 'Computer Lab 1', date: '2030-05-01' }).length, 2);
    assert.deepEqual(service.createSlot({
      labName: '',
      startsAt: '2030-05-01T09:00:00.000Z',
      capacity: 1
    }, '2029-01-01T00:00:00.000Z').error, 'INVALID_SLOT');
    assert.deepEqual(service.createSlot({
      labName: 'Computer Lab 1',
      startsAt: '2030-05-01T09:00:00.000Z',
      capacity: 0
    }, '2029-01-01T00:00:00.000Z').error, 'INVALID_CAPACITY');
    assert.deepEqual(service.createSlot({
      labName: 'Computer Lab 1',
      startsAt: '2030-05-01T09:00:00.000Z',
      capacity: 1
    }, '2029-01-01T00:00:00.000Z').error, 'DUPLICATE_SLOT');
    assert.deepEqual(service.createSlot({
      labName: 'Past Lab',
      startsAt: '2020-01-01T09:00:00.000Z',
      capacity: 1
    }, '2029-01-01T00:00:00.000Z').error, 'INVALID_SLOT');
    assert.deepEqual(service.createSlot({
      labName: 42,
      startsAt: '2031-01-01T09:00:00.000Z',
      capacity: 1
    }, '2029-01-01T00:00:00.000Z').error, 'INVALID_SLOT');
    assert.deepEqual(service.createSlot({
      labName: 'Lab',
      startsAt: 42,
      capacity: 1
    }, '2029-01-01T00:00:00.000Z').error, 'INVALID_SLOT');
    assert.deepEqual(service.createSlot({
      labName: 'x'.repeat(101),
      startsAt: '2031-01-01T09:00:00.000Z',
      capacity: 1
    }, '2029-01-01T00:00:00.000Z').error, 'INVALID_SLOT');
    assert.deepEqual(service.createSlot({
      labName: 'Lab',
      startsAt: '2031-02-30T09:00:00.000Z',
      capacity: 1
    }, '2029-01-01T00:00:00.000Z').error, 'INVALID_SLOT');
    assert.deepEqual(service.createSlot({
      labName: 'Lab',
      startsAt: '2031-01-01T09:00:00Z',
      capacity: 1
    }, '2029-01-01T00:00:00.000Z').error, 'INVALID_SLOT');

    assert.deepEqual(service.bookSlot(999, 999999, '2029-01-01T00:00:00.000Z'),
      { success: false, error: 'NOT_FOUND' });
    assert.deepEqual(service.cancelBooking(999, 999999, '2029-01-01T00:00:00.000Z'),
      { success: false, error: 'NOT_FOUND' });

    db.prepare('UPDATE lab_slots SET starts_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', slot.id);
    const userId = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('past@example.edu', 'hash').lastInsertRowid;
    assert.deepEqual(service.bookSlot(userId, slot.id, '2029-01-01T00:00:00.000Z'),
      { success: false, error: 'PAST_SLOT' });
  } finally {
    db.close();
  }
});

test('Exercise 4 lab service covers duplicate, cancelled, and past cancellation states', () => {
  const db = createDatabase(':memory:');
  try {
    const service = createTestService(db);
    const userId = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('student@example.edu', 'hash').lastInsertRowid;
    const slot = db.prepare('SELECT id FROM lab_slots LIMIT 1').get();

    assert.equal(service.bookSlot(userId, slot.id, '2029-01-01T00:00:00.000Z').success, true);
    assert.deepEqual(service.bookSlot(userId, slot.id, '2029-01-01T00:00:00.000Z'),
      { success: false, error: 'ALREADY_BOOKED' });

    const booking = db.prepare('SELECT id FROM bookings WHERE user_id = ?').get(userId);
    assert.equal(service.cancelBooking(userId, booking.id, '2029-01-01T00:00:00.000Z').success, true);
    assert.equal(service.cancelBooking(userId, booking.id, '2029-01-01T00:00:00.000Z').success, true);

    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('active', booking.id);
    db.prepare('UPDATE lab_slots SET starts_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', slot.id);
    assert.deepEqual(service.cancelBooking(userId, booking.id, '2029-01-01T00:00:00.000Z'),
      { success: false, error: 'PAST_SLOT' });
  } finally {
    db.close();
  }
});

test('Exercise 4 lab service covers database constraint and seat-release fallbacks', () => {
  const db = createDatabase(':memory:');
  try {
    const slots = createLabSlotRepository(db);
    const bookings = createBookingRepository(db);
    const realService = createLabService(db, slots, bookings);

    const slot = db.prepare('SELECT id FROM lab_slots LIMIT 1').get();
    const duplicateError = { code: 'SQLITE_CONSTRAINT_UNIQUE' };
    const throwingSlots = {
      findById: slots.findById,
      incrementReservedSeats: () => true,
      decrementReservedSeats: () => false,
      create: () => { throw duplicateError; },
      listUpcoming: slots.listUpcoming
    };
    const throwingService = createLabService(db, throwingSlots, bookings);
    assert.deepEqual(throwingService.createSlot({
      labName: 'New Lab',
      startsAt: '2031-01-01T10:00:00.000Z',
      capacity: 5
    }, '2029-01-01T00:00:00.000Z'), { success: false, error: 'DUPLICATE_SLOT' });

    const duplicateSlots = {
      findById: () => ({ id: slot.id, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', capacity: 1, reserved_seats: 0 }),
      incrementReservedSeats: () => true,
      decrementReservedSeats: () => true,
      create: slots.create,
      listUpcoming: slots.listUpcoming
    };
    const duplicateBookings = {
      findActive: () => null,
      create: () => { throw duplicateError; },
      findById: () => null,
      listForUser: () => []
    };
    const duplicateService = createLabService(db, duplicateSlots, duplicateBookings);
    assert.deepEqual(duplicateService.bookSlot(1, slot.id, '2029-01-01T00:00:00.000Z'),
      { success: false, error: 'ALREADY_BOOKED' });

    const failedSqliteBookingService = createLabService(db, duplicateSlots, {
      findActive: () => null,
      create: () => { throw new Error('booking persistence failed'); },
      findById: () => null,
      listForUser: () => []
    });
    assert.throws(() => failedSqliteBookingService.bookSlot(1, slot.id, '2029-01-01T00:00:00.000Z'),
      /booking persistence failed/);

    const releaseSlots = {
      findById: () => ({ id: slot.id, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', capacity: 1, reserved_seats: 1 }),
      incrementReservedSeats: () => true,
      decrementReservedSeats: () => false,
      create: slots.create,
      listUpcoming: slots.listUpcoming
    };
    const releaseBookings = {
      findActive: () => null,
      create: () => 1,
      findById: () => ({ id: 1, user_id: 1, slot_id: slot.id, status: 'active' }),
      cancel: () => true,
      listForUser: () => []
    };
    const releaseService = createLabService(db, releaseSlots, releaseBookings);
    assert.throws(() => releaseService.cancelBooking(1, 1, '2029-01-01T00:00:00.000Z'),
      /Could not release a seat/);

    assert.equal(realService.listAvailableSlots({}).length, 4);
    assert.deepEqual(realService.listMyBookings(1), []);
    assert.equal(realService.listAvailableSlots({ labName: 'No Such Lab' }).length, 0);
    assert.equal(realService.listAvailableSlots({ date: '2030-05-99' }).length, 0);

    const fullSlots = {
      findById: () => ({ id: slot.id, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', capacity: 1, reserved_seats: 0 }),
      incrementReservedSeats: () => false,
      decrementReservedSeats: () => true,
      create: slots.create,
      listUpcoming: slots.listUpcoming
    };
    const fullService = createLabService(db, fullSlots, {
      findActive: () => null,
      create: () => 1,
      findById: () => null,
      listForUser: () => []
    });
    assert.deepEqual(fullService.bookSlot(1, slot.id, '2029-01-01T00:00:00.000Z'),
      { success: false, error: 'FULL' });

    const missingSlots = {
      findById: () => null,
      incrementReservedSeats: () => true,
      decrementReservedSeats: () => true,
      create: slots.create,
      listUpcoming: slots.listUpcoming
    };
    const missingService = createLabService(db, missingSlots, {
      findActive: () => null,
      create: () => 1,
      findById: () => ({ id: 1, user_id: 1, slot_id: 999, status: 'active' }),
      cancel: () => true,
      listForUser: () => []
    });
    assert.deepEqual(missingService.cancelBooking(1, 1, '2029-01-01T00:00:00.000Z'),
      { success: false, error: 'NOT_FOUND' });

    const noCancelService = createLabService(db, {
      findById: () => ({ id: slot.id, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', capacity: 1, reserved_seats: 1 }),
      incrementReservedSeats: () => true,
      decrementReservedSeats: () => true,
      create: slots.create,
      listUpcoming: slots.listUpcoming
    }, {
      findActive: () => null,
      create: () => 1,
      findById: () => ({ id: 1, user_id: 1, slot_id: slot.id, status: 'active' }),
      cancel: () => false,
      listForUser: () => []
    });
    assert.deepEqual(noCancelService.cancelBooking(1, 1, '2029-01-01T00:00:00.000Z'),
      { success: true });

    const unknownConstraintService = createLabService(db, {
      findById: slots.findById,
      incrementReservedSeats: () => true,
      decrementReservedSeats: () => true,
      create: () => { throw new Error('database unavailable'); },
      listUpcoming: slots.listUpcoming
    }, bookings);
    assert.throws(() => unknownConstraintService.createSlot({
      labName: 'New Lab',
      startsAt: '2031-01-01T10:00:00.000Z',
      capacity: 5
    }, '2029-01-01T00:00:00.000Z'), /database unavailable/);

    const failedBookingService = createLabService(db, {
      findById: () => ({ id: slot.id, lab_name: 'Lab', starts_at: '2030-01-01T10:00:00.000Z', capacity: 2, reserved_seats: 0 }),
      incrementReservedSeats: () => true,
      decrementReservedSeats: () => true,
      create: slots.create,
      listUpcoming: slots.listUpcoming
    }, {
      findActive: () => null,
      create: () => { throw new Error('booking persistence failed'); },
      findById: () => null,
      listForUser: () => []
    });
    assert.throws(() => failedBookingService.bookSlot(1, slot.id, '2029-01-01T00:00:00.000Z'),
      /booking persistence failed/);
  } finally {
    db.close();
  }
});

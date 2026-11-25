const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createPostgresBookingRepository,
  createPostgresLabSlotRepository,
  createPostgresOAuthStateRepository,
  createPostgresSessionRepository,
  createPostgresUserRepository
} = require('../src/data/postgres');

test('Postgres repositories use database and transaction queries for app data', async () => {
  const user = { id: 1, email: 'student@example.edu', password_hash: 'hash', google_sub: 'google-1' };
  const slot = {
    id: 2,
    lab_name: 'Computer Lab',
    starts_at: '2030-01-01T10:00:00.000Z',
    capacity: 3,
    reserved_seats: 1,
    available_seats: 2
  };
  const booking = { id: 3, user_id: 1, slot_id: 2, status: 'active' };
  const oauthState = { state: 'state', user_id: 1, flow: 'link', expires_at: 5000 };
  let rowCount = 1;
  const query = async (sql) => {
    if (sql.includes('INSERT INTO users (email, password_hash, google_sub)')) {
      return { rows: [{ ...user, google_sub: 'google-new' }], rowCount };
    }
    if (sql.includes('INSERT INTO bookings')) return { rows: [{ id: booking.id }], rowCount };
    if (sql.includes('INSERT INTO lab_slots')) return { rows: [{ id: slot.id }], rowCount };
    if (sql.includes('SELECT id FROM labs')) return { rows: [{ id: 4 }], rowCount };
    if (sql.includes('SELECT state, user_id, flow, expires_at')) return { rows: [oauthState], rowCount };
    if (sql.includes('SELECT lab_slots.id')) return { rows: [slot], rowCount };
    if (sql.includes('SELECT bookings.id')) return { rows: [booking], rowCount };
    if (sql.includes('SELECT id FROM bookings')) return { rows: [booking], rowCount };
    if (sql.includes('SELECT id, user_id, slot_id, status')) return { rows: [booking], rowCount };
    if (sql.includes('UPDATE')) return { rows: [], rowCount };
    return { rows: [user], rowCount };
  };
  const client = { query };
  const db = {
    query,
    async withTransaction(callback) {
      return callback(client);
    }
  };

  const users = createPostgresUserRepository(db);
  assert.deepEqual(await users.findByEmail(user.email), user);
  assert.deepEqual(await users.findById(user.id), user);
  assert.deepEqual(await users.findByGoogleSub(user.google_sub), user);
  assert.equal(await users.linkGoogle('google-2', user.id), true);
  rowCount = 0;
  assert.equal(await users.linkGoogle('google-2', user.id), false);
  rowCount = 1;
  assert.deepEqual(await users.create(user.email, user.password_hash), user);
  assert.deepEqual(await users.createWithGoogle(user.email, user.password_hash, 'google-new'),
    { ...user, google_sub: 'google-new' });

  const sessions = createPostgresSessionRepository(db);
  await sessions.create('hash', user.id, 5000);
  assert.deepEqual(await sessions.findUser('hash', 1000), user);
  await sessions.remove('hash');
  await sessions.removeExpired(1000);

  const states = createPostgresOAuthStateRepository(db);
  await states.create(oauthState.state, user.id, oauthState.flow, oauthState.expires_at);
  assert.deepEqual(await states.consume(oauthState.state, 1000), oauthState);

  const slots = createPostgresLabSlotRepository(db);
  assert.deepEqual(await slots.listUpcoming('2029-01-01T00:00:00.000Z'), [slot]);
  assert.deepEqual(await slots.findById(slot.id, client), slot);
  assert.deepEqual(await slots.create(slot.lab_name, slot.starts_at, slot.capacity, client), slot);
  assert.equal(await slots.incrementReservedSeats(slot.id, client), true);
  assert.equal(await slots.decrementReservedSeats(slot.id, client), true);
  rowCount = 0;
  assert.equal(await slots.incrementReservedSeats(slot.id, client), false);
  assert.equal(await slots.decrementReservedSeats(slot.id, client), false);
  rowCount = 1;

  const bookings = createPostgresBookingRepository(db);
  assert.equal(await bookings.create(user.id, slot.id, client), booking.id);
  assert.deepEqual(await bookings.findActive(user.id, slot.id, client), booking);
  assert.deepEqual(await bookings.findById(booking.id, client), booking);
  assert.deepEqual(await bookings.listForUser(user.id), [booking]);
  assert.equal(await bookings.cancel(booking.id, client), true);
  rowCount = 0;
  assert.equal(await bookings.cancel(booking.id, client), false);
});

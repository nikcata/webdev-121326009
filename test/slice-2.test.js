const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('../src/data/database');
const { createUserRepository } = require('../src/data/users');
const { createApp } = require('../src/app');

async function withServer(run) {
  const db = createDatabase(':memory:');
  const { app } = createApp({ db });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    await run({ db, origin });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    db.close();
  }
}

async function postJson(origin, path, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';', 1)[0];
}

async function signIn(origin, email, password) {
  const res = await postJson(origin, '/api/auth/login', { email, password });
  return sessionCookie(res);
}

test('AC-2 a student reserves a free seat', async () => {
  await withServer(async ({ db, origin }) => {
    const users = createUserRepository(db);
    const pass = await bcrypt.hash('pass', 12);
    users.create('student@example.edu', pass);
    const cookie = await signIn(origin, 'student@example.edu', 'pass');

    const slotsRes = await fetch(`${origin}/api/lab-slots`, { headers: { Cookie: cookie } });
    const { slots } = await slotsRes.json();
    const slot = slots[0];

    const bookRes = await postJson(origin, '/api/bookings', { slotId: slot.id }, cookie);
    assert.equal(bookRes.status, 201);
    const bookData = await bookRes.json();
    assert.equal(bookData.labName, slot.labName);

    const dbSlot = db.prepare('SELECT reserved_seats FROM lab_slots WHERE id = ?').get(slot.id);
    assert.equal(dbSlot.reserved_seats, 1);
  });
});

test('AC-3 two students try to reserve the final seat', async () => {
  await withServer(async ({ db, origin }) => {
    db.prepare('UPDATE lab_slots SET capacity = 1').run();
    const users = createUserRepository(db);
    const pass = await bcrypt.hash('pass', 12);
    users.create('s1@example.edu', pass);
    users.create('s2@example.edu', pass);

    const c1 = await signIn(origin, 's1@example.edu', 'pass');
    const c2 = await signIn(origin, 's2@example.edu', 'pass');

    const slot = db.prepare('SELECT id FROM lab_slots LIMIT 1').get();

    const r1 = await postJson(origin, '/api/bookings', { slotId: slot.id }, c1);
    const r2 = await postJson(origin, '/api/bookings', { slotId: slot.id }, c2);

    assert.equal(r1.status, 201);
    assert.equal(r2.status, 409); // Conflict/Full
    assert.equal((await r2.json()).error, 'No seats remain.');

    const dbSlot = db.prepare('SELECT reserved_seats, capacity FROM lab_slots WHERE id = ?').get(slot.id);
    assert.equal(dbSlot.reserved_seats, 1);
    assert.equal(dbSlot.reserved_seats <= dbSlot.capacity, true);
  });
});

test('AC-4 a student tries to reserve the same slot twice', async () => {
  await withServer(async ({ db, origin }) => {
    const users = createUserRepository(db);
    const pass = await bcrypt.hash('pass', 12);
    users.create('student@example.edu', pass);
    const cookie = await signIn(origin, 'student@example.edu', 'pass');

    const slot = db.prepare('SELECT id FROM lab_slots LIMIT 1').get();

    await postJson(origin, '/api/bookings', { slotId: slot.id }, cookie);
    const repeat = await postJson(origin, '/api/bookings', { slotId: slot.id }, cookie);

    assert.equal(repeat.status, 409);
    assert.equal((await repeat.json()).error, 'You already have a booking for this slot.');

    const bookings = db.prepare('SELECT COUNT(*) AS count FROM bookings WHERE user_id = (SELECT id FROM users WHERE email = ?) AND slot_id = ? AND status = \'active\'')
      .get('student@example.edu', slot.id);
    assert.equal(bookings.count, 1);
  });
});

test('AC-5 a student cancels one of their future reservations', async () => {
  await withServer(async ({ db, origin }) => {
    const users = createUserRepository(db);
    const pass = await bcrypt.hash('pass', 12);
    users.create('student@example.edu', pass);
    const cookie = await signIn(origin, 'student@example.edu', 'pass');

    const slot = db.prepare('SELECT id FROM lab_slots LIMIT 1').get();
    await postJson(origin, '/api/bookings', { slotId: slot.id }, cookie);

    const myBookings = await fetch(`${origin}/api/my-bookings`, { headers: { Cookie: cookie } });
    const { bookings } = await myBookings.json();
    const booking = bookings[0];

    const cancelRes = await postJson(origin, `/api/bookings/${booking.id}/cancel`, {}, cookie);
    assert.equal(cancelRes.status, 200);

    const dbSlot = db.prepare('SELECT reserved_seats FROM lab_slots WHERE id = ?').get(slot.id);
    assert.equal(dbSlot.reserved_seats, 0);

    const updatedBookings = await fetch(`${origin}/api/my-bookings`, { headers: { Cookie: cookie } });
    const { bookings: afterCancel } = await updatedBookings.json();
    assert.equal(afterCancel.find(b => b.id === booking.id).status, 'cancelled');
  });
});

test('AC-7 a student sees only their own reservations', async () => {
  await withServer(async ({ db, origin }) => {
    const users = createUserRepository(db);
    const pass = await bcrypt.hash('pass', 12);
    users.create('s1@example.edu', pass);
    users.create('s2@example.edu', pass);

    const c1 = await signIn(origin, 's1@example.edu', 'pass');
    const c2 = await signIn(origin, 's2@example.edu', 'pass');

    const slots = db.prepare('SELECT id FROM lab_slots LIMIT 2').all();
    await postJson(origin, '/api/bookings', { slotId: slots[0].id }, c1);
    await postJson(origin, '/api/bookings', { slotId: slots[1].id }, c2);

    const res1 = await fetch(`${origin}/api/my-bookings`, { headers: { Cookie: c1 } });
    const { bookings: b1 } = await res1.json();
    assert.equal(b1.length, 1);
    assert.equal(b1[0].labName, db.prepare('SELECT labs.name FROM labs JOIN lab_slots ON labs.id = lab_slots.lab_id WHERE lab_slots.id = ?').get(slots[0].id).name);
  });
});

test('Failure case: Reject bookings for slots that have already started', async () => {
  await withServer(async ({ db, origin }) => {
    const pastDate = '2000-01-01T00:00:00.000Z';
    db.prepare('INSERT INTO lab_slots (lab_id, starts_at, capacity) VALUES (1, ?, 10)').run(pastDate);
    const slot = db.prepare('SELECT id FROM lab_slots WHERE starts_at = ?').get(pastDate);

    const users = createUserRepository(db);
    const pass = await bcrypt.hash('pass', 12);
    users.create('student@example.edu', pass);
    const cookie = await signIn(origin, 'student@example.edu', 'pass');

    const res = await postJson(origin, '/api/bookings', { slotId: slot.id }, cookie);
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, 'Cannot book a slot that has already started.');
  });
});

test('Failure case: Reject cancellation of bookings for slots that have already started', async () => {
  await withServer(async ({ db, origin }) => {
    const users = createUserRepository(db);
    const pass = await bcrypt.hash('pass', 12);
    users.create('student@example.edu', pass);
    const userId = db.prepare('SELECT id FROM users WHERE email = \'student@example.edu\'').get().id;
    const cookie = await signIn(origin, 'student@example.edu', 'pass');

    const pastDate = '2000-01-01T00:00:00.000Z';
    db.prepare('INSERT INTO lab_slots (lab_id, starts_at, capacity, reserved_seats) VALUES (1, ?, 10, 1)').run(pastDate);
    const slot = db.prepare('SELECT id FROM lab_slots WHERE starts_at = ?').get(pastDate);
    const bookingId = db.prepare('INSERT INTO bookings (user_id, slot_id) VALUES (?, ?)').run(userId, slot.id).lastInsertRowid;

    const res = await postJson(origin, `/api/bookings/${bookingId}/cancel`, {}, cookie);
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, 'Cannot cancel a booking for a slot that has already started.');
  });
});

test('Failure case: Return HTTP 403 if a student tries to cancel another student\'s booking', async () => {
  await withServer(async ({ db, origin }) => {
    const users = createUserRepository(db);
    const pass = await bcrypt.hash('pass', 12);
    users.create('s1@example.edu', pass);
    users.create('s2@example.edu', pass);

    const userId1 = db.prepare('SELECT id FROM users WHERE email = "s1@example.edu"').get().id;
    const c2 = await signIn(origin, 's2@example.edu', 'pass');

    const slot = db.prepare('SELECT id FROM lab_slots LIMIT 1').get();
    const b1 = db.prepare('INSERT INTO bookings (user_id, slot_id) VALUES (?, ?)').run(userId1, slot.id).lastInsertRowid;

    const res = await postJson(origin, `/api/bookings/${b1}/cancel`, {}, c2);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'You cannot cancel another student\'s booking.');
  });
});

test('Failure case: Return HTTP 404 if the requested slot does not exist', async () => {
  await withServer(async ({ db, origin }) => {
    const users = createUserRepository(db);
    const pass = await bcrypt.hash('pass', 12);
    users.create('student@example.edu', pass);
    const cookie = await signIn(origin, 'student@example.edu', 'pass');

    const res = await postJson(origin, '/api/bookings', { slotId: 99999 }, cookie);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'The requested slot does not exist.');
  });
});

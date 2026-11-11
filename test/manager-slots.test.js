const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/data/database');
const { createUserRepository } = require('../src/data/users');

async function withManagerServer(run) {
  const db = createDatabase(':memory:');
  const { app } = createApp({ db, managerEmails: 'manager@example.edu' });
  const users = createUserRepository(db);
  const passwordHash = await bcrypt.hash('manager-password', 4);
  users.create('manager@example.edu', passwordHash);
  users.create('student@example.edu', passwordHash);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    await run({ db, origin });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
}

async function login(origin, email) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'manager-password' })
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';', 1)[0];
}

test('AC-6 a manager submitting zero capacity receives validation and creates no slot', async () => {
  await withManagerServer(async ({ db, origin }) => {
    const cookie = await login(origin, 'manager@example.edu');
    const before = db.prepare('SELECT COUNT(*) AS count FROM lab_slots').get().count;
    const response = await fetch(`${origin}/api/lab-slots`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labName: 'New Lab',
        startsAt: '2035-01-01T10:00:00.000Z',
        capacity: 0
      })
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /capacity/i);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM lab_slots').get().count, before);
  });
});

test('AC-6 a student cannot create a manager lab slot', async () => {
  await withManagerServer(async ({ origin }) => {
    const cookie = await login(origin, 'student@example.edu');
    const response = await fetch(`${origin}/api/lab-slots`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labName: 'New Lab',
        startsAt: '2035-01-01T10:00:00.000Z',
        capacity: 10
      })
    });
    assert.equal(response.status, 403);
  });
});

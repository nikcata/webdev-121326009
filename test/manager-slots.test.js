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
    const labId = db.prepare('SELECT id FROM labs LIMIT 1').get().id;
    const before = db.prepare('SELECT COUNT(*) AS count FROM lab_slots').get().count;
    const response = await fetch(`${origin}/api/lab-slots`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId,
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
  await withManagerServer(async ({ db, origin }) => {
    const cookie = await login(origin, 'student@example.edu');
    const labId = db.prepare('SELECT id FROM labs LIMIT 1').get().id;
    const response = await fetch(`${origin}/api/lab-slots`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId,
        startsAt: '2035-01-01T10:00:00.000Z',
        capacity: 10
      })
    });
    assert.equal(response.status, 403);
  });
});

test('AC-19 a manager adds a laboratory and creates a slot for it', async () => {
  await withManagerServer(async ({ origin }) => {
    const managerCookie = await login(origin, 'manager@example.edu');
    const createLabResponse = await fetch(`${origin}/api/labs`, {
      method: 'POST',
      headers: { Cookie: managerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Research Lab' })
    });

    assert.equal(createLabResponse.status, 201);
    const { lab } = await createLabResponse.json();
    assert.equal(lab.name, 'Research Lab');

    const duplicateResponse = await fetch(`${origin}/api/labs`, {
      method: 'POST',
      headers: { Cookie: managerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Research Lab' })
    });
    assert.equal(duplicateResponse.status, 409);

    const studentCookie = await login(origin, 'student@example.edu');
    const listResponse = await fetch(`${origin}/api/labs`, {
      headers: { Cookie: studentCookie }
    });
    assert.equal(listResponse.status, 200);
    assert.ok((await listResponse.json()).labs.some((item) => item.id === lab.id));

    const studentCreateResponse = await fetch(`${origin}/api/labs`, {
      method: 'POST',
      headers: { Cookie: studentCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauthorized Lab' })
    });
    assert.equal(studentCreateResponse.status, 403);

    const slotResponse = await fetch(`${origin}/api/lab-slots`, {
      method: 'POST',
      headers: { Cookie: managerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labId: lab.id,
        startsAt: '2035-01-01T10:00:00.000Z',
        capacity: 10
      })
    });
    assert.equal(slotResponse.status, 201);
    assert.equal((await slotResponse.json()).slot.labName, 'Research Lab');
  });
});

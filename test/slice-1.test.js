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

async function postJson(origin, path, body) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';', 1)[0];
}

test('AC-9 registration stores a salted password hash and opens availability', async () => {
  await withServer(async ({ db, origin }) => {
    const response = await postJson(origin, '/api/auth/register', {
      email: '  Student@Example.edu ',
      password: 'a-strong-password'
    });
    assert.equal(response.status, 201);
    assert.match(sessionCookie(response), /^lab_session=/);

    const user = db.prepare('SELECT email, password_hash FROM users').get();
    assert.equal(user.email, 'student@example.edu');
    assert.notEqual(user.password_hash, 'a-strong-password');
    assert.equal(await bcrypt.compare('a-strong-password', user.password_hash), true);

    const slots = await fetch(`${origin}/api/lab-slots`, {
      headers: { Cookie: sessionCookie(response) }
    });
    assert.equal(slots.status, 200);
    assert.ok((await slots.json()).slots.length > 0);
  });
});

test('AC-10 a registered student signs in and can open their bookings page', async () => {
  await withServer(async ({ db, origin }) => {
    const users = createUserRepository(db);
    users.create('student@example.edu', await bcrypt.hash('correct-password', 12));

    const anonymousSlots = await fetch(`${origin}/api/lab-slots`);
    assert.equal(anonymousSlots.status, 401);
    assert.deepEqual(await anonymousSlots.json(), { error: 'Sign in to continue.' });

    const response = await postJson(origin, '/api/auth/login', {
      email: 'student@example.edu',
      password: 'correct-password'
    });
    assert.equal(response.status, 200);
    const cookie = sessionCookie(response);
    assert.match(cookie, /^lab_session=/);

    const availability = await fetch(`${origin}/api/lab-slots`, {
      headers: { Cookie: cookie }
    });
    assert.equal(availability.status, 200);
    assert.ok((await availability.json()).slots.length > 0);

    const page = await fetch(`${origin}/my-bookings`, {
      headers: { Cookie: cookie }
    });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /My bookings/);
  });
});

test('AC-11 a wrong password does not create an authenticated session', async () => {
  await withServer(async ({ db, origin }) => {
    const users = createUserRepository(db);
    users.create('student@example.edu', await bcrypt.hash('correct-password', 12));

    const response = await postJson(origin, '/api/auth/login', {
      email: 'student@example.edu',
      password: 'wrong-password'
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'Email or password is incorrect.');
    assert.equal(response.headers.get('set-cookie'), null);

    const me = await fetch(`${origin}/api/me`);
    assert.equal(me.status, 401);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  });
});

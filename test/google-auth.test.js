const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/data/database');
const { createUserRepository } = require('../src/data/users');

function fakeGoogleClient(getProfile) {
  return {
    authorizationUrl(state) {
      return `https://accounts.google.test/authorize?state=${encodeURIComponent(state)}`;
    },
    async getVerifiedProfile() {
      return getProfile();
    }
  };
}

function stateFrom(url) {
  return new URL(url).searchParams.get('state');
}

test('AC-8 a student links verified Google sign-in and can sign in either way with one account', async () => {
  const db = createDatabase(':memory:');
  let profile = {
    subject: 'google-sub-123',
    email: 'student@example.edu',
    emailVerified: true
  };
  const { services } = createApp({ db, googleClient: fakeGoogleClient(() => profile) });
  try {
    const users = createUserRepository(db);
    users.create('student@example.edu', await bcrypt.hash('local-password', 4));
    const localSession = await services.authService.login('student@example.edu', 'local-password');

    const linkUrl = services.googleAuthService.beginLink(localSession.user.id);
    await services.googleAuthService.complete({
      code: 'fake-link-code',
      state: stateFrom(linkUrl),
      currentUser: localSession.user
    });

    const googleLoginUrl = services.googleAuthService.beginLogin();
    const googleSession = await services.googleAuthService.complete({
      code: 'fake-login-code',
      state: stateFrom(googleLoginUrl)
    });
    const localLogin = await services.authService.login('student@example.edu', 'local-password');

    assert.equal(googleSession.flow, 'login');
    assert.equal(googleSession.user.id, localSession.user.id);
    assert.equal(localLogin.user.id, localSession.user.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
    assert.equal(db.prepare('SELECT google_sub FROM users WHERE id = ?').get(localSession.user.id).google_sub, 'google-sub-123');
  } finally {
    db.close();
  }
});

test('AC-8 Google linking refuses an unverified or mismatched email without linking an account', async () => {
  const db = createDatabase(':memory:');
  let profile = {
    subject: 'unverified-sub',
    email: 'different@example.edu',
    emailVerified: false
  };
  const googleClient = fakeGoogleClient(() => profile);
  const { services } = createApp({ db, googleClient });
  try {
    const users = createUserRepository(db);
    users.create('student@example.edu', await bcrypt.hash('local-password', 4));
    const localSession = await services.authService.login('student@example.edu', 'local-password');
    const linkUrl = services.googleAuthService.beginLink(localSession.user.id);

    await assert.rejects(services.googleAuthService.complete({
      code: 'fake-code',
      state: stateFrom(linkUrl),
      currentUser: localSession.user
    }), /verified email/i);
    assert.equal(db.prepare('SELECT google_sub FROM users WHERE id = ?').get(localSession.user.id).google_sub, null);

    profile = { subject: 'mismatched-sub', email: 'different@example.edu', emailVerified: true };
    const mismatchUrl = services.googleAuthService.beginLink(localSession.user.id);
    await assert.rejects(services.googleAuthService.complete({
      code: 'fake-code',
      state: stateFrom(mismatchUrl),
      currentUser: localSession.user
    }), /must match/i);
    assert.equal(db.prepare('SELECT google_sub FROM users WHERE id = ?').get(localSession.user.id).google_sub, null);
  } finally {
    db.close();
  }
});

test('AC-8 Google HTTP link callback and sign-in reuse the existing account', async () => {
  const db = createDatabase(':memory:');
  const googleClient = fakeGoogleClient(() => ({
    subject: 'google-http-sub',
    email: 'student@example.edu',
    emailVerified: true
  }));
  const { app } = createApp({ db, googleClient });
  const users = createUserRepository(db);
  users.create('student@example.edu', await bcrypt.hash('local-password', 4));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    const localLogin = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@example.edu', password: 'local-password' })
    });
    const localCookie = localLogin.headers.get('set-cookie').split(';', 1)[0];
    const linkStart = await fetch(`${origin}/api/auth/google/link/start`, {
      headers: { Cookie: localCookie },
      redirect: 'manual'
    });
    assert.equal(linkStart.status, 302);
    const linkState = new URL(linkStart.headers.get('location')).searchParams.get('state');
    const linkCallback = await fetch(
      `${origin}/api/auth/google/callback?${new URLSearchParams({ code: 'link-code', state: linkState })}`,
      { headers: { Cookie: localCookie }, redirect: 'manual' }
    );
    assert.equal(linkCallback.status, 302);
    assert.equal(new URL(linkCallback.headers.get('location'), origin).searchParams.get('google'), 'linked');

    const googleStart = await fetch(`${origin}/api/auth/google/start`, { redirect: 'manual' });
    const loginState = new URL(googleStart.headers.get('location')).searchParams.get('state');
    const googleCallback = await fetch(
      `${origin}/api/auth/google/callback?${new URLSearchParams({ code: 'login-code', state: loginState })}`,
      { redirect: 'manual' }
    );
    assert.equal(googleCallback.status, 302);
    const googleCookie = googleCallback.headers.get('set-cookie').split(';', 1)[0];
    const currentUser = await fetch(`${origin}/api/me`, { headers: { Cookie: googleCookie } });
    assert.equal(currentUser.status, 200);
    assert.equal((await currentUser.json()).user.id, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});

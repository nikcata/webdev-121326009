const assert = require('node:assert/strict');
const test = require('node:test');
const { AuthError, createAuthService } = require('../src/services/auth');
const { GoogleOAuthError, createGoogleOAuthClient } = require('../src/services/google-oauth-client');
const { createGeminiClient } = require('../src/services/gemini-client');
const { createGoogleAuthService } = require('../src/services/google-auth');

test('Exercise 4 auth service rejects invalid input and unknown users', async () => {
  const sessions = { removeExpired() {}, create() {}, findUser() { return null; } };
  const users = { create() { return null; }, findByEmail() { return null; } };
  const auth = createAuthService({ users, sessions });

  await assert.rejects(auth.register(null, 'valid-password'), (error) =>
    error instanceof AuthError && error.status === 400);
  await assert.rejects(auth.register('student@example.edu', 'short'), (error) =>
    error instanceof AuthError && error.status === 400);
  await assert.rejects(auth.register('student@example.edu', 'valid-password'), (error) =>
    error instanceof AuthError && error.status === 409);
  await assert.rejects(auth.login('student@example.edu', 'wrong'), (error) =>
    error instanceof AuthError && error.status === 401);
  assert.equal(auth.getUserForToken(null), null);
  auth.revokeToken('');
});

test('Exercise 4 auth service covers valid session helpers', async () => {
  const tokenSessions = {
    removeExpired() {},
    create() {},
    findUser() { return { id: 1, email: 'student@example.edu' }; },
    remove() {}
  };
  const auth = createAuthService({ users: {}, sessions: tokenSessions, now: () => 1000 });
  await assert.rejects(auth.register('not-an-email', 'valid-password'), AuthError);
  await assert.rejects(auth.register(42, 'valid-password'), AuthError);
  assert.equal(auth.getUserForToken('valid-token').email, 'student@example.edu');
  assert.equal(auth.getUserForToken(''), null);
  assert.equal(auth.getUserForToken(42), null);
  const missingSyncUserAuth = createAuthService({
    users: {},
    sessions: { findUser() { return undefined; } }
  });
  assert.equal(missingSyncUserAuth.getUserForToken('expired-token'), null);
  auth.revokeToken(null);
  auth.revokeToken('');
  auth.revokeToken('valid-token');
  auth.revokeToken(42);
  const issued = await auth.issueSessionForUser({ id: 7, email: 'student@example.edu' });
  assert.equal(issued.user.email, 'student@example.edu');
  await assert.rejects(auth.login(42, 'wrong'), AuthError);
  await assert.rejects(auth.register('student@example.edu', 42), AuthError);
});

test('Exercise 4 auth login handles non-string passwords for an existing user', async () => {
  const auth = createAuthService({
    users: { findByEmail: () => ({ id: 1, email: 'student@example.edu', password_hash: 'hash' }) },
    sessions: { removeExpired() {}, create() {}, findUser() { return null; }, remove() {} }
  });
  await assert.rejects(auth.login('student@example.edu', 42), AuthError);
});

test('Exercise 4 auth service creates sessions for verified Google registrations', async () => {
  let inserted;
  const user = { id: 2, email: 'student@example.edu', google_sub: 'google-sub' };
  const auth = createAuthService({
    users: {
      async createWithGoogle(email, passwordHash, subject) {
        inserted = { email, passwordHash, subject };
        return user;
      }
    },
    sessions: {
      async removeExpired() {},
      async create() {}
    },
    now: () => 1000
  });
  const session = await auth.registerWithGoogle(' Student@Example.edu ', 'google-sub');
  assert.deepEqual(inserted.email, 'student@example.edu');
  assert.equal(inserted.subject, 'google-sub');
  assert.match(inserted.passwordHash, /^\$2/);
  assert.equal(session.user.id, user.id);

  await assert.rejects(auth.registerWithGoogle('invalid-email', 'google-sub'), AuthError);
  await assert.rejects(auth.registerWithGoogle('student@example.edu', ''), AuthError);

  const conflictAuth = createAuthService({
    users: { async createWithGoogle() { return null; } },
    sessions: {}
  });
  await assert.rejects(conflictAuth.registerWithGoogle('student@example.edu', 'google-sub'),
    (error) => error instanceof AuthError && error.status === 409);
});

test('Exercise 4 OAuth client covers configuration and provider responses', async () => {
  const unconfigured = createGoogleOAuthClient({
    clientId: '',
    clientSecret: '',
    fetchImpl: async () => ({ ok: true })
  });
  assert.throws(() => unconfigured.authorizationUrl('state'), (error) =>
    error instanceof GoogleOAuthError && error.status === 503);
  await assert.rejects(unconfigured.getVerifiedProfile('code'), GoogleOAuthError);

  const client = createGoogleOAuthClient({
    clientId: 'client',
    clientSecret: 'secret',
    redirectUri: 'https://example.com/api/auth/google/callback',
    fetchImpl: async (url) => ({
      ok: true,
      async json() {
        if (String(url).includes('/token')) return { access_token: 'token' };
        return { id: 'subject', email: 'student@example.edu', verified_email: true };
      }
    })
  });
  assert.match(client.authorizationUrl('state'), /accounts\.google\.com\/o\/oauth2/);
  assert.deepEqual(await client.getVerifiedProfile('code'), {
    subject: 'subject',
    email: 'student@example.edu',
    emailVerified: true
  });

  const failedToken = createGoogleOAuthClient({
    clientId: 'client',
    clientSecret: 'secret',
    fetchImpl: async () => ({ ok: false })
  });
  await assert.rejects(failedToken.getVerifiedProfile('code'), GoogleOAuthError);
});

test('Exercise 4 OAuth client covers empty tokens and profile failures', async () => {
  const emptyToken = createGoogleOAuthClient({
    clientId: 'client',
    clientSecret: 'secret',
    fetchImpl: async (url) => ({
      ok: true,
      async json() { return String(url).includes('/token') ? {} : {}; }
    })
  });
  await assert.rejects(emptyToken.getVerifiedProfile('code'), GoogleOAuthError);

  const badProfile = createGoogleOAuthClient({
    clientId: 'client',
    clientSecret: 'secret',
    fetchImpl: async (url) => ({
      ok: true,
      async json() {
        return String(url).includes('/token')
          ? { access_token: 'token' }
          : { id: '', email: 'student@example.edu', verified_email: true };
      }
    })
  });
  await assert.rejects(badProfile.getVerifiedProfile('code'), GoogleOAuthError);

  const failedProfile = createGoogleOAuthClient({
    clientId: 'client',
    clientSecret: 'secret',
    fetchImpl: async (url) => ({
      ok: String(url).includes('/token'),
      async json() { return { access_token: 'token' }; }
    })
  });
  await assert.rejects(failedProfile.getVerifiedProfile('code'), GoogleOAuthError);
});

test('Exercise 4 Gemini client handles missing configuration and API failures', async () => {
  const missing = createGeminiClient({ apiKey: '', fetchImpl: async () => ({ ok: true }) });
  await assert.rejects(missing.generateSummary([]), /not configured/);

  const failed = createGeminiClient({
    apiKey: 'key',
    fetchImpl: async () => ({ ok: false })
  });
  await assert.rejects(failed.generateSummary([]), /request failed/);

  const noSummary = createGeminiClient({
    apiKey: 'key',
    fetchImpl: async () => ({
      ok: true,
      async json() { return { candidates: [] }; }
    })
  });
  await assert.rejects(noSummary.generateSummary([]), /no summary/);

  const success = createGeminiClient({
    apiKey: 'key',
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { candidates: [{ content: { parts: [{ text: '{"summary":"Open","slotIds":[1]}' }] } }] };
      }
    })
  });
  assert.deepEqual(await success.generateSummary([{ id: 1 }]), { summary: 'Open', slotIds: [1] });
});

test('Exercise 4 Google auth rejects missing callbacks and invalid state', async () => {
  const google = createGoogleAuthService({
    users: {},
    authService: {},
    oauthStates: { create() {}, consume() { return null; } },
    googleClient: { authorizationUrl(state) { return `https://google.example/${state}`; } }
  });
  await assert.rejects(google.complete({ code: '', state: '' }), GoogleOAuthError);
  await assert.rejects(google.complete({ code: 'code', state: 'state' }), GoogleOAuthError);
  assert.match(google.beginLogin(), /google\.example/);
  assert.match(google.beginLink(1), /google\.example/);
});

test('Exercise 4 Google auth covers linking and login branches', async () => {
  const now = () => 1000;
  const state = { state: 'state', user_id: 1, flow: 'link', expires_at: 9999 };
  const user = { id: 1, email: 'student@example.edu', google_sub: null };
  const users = {
    findByGoogleSub() { return null; },
    findById() { return user; },
    linkGoogle() { return true; }
  };
  const google = createGoogleAuthService({
    users,
    authService: { issueSessionForUser: async () => ({ token: 'token', user }) },
    oauthStates: { create() {}, consume() { return state; } },
    googleClient: {
      authorizationUrl() { return 'https://google.example'; },
      async getVerifiedProfile() {
        return { subject: 'google-1', email: 'student@example.edu', emailVerified: true };
      }
    },
    now
  });
  assert.deepEqual(await google.complete({ code: 'code', state: 'state', currentUser: user }),
    { flow: 'link', user });

  await assert.rejects(google.complete({
    code: 'code',
    state: 'state',
    currentUser: { id: 2, email: 'other@example.edu' }
  }), GoogleOAuthError);

  const loginState = { state: 'login-state', flow: 'login' };
  const loginGoogle = createGoogleAuthService({
    users: { findByGoogleSub: () => user },
    authService: { issueSessionForUser: async () => ({ token: 'token', user }) },
    oauthStates: { create() {}, consume: () => loginState },
    googleClient: {
      authorizationUrl() { return 'https://google.example'; },
      async getVerifiedProfile() {
        return { subject: 'google-1', email: 'student@example.edu', emailVerified: true };
      }
    },
    now
  });
  assert.deepEqual(await loginGoogle.complete({ code: 'code', state: 'login-state' }), {
    flow: 'login',
    session: { token: 'token', user },
    user
  });

  const signupSession = { token: 'new-token', user: { id: 2, email: 'student@example.edu' } };
  const signupGoogle = createGoogleAuthService({
    users: { findByGoogleSub: () => null },
    authService: { registerWithGoogle: async () => signupSession },
    oauthStates: { consume: () => loginState },
    googleClient: {
      async getVerifiedProfile() {
        return { subject: 'google-1', email: 'student@example.edu', emailVerified: true };
      }
    },
    now
  });
  assert.deepEqual(await signupGoogle.complete({ code: 'code', state: 'login-state' }), {
    flow: 'login',
    session: signupSession,
    user: signupSession.user
  });

  const existingEmailGoogle = createGoogleAuthService({
    users: { findByGoogleSub: () => null },
    authService: {
      async registerWithGoogle() {
        throw new AuthError(409, 'duplicate email');
      }
    },
    oauthStates: { consume: () => loginState },
    googleClient: {
      async getVerifiedProfile() {
        return { subject: 'google-1', email: 'student@example.edu', emailVerified: true };
      }
    },
    now
  });
  await assert.rejects(existingEmailGoogle.complete({ code: 'code', state: 'login-state' }),
    (error) => error instanceof GoogleOAuthError && error.status === 409);

  const mismatchedLinkedGoogle = createGoogleAuthService({
    users: { findByGoogleSub: () => ({ id: 2, email: 'other@example.edu' }) },
    authService: {},
    oauthStates: { consume: () => loginState },
    googleClient: {
      async getVerifiedProfile() {
        return { subject: 'google-1', email: 'student@example.edu', emailVerified: true };
      }
    },
    now
  });
  await assert.rejects(mismatchedLinkedGoogle.complete({ code: 'code', state: 'login-state' }),
    (error) => error instanceof GoogleOAuthError && error.status === 401);

  for (const code of ['SQLITE_CONSTRAINT_UNIQUE', '23505']) {
    const duplicateGoogle = createGoogleAuthService({
      users: { findByGoogleSub: () => null },
      authService: {
        async registerWithGoogle() {
          throw Object.assign(new Error('duplicate subject'), { code });
        }
      },
      oauthStates: { consume: () => loginState },
      googleClient: {
        async getVerifiedProfile() {
          return { subject: 'google-1', email: 'student@example.edu', emailVerified: true };
        }
      },
      now
    });
    await assert.rejects(duplicateGoogle.complete({ code: 'code', state: 'login-state' }),
      (error) => error instanceof GoogleOAuthError && error.status === 409);
  }

  const unexpectedGoogleError = new Error('registration failed');
  const failedSignupGoogle = createGoogleAuthService({
    users: { findByGoogleSub: () => null },
    authService: { async registerWithGoogle() { throw unexpectedGoogleError; } },
    oauthStates: { consume: () => loginState },
    googleClient: {
      async getVerifiedProfile() {
        return { subject: 'google-1', email: 'student@example.edu', emailVerified: true };
      }
    },
    now
  });
  await assert.rejects(failedSignupGoogle.complete({ code: 'code', state: 'login-state' }),
    (error) => error === unexpectedGoogleError);
});

test('Exercise 4 Google auth covers verification and conflicting-link branches', async () => {
  const now = () => 1000;
  const linkState = { user_id: 1, flow: 'link' };
  const currentUser = { id: 1, email: 'student@example.edu', google_sub: null };

  const unverified = createGoogleAuthService({
    users: {},
    authService: {},
    oauthStates: { consume: () => linkState },
    googleClient: { async getVerifiedProfile() { return { subject: 'g', email: 'student@example.edu', emailVerified: false }; } },
    now
  });
  await assert.rejects(unverified.complete({ code: 'code', state: 'state', currentUser }),
    GoogleOAuthError);

  const mismatch = createGoogleAuthService({
    users: {},
    authService: {},
    oauthStates: { consume: () => linkState },
    googleClient: { async getVerifiedProfile() { return { subject: 'g', email: 'other@example.edu', emailVerified: true }; } },
    now
  });
  await assert.rejects(mismatch.complete({ code: 'code', state: 'state', currentUser }),
    GoogleOAuthError);

  const alreadyLinked = createGoogleAuthService({
    users: {
      findByGoogleSub: () => ({ id: 2, email: 'other@example.edu' }),
      findById: () => currentUser,
      linkGoogle: () => true
    },
    authService: {},
    oauthStates: { consume: () => linkState },
    googleClient: { async getVerifiedProfile() { return { subject: 'g', email: 'student@example.edu', emailVerified: true }; } },
    now
  });
  await assert.rejects(alreadyLinked.complete({ code: 'code', state: 'state', currentUser }),
    GoogleOAuthError);

  const differentLink = createGoogleAuthService({
    users: {
      findByGoogleSub: () => null,
      findById: () => ({ ...currentUser, google_sub: 'different-google-subject' }),
      linkGoogle: () => true
    },
    authService: {},
    oauthStates: { consume: () => linkState },
    googleClient: { async getVerifiedProfile() { return { subject: 'g', email: 'student@example.edu', emailVerified: true }; } },
    now
  });
  await assert.rejects(differentLink.complete({ code: 'code', state: 'state', currentUser }),
    GoogleOAuthError);

  const invalidEmail = createGoogleAuthService({
    users: {},
    authService: {},
    oauthStates: { consume: () => linkState },
    googleClient: { async getVerifiedProfile() { return { subject: 'g', email: 'not-an-email', emailVerified: true }; } },
    now
  });
  await assert.rejects(invalidEmail.complete({ code: 'code', state: 'state', currentUser }),
    GoogleOAuthError);
});

test('Exercise 4 Google auth maps a database uniqueness conflict', async () => {
  const state = { user_id: 1, flow: 'link' };
  const currentUser = { id: 1, email: 'student@example.edu', google_sub: null };
  const google = createGoogleAuthService({
    users: {
      findByGoogleSub: () => null,
      findById: () => currentUser,
      linkGoogle() {
        const error = new Error('duplicate');
        error.code = 'SQLITE_CONSTRAINT_UNIQUE';
        throw error;
      }
    },
    authService: {},
    oauthStates: { consume: () => state },
    googleClient: {
      async getVerifiedProfile() {
        return { subject: 'g', email: 'student@example.edu', emailVerified: true };
      }
    }
  });
  await assert.rejects(google.complete({ code: 'code', state: 'state', currentUser }),
    GoogleOAuthError);

  const postgresConflict = createGoogleAuthService({
    users: {
      findByGoogleSub: async () => null,
      findById: async () => currentUser,
      async linkGoogle() {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
    },
    authService: {},
    oauthStates: { consume: async () => state },
    googleClient: {
      async getVerifiedProfile() {
        return { subject: 'g', email: 'student@example.edu', emailVerified: true };
      }
    }
  });
  await assert.rejects(postgresConflict.complete({ code: 'code', state: 'state', currentUser }),
    GoogleOAuthError);
});

test('Exercise 4 async auth and Google state branches are covered', async () => {
  let removed = false;
  const auth = createAuthService({
    users: {},
    sessions: {
      removeExpired: async () => {},
      create: async () => {},
      findUser: async () => ({ id: 1, email: 'student@example.edu' }),
      remove: async () => { removed = true; }
    }
  });
  assert.equal((await auth.getUserForToken('token')).email, 'student@example.edu');
  const missingUserAuth = createAuthService({
    users: {},
    sessions: { findUser: async () => null }
  });
  assert.equal(await missingUserAuth.getUserForToken('unknown-token'), null);
  await auth.revokeToken('token');
  assert.equal(removed, true);

  const google = createGoogleAuthService({
    users: {},
    authService: {},
    oauthStates: {
      create: async () => {},
      consume: async () => null
    },
    googleClient: {
      authorizationUrl: (state) => `https://google.example/${state}`,
      getVerifiedProfile: async () => ({ subject: 'g', email: 'student@example.edu', emailVerified: true })
    }
  });
  assert.match(await google.beginLogin(), /google\.example/);
  assert.match(await google.beginLink(1), /google\.example/);
  await assert.rejects(google.complete({ code: 'code', state: 'missing' }), GoogleOAuthError);
});

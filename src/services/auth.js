const { createHash, randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw new AuthError(400, 'Enter a valid email address.');
  }
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AuthError(400, 'Enter a valid email address.');
  }
  return normalized;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createAuthService({ users, sessions, now = Date.now }) {
  async function issueSession(user) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now() + SESSION_TTL_MS;
    sessions.removeExpired(now());
    sessions.create(hashToken(token), user.id, expiresAt);
    return { token, user: { id: user.id, email: user.email } };
  }

  return {
    async register(email, password) {
      const normalizedEmail = normalizeEmail(email);
      if (typeof password !== 'string' || password.length < 8) {
        throw new AuthError(400, 'Password must be at least 8 characters.');
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = users.create(normalizedEmail, passwordHash);
      if (!user) throw new AuthError(409, 'An account with that email already exists.');
      return issueSession(user);
    },

    async login(email, password) {
      const normalizedEmail = normalizeEmail(email);
      const user = users.findByEmail(normalizedEmail);
      const passwordMatches = typeof password === 'string' && user
        ? await bcrypt.compare(password, user.password_hash)
        : false;
      if (!passwordMatches) {
        throw new AuthError(401, 'Email or password is incorrect.');
      }
      return issueSession(user);
    },

    getUserForToken(token) {
      if (typeof token !== 'string' || token.length === 0) return null;
      return sessions.findUser(hashToken(token), now()) ?? null;
    },

    revokeToken(token) {
      if (typeof token === 'string' && token.length > 0) {
        sessions.remove(hashToken(token));
      }
    }
  };
}

module.exports = { AuthError, createAuthService };

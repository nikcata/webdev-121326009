const { randomBytes } = require('node:crypto');
const { AuthError } = require('./auth');
const { GoogleOAuthError } = require('./google-oauth-client');

const STATE_TTL_MS = 10 * 60 * 1000;

function createGoogleAuthService({ users, authService, oauthStates, googleClient, now = Date.now }) {
  function begin(flow, userId = null) {
    const state = randomBytes(32).toString('base64url');
    const created = oauthStates.create(state, userId, flow, now() + STATE_TTL_MS);
    const url = googleClient.authorizationUrl(state);
    if (created && typeof created.then === 'function') {
      return created.then(() => url);
    }
    return url;
  }

  return {
    beginLogin() {
      return begin('login');
    },

    beginLink(userId) {
      return begin('link', userId);
    },

    async complete({ code, state, currentUser }) {
      if (typeof code !== 'string' || !code || typeof state !== 'string' || !state) {
        throw new GoogleOAuthError(400, 'Google callback is missing its code or state.');
      }
      const stateRecord = await oauthStates.consume(state, now());
      if (!stateRecord) {
        throw new GoogleOAuthError(400, 'Google sign-in state is invalid or expired.');
      }

      const profile = await googleClient.getVerifiedProfile(code);
      if (!profile.emailVerified) {
        throw new GoogleOAuthError(401, 'Google must provide a verified email address.');
      }
      const normalizedEmail = profile.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new GoogleOAuthError(401, 'Google returned an invalid email address.');
      }

      if (stateRecord.flow === 'link') {
        if (!currentUser || currentUser.id !== stateRecord.user_id) {
          throw new GoogleOAuthError(401, 'Sign in to the same account before linking Google.');
        }
        if (normalizedEmail !== currentUser.email.toLowerCase()) {
          throw new GoogleOAuthError(409, 'The verified Google email must match your account email.');
        }
        const linkedUser = await users.findByGoogleSub(profile.subject);
        if (linkedUser && linkedUser.id !== currentUser.id) {
          throw new GoogleOAuthError(409, 'This Google account is already linked to another student.');
        }
        const existingUser = await users.findById(currentUser.id);
        if (existingUser.google_sub && existingUser.google_sub !== profile.subject) {
          throw new GoogleOAuthError(409, 'A different Google account is already linked.');
        }
        try {
          await users.linkGoogle(profile.subject, currentUser.id);
        } catch (error) {
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
            throw new GoogleOAuthError(409, 'This Google account is already linked to another student.');
          }
          throw error;
        }
        return { flow: 'link', user: currentUser };
      }

      const user = await users.findByGoogleSub(profile.subject);
      if (user) {
        if (user.email.toLowerCase() !== normalizedEmail) {
          throw new GoogleOAuthError(401, 'This Google account is linked to a different email.');
        }
        return { flow: 'login', session: await authService.issueSessionForUser(user), user };
      }

      try {
        const session = await authService.registerWithGoogle(normalizedEmail, profile.subject);
        return { flow: 'login', session, user: session.user };
      } catch (error) {
        if (error instanceof AuthError && error.status === 409) {
          throw new GoogleOAuthError(
            409,
            'An account with this email already exists. Sign in first and link Google.'
          );
        }
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
          throw new GoogleOAuthError(409, 'This Google account is already linked to another student.');
        }
        throw error;
      }
    }
  };
}

module.exports = { createGoogleAuthService };

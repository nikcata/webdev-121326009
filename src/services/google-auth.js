const { randomBytes } = require('node:crypto');
const { GoogleOAuthError } = require('./google-oauth-client');

const STATE_TTL_MS = 10 * 60 * 1000;

function createGoogleAuthService({ users, authService, oauthStates, googleClient, now = Date.now }) {
  function begin(flow, userId = null) {
    const state = randomBytes(32).toString('base64url');
    oauthStates.create(state, userId, flow, now() + STATE_TTL_MS);
    return googleClient.authorizationUrl(state);
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
      const stateRecord = oauthStates.consume(state, now());
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
        const linkedUser = users.findByGoogleSub(profile.subject);
        if (linkedUser && linkedUser.id !== currentUser.id) {
          throw new GoogleOAuthError(409, 'This Google account is already linked to another student.');
        }
        const existingUser = users.findById(currentUser.id);
        if (existingUser.google_sub && existingUser.google_sub !== profile.subject) {
          throw new GoogleOAuthError(409, 'A different Google account is already linked.');
        }
        try {
          users.linkGoogle(profile.subject, currentUser.id);
        } catch (error) {
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            throw new GoogleOAuthError(409, 'This Google account is already linked to another student.');
          }
          throw error;
        }
        return { flow: 'link', user: currentUser };
      }

      const user = users.findByGoogleSub(profile.subject);
      if (!user || user.email.toLowerCase() !== normalizedEmail) {
        throw new GoogleOAuthError(401, 'This Google account is not linked. Sign in and link it first.');
      }
      return { flow: 'login', session: await authService.issueSessionForUser(user), user };
    }
  };
}

module.exports = { createGoogleAuthService };

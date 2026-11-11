class GoogleOAuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createGoogleOAuthClient({
  clientId = process.env.GOOGLE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_CLIENT_SECRET,
  redirectUri = new URL(
    '/api/auth/google/callback',
    process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'
  ).toString(),
  fetchImpl = fetch,
  timeoutMs = 5000
} = {}) {
  function requireConfiguration() {
    if (!clientId || !clientSecret) {
      throw new GoogleOAuthError(503, 'Google sign-in is not configured.');
    }
  }

  return {
    authorizationUrl(state) {
      requireConfiguration();
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account'
      }).toString();
      return url.toString();
    },

    async getVerifiedProfile(code) {
      requireConfiguration();
      const tokenResponse = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!tokenResponse.ok) {
        throw new GoogleOAuthError(502, 'Google could not complete sign-in.');
      }

      const tokens = await tokenResponse.json();
      if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
        throw new GoogleOAuthError(502, 'Google returned an invalid sign-in response.');
      }

      const profileResponse = await fetchImpl('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!profileResponse.ok) {
        throw new GoogleOAuthError(502, 'Google profile verification failed.');
      }

      const profile = await profileResponse.json();
      if (typeof profile.id !== 'string' || !profile.id
        || typeof profile.email !== 'string'
        || (profile.email_verified !== true && profile.verified_email !== true)) {
        throw new GoogleOAuthError(401, 'Google must provide a verified email address.');
      }
      return { subject: profile.id, email: profile.email, emailVerified: true };
    }
  };
}

module.exports = { GoogleOAuthError, createGoogleOAuthClient };

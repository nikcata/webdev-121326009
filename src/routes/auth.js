const express = require('express');
const { AuthError } = require('../services/auth');
const { GoogleAuthError } = require('../services/google-auth');
const { GoogleOAuthError } = require('../services/google-oauth-client');

const COOKIE_NAME = 'lab_session';

function cookieToken(req) {
  const cookies = req.headers.cookie ?? '';
  const entry = cookies.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return entry ? entry.slice(COOKIE_NAME.length + 1) : null;
}

function cookieOptions() {
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : [])
  ].join('; ');
}

function createAuthRouter(authService, googleAuthService) {
  const router = express.Router();
  const respondWithGoogleError = (error, res, next) => {
    if (error instanceof GoogleAuthError || error instanceof GoogleOAuthError) {
      res.status(error.status).send(error.message);
      return;
    }
    next(error);
  };

  router.post('/register', async (req, res, next) => {
    try {
      const session = await authService.register(req.body?.email, req.body?.password);
      res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${session.token}; ${cookieOptions()}`
      );
      res.status(201).json({ user: session.user });
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const session = await authService.login(req.body?.email, req.body?.password);
      res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${session.token}; ${cookieOptions()}`
      );
      res.json({ user: session.user });
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.get('/google/start', (req, res, next) => {
    try {
      res.redirect(googleAuthService.beginLogin());
    } catch (error) {
      respondWithGoogleError(error, res, next);
    }
  });

  router.get('/google/link/start', (req, res, next) => {
    const user = authService.getUserForToken(cookieToken(req));
    if (!user) {
      res.status(401).send('Sign in before linking Google.');
      return;
    }
    try {
      res.redirect(googleAuthService.beginLink(user.id));
    } catch (error) {
      respondWithGoogleError(error, res, next);
    }
  });

  router.get('/google/callback', async (req, res, next) => {
    if (req.query.error) {
      res.status(401).send('Google sign-in was not completed.');
      return;
    }
    const currentUser = authService.getUserForToken(cookieToken(req));
    try {
      const result = await googleAuthService.complete({
        code: req.query.code,
        state: req.query.state,
        currentUser
      });
      if (result.flow === 'login') {
        res.setHeader('Set-Cookie', `${COOKIE_NAME}=${result.session.token}; ${cookieOptions()}`);
        res.redirect('/?google=signed-in');
      } else {
        res.redirect('/?google=linked');
      }
    } catch (error) {
      respondWithGoogleError(error, res, next);
    }
  });

  router.post('/logout', (req, res) => {
    authService.revokeToken(cookieToken(req));
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=; ${cookieOptions()}; Max-Age=0`
    );
    res.status(204).end();
  });

  return { router, cookieToken };
}

module.exports = { COOKIE_NAME, createAuthRouter };

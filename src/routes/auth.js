const express = require('express');
const { AuthError } = require('../services/auth');

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

function createAuthRouter(authService) {
  const router = express.Router();

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

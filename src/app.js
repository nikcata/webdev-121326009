const path = require('node:path');
const express = require('express');
const { createDatabase } = require('./data/database');
const { createLabSlotRepository } = require('./data/lab-slots');
const { createBookingRepository } = require('./data/bookings');
const { createSessionRepository } = require('./data/sessions');
const { createUserRepository } = require('./data/users');
const { createAuthService } = require('./services/auth');
const { createGoogleAuthService } = require('./services/google-auth');
const { createGoogleOAuthClient } = require('./services/google-oauth-client');
const { createAvailabilitySummaryService } = require('./services/availability-summary');
const { createOAuthStateRepository } = require('./data/oauth-states');
const { createLabService } = require('./services/labs');
const { createAuthRouter, COOKIE_NAME } = require('./routes/auth');
const { createLabRouter } = require('./routes/labs');

function createApp({
  db = createDatabase(),
  googleClient,
  summaryClient,
  managerEmails = process.env.LAB_MANAGER_EMAILS ?? ''
} = {}) {
  const app = express();
  const users = createUserRepository(db);
  const sessions = createSessionRepository(db);
  const authService = createAuthService({ users, sessions });
  const googleAuthService = createGoogleAuthService({
    users,
    authService,
    oauthStates: createOAuthStateRepository(db),
    googleClient: googleClient ?? createGoogleOAuthClient()
  });
  const labSlots = createLabSlotRepository(db);
  const bookings = createBookingRepository(db);
  const labService = createLabService(db, labSlots, bookings);
  const summaryService = createAvailabilitySummaryService({
    labService,
    client: summaryClient ?? require('./services/gemini-client').createGeminiClient()
  });
  const { router: authRouter, cookieToken } = createAuthRouter(authService, googleAuthService);
  const publicDirectory = path.join(__dirname, '..', 'public');

  app.use(express.json({ limit: '16kb' }));
  app.use('/api/auth', authRouter);

  function requireUser(req, res, next) {
    const token = cookieToken(req);
    const user = authService.getUserForToken(token);
    if (!user) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    req.user = user;
    next();
  }

  const allowedManagers = new Set(managerEmails
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
  function isManager(user) {
    return allowedManagers.has(user.email.toLowerCase());
  }
  function requireManager(req, res, next) {
    if (!isManager(req.user)) {
      res.status(403).json({ error: 'Lab manager access is required.' });
      return;
    }
    next();
  }

  app.use('/api', createLabRouter({ labService, summaryService, requireUser, requireManager }));

  app.get('/api/me', requireUser, (req, res) => {
    res.json({ user: req.user, isManager: isManager(req.user) });
  });

  app.get('/my-bookings', requireUser, (req, res) => {
    res.sendFile(path.join(publicDirectory, 'my-bookings.html'));
  });

  app.use(express.static(publicDirectory));

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body must be valid JSON.' });
      return;
    }
    console.error('Unhandled application error:', error);
    res.status(500).json({ error: 'The request could not be completed.' });
  });

  return {
    app,
    db,
    services: { authService, labService, summaryService, googleAuthService }
  };
}

if (require.main === module) {
  const { app } = createApp();
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`Lab booking app listening on port ${port}`);
  });
}

module.exports = { createApp };

# Readiness report: Lab booking

## 1. Live URL and how to verify it
No public Render URL has been configured yet, so this is not live and `course.json` still has an empty `liveUrl`.

How I checked: inspected `course.json` and confirmed that no deployment address is recorded.

## 2. Environment variables
| Name | Purpose | Where the value comes from | Secret |
|---|---|---|---|
| `PORT` | HTTP listen port | Render sets it; local default is 3000 | No |
| `DATABASE_URL` | Neon/Postgres connection | Neon dashboard | Yes |
| `SESSION_SECRET` | Signs session tokens | Generated with `openssl rand -hex 32` | Yes |
| `PUBLIC_BASE_URL` | OAuth callback base URL | Render URL or local forwarded URL | No |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Google Cloud credentials | Not by itself |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Google Cloud credentials | Yes |
| `GEMINI_API_KEY` | Availability model access | Google AI Studio | Yes |
| `MODEL_NAME` | Gemini model name | Configuration; defaults to `gemini-2.5-flash` | No |
| `MCP_TOKEN` | MCP caller session token | Hosting secret | Yes |
| `LAB_MANAGER_EMAILS` | Manager allowlist | Deployment configuration | No |

How I checked: listed variables with `rg`-style repository inspection and compared them with `.env.example`.

## 3. What happens when things fail
The app has a `/health` endpoint that checks the database, an unknown-route handler that returns one JSON sentence, and an error handler that logs full errors while returning a client-safe 400 or 500 response.

How I checked: added and ran tests for `/health`, `/no-such-page`, and malformed JSON. The startup check was also run with `SESSION_SECRET=` and stopped naming `DATABASE_URL` and `SESSION_SECRET`.

The database-outage, bad-deploy rollback, live garbage-input, and live redeploy tests are not yet complete because no Neon and Render deployment exists.

## 4. Four states of one screen
The main availability screen is rendered in the browser. It has loading, content, empty, and error states in its UI code, but the production site still needs browser DevTools verification.

How I checked: the state markup and fetch paths are present in `public/app.js`; live throttling and offline checks remain pending.

## 5. Request waterfall
No production request waterfall has been measured.

How I checked: this section cannot claim numbers until the app is deployed and browser Network data is recorded.

## 6. Security basics checked
Write routes enforce authentication and several routes enforce ownership in their services. The repository secrets search found no real credential in tracked files or the sharp history search.

How I checked: ran `git grep` and `git log -p` sharp searches. Session cookies use HttpOnly and SameSite settings in `src/routes/auth.js`; live second-account and HTTPS checks remain pending.

## 7. Known gaps, ranked by risk
1. **No persistent Neon/Postgres deployment exists yet.** The app now supports Neon/Postgres in `src/data/database.js` and `src/data/postgres.js`, but no live database or Render URL has been configured. Next: enter a Neon URL into a local `.env`, run `npm run migrate`, and deploy.
2. **Render deployment, rollback evidence, live OAuth, and redeploy persistence are untested.** Next: deploy the Docker image and record commands, timing, and results.
3. **Browser states and waterfall have not been measured at production size.** Next: use DevTools Slow 4G and Offline modes and record request counts and finish time.
4. **The auth service's branch coverage is 96.43%; the overall branch gate is 99.42%.** Next: add the remaining auth branch cases before calling the gate complete.

How I checked: Docker and coverage runs were executed; Docker initially failed until native SQLite build tools were added, and the coverage gate reported uncovered service branches.

## 8. Model feature
The Gemini availability summary sends public lab and slot fields outside the app; it never sends account or booking-owner data. It is omitted or replaced by the database-backed list when the key is missing, the call times out or is rate-limited, or returned IDs are stale or invented.

How I checked: model tests use a fake client; they cover invented IDs and fallback behavior. Production cost and provider-down behavior have not been observed.

## 9. MCP
The local MCP server exposes lab-slot listing, booking, booking listing, and cancellation tools through the shared lab service. MCP callers must provide the same signed-in session represented by `MCP_TOKEN`; tools are not deployed yet.

How I checked: `npm test` runs `mcp-server/check.mjs`, and all local conformance checks pass.

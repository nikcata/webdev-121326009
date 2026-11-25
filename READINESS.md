# Readiness report: Lab booking

## 1. Live URL and how to verify it
The live Render URL is `https://labbooking1.onrender.com`. Its health endpoint and main page returned successfully during the Exercise 4 self-check; the live OAuth and booking flows have not been independently checked in this review.

How I checked: ran `node checks/ex4.mjs`; `GET /health` returned 200 and the page served HTML with a real title.

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
| `MODEL_NAME` | Gemini model name | Configuration; defaults to `gemini-3.5-flash-lite` | No |
| `MCP_TOKEN` | MCP caller session token | Hosting secret | Yes |
| `LAB_MANAGER_EMAILS` | Manager allowlist | Deployment configuration | No |

How I checked: compared the variable list with `.env.example`; Render values were reported by the user and were not read or exposed here.

## 3. What happens when things fail
The app has a `/health` endpoint that checks the database, an unknown-route handler that returns one JSON sentence, and an error handler that logs full errors while returning a client-safe 400 or 500 response.

How I checked: added and ran tests for `/health`, `/no-such-page`, and malformed JSON. The startup check was also run with `SESSION_SECRET=` and stopped naming `DATABASE_URL` and `SESSION_SECRET`.

The database-outage, bad-deploy rollback, live garbage-input, and live redeploy tests are not yet complete. The user reports a Render deployment is serving the app, but its health endpoint has not been independently checked.

## 4. Four states of one screen
The main availability screen has loading, content, empty, and error states. The current UI was exercised in Chromium locally; the empty, error, and model states used simulated responses.

How I checked: Playwright 1.65.1 drove the local app against an in-memory SQLite database; screenshots are in `docs/evidence/`. Production throttling and offline checks remain pending.
The lab/date filters and manager lab-creation controls were added after those screenshots; their API behavior is tested, but refreshed browser evidence is still pending.

## 5. Request waterfall
No production request waterfall has been measured.

How I checked: this section cannot claim numbers until the app is deployed and browser Network data is recorded.

## 6. Security basics checked
Write routes enforce authentication and several routes enforce ownership in their services. The repository secrets search found no real credential in tracked files or the sharp history search.

How I checked: ran `git grep` and `git log -p` sharp searches. Session cookies use HttpOnly and SameSite settings in `src/routes/auth.js`; live second-account and HTTPS checks remain pending.

## 7. Known gaps, ranked by risk
1. **Live user flows are incomplete.** The public page and `/health` pass, but Google OAuth, booking persistence, and redeploy behavior still need live verification. Next: test those flows without using personal accounts or changing production data unexpectedly.
2. **Production schema migration is unverified.** The app supports Neon/Postgres, but the direct `DATABASE_URL_UNPOOLED` needed by `npm run migrate` was not available in the prior setup. Next: configure it in the deployment environment and follow the approved migration process.
3. **The production request waterfall and slow/offline behavior have not been measured.** Local UI states and responsive sizes are covered in `docs/evidence/`. Next: use production DevTools at Slow 4G and Offline modes and record the request waterfall.
4. **MCP production access and OAuth account flows are not independently verified.** Next: check the deployed authorization flows and document who may call the MCP tools.
5. **UI evidence is local, not production evidence.** The checklist and screenshots cover the current code using an isolated database and simulated API errors; verify production behavior separately if needed.

How I checked: the latest `npm run coverage` passed with 100% service coverage and 87.78% overall line coverage; `npm test` passed 50 tests plus 12 MCP checks; `node checks/ex4.mjs` passed 34/34.

## 8. Model feature
The Gemini availability summary sends public lab and slot fields outside the app; it never sends account or booking-owner data. It is omitted or replaced by the database-backed list when the key is missing, the call times out or is rate-limited, or returned IDs are stale or invented. The user reports seeing a generated summary in the deployed app.

How I checked: model tests use a fake client; they cover invented IDs and fallback behavior. The user reported the deployed result; the live provider-down behavior has not been observed. Google's [pricing page](https://ai.google.dev/gemini-api/docs/pricing), checked 2026-11-25, lists standard paid pricing of $0.30 per million input tokens and $2.50 per million output tokens for Gemini 3.5 Flash-Lite. A reference call of 1,000 input and 100 output tokens would cost about $0.00055; actual cost depends on token usage. The page lists input and output as free of charge on the Free tier.

## 9. MCP
The local MCP server exposes lab-slot listing, booking, booking listing, and cancellation tools through the shared lab service. MCP callers must provide the same signed-in session represented by `MCP_TOKEN`; tools are not deployed yet.

How I checked: `npm test` runs `mcp-server/check.mjs`, and all local conformance checks pass.

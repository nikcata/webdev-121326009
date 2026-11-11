# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

## 2026-10-22 · Exercise 1 project setup
- Goal: make the repository capable of starting the MCP server via the expected npm script and record the session.
- Delegated: none
- Checkpoints: confirmed the server responds to the course check; verified the root project was missing package metadata.
- Went wrong: the project had the server implementation but no package.json, so CI and the course checks could not start it through the standard command.
- Changed by hand: added package.json with the mcp and test scripts and noted the current session in the logs.

## 2026-10-22 · MCP description experiment
- Goal: connect Gemini CLI to the local MCP server and test whether a changed tool description changes tool selection.
- Delegated: none
- Checkpoints: verified `gemini mcp list` shows `my-project` connected; interactive Gemini returned lecture 7 through the MCP tool; the local protocol self-check passes.
- Went wrong: headless token accounting was blocked by `API key not valid`, so token totals were not captured.
- Changed by hand: shortened the `find_lecture` description in `mcp-server/server.js` and wrote the experiment notes into `mcp-server/README.md`.

## 2026-10-22 · Exercise 1 transcript
- Goal: complete the missing MCP session transcript in the Exercise 1 README.
- Delegated: none
- Checkpoints: captured actual initialize, tools/list, successful lecture lookup, and invalid lecture replies from the server.
- Went wrong: none.
- Changed by hand: added the verified JSON-RPC exchange to `mcp-server/README.md` and updated this log.

## 2026-10-22 · Exercise 1 acceptance review
- Goal: check the Exercise 1 submission against the official assistant checklist.
- Delegated: none
- Checkpoints: reviewed the course checklist; the MCP self-check passed 12/12 checks.
- Went wrong: the README had the wrong lecture range and omitted the no-reply initialized notification from its transcript.
- Changed by hand: corrected the lecture range, completed the transcript, and recorded this review.

## 2026-11-05 · Exercise 2 Slice 1 implementation
- Goal: implement the approved sign-in and lab-availability slice for AC-9 through AC-11.
- Delegated: none.
- Plan: create SQLite-backed users, sessions, labs, and seeded lab slots; add email/password registration and sign-in; show the availability list and protect the bookings page; keep reservations, Google OAuth, manager tools, and model calls out of this slice.
- Checkpoints: `npm test` passed all 3 slice tests and all 12 MCP checks; `node checks/ex2.mjs` passed 32/32 checks; live smoke checks returned 200 for `/`, 401 for unauthenticated `/api/lab-slots`, `/api/me`, and `/my-bookings`.
- Went wrong: the first bookings screen can only show an empty state because booking creation belongs to a later slice. The first implementation also left the list API public, contrary to the run-through's expected sign-in gate.
- Changed by hand: added the Express app, data and service layers, responsive sign-in/availability UI, SQLite initialization, and tests named for AC-9, AC-10, and AC-11. After user approval, protected the availability API and extended AC-10's test.

## 2026-11-08 · Exercise 3 plan
Goal: a written plan for the booking feature, no code
Autonomy: the agent works alone within one step of the plan; I read the diff before every commit
Checkpoints: plan review before any further code, `npm test` green before each commit, a permission prompt for everything in "Always ask before"
Plan:
1. Add a numbered bookings migration and migration tracking in `src/data/database.js`, moving the bookings table and index out of the inline schema while preserving existing databases and booking data. Verify on a fresh database and the existing schema.
2. Complete `src/data/bookings.js`, `src/data/lab-slots.js`, and `src/services/labs.js`; keep capacity, duplicate, started-slot, and ownership rules in the transactional service layer, and add direct service tests for refusals leaving data unchanged.
3. Keep HTTP behavior in `src/routes/labs.js`: `POST /api/bookings` returns 201 on success, 401 signed out, 404 missing slot, 409 full or duplicate, and 422 for a started slot. `POST /api/bookings/:id/cancel` keeps 200 on success, 401 signed out, 403 for another owner's booking, and 404 when missing. Authentication must run before service calls; authorization remains separate.
4. Complete `public/app.js` and `public/my-bookings.html` with booking/cancellation controls and loading, empty, and readable error states; refresh availability and bookings after success.
5. Extend `test/slice-2.test.js` or add focused tests with titles naming AC-12 through AC-17. Cover service rules and real HTTP failure paths, including unchanged database state; preserve existing tests.
6. Ask before adding the booking MCP tools listed in `SPEC.md`. If approved, connect them to the same service functions and caller authorization as HTTP; keep SQL out of MCP. The unrelated model-summary feature is outside this slice.
Changed in review: none; the user approved this project-specific plan as written.
Implementation follow-up: delivered the migration, booking service/API behavior, browser booking and cancellation flows, shared-service MCP tools, and AC-12–AC-17 tests. `npm test` passes all 18 tests and the MCP protocol check passes 12/12.
Went wrong: the baseline suite exposed a test fixture using double quotes for an SQLite string; changed it to a parameterized query without weakening the assertion.
At that checkpoint, after the architecture note was added, `node checks/ex3.mjs` reported 12/18; AC-6/AC-8 and the model feature were still unimplemented.
Manual status check: exercised real HTTP requests against an isolated in-memory app; booking returned 201, a capacity conflict 409, unsigned booking 401, another student's cancellation 403, and unsigned cancellation 401. Did not start `npm start` against the persistent database.

## What the agent did that I did not ask for
- Extra implementation files: `public/my-bookings.js` separates the bookings-page behavior; `mcp-server/lab-booking-tools.js` defines the approved booking tools; `migrations/001_bookings.sql` and the migration test files implement and verify the planned migration.
- Supporting changes beyond the booking handlers: `src/app.js` exposes the shared services to the MCP process; `src/services/labs.js` and `src/routes/labs.js` add optional lab/date slot filters; `src/data/database.js` accepts `LAB_BOOKING_DB`; `mcp-server/check.mjs` sets that variable to `:memory:` so protocol checks cannot migrate the persistent local database. Kept these because the listed slot tool supports filters, HTTP and MCP must share service rules, and tests must not touch the persistent database.
- Documentation/configuration: updated the MCP README and added the `LAB_BOOKING_SESSION_TOKEN` handling note to `AGENTS.md`. `AGENTS.md` also has whitespace-only cleanup in two template lines; no behavior change.
- Dependencies and CI: no dependencies were added or removed; no CI workflow was changed.
- Tests: expanded `test/slice-2.test.js` with AC IDs and database-state assertions, and corrected the double-quoted SQLite email lookup to a parameterized query. Added direct service, MCP, and migration tests. Kept the existing assertions and added failure checks; no tests were deleted or weakened.
- Files removed: none.
- Step 10 follow-up (after user approval): added the manager email allowlist and AC-6 slot validation, verified Google OAuth code/state flow for linking an existing account by matching verified email without implicit merge, and added a Gemini availability summary with timeout, fallback, current-slot ID validation, and fake-client tests. No dependency was added, `.env` was not edited, and no live Google/Gemini provider request was made.
- Final Exercise 3 self-check: all 18/18 checks passed; `npm test` passed 27 tests and the MCP protocol checks passed 12/12.

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

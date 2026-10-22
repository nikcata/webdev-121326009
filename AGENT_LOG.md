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

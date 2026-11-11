# Lab booking · MCP server

The hand-written MCP server began in Exercise 1 and now exposes the lab-booking services as well as the original course-data tools.

## What is already here

| File | What it is |
|---|---|
| `lectures.json` | The course lectures. Your first tool reads this file. |
| `messages.jsonl` | The messages a client sends, in order, with what your server must answer. |
| `check.mjs` | The self-check. It starts your server, sends those messages and tells you what is wrong. |

## Course-data tools

1. **`find_lecture`**: everyone writes this one. Input: `number` (1 to 12). It returns the title and topics of that lecture from `lectures.json`. A number outside the range is not a crash and not a protocol error: it is a result with `isError: true` and a readable message.
2. **One of your own**: anything useful that reads local data. Give it a description a model can choose by. Every tool needs one: the self-check applies the same rule to all of them, because a description is the only thing a model reads when it decides what to call.

## Lab booking tools

- `list_lab_slots` uses the same slot-listing service as the HTTP API and can filter by lab name and date.
- `book_lab_slot`, `list_my_bookings`, and `cancel_my_booking` use the same booking service as the HTTP API.
- Authenticated calls run on behalf of the session in `MCP_TOKEN`. Set this environment variable in the MCP process configuration; do not put the token in tool arguments, source files, or logs. Without a valid token, booking and personal-booking tools return an authorization error.
- The MCP process uses the same SQLite database as the app by default. `LAB_BOOKING_DB` can point both processes at the same database. The protocol self-check sets it to `:memory:` so tests never migrate the persistent local database.

The tools call exactly the same service functions as HTTP, so they enforce the same booking, capacity, and ownership rules. MCP source must not issue its own database queries.

That is the whole design, and it is one sentence: **one set of rules, two front doors.**

Add an `mcp` script to `package.json` (`"mcp": "node mcp-server/server.js"`) so your agent, CI and the lecturer can all start the server the same way.

## Run the self-check

```bash
node mcp-server/check.mjs -- <your start command>
# for example
node mcp-server/check.mjs -- node mcp-server/server.js
node mcp-server/check.mjs -- python3 mcp-server/server.py
# once you have added the mcp script
node mcp-server/check.mjs -- npm run --silent mcp
```

It prints one line per check. Fix the failures yourself: the agent may explain a message or review your handler, but it must not write the protocol code for you.

## The description experiment
I changed the description of `find_lecture` from a detailed, task-oriented summary to a shorter and more general phrase. The model still chose the same tool when I asked “What does lecture 7 cover?”, which shows the request was specific enough to match the lecture lookup intent. I think the model is matching on the key nouns and task meaning, so the shorter description still clearly points to the lecture tool.

## How to start it

npm run --silent mcp

For authenticated booking tools, configure `MCP_TOKEN` in the MCP server process environment with a valid lab-booking session token. The token is not a tool argument and must not be committed or logged.

## Session transcript
The following JSON-RPC messages record the original Exercise 1 exchange, before the lab-booking tools were added. The server sends no reply to `notifications/initialized`.

```jsonl
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"readme-transcript","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{}},"serverInfo":{"name":"lectures","version":"0.1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"find_lecture","description":"Looks up lecture information by number in the course data.","inputSchema":{"type":"object","properties":{"number":{"type":"integer","description":"Lecture number, 1 to 12"}},"required":["number"]}},{"name":"list_messages","description":"Reads the course messages file and returns its contents as text. Use it when you need to inspect the example JSON-RPC messages provided with the exercise.","inputSchema":{"type":"object","properties":{},"required":[]}}]}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":7}}}
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"Lecture 7: Evaluating output. Topics: Non-determinism, false positives, when to trust it"}],"isError":false}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":99}}}
{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"There is no lecture 99. The course has lectures 1 to 12."}],"isError":true}}
```
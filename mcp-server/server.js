
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');

// Paths to local data files.
const lecturesPath = path.join(__dirname, 'lectures.json');
const messagesPath = path.join(__dirname, 'messages.jsonl');

// Send one JSON-RPC reply to stdout.
function send(reply) {
  process.stdout.write(JSON.stringify(reply) + '\n');
}

// Return a successful tool result containing text.
function toolResult(id, text, isError = false) {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text }],
      isError
    }
  };
}

// Decide how to respond to each incoming message.
function handle(msg) {
  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'lectures',
          version: '0.1.0'
        }
      }
    };
  }

  if (msg.method === 'notifications/initialized') {
    return null;
  }

  if (msg.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: [
          {
            name: 'find_lecture',
            description:
              'Returns the title and topics of a lecture by number. Use it to find out what a course lecture covers. Returns the lecture details as text.',
            inputSchema: {
              type: 'object',
              properties: {
                number: {
                  type: 'integer',
                  description: 'Lecture number, 1 to 12'
                }
              },
              required: ['number']
            }
          },
          {
            name: 'list_messages',
            description:
              'Reads the course messages file and returns its contents as text. Use it when you need to inspect the example JSON-RPC messages provided with the exercise.',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        ]
      }
    };
  }

  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments ?? {};

    if (name === 'find_lecture') {
      const lectures = JSON.parse(
        fs.readFileSync(lecturesPath, 'utf8')
      );

      const lecture = lectures.find(
        (item) => item.number === args.number
      );

      if (!lecture) {
        return toolResult(
          msg.id,
          `There is no lecture ${args.number}. The course has lectures 1 to 12.`,
          true
        );
      }

      const topics = Array.isArray(lecture.topics)
        ? lecture.topics.join(', ')
        : lecture.topics;

      return toolResult(
        msg.id,
        `Lecture ${lecture.number}: ${lecture.title}. Topics: ${topics}`,
        false
      );
    }

    if (name === 'list_messages') {
      const contents = fs.readFileSync(messagesPath, 'utf8');

      return toolResult(
        msg.id,
        contents.trim() || 'The messages file is empty.',
        false
      );
    }

    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: {
        code: -32602,
        message: `Unknown tool: ${name}`
      }
    };
  }

  // Unknown methods with an id receive a JSON-RPC error.
  if (msg.id !== undefined) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: {
        code: -32601,
        message: `Unknown method: ${msg.method}`
      }
    };
  }

  // Notifications do not receive replies.
  return null;
}

// Read standard input one line at a time.
const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  // Debug logs go to stderr, never stdout.
  console.error('got:', line);

  try {
    const msg = JSON.parse(line);
    const reply = handle(msg);

    if (reply !== null) {
      send(reply);
    }
  } catch (err) {
    console.error('Error processing message:', err.message);
  }
});

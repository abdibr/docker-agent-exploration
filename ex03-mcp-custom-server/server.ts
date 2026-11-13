// mcp-echo — dependency-free MCP stdio server in TypeScript.
// Transport: stdio, newline-delimited JSON (NDJSON) per MCP spec.
// Deliberately uses only "erasable" TypeScript syntax (annotations,
// interfaces, as-casts) so Node 24's default type stripping executes it
// directly: no npm install, no tsc build, no runtime deps.
// MCP protocol methods handled: initialize, notifications/initialized,
// tools/list, tools/call, ping.

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const SERVER_INFO = { name: 'mcp-echo', version: '1.0.0' };

const TOOLS: ToolDefinition[] = [
  {
    name: 'echo',
    description: 'Echoes back the given message prefixed with "ECHO:", plus the character count.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Text to echo back' }
      },
      required: ['message'],
      additionalProperties: false
    }
  }
];

function safeId(id: unknown): id is number | string | null {
  return id !== undefined;
}

function handle(req: JsonRpcRequest): JsonRpcResponse | null {
  if (!safeId(req.id)) {
    return null; // notification: no response object expected
  }
  const id: number | string | null = req.id as number | string | null;
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });
  const err = (code: number, message: string): JsonRpcResponse =>
    ({ jsonrpc: '2.0', id, error: { code, message } });

  switch (req.method) {
    case 'initialize': {
      // Reflect the client's requested protocol version when it speaks one we
      // know; else serve the spec this server implements.
      const requested = (req.params as { protocolVersion?: string } | undefined)?.protocolVersion;
      const version = requested ? requested : '2025-06-18';
      return ok({
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO
      });
    }
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = (req.params as { name?: string } | undefined)?.name;
      if (name === 'echo') {
        const message = ((req.params as { arguments?: Record<string, unknown> } | undefined)
          ?.arguments ?? {}).message;
        const text = 'ECHO: ' + String(message ?? '') + ' (' + String(message ?? '').length + ' chars)';
        return ok({ content: [{ type: 'text', text }], isError: false });
      }
      return err(-32602, 'Unknown tool: ' + String(name));
    }
    case 'ping':
      return ok({});
    default:
      return err(-32601, 'Method not found: ' + req.method);
  }
}

const rl = require('node:readline').createInterface({ input: process.stdin });

rl.on('line', (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    process.stderr.write('mcp-echo: unparseable line: ' + trimmed + '\n');
    return;
  }
  const res = handle(req);
  if (res) process.stdout.write(JSON.stringify(res) + '\n');
});

process.stderr.write('mcp-echo: ready on stdio\n');

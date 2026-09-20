import { once } from 'node:events';
import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeOllamaHandler = (req: IncomingMessage, res: ServerResponse, body: unknown) => void;

export interface FakeOllama {
  url: string;
  /** JSON bodies received on POST /api/chat. */
  chats: unknown[];
  /** How many answers the client cut before their end. */
  aborted(): number;
  close(): Promise<void>;
}

/** NDJSON lines of an answer of /api/chat, the way Ollama 0.34 sends them. */
export function chatLines(parts: string[], doneReason = 'stop'): string[] {
  const message = (content: string) => ({ role: 'assistant', content });
  return [
    ...parts.map((part) => JSON.stringify({ model: 'qwen3.5:9b', message: message(part), done: false })),
    JSON.stringify({ model: 'qwen3.5:9b', message: message(''), done: true, done_reason: doneReason, eval_count: parts.length }),
  ];
}

export const TAGS = { models: [{ name: 'qwen3.5:9b' }, { name: 'qwen3.5:4b' }, { name: 'llama3.2:latest' }] };

/** Default answers: the list of models, and an answer in two chunks for qwen3.5:9b. */
export const DEFAULT_ROUTES: Record<string, FakeOllamaHandler> = {
  'GET /api/tags': (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(TAGS));
  },
  'POST /api/chat': (_req, res, body) => {
    const model = (body as { model?: string }).model;
    if (model !== 'qwen3.5:9b') {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `model '${model}' not found` }));
      return;
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.end(`${chatLines(['Hello', ' Player.']).join('\n')}\n`);
  },
};

/** Fake Ollama server on an ephemeral port; `routes` replaces the default answers. */
export async function startFakeOllama(routes: Record<string, FakeOllamaHandler> = {}): Promise<FakeOllama> {
  const handlers = { ...DEFAULT_ROUTES, ...routes };
  const chats: unknown[] = [];
  let aborted = 0;
  const server: Server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    const body: unknown = text ? JSON.parse(text) : null;
    if (req.method === 'POST' && req.url === '/api/chat') chats.push(body);
    res.on('close', () => {
      if (!res.writableFinished) aborted += 1;
    });
    const handler = handlers[`${req.method} ${req.url}`];
    if (!handler) {
      res.statusCode = 404;
      res.end('404 page not found');
      return;
    }
    handler(req, res, body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    chats,
    aborted: () => aborted,
    async close() {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}

/** Address of a closed local port (ECONNREFUSED). */
export async function closedUrl(): Promise<string> {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, 'close');
  return `http://127.0.0.1:${port}`;
}

import { once } from 'node:events';
import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type FakeOllamaHandler = (req: IncomingMessage, res: ServerResponse, body: unknown) => void;

export interface FakeOllama {
  url: string;
  /** Corps JSON reçus sur POST /api/chat. */
  chats: unknown[];
  /** Nombre de réponses coupées par le client avant leur fin. */
  aborted(): number;
  close(): Promise<void>;
}

/** Lignes NDJSON d'une réponse de /api/chat, telles qu'Ollama 0.34 les envoie. */
export function chatLines(parts: string[], doneReason = 'stop'): string[] {
  const message = (content: string) => ({ role: 'assistant', content });
  return [
    ...parts.map((part) => JSON.stringify({ model: 'qwen3.5:9b', message: message(part), done: false })),
    JSON.stringify({ model: 'qwen3.5:9b', message: message(''), done: true, done_reason: doneReason, eval_count: parts.length }),
  ];
}

export const TAGS = { models: [{ name: 'qwen3.5:9b' }, { name: 'qwen3.5:4b' }, { name: 'llama3.2:latest' }] };

/** Réponses par défaut : liste des modèles, et une réponse en deux morceaux pour qwen3.5:9b. */
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
    res.end(`${chatLines(['Bonjour', ' Player.']).join('\n')}\n`);
  },
};

/** Faux serveur Ollama sur un port éphémère ; `routes` remplace les réponses par défaut. */
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

/** Adresse d'un port local fermé (ECONNREFUSED). */
export async function closedUrl(): Promise<string> {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, 'close');
  return `http://127.0.0.1:${port}`;
}

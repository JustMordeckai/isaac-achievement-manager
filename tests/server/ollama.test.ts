import { afterEach, describe, expect, it } from 'vitest';
import {
  fullModelName,
  listModels,
  NUM_CTX,
  NUM_PREDICT,
  OllamaError,
  openChat,
  TRUNCATED_NOTICE,
} from '../../server/advisor/ollama.ts';
import { chatLines, closedUrl, type FakeOllama, startFakeOllama } from './helpers/fake-ollama.ts';

let fake: FakeOllama | null = null;

afterEach(async () => {
  await fake?.close();
  fake = null;
});

async function collect(reply: AsyncGenerator<string>): Promise<string> {
  let text = '';
  for await (const part of reply) text += part;
  return text;
}

const USER = [{ role: 'user' as const, content: 'Salut' }];

describe('listModels', () => {
  it('liste les modèles installés, triés', async () => {
    fake = await startFakeOllama();
    expect(await listModels(fake.url)).toEqual(['llama3.2:latest', 'qwen3.5:4b', 'qwen3.5:9b']);
    expect(await listModels(`${fake.url}/`)).toHaveLength(3);
  });

  it('signale un serveur injoignable', async () => {
    const url = await closedUrl();
    const error = await listModels(url).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OllamaError);
    expect(error).toMatchObject({ kind: 'unreachable', message: `Ollama injoignable sur ${url} (ECONNREFUSED)` });
  });

  it('refuse un serveur qui n’est pas Ollama', async () => {
    fake = await startFakeOllama({
      'GET /api/tags': (_req, res) => {
        res.end('<html></html>');
      },
    });
    await expect(listModels(fake.url)).rejects.toMatchObject({
      kind: 'upstream',
      message: `Réponse inattendue de ${fake.url} : est-ce bien un serveur Ollama ?`,
    });
  });

  it('relaie une erreur HTTP d’Ollama', async () => {
    fake = await startFakeOllama({
      'GET /api/tags': (_req, res) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'disque plein' }));
      },
    });
    await expect(listModels(fake.url)).rejects.toMatchObject({ kind: 'upstream', message: 'Ollama a répondu 500 : disque plein' });
  });
});

describe('openChat', () => {
  it('envoie le modèle, le contexte forcé et le flux, puis renvoie la réponse morceau par morceau', async () => {
    fake = await startFakeOllama();
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', messages: USER, signal: new AbortController().signal });
    const parts: string[] = [];
    for await (const part of reply) parts.push(part);
    expect(parts).toEqual(['Bonjour', ' Player.']);
    expect(fake.chats).toEqual([
      { model: 'qwen3.5:9b', messages: USER, stream: true, think: false, options: { num_ctx: NUM_CTX, num_predict: NUM_PREDICT } },
    ]);
    expect(NUM_CTX).toBe(65536);
    expect(NUM_PREDICT).toBe(1500);
  });

  it('explique un modèle absent avant tout texte', async () => {
    fake = await startFakeOllama();
    await expect(
      openChat({ url: fake.url, model: 'nope:1b', messages: USER, signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      kind: 'model',
      message: 'Modèle nope:1b absent du serveur Ollama : lance « ollama pull nope:1b » sur ce serveur',
    });
  });

  it('signale un serveur injoignable', async () => {
    const url = await closedUrl();
    await expect(openChat({ url, model: 'qwen3.5:9b', messages: USER, signal: new AbortController().signal })).rejects.toMatchObject({
      kind: 'unreachable',
    });
  });

  it('remonte une erreur envoyée au milieu du flux', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.write(`${chatLines(['Début'])[0]}\n`);
        res.end(`${JSON.stringify({ error: 'out of memory' })}\n`);
      },
    });
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', messages: USER, signal: new AbortController().signal });
    const parts: string[] = [];
    const error = await (async () => {
      for await (const part of reply) parts.push(part);
    })().catch((e: unknown) => e);
    expect(parts).toEqual(['Début']);
    expect(error).toMatchObject({ kind: 'upstream', message: "Erreur d'Ollama : out of memory" });
  });

  it('signale une réponse coupée par la limite de longueur', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.end(`${chatLines(['Début'], 'length').join('\n')}\n`);
      },
    });
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', messages: USER, signal: new AbortController().signal });
    expect(await collect(reply)).toBe(`Début\n\n${TRUNCATED_NOTICE}`);
    expect(TRUNCATED_NOTICE).toBe('(Réponse coupée : limite de longueur atteinte.)');
  });

  it('signale un flux coupé avant la ligne finale', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.end(`${chatLines(['Début'])[0]}\n`);
      },
    });
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', messages: USER, signal: new AbortController().signal });
    await expect(collect(reply)).rejects.toThrow("Réponse d'Ollama interrompue avant la fin");
  });

  it('abandonne une réponse qui ne progresse plus', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.write(`${chatLines(['Début'])[0]}\n`);
      },
    });
    const reply = await openChat({
      url: fake.url,
      model: 'qwen3.5:9b',
      messages: USER,
      signal: new AbortController().signal,
      idleTimeoutMs: 100,
    });
    await expect(collect(reply)).rejects.toMatchObject({
      kind: 'timeout',
      message: 'Ollama ne répond plus (rien reçu depuis 1 s) : le serveur est peut-être occupé par une autre demande',
    });
  });

  it('coupe la requête vers Ollama quand l’appelant abandonne', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.write(`${chatLines(['Début'])[0]}\n`);
      },
    });
    const controller = new AbortController();
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', messages: USER, signal: controller.signal });
    const first = await reply.next();
    expect(first.value).toBe('Début');
    controller.abort();
    const error = await reply.next().catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(OllamaError);
    expect((error as Error).name).toBe('AbortError');
    await expect.poll(() => fake?.aborted()).toBe(1);
  });
});

describe('fullModelName', () => {
  it('ajoute l’étiquette latest quand elle manque', () => {
    expect(fullModelName('llama3.2')).toBe('llama3.2:latest');
    expect(fullModelName('qwen3.5:9b')).toBe('qwen3.5:9b');
  });
});

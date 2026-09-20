import { afterEach, describe, expect, it } from 'vitest';
import {
  fullModelName,
  listModels,
  NUM_CTX,
  NUM_PREDICT,
  OllamaError,
  openChat,
  truncatedNotice,
} from '../../server/advisor/ollama.ts';
import { t } from '../../shared/i18n/index.ts';
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
const ASK = { messages: USER, signal: new AbortController().signal, locale: 'en' as const };

describe('listModels', () => {
  it('lists the installed models, sorted', async () => {
    fake = await startFakeOllama();
    expect(await listModels(fake.url, 'en')).toEqual(['llama3.2:latest', 'qwen3.5:4b', 'qwen3.5:9b']);
    expect(await listModels(`${fake.url}/`, 'en')).toHaveLength(3);
  });

  it('reports an unreachable server', async () => {
    const url = await closedUrl();
    const error = await listModels(url, 'en').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OllamaError);
    expect(error).toMatchObject({ kind: 'unreachable', message: `Ollama unreachable at ${url} (ECONNREFUSED)` });
  });

  it('reports an unreachable server in the locale it is given', async () => {
    const url = await closedUrl();
    const error = await listModels(url, 'fr').catch((e: unknown) => e);
    expect(error).toMatchObject({ message: t('fr', 'advisor.unreachableCode', { url, code: 'ECONNREFUSED' }) });
  });

  it('refuses a server that is not Ollama', async () => {
    fake = await startFakeOllama({
      'GET /api/tags': (_req, res) => {
        res.end('<html></html>');
      },
    });
    await expect(listModels(fake.url, 'en')).rejects.toMatchObject({
      kind: 'upstream',
      message: `Unexpected answer from ${fake.url}: is it really an Ollama server?`,
    });
  });

  it('reports a server that never finishes its answer', async () => {
    fake = await startFakeOllama({
      'GET /api/tags': (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.flushHeaders();
      },
    });
    const error = await listModels(fake.url, 'en', 200).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OllamaError);
    expect(error).toMatchObject({
      kind: 'unreachable',
      message: `Ollama unreachable at ${fake.url} (no answer in 0.2 s)`,
    });
  });

  it('passes on an HTTP error from Ollama', async () => {
    fake = await startFakeOllama({
      'GET /api/tags': (_req, res) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'disk full' }));
      },
    });
    await expect(listModels(fake.url, 'en')).rejects.toMatchObject({ kind: 'upstream', message: 'Ollama answered 500: disk full' });
  });
});

describe('openChat', () => {
  it('sends the model, the forced context and the stream, then yields the answer chunk by chunk', async () => {
    fake = await startFakeOllama();
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', ...ASK });
    const parts: string[] = [];
    for await (const part of reply) parts.push(part);
    expect(parts).toEqual(['Bonjour', ' Player.']);
    expect(fake.chats).toEqual([
      { model: 'qwen3.5:9b', messages: USER, stream: true, think: false, options: { num_ctx: NUM_CTX, num_predict: NUM_PREDICT } },
    ]);
    expect(NUM_CTX).toBe(32768);
    expect(NUM_PREDICT).toBe(1500);
  });

  it('explains a missing model before any text', async () => {
    fake = await startFakeOllama();
    await expect(openChat({ url: fake.url, model: 'nope:1b', ...ASK })).rejects.toMatchObject({
      kind: 'model',
      message: 'Model nope:1b is not on the Ollama server: run "ollama pull nope:1b" there',
    });
  });

  it('reports an unreachable server', async () => {
    const url = await closedUrl();
    await expect(openChat({ url, model: 'qwen3.5:9b', ...ASK })).rejects.toMatchObject({
      kind: 'unreachable',
    });
  });

  it('does not wait forever for the body of a failing answer', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.flushHeaders();
      },
    });
    await expect(
      openChat({
        url: fake.url,
        model: 'qwen3.5:9b',
        ...ASK,
        idleTimeoutMs: 100,
      }),
    ).rejects.toMatchObject({
      kind: 'timeout',
      message: 'Ollama has gone quiet (nothing received for 1 s): the server may be busy with another request',
    });
  });

  it('refuses a line of the stream that is not an object', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.end('null\n');
      },
    });
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', ...ASK });
    await expect(collect(reply)).rejects.toMatchObject({ kind: 'upstream', message: 'Unreadable answer from Ollama' });
  });

  it('passes on an error sent in the middle of the stream', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.write(`${chatLines(['Début'])[0]}\n`);
        res.end(`${JSON.stringify({ error: 'out of memory' })}\n`);
      },
    });
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', ...ASK });
    const parts: string[] = [];
    const error = await (async () => {
      for await (const part of reply) parts.push(part);
    })().catch((e: unknown) => e);
    expect(parts).toEqual(['Début']);
    expect(error).toMatchObject({ kind: 'upstream', message: 'Ollama error: out of memory' });
  });

  it('reports an answer cut short by the length limit', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.end(`${chatLines(['Début'], 'length').join('\n')}\n`);
      },
    });
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', ...ASK });
    expect(await collect(reply)).toBe('Début\n\n(Answer cut short: length limit reached.)');
    expect(truncatedNotice('en')).toBe('(Answer cut short: length limit reached.)');
  });

  it('appends the notice in the locale it is given', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.end(`${chatLines(['Début'], 'length').join('\n')}\n`);
      },
    });
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', ...ASK, locale: 'fr' });
    expect(await collect(reply)).toBe(`Début\n\n${t('fr', 'advisor.truncated')}`);
  });

  it('reports a stream cut before its final line', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.end(`${chatLines(['Début'])[0]}\n`);
      },
    });
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', ...ASK });
    await expect(collect(reply)).rejects.toThrow('Ollama answer cut off before the end');
  });

  it('gives up on an answer that stops progressing', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.write(`${chatLines(['Début'])[0]}\n`);
      },
    });
    const reply = await openChat({
      url: fake.url,
      model: 'qwen3.5:9b',
      ...ASK,
      idleTimeoutMs: 100,
    });
    await expect(collect(reply)).rejects.toMatchObject({
      kind: 'timeout',
      message: 'Ollama has gone quiet (nothing received for 1 s): the server may be busy with another request',
    });
  });

  it('cuts the request to Ollama when the caller gives up', async () => {
    fake = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.write(`${chatLines(['Début'])[0]}\n`);
      },
    });
    const controller = new AbortController();
    const reply = await openChat({ url: fake.url, model: 'qwen3.5:9b', ...ASK, signal: controller.signal });
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
  it('adds the latest tag when it is missing', () => {
    expect(fullModelName('llama3.2')).toBe('llama3.2:latest');
    expect(fullModelName('qwen3.5:9b')).toBe('qwen3.5:9b');
  });
});

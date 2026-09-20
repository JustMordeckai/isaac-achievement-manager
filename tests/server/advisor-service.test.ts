import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAdvisorRequest, parseOllamaSettings } from '../../server/advisor/request.ts';
import { createAdvisorService } from '../../server/advisor/service.ts';
import { t } from '../../shared/i18n/index.ts';
import type { OllamaSettings } from '../../shared/types.ts';
import { closedUrl, type FakeOllama, startFakeOllama, TAGS } from './helpers/fake-ollama.ts';

let fake: FakeOllama | null = null;

afterEach(async () => {
  await fake?.close();
  fake = null;
});

const MODELS = TAGS.models.map((m) => m.name).sort();

describe('createAdvisorService', () => {
  it('gives the state of the server and of the model', async () => {
    fake = await startFakeOllama();
    const service = createAdvisorService({ settings: { url: fake.url, model: 'qwen3.5:9b' }, save: vi.fn() });
    expect(await service.status('en')).toEqual({ state: 'ok', url: fake.url, model: 'qwen3.5:9b', models: MODELS });
  });

  it('recognizes a model with no tag', async () => {
    fake = await startFakeOllama();
    const service = createAdvisorService({ settings: { url: fake.url, model: 'llama3.2' }, save: vi.fn() });
    expect((await service.status('en')).state).toBe('ok');
  });

  it('reports a missing model and an unreachable server', async () => {
    fake = await startFakeOllama();
    const missing = createAdvisorService({ settings: { url: fake.url, model: 'mistral:7b' }, save: vi.fn() });
    expect(await missing.status('en')).toEqual({
      state: 'error',
      url: fake.url,
      model: 'mistral:7b',
      models: MODELS,
      message: 'Model mistral:7b is not on the Ollama server: run "ollama pull mistral:7b" there',
    });
    const url = await closedUrl();
    const offline = createAdvisorService({ settings: { url, model: 'qwen3.5:9b' }, save: vi.fn() });
    expect(await offline.status('en')).toEqual({
      state: 'absent',
      url,
      model: 'qwen3.5:9b',
      models: [],
      message: `Ollama unreachable at ${url} (ECONNREFUSED)`,
    });
  });

  it('reports a missing model in the locale it is given', async () => {
    fake = await startFakeOllama();
    const service = createAdvisorService({ settings: { url: fake.url, model: 'mistral:7b' }, save: vi.fn() });
    expect((await service.status('fr')).message).toBe(t('fr', 'advisor.modelMissing', { model: 'mistral:7b' }));
  });

  it('saves then applies new settings', async () => {
    fake = await startFakeOllama();
    const url = await closedUrl();
    const save = vi.fn(async (_settings: OllamaSettings) => {});
    const service = createAdvisorService({ settings: { url, model: 'qwen3.5:9b' }, save });
    const status = await service.configure({ url: fake.url, model: 'qwen3.5:9b' }, 'en');
    expect(save).toHaveBeenCalledWith({ url: fake.url, model: 'qwen3.5:9b' });
    expect(status.state).toBe('ok');
    const reply = await service.chat([{ role: 'user', content: 'Salut' }], new AbortController().signal, 'en');
    let text = '';
    for await (const part of reply) text += part;
    expect(text).toBe('Bonjour Player.');
  });

  it('keeps the previous settings when the write fails', async () => {
    fake = await startFakeOllama();
    const save = vi.fn(async () => {
      throw new Error('disk full');
    });
    const service = createAdvisorService({ settings: { url: fake.url, model: 'qwen3.5:9b' }, save });
    await expect(service.configure({ url: 'http://10.0.0.9:11434', model: 'qwen3.5:4b' }, 'en')).rejects.toThrow('disk full');
    expect(await service.status('en')).toMatchObject({ state: 'ok', url: fake.url, model: 'qwen3.5:9b' });
  });
});

describe('parseAdvisorRequest', () => {
  const valid = { question: '  Which run should I do?  ', history: [], profile: 'me', slot: null };

  it('accepts a question with its history', () => {
    const history = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hello!' },
    ];
    expect(parseAdvisorRequest({ ...valid, history, slot: 2 }, 'en')).toEqual({
      question: 'Which run should I do?',
      history,
      profile: 'me',
      slot: 2,
    });
  });

  it.each([
    [null, 'A JSON body is required'],
    [[], 'A JSON body is required'],
    [{ ...valid, question: '   ' }, 'Empty question'],
    [{ ...valid, question: 'x'.repeat(2001) }, 'Question too long (2000 characters at most)'],
    [{ ...valid, history: 'no' }, 'Invalid history (10 messages at most)'],
    [{ ...valid, history: Array.from({ length: 11 }, () => ({ role: 'user', content: 'x' })) }, 'Invalid history (10 messages at most)'],
    [{ ...valid, history: [{ role: 'system', content: 'x' }] }, 'Invalid history message (4000 characters at most)'],
    [{ ...valid, history: [{ role: 'user', content: 'x'.repeat(4001) }] }, 'Invalid history message (4000 characters at most)'],
    [{ ...valid, profile: '' }, 'Invalid profile'],
    [{ ...valid, slot: 4 }, 'Invalid slot parameter (1 to 3)'],
    [{ ...valid, slot: '1' }, 'Invalid slot parameter (1 to 3)'],
  ])('refuses an invalid body (%#)', (body, message) => {
    expect(() => parseAdvisorRequest(body, 'en')).toThrow(message);
  });

  it('refuses an invalid body in the locale it is given', () => {
    expect(() => parseAdvisorRequest({ ...valid, question: '   ' }, 'fr')).toThrow(t('fr', 'advisor.questionEmpty'));
  });
});

describe('parseOllamaSettings', () => {
  it('cleans valid settings and refuses the others', () => {
    expect(parseOllamaSettings({ url: 'http://10.0.0.5:11434/', model: ' qwen3.5:4b ' }, 'en')).toEqual({
      url: 'http://10.0.0.5:11434',
      model: 'qwen3.5:4b',
    });
    expect(() => parseOllamaSettings({ url: 'nas:11434', model: 'qwen3.5:4b' }, 'en')).toThrow(
      'Invalid Ollama address (http://host:port expected)',
    );
    expect(() => parseOllamaSettings({ url: 'http://nas:11434', model: '' }, 'en')).toThrow('Invalid model name');
    expect(() => parseOllamaSettings('x', 'en')).toThrow('A JSON body is required');
  });
});

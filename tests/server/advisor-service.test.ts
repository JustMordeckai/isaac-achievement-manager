import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAdvisorRequest, parseOllamaSettings } from '../../server/advisor/request.ts';
import { createAdvisorService } from '../../server/advisor/service.ts';
import type { OllamaSettings } from '../../shared/types.ts';
import { closedUrl, type FakeOllama, startFakeOllama, TAGS } from './helpers/fake-ollama.ts';

let fake: FakeOllama | null = null;

afterEach(async () => {
  await fake?.close();
  fake = null;
});

const MODELS = TAGS.models.map((m) => m.name).sort();

describe('createAdvisorService', () => {
  it('donne l’état du serveur et du modèle', async () => {
    fake = await startFakeOllama();
    const service = createAdvisorService({ settings: { url: fake.url, model: 'qwen3.5:9b' }, save: vi.fn() });
    expect(await service.status()).toEqual({ state: 'ok', url: fake.url, model: 'qwen3.5:9b', models: MODELS });
  });

  it('reconnaît un modèle sans étiquette', async () => {
    fake = await startFakeOllama();
    const service = createAdvisorService({ settings: { url: fake.url, model: 'llama3.2' }, save: vi.fn() });
    expect((await service.status()).state).toBe('ok');
  });

  it('signale un modèle absent et un serveur injoignable', async () => {
    fake = await startFakeOllama();
    const missing = createAdvisorService({ settings: { url: fake.url, model: 'mistral:7b' }, save: vi.fn() });
    expect(await missing.status()).toEqual({
      state: 'error',
      url: fake.url,
      model: 'mistral:7b',
      models: MODELS,
      message: 'Modèle mistral:7b absent du serveur Ollama : lance « ollama pull mistral:7b » sur ce serveur',
    });
    const url = await closedUrl();
    const offline = createAdvisorService({ settings: { url, model: 'qwen3.5:9b' }, save: vi.fn() });
    expect(await offline.status()).toEqual({
      state: 'absent',
      url,
      model: 'qwen3.5:9b',
      models: [],
      message: `Ollama injoignable sur ${url} (ECONNREFUSED)`,
    });
  });

  it('enregistre puis applique de nouveaux réglages', async () => {
    fake = await startFakeOllama();
    const url = await closedUrl();
    const save = vi.fn(async (_settings: OllamaSettings) => {});
    const service = createAdvisorService({ settings: { url, model: 'qwen3.5:9b' }, save });
    const status = await service.configure({ url: fake.url, model: 'qwen3.5:9b' });
    expect(save).toHaveBeenCalledWith({ url: fake.url, model: 'qwen3.5:9b' });
    expect(status.state).toBe('ok');
    const reply = await service.chat([{ role: 'user', content: 'Salut' }], new AbortController().signal);
    let text = '';
    for await (const part of reply) text += part;
    expect(text).toBe('Bonjour Player.');
  });

  it('garde les anciens réglages si l’écriture échoue', async () => {
    fake = await startFakeOllama();
    const save = vi.fn(async () => {
      throw new Error('disque plein');
    });
    const service = createAdvisorService({ settings: { url: fake.url, model: 'qwen3.5:9b' }, save });
    await expect(service.configure({ url: 'http://10.0.0.9:11434', model: 'qwen3.5:4b' })).rejects.toThrow('disque plein');
    expect(await service.status()).toMatchObject({ state: 'ok', url: fake.url, model: 'qwen3.5:9b' });
  });
});

describe('parseAdvisorRequest', () => {
  const valid = { question: '  Quelle run faire ?  ', history: [], profile: 'me', slot: null };

  it('accepte une question avec son historique', () => {
    const history = [
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Bonjour !' },
    ];
    expect(parseAdvisorRequest({ ...valid, history, slot: 2 })).toEqual({
      question: 'Quelle run faire ?',
      history,
      profile: 'me',
      slot: 2,
    });
  });

  it.each([
    [null, 'Corps JSON attendu'],
    [[], 'Corps JSON attendu'],
    [{ ...valid, question: '   ' }, 'Question vide'],
    [{ ...valid, question: 'x'.repeat(2001) }, 'Question trop longue (2000 caractères au plus)'],
    [{ ...valid, history: 'non' }, 'Historique invalide (10 messages au plus)'],
    [{ ...valid, history: Array.from({ length: 11 }, () => ({ role: 'user', content: 'x' })) }, 'Historique invalide (10 messages au plus)'],
    [{ ...valid, history: [{ role: 'system', content: 'x' }] }, "Message d'historique invalide (8000 caractères au plus)"],
    [{ ...valid, history: [{ role: 'user', content: 'x'.repeat(8001) }] }, "Message d'historique invalide (8000 caractères au plus)"],
    [{ ...valid, profile: '' }, 'Profil invalide'],
    [{ ...valid, slot: 4 }, 'Paramètre slot invalide (1 à 3)'],
    [{ ...valid, slot: '1' }, 'Paramètre slot invalide (1 à 3)'],
  ])('refuse un corps invalide (%#)', (body, message) => {
    expect(() => parseAdvisorRequest(body)).toThrow(message);
  });
});

describe('parseOllamaSettings', () => {
  it('nettoie des réglages valides et refuse les autres', () => {
    expect(parseOllamaSettings({ url: 'http://10.0.0.5:11434/', model: ' qwen3.5:4b ' })).toEqual({
      url: 'http://10.0.0.5:11434',
      model: 'qwen3.5:4b',
    });
    expect(() => parseOllamaSettings({ url: 'nas:11434', model: 'qwen3.5:4b' })).toThrow(
      'Adresse Ollama invalide (attendu : http://hôte:port)',
    );
    expect(() => parseOllamaSettings({ url: 'http://nas:11434', model: '' })).toThrow('Nom de modèle invalide');
    expect(() => parseOllamaSettings('x')).toThrow('Corps JSON attendu');
  });
});

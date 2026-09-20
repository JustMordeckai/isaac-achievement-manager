import { once } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../shared/i18n/index.ts';
import type { AdvisorStatus, KbStatus, SettingsInfo, WikiSyncEvent } from '../../shared/types.ts';
import { type AdvisorService, createAdvisorService } from '../../server/advisor/service.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { HttpError } from '../../server/http-error.ts';
import type { KbService } from '../../server/kb-service.ts';
import { mergeProgress } from '../../server/sources/progress.ts';
import { ProfileError } from '../../server/sources/steam-profile.ts';
import type { KnowledgeBase } from '../../server/wiki/kb-types.ts';
import { chatLines, closedUrl, type FakeOllama, startFakeOllama } from './helpers/fake-ollama.ts';
import { ME_ID64, OTHER_ID64 } from './helpers/fixtures.ts';
import { testKnowledgeBase } from './helpers/kb.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';
import { removeDir } from './helpers/steam-dir.ts';

const merged = mergeProgress(fixtureMergeInput());
const ABSENT: KbStatus = { state: 'absent', syncedAt: null, running: false };
const SETTINGS: SettingsInfo = {
  port: 5250,
  dataDir: 'C:\\iam\\data',
  steamPath: 'C:\\Steam',
  account: { accountId: 123456789, steamId64: ME_ID64, personaName: 'Player' },
  forcedAccountId: null,
  locale: 'en',
};

function fakeKb(kb: KnowledgeBase | null = null, overrides: Partial<KbService> = {}): KbService {
  return {
    get: vi.fn(async () => kb),
    status: vi.fn(async () => (kb ? { state: 'ok', syncedAt: kb.syncedAt, running: false } : ABSENT) satisfies KbStatus),
    isRunning: vi.fn(() => false),
    sync: vi.fn(async () => {
      throw new Error('not simulated');
    }),
    ...overrides,
  };
}

const ADVISOR_OK: AdvisorStatus = { state: 'ok', url: 'http://127.0.0.1:11434', model: 'qwen3.5:9b', models: ['qwen3.5:9b'] };

function fakeAdvisor(overrides: Partial<AdvisorService> = {}): AdvisorService {
  return {
    status: vi.fn(async () => ADVISOR_OK),
    configure: vi.fn(async () => ADVISOR_OK),
    chat: vi.fn(async () => {
      throw new Error('not simulated');
    }),
    ...overrides,
  };
}

let server: Server | null = null;

afterEach(async () => {
  if (server) {
    server.close();
    await once(server, 'close');
    server = null;
  }
  vi.restoreAllMocks();
});

async function start(overrides: Partial<AppDeps> = {}): Promise<string> {
  const app = createApp({
    progress: { get: vi.fn(async () => merged) },
    profiles: {
      getStats: vi.fn(),
      resolve: vi.fn(async () => ({ steamId64: ME_ID64, name: 'Player' })),
    },
    icons: { get: vi.fn(async () => new Uint8Array([0xff, 0xd8])) },
    kb: fakeKb(),
    advisor: fakeAdvisor(),
    settings: SETTINGS,
    ...overrides,
  });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function requestWithHost(port: number, hostHeader: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/status', headers: { Host: hostHeader } },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('API', () => {
  it('blocks a disallowed host and lets 127.0.0.1 and localhost through', async () => {
    const base = await start();
    const { port } = new URL(base);
    const evil = await requestWithHost(Number(port), 'evil.example:5250');
    expect(evil.status).toBe(403);
    expect(evil.body).toEqual({ error: 'Host not allowed' });
    const local = await requestWithHost(Number(port), `localhost:${port}`);
    expect(local.status).toBe(200);
  });

  it('answers /api/ping without depending on the progress sources', async () => {
    const base = await start({ progress: { get: vi.fn(() => new Promise<never>(() => {})) } });
    const res = await fetch(`${base}/api/ping`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: 'isaac-achievement-manager' });
  });

  it('serves the default profile\'s progress', async () => {
    const get = vi.fn(async () => merged);
    const base = await start({ progress: { get } });
    const res = await fetch(`${base}/api/progress`);
    expect(res.status).toBe(200);
    expect((await res.json()).unlocked).toBe(125);
    expect(get).toHaveBeenCalledWith('me', null, 'en');
  });

  it('passes through the requested profile and slot', async () => {
    const get = vi.fn(async () => merged);
    const base = await start({ progress: { get } });
    const res = await fetch(`${base}/api/achievements?profile=${OTHER_ID64}&slot=2`);
    expect(await res.json()).toHaveLength(641);
    expect(get).toHaveBeenCalledWith(OTHER_ID64, 2, 'en');
  });

  it('refuses an invalid slot, in the reader\'s language', async () => {
    const base = await start();
    for (const slot of ['9', '0', 'abc', '1.5']) {
      const res = await fetch(`${base}/api/progress?slot=${slot}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid slot parameter (1 to 3)' });
    }
    const frBase = await start({ settings: { ...SETTINGS, locale: 'fr' } });
    const frRes = await fetch(`${frBase}/api/progress?slot=9`);
    expect(frRes.status).toBe(400);
    expect(await frRes.json()).toEqual({ error: 'Paramètre slot invalide (1 à 3)' });
  });

  it('returns the status of HttpError', async () => {
    const base = await start({
      progress: {
        get: vi.fn(async () => {
          throw new HttpError(404, 'No account');
        }),
      },
    });
    const res = await fetch(`${base}/api/progress`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'No account' });
  });

  it('returns 500 for an unexpected error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = await start({
      progress: {
        get: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    });
    const res = await fetch(`${base}/api/achievements`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'boom' });
    expect(logged).toHaveBeenCalled();
  });

  it('exposes the sources status', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/status`)).json()).toEqual({
      app: 'isaac-achievement-manager',
      sources: merged.summary.sources,
      wiki: ABSENT,
    });
  });

  it('exposes a status without sources when the progress fails', async () => {
    const base = await start({
      progress: {
        get: vi.fn(async () => {
          throw new HttpError(404, 'No account');
        }),
      },
    });
    const res = await fetch(`${base}/api/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: 'isaac-achievement-manager', sources: null, wiki: ABSENT });
  });

  it('resolves a profile', async () => {
    const resolve = vi.fn(async () => ({ steamId64: ME_ID64, name: 'Player' }));
    const base = await start({ profiles: { getStats: vi.fn(), resolve } });
    const res = await fetch(`${base}/api/profile/resolve?input=${encodeURIComponent('https://steamcommunity.com/id/JustMordeckai/')}`);
    expect(await res.json()).toEqual({ steamId64: ME_ID64, name: 'Player' });
    expect(resolve).toHaveBeenCalledWith('https://steamcommunity.com/id/JustMordeckai/', 'en');
  });

  it('translates profile errors', async () => {
    const resolve = vi.fn(async () => {
      throw new ProfileError('notFound', 'Steam profile not found');
    });
    const base = await start({ profiles: { getStats: vi.fn(), resolve } });
    const res = await fetch(`${base}/api/profile/resolve?input=unknown`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Steam profile not found' });
  });

  it('answers 400 to an unrecognized profile input', async () => {
    const resolve = vi.fn(async () => {
      throw new ProfileError('input', 'Unrecognized input');
    });
    const base = await start({ profiles: { getStats: vi.fn(), resolve } });
    const res = await fetch(`${base}/api/profile/resolve?input=${encodeURIComponent('not a profile !')}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unrecognized input' });
  });

  it('serves the icons', async () => {
    const get = vi.fn(async () => new Uint8Array([0xff, 0xd8]));
    const base = await start({ icons: { get } });
    const file = 'a36d7e92df7e991758907a75dfa55d36b52548c4.jpg';
    const res = await fetch(`${base}/api/icons/${file}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('max-age=604800');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8]));
    expect(get).toHaveBeenCalledWith(file, 'en');
  });

  it('relays the refusal of an icon name', async () => {
    const base = await start({
      icons: {
        get: vi.fn(async () => {
          throw new HttpError(400, 'Invalid icon name');
        }),
      },
    });
    const res = await fetch(`${base}/api/icons/bad.png`);
    expect(res.status).toBe(400);
  });

  it('stops the server only with the dedicated header', async () => {
    const onShutdown = vi.fn();
    const base = await start({ onShutdown });
    const refused = await fetch(`${base}/api/shutdown`, { method: 'POST' });
    expect(refused.status).toBe(403);
    expect(onShutdown).not.toHaveBeenCalled();
    const accepted = await fetch(`${base}/api/shutdown`, { method: 'POST', headers: { 'X-IAM-Action': 'shutdown' } });
    expect(await accepted.json()).toEqual({ ok: true });
    await vi.waitFor(() => expect(onShutdown).toHaveBeenCalledTimes(1));
  });

  it('answers 404 to an unconfigured shutdown and to unknown routes', async () => {
    const base = await start();
    const shutdown = await fetch(`${base}/api/shutdown`, { method: 'POST', headers: { 'X-IAM-Action': 'shutdown' } });
    expect(shutdown.status).toBe(404);
    const unknown = await fetch(`${base}/api/nope`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'Unknown API route' });
  });

  it('exposes the detected settings', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/settings`)).json()).toEqual(SETTINGS);
  });

  it('saves the requested locale with the dedicated header', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'iam-settings-'));
    try {
      const base = await start({ settings: { ...SETTINGS, dataDir: dir } });
      const post = (body: unknown, headers: Record<string, string> = { 'X-IAM-Action': 'settings' }) =>
        fetch(`${base}/api/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body),
        });
      const refused = await post({ locale: 'fr' }, {});
      expect(refused.status).toBe(403);
      const invalid = await post({ locale: 'de' });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({ error: 'Unknown language: de' });
      const saved = await post({ locale: 'fr' });
      expect(saved.status).toBe(200);
      expect((await saved.json()).locale).toBe('fr');
      expect(JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf8'))).toEqual({ locale: 'fr' });
      // The saved locale applies at once, without a restart: the error message follows.
      const stillInvalid = await post({ locale: 'de' });
      expect(await stillInvalid.json()).toEqual({ error: 'Langue inconnue : de' });
    } finally {
      removeDir(dir);
    }
  });

  it('refuses a settings body that is not a JSON object', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = await start();
    const res = await fetch(`${base}/api/settings`, { method: 'POST', headers: { 'X-IAM-Action': 'settings' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A JSON body is required' });
    expect(logged).not.toHaveBeenCalled();
  });
});

describe('API wiki', () => {
  it('exposes the wiki database state', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/wiki/status`)).json()).toEqual(ABSENT);
  });

  it('enriches the achievement list with the wiki database', async () => {
    const base = await start({ kb: fakeKb(await testKnowledgeBase()) });
    const list = await (await fetch(`${base}/api/achievements`)).json();
    expect(list[8]).toMatchObject({ id: 9, name: 'The Nail', how: 'mark', character: 'azazel' });
  });

  it('leaves the list unenriched when the database is absent', async () => {
    const base = await start();
    const list = await (await fetch(`${base}/api/achievements`)).json();
    expect(list[8]).toMatchObject({ id: 9, how: null, character: null });
  });

  it('serves an achievement card with its state for the requested profile', async () => {
    const kb = await testKnowledgeBase();
    const get = vi.fn(async () => merged);
    const base = await start({ progress: { get }, kb: fakeKb(kb) });
    const res = await fetch(`${base}/api/achievement/70?profile=${OTHER_ID64}&slot=1`);
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(get).toHaveBeenCalledWith(OTHER_ID64, 1, 'en');
    expect(card.achievement).toMatchObject({ id: 70, how: 'mark', character: 'isaac' });
    expect(card.wiki).toMatchObject({ name: "Isaac's Head", unlocks: { kind: 'trinket', name: "Isaac's Head" } });
    expect(card.kb).toEqual({ state: 'ok', syncedAt: kb.syncedAt, running: false });
    expect(card.plan.requirements).toEqual([{ anyOf: [{ id: 4, name: 'The Womb' }], met: true }]);
    expect(card.plan.runs).toEqual([
      {
        id: 'isaac-1',
        character: 'isaac',
        mode: 'hard',
        endings: ['bossRush', 'momsHeart', 'satan', 'lamb', 'megaSatan', 'delirium'],
        minutes: 85,
        blocked: false,
        preparation: false,
      },
    ]);
  });

  it('gives the requirements of a character achievement in the card', async () => {
    const base = await start({ kb: fakeKb(await testKnowledgeBase()) });
    const card = await (await fetch(`${base}/api/achievement/491`)).json();
    // #491: The Beast with Tainted Isaac.
    expect(card.plan.requirements).toEqual([
      { anyOf: [{ id: 474, name: 'The Broken' }], met: false },
      { anyOf: [{ id: 635, name: 'A Strange Door' }], met: false },
      { anyOf: [{ id: 57, name: 'The Polaroid' }, { id: 78, name: 'The Negative' }], met: true },
    ]);
    expect(card.plan.runs).toEqual([
      {
        id: 'taintedIsaac-5',
        character: 'taintedIsaac',
        mode: 'normal',
        endings: ['beast'],
        minutes: 60,
        blocked: true,
        preparation: false,
      },
    ]);
  });

  it('serves a card without a wiki part when the database is absent', async () => {
    const base = await start();
    const card = await (await fetch(`${base}/api/achievement/9`)).json();
    expect(card).toMatchObject({ achievement: { id: 9, how: null }, wiki: null, kb: ABSENT, plan: null });
  });

  it('serves the route plan of the requested profile', async () => {
    const get = vi.fn(async () => merged);
    const base = await start({ progress: { get }, kb: fakeKb(await testKnowledgeBase()) });
    const res = await fetch(`${base}/api/routes?profile=me&slot=1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(get).toHaveBeenCalledWith('me', 1, 'en');
    expect(body.kb.state).toBe('ok');
    expect(body.plan.marksSource).toBe('save');
    expect(body.plan.characters).toHaveLength(34);
    expect(body.plan.runs[0]).toMatchObject({ id: 'magdalene-1', mode: 'hard', minutes: 97 });
    expect(body.plan.offRoute.redKey).toBe(false);
  });

  it('serves an empty plan when the database is absent', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/routes`)).json()).toEqual({ kb: ABSENT, plan: null });
    expect((await fetch(`${base}/api/routes?slot=9`)).status).toBe(400);
  });

  it('refuses an invalid or unknown id', async () => {
    const base = await start();
    const invalid = await fetch(`${base}/api/achievement/abc`);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Invalid achievement id' });
    const unknown = await fetch(`${base}/api/achievement/9999`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'Achievement #9999 unknown' });
  });

  it('streams the sync as NDJSON, with the dedicated header', async () => {
    const report = {
      achievements: 641,
      pages: 1,
      missingPages: [],
      unknownTemplates: {},
      miscCount: 0,
      otherUnlockCount: 0,
      cachedPages: 0,
    };
    const sync = vi.fn(async (onEvent: (event: WikiSyncEvent) => void) => {
      onEvent({ step: 'core', done: 0, total: 1, message: 'start' });
      onEvent({ step: 'done', done: 1, total: 1, message: 'Sync complete', report });
      return report;
    });
    const base = await start({ kb: fakeKb(null, { sync }) });

    const refused = await fetch(`${base}/api/wiki/sync`, { method: 'POST' });
    expect(refused.status).toBe(403);
    expect(sync).not.toHaveBeenCalled();

    const res = await fetch(`${base}/api/wiki/sync`, { method: 'POST', headers: { 'X-IAM-Action': 'wiki-sync' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8');
    const lines = (await res.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { step: 'core', done: 0, total: 1, message: 'start' },
      { step: 'done', done: 1, total: 1, message: 'Sync complete', report },
    ]);
  });

  it('ends the stream after a failed sync', async () => {
    const sync = vi.fn(async (onEvent: (event: WikiSyncEvent) => void) => {
      onEvent({ step: 'error', done: 0, total: 1, message: 'wiki unreachable' });
      throw new Error('wiki unreachable');
    });
    const base = await start({ kb: fakeKb(null, { sync }) });
    const res = await fetch(`${base}/api/wiki/sync`, { method: 'POST', headers: { 'X-IAM-Action': 'wiki-sync' } });
    expect((await res.text()).trim()).toBe(JSON.stringify({ step: 'error', done: 0, total: 1, message: 'wiki unreachable' }));
  });

  it('answers 409 when a sync is already running', async () => {
    const base = await start({ kb: fakeKb(null, { isRunning: vi.fn(() => true) }) });
    const res = await fetch(`${base}/api/wiki/sync`, { method: 'POST', headers: { 'X-IAM-Action': 'wiki-sync' } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'A wiki sync is already running' });
  });
});

describe('API advisor', () => {
  let ollama: FakeOllama | null = null;

  afterEach(async () => {
    await ollama?.close();
    ollama = null;
  });

  async function startWithOllama(overrides: Partial<AppDeps> = {}, model = 'qwen3.5:9b') {
    ollama ??= await startFakeOllama();
    const advisor = createAdvisorService({ settings: { url: ollama.url, model }, save: vi.fn(async () => {}) });
    return start({ advisor, kb: fakeKb(await testKnowledgeBase()), ...overrides });
  }

  const ask = (base: string, body: unknown, headers: Record<string, string> = { 'X-IAM-Action': 'advisor' }) =>
    fetch(`${base}/api/advisor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  const lines = async (res: Response) =>
    (await res.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

  const QUESTION = { question: 'How do I get The Nail (#9)?', history: [], profile: 'me', slot: null };

  it('exposes the advisor status', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/advisor/status`)).json()).toEqual(ADVISOR_OK);
  });

  it('saves the Ollama settings with the dedicated header', async () => {
    const configure = vi.fn(async () => ADVISOR_OK);
    const base = await start({ advisor: fakeAdvisor({ configure }) });
    const post = (body: unknown, headers: Record<string, string> = { 'X-IAM-Action': 'advisor-settings' }) =>
      fetch(`${base}/api/advisor/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const refused = await post({ url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' }, {});
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'X-IAM-Action header required: advisor-settings' });
    const invalid = await post({ url: 'nas', model: 'qwen3.5:4b' });
    expect(invalid.status).toBe(400);
    expect(configure).not.toHaveBeenCalled();
    const saved = await post({ url: 'http://10.0.0.5:11434/', model: 'qwen3.5:4b' });
    expect(await saved.json()).toEqual(ADVISOR_OK);
    expect(configure).toHaveBeenCalledWith({ url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' }, 'en');
  });

  it('refuses a question with no header, unreadable, invalid or too large', async () => {
    const base = await start();
    const refused = await ask(base, QUESTION, {});
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'X-IAM-Action header required: advisor' });
    const unreadable = await ask(base, '{"question":');
    expect(unreadable.status).toBe(400);
    expect(await unreadable.json()).toEqual({ error: 'Unreadable JSON body' });
    const empty = await ask(base, { ...QUESTION, question: ' ' });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: 'Empty question' });
    const hugeBody = { ...QUESTION, history: [{ role: 'user', content: 'x'.repeat(300_000) }] };
    const huge = await ask(base, hugeBody);
    expect(huge.status).toBe(413);
    expect(await huge.json()).toEqual({ error: 'Request body too large' });
    // The header is checked before the body is read.
    expect((await ask(base, hugeBody, {})).status).toBe(403);
  });

  it('refuses a question in the language of the settings', async () => {
    const frBase = await start({ settings: { ...SETTINGS, locale: 'fr' } });
    const empty = await ask(frBase, { ...QUESTION, question: ' ' });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: t('fr', 'advisor.questionEmpty') });
  });

  it('streams the consulted cards then Ollama\'s reply', async () => {
    const get = vi.fn(async () => merged);
    const base = await startWithOllama({ progress: { get } });
    const history = [
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Bonjour !' },
    ];
    const res = await ask(base, { ...QUESTION, history, profile: OTHER_ID64, slot: 2 });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8');
    expect(await lines(res)).toEqual([
      { kind: 'context', sources: [{ id: 9, name: 'The Nail' }] },
      { kind: 'delta', text: 'Bonjour' },
      { kind: 'delta', text: ' Player.' },
      { kind: 'done' },
    ]);
    expect(get).toHaveBeenCalledWith(OTHER_ID64, 2, 'en');
    const [chat] = ollama?.chats as Array<{ messages: Array<{ role: string; content: string }> }>;
    expect(chat.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(chat.messages[0].content).toContain('#9 The Nail: missing');
    expect(chat.messages.slice(1).map((m) => m.content)).toEqual(['Bonjour', 'Bonjour !', 'How do I get The Nail (#9)?']);
  });

  it('warns the model when the wiki database is missing', async () => {
    const base = await startWithOllama({ kb: fakeKb() });
    const [context] = await lines(await ask(base, QUESTION));
    expect(context).toEqual({ kind: 'context', sources: [{ id: 9, name: 'The Nail' }] });
    const [chat] = ollama?.chats as Array<{ messages: Array<{ content: string }> }>;
    expect(chat.messages[0].content).toContain('Wiki base missing');
  });

  it('answers 503 when Ollama is unreachable', async () => {
    const url = await closedUrl();
    const base = await start({ advisor: createAdvisorService({ settings: { url, model: 'qwen3.5:9b' }, save: vi.fn() }) });
    const res = await ask(base, QUESTION);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: `Ollama unreachable at ${url} (ECONNREFUSED)` });
  });

  it('answers 502 when the model is missing', async () => {
    const base = await startWithOllama({}, 'mistral:7b');
    const res = await ask(base, QUESTION);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'Model mistral:7b is not on the Ollama server: run "ollama pull mistral:7b" there',
    });
  });

  it('answers 504 when Ollama does not respond', async () => {
    ollama = await startFakeOllama({
      'POST /api/chat': () => {
        // No response: the server is busy.
      },
    });
    const advisor = createAdvisorService({ settings: { url: ollama.url, model: 'qwen3.5:9b' }, save: vi.fn(), idleTimeoutMs: 100 });
    const base = await start({ advisor, kb: fakeKb(await testKnowledgeBase()) });
    const res = await ask(base, QUESTION);
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/^Ollama has gone quiet \(nothing received for 1 s\)/);
  });

  it('ends the stream with the error sent by Ollama mid-flight', async () => {
    ollama = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.write(`${chatLines(['Début'])[0]}\n`);
        res.end(`${JSON.stringify({ error: 'out of memory' })}\n`);
      },
    });
    const base = await startWithOllama();
    expect((await lines(await ask(base, QUESTION))).slice(1)).toEqual([
      { kind: 'delta', text: 'Début' },
      { kind: 'error', message: 'Ollama error: out of memory' },
    ]);
  });

  it('cuts the generation when the browser gives up', async () => {
    ollama = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.write(`${chatLines(['Début'])[0]}\n`);
      },
    });
    const base = await startWithOllama();
    const controller = new AbortController();
    const res = await fetch(`${base}/api/advisor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-IAM-Action': 'advisor' },
      body: JSON.stringify(QUESTION),
      signal: controller.signal,
    });
    await res.body?.getReader().read();
    controller.abort();
    await expect.poll(() => ollama?.aborted()).toBe(1);
  });

  it('does not open a generation when the client gives up while the progress is loading', async () => {
    let resolveProgress!: () => void;
    const progressDone = new Promise<void>((resolve) => {
      resolveProgress = resolve;
    });
    const get = vi.fn(async () => {
      await progressDone;
      return merged;
    });
    const base = await startWithOllama({ progress: { get } });
    const closed = new Promise<void>((resolve) => {
      server?.once('connection', (socket) => socket.once('close', () => resolve()));
    });
    const controller = new AbortController();
    const pending = fetch(`${base}/api/advisor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-IAM-Action': 'advisor' },
      body: JSON.stringify(QUESTION),
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toThrow();
    await closed;
    resolveProgress();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ollama?.chats).toHaveLength(0);
  });
});

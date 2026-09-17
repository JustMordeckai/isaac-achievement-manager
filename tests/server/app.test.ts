import { once } from 'node:events';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const merged = mergeProgress(fixtureMergeInput());
const ABSENT: KbStatus = { state: 'absent', syncedAt: null, running: false };
const SETTINGS: SettingsInfo = {
  port: 5250,
  dataDir: 'C:\\iam\\data',
  steamPath: 'C:\\Steam',
  account: { accountId: 123456789, steamId64: ME_ID64, personaName: 'Player' },
  forcedAccountId: null,
};

function fakeKb(kb: KnowledgeBase | null = null, overrides: Partial<KbService> = {}): KbService {
  return {
    get: vi.fn(async () => kb),
    status: vi.fn(async () => (kb ? { state: 'ok', syncedAt: kb.syncedAt, running: false } : ABSENT) satisfies KbStatus),
    isRunning: vi.fn(() => false),
    sync: vi.fn(async () => {
      throw new Error('non simulé');
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
      throw new Error('non simulé');
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
  it('bloque un hôte non autorisé et laisse passer 127.0.0.1 et localhost', async () => {
    const base = await start();
    const { port } = new URL(base);
    const evil = await requestWithHost(Number(port), 'evil.example:5250');
    expect(evil.status).toBe(403);
    expect(evil.body).toEqual({ error: 'Hôte non autorisé' });
    const local = await requestWithHost(Number(port), `localhost:${port}`);
    expect(local.status).toBe(200);
  });

  it('répond à /api/ping sans dépendre des sources de progression', async () => {
    const base = await start({ progress: { get: vi.fn(() => new Promise<never>(() => {})) } });
    const res = await fetch(`${base}/api/ping`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: 'isaac-achievement-manager' });
  });

  it('sert la progression du profil par défaut', async () => {
    const get = vi.fn(async () => merged);
    const base = await start({ progress: { get } });
    const res = await fetch(`${base}/api/progress`);
    expect(res.status).toBe(200);
    expect((await res.json()).unlocked).toBe(125);
    expect(get).toHaveBeenCalledWith('me', null);
  });

  it('transmet le profil et le slot demandés', async () => {
    const get = vi.fn(async () => merged);
    const base = await start({ progress: { get } });
    const res = await fetch(`${base}/api/achievements?profile=${OTHER_ID64}&slot=2`);
    expect(await res.json()).toHaveLength(641);
    expect(get).toHaveBeenCalledWith(OTHER_ID64, 2);
  });

  it('refuse un slot invalide', async () => {
    const base = await start();
    for (const slot of ['9', '0', 'abc', '1.5']) {
      const res = await fetch(`${base}/api/progress?slot=${slot}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Paramètre slot invalide (1 à 3)' });
    }
  });

  it('renvoie le statut des HttpError', async () => {
    const base = await start({
      progress: {
        get: vi.fn(async () => {
          throw new HttpError(404, 'Aucun compte');
        }),
      },
    });
    const res = await fetch(`${base}/api/progress`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Aucun compte' });
  });

  it('renvoie 500 pour une erreur imprévue', async () => {
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

  it('expose le statut des sources', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/status`)).json()).toEqual({
      app: 'isaac-achievement-manager',
      sources: merged.summary.sources,
      wiki: ABSENT,
    });
  });

  it('expose un statut sans sources si la progression échoue', async () => {
    const base = await start({
      progress: {
        get: vi.fn(async () => {
          throw new HttpError(404, 'Aucun compte');
        }),
      },
    });
    const res = await fetch(`${base}/api/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: 'isaac-achievement-manager', sources: null, wiki: ABSENT });
  });

  it('résout un profil', async () => {
    const resolve = vi.fn(async () => ({ steamId64: ME_ID64, name: 'Player' }));
    const base = await start({ profiles: { getStats: vi.fn(), resolve } });
    const res = await fetch(`${base}/api/profile/resolve?input=${encodeURIComponent('https://steamcommunity.com/id/JustMordeckai/')}`);
    expect(await res.json()).toEqual({ steamId64: ME_ID64, name: 'Player' });
    expect(resolve).toHaveBeenCalledWith('https://steamcommunity.com/id/JustMordeckai/');
  });

  it('traduit les erreurs de profil', async () => {
    const resolve = vi.fn(async () => {
      throw new ProfileError('notFound', 'Profil Steam introuvable');
    });
    const base = await start({ profiles: { getStats: vi.fn(), resolve } });
    const res = await fetch(`${base}/api/profile/resolve?input=inconnu`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Profil Steam introuvable' });
  });

  it('répond 400 à une saisie de profil non reconnue', async () => {
    const resolve = vi.fn(async () => {
      throw new ProfileError('input', 'Entrée non reconnue');
    });
    const base = await start({ profiles: { getStats: vi.fn(), resolve } });
    const res = await fetch(`${base}/api/profile/resolve?input=${encodeURIComponent('pas un profil !')}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Entrée non reconnue' });
  });

  it('sert les icônes', async () => {
    const get = vi.fn(async () => new Uint8Array([0xff, 0xd8]));
    const base = await start({ icons: { get } });
    const file = 'a36d7e92df7e991758907a75dfa55d36b52548c4.jpg';
    const res = await fetch(`${base}/api/icons/${file}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('max-age=604800');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8]));
    expect(get).toHaveBeenCalledWith(file);
  });

  it('relaie le refus d’un nom d’icône', async () => {
    const base = await start({
      icons: {
        get: vi.fn(async () => {
          throw new HttpError(400, "Nom d'icône invalide");
        }),
      },
    });
    const res = await fetch(`${base}/api/icons/bad.png`);
    expect(res.status).toBe(400);
  });

  it('arrête le serveur seulement avec l’en-tête dédié', async () => {
    const onShutdown = vi.fn();
    const base = await start({ onShutdown });
    const refused = await fetch(`${base}/api/shutdown`, { method: 'POST' });
    expect(refused.status).toBe(403);
    expect(onShutdown).not.toHaveBeenCalled();
    const accepted = await fetch(`${base}/api/shutdown`, { method: 'POST', headers: { 'X-IAM-Action': 'shutdown' } });
    expect(await accepted.json()).toEqual({ ok: true });
    await vi.waitFor(() => expect(onShutdown).toHaveBeenCalledTimes(1));
  });

  it('répond 404 à un arrêt non configuré et aux routes inconnues', async () => {
    const base = await start();
    const shutdown = await fetch(`${base}/api/shutdown`, { method: 'POST', headers: { 'X-IAM-Action': 'shutdown' } });
    expect(shutdown.status).toBe(404);
    const unknown = await fetch(`${base}/api/nope`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'Route API inconnue' });
  });

  it('expose les réglages détectés', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/settings`)).json()).toEqual(SETTINGS);
  });
});

describe('API wiki', () => {
  it('expose l’état de la base wiki', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/wiki/status`)).json()).toEqual(ABSENT);
  });

  it('enrichit la liste des succès avec la base wiki', async () => {
    const base = await start({ kb: fakeKb(await testKnowledgeBase()) });
    const list = await (await fetch(`${base}/api/achievements`)).json();
    expect(list[8]).toMatchObject({ id: 9, name: 'The Nail', how: 'mark', character: 'azazel' });
  });

  it('laisse la liste sans enrichissement quand la base est absente', async () => {
    const base = await start();
    const list = await (await fetch(`${base}/api/achievements`)).json();
    expect(list[8]).toMatchObject({ id: 9, how: null, character: null });
  });

  it('sert la fiche d’un succès avec son état pour le profil demandé', async () => {
    const kb = await testKnowledgeBase();
    const get = vi.fn(async () => merged);
    const base = await start({ progress: { get }, kb: fakeKb(kb) });
    const res = await fetch(`${base}/api/achievement/70?profile=${OTHER_ID64}&slot=1`);
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(get).toHaveBeenCalledWith(OTHER_ID64, 1);
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

  it('donne les prérequis d’un succès de personnage dans la fiche', async () => {
    const base = await start({ kb: fakeKb(await testKnowledgeBase()) });
    const card = await (await fetch(`${base}/api/achievement/491`)).json();
    // #491 : The Beast avec Tainted Isaac.
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

  it('sert une fiche sans partie wiki quand la base est absente', async () => {
    const base = await start();
    const card = await (await fetch(`${base}/api/achievement/9`)).json();
    expect(card).toMatchObject({ achievement: { id: 9, how: null }, wiki: null, kb: ABSENT, plan: null });
  });

  it('sert le plan de routes du profil demandé', async () => {
    const get = vi.fn(async () => merged);
    const base = await start({ progress: { get }, kb: fakeKb(await testKnowledgeBase()) });
    const res = await fetch(`${base}/api/routes?profile=me&slot=1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(get).toHaveBeenCalledWith('me', 1);
    expect(body.kb.state).toBe('ok');
    expect(body.plan.marksSource).toBe('save');
    expect(body.plan.characters).toHaveLength(34);
    expect(body.plan.runs[0]).toMatchObject({ id: 'magdalene-1', mode: 'hard', minutes: 97 });
    expect(body.plan.offRoute.redKey).toBe(false);
  });

  it('sert un plan vide quand la base est absente', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/routes`)).json()).toEqual({ kb: ABSENT, plan: null });
    expect((await fetch(`${base}/api/routes?slot=9`)).status).toBe(400);
  });

  it('refuse un identifiant invalide ou inconnu', async () => {
    const base = await start();
    const invalid = await fetch(`${base}/api/achievement/abc`);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Identifiant de succès invalide' });
    const unknown = await fetch(`${base}/api/achievement/9999`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'Succès #9999 inconnu' });
  });

  it('diffuse la synchro en NDJSON, avec l’en-tête dédié', async () => {
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
      onEvent({ step: 'core', done: 0, total: 1, message: 'début' });
      onEvent({ step: 'done', done: 1, total: 1, message: 'Synchro terminée', report });
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
      { step: 'core', done: 0, total: 1, message: 'début' },
      { step: 'done', done: 1, total: 1, message: 'Synchro terminée', report },
    ]);
  });

  it('termine le flux après une synchro en échec', async () => {
    const sync = vi.fn(async (onEvent: (event: WikiSyncEvent) => void) => {
      onEvent({ step: 'error', done: 0, total: 1, message: 'wiki injoignable' });
      throw new Error('wiki injoignable');
    });
    const base = await start({ kb: fakeKb(null, { sync }) });
    const res = await fetch(`${base}/api/wiki/sync`, { method: 'POST', headers: { 'X-IAM-Action': 'wiki-sync' } });
    expect((await res.text()).trim()).toBe(JSON.stringify({ step: 'error', done: 0, total: 1, message: 'wiki injoignable' }));
  });

  it('répond 409 si une synchro tourne déjà', async () => {
    const base = await start({ kb: fakeKb(null, { isRunning: vi.fn(() => true) }) });
    const res = await fetch(`${base}/api/wiki/sync`, { method: 'POST', headers: { 'X-IAM-Action': 'wiki-sync' } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Une synchro du wiki est déjà en cours' });
  });
});

describe('API conseiller', () => {
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

  const QUESTION = { question: 'Comment obtenir The Nail (#9) ?', history: [], profile: 'me', slot: null };

  it('expose l’état du conseiller', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/advisor/status`)).json()).toEqual(ADVISOR_OK);
  });

  it('enregistre les réglages Ollama avec l’en-tête dédié', async () => {
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
    expect(await refused.json()).toEqual({ error: 'En-tête X-IAM-Action: advisor-settings requis' });
    const invalid = await post({ url: 'nas', model: 'qwen3.5:4b' });
    expect(invalid.status).toBe(400);
    expect(configure).not.toHaveBeenCalled();
    const saved = await post({ url: 'http://10.0.0.5:11434/', model: 'qwen3.5:4b' });
    expect(await saved.json()).toEqual(ADVISOR_OK);
    expect(configure).toHaveBeenCalledWith({ url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' });
  });

  it('refuse une question sans en-tête, illisible, invalide ou trop grosse', async () => {
    const base = await start();
    const refused = await ask(base, QUESTION, {});
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'En-tête X-IAM-Action: advisor requis' });
    const unreadable = await ask(base, '{"question":');
    expect(unreadable.status).toBe(400);
    expect(await unreadable.json()).toEqual({ error: 'Corps JSON illisible' });
    const empty = await ask(base, { ...QUESTION, question: ' ' });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: 'Question vide' });
    const hugeBody = { ...QUESTION, history: [{ role: 'user', content: 'x'.repeat(300_000) }] };
    const huge = await ask(base, hugeBody);
    expect(huge.status).toBe(413);
    expect(await huge.json()).toEqual({ error: 'Requête trop volumineuse' });
    // L'en-tête est contrôlé avant la lecture du corps.
    expect((await ask(base, hugeBody, {})).status).toBe(403);
  });

  it('diffuse les fiches consultées puis la réponse d’Ollama', async () => {
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
    expect(get).toHaveBeenCalledWith(OTHER_ID64, 2);
    const [chat] = ollama?.chats as Array<{ messages: Array<{ role: string; content: string }> }>;
    expect(chat.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(chat.messages[0].content).toContain('#9 The Nail : manquant');
    expect(chat.messages.slice(1).map((m) => m.content)).toEqual(['Bonjour', 'Bonjour !', 'Comment obtenir The Nail (#9) ?']);
  });

  it('prévient le modèle quand la base wiki manque', async () => {
    const base = await startWithOllama({ kb: fakeKb() });
    const [context] = await lines(await ask(base, QUESTION));
    expect(context).toEqual({ kind: 'context', sources: [{ id: 9, name: 'The Nail' }] });
    const [chat] = ollama?.chats as Array<{ messages: Array<{ content: string }> }>;
    expect(chat.messages[0].content).toContain('Base wiki absente');
  });

  it('répond 503 quand Ollama est injoignable', async () => {
    const url = await closedUrl();
    const base = await start({ advisor: createAdvisorService({ settings: { url, model: 'qwen3.5:9b' }, save: vi.fn() }) });
    const res = await ask(base, QUESTION);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: `Ollama injoignable sur ${url} (ECONNREFUSED)` });
  });

  it('répond 502 quand le modèle manque', async () => {
    const base = await startWithOllama({}, 'mistral:7b');
    const res = await ask(base, QUESTION);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'Modèle mistral:7b absent du serveur Ollama : lance « ollama pull mistral:7b » sur ce serveur',
    });
  });

  it('répond 504 quand Ollama ne répond pas', async () => {
    ollama = await startFakeOllama({
      'POST /api/chat': () => {
        // Aucune réponse : le serveur est occupé.
      },
    });
    const advisor = createAdvisorService({ settings: { url: ollama.url, model: 'qwen3.5:9b' }, save: vi.fn(), idleTimeoutMs: 100 });
    const base = await start({ advisor, kb: fakeKb(await testKnowledgeBase()) });
    const res = await ask(base, QUESTION);
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/^Ollama ne répond plus \(rien reçu depuis 1 s\)/);
  });

  it('termine le flux par l’erreur envoyée par Ollama en cours de route', async () => {
    ollama = await startFakeOllama({
      'POST /api/chat': (_req, res) => {
        res.write(`${chatLines(['Début'])[0]}\n`);
        res.end(`${JSON.stringify({ error: 'out of memory' })}\n`);
      },
    });
    const base = await startWithOllama();
    expect((await lines(await ask(base, QUESTION))).slice(1)).toEqual([
      { kind: 'delta', text: 'Début' },
      { kind: 'error', message: "Erreur d'Ollama : out of memory" },
    ]);
  });

  it('coupe la génération quand le navigateur abandonne', async () => {
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

  it('n’ouvre pas de génération quand le client abandonne pendant la lecture de la progression', async () => {
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

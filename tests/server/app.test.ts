import { once } from 'node:events';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KbStatus, SettingsInfo, WikiSyncEvent } from '../../shared/types.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { HttpError } from '../../server/http-error.ts';
import type { KbService } from '../../server/kb-service.ts';
import { mergeProgress } from '../../server/sources/progress.ts';
import { ProfileError } from '../../server/sources/steam-profile.ts';
import type { KnowledgeBase } from '../../server/wiki/kb-types.ts';
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
  it('bloque un hote non autorise et laisse passer 127.0.0.1 et localhost', async () => {
    const base = await start();
    const { port } = new URL(base);
    const evil = await requestWithHost(Number(port), 'evil.example:5250');
    expect(evil.status).toBe(403);
    expect(evil.body).toEqual({ error: 'Hôte non autorisé' });
    const local = await requestWithHost(Number(port), `localhost:${port}`);
    expect(local.status).toBe(200);
  });

  it('repond a /api/ping sans dependre des sources de progression', async () => {
    const base = await start({ progress: { get: vi.fn(() => new Promise<never>(() => {})) } });
    const res = await fetch(`${base}/api/ping`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: 'isaac-achievement-manager' });
  });

  it('sert la progression du profil par defaut', async () => {
    const get = vi.fn(async () => merged);
    const base = await start({ progress: { get } });
    const res = await fetch(`${base}/api/progress`);
    expect(res.status).toBe(200);
    expect((await res.json()).unlocked).toBe(125);
    expect(get).toHaveBeenCalledWith('me', null);
  });

  it('transmet le profil et le slot demandes', async () => {
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

  it('renvoie 500 pour une erreur imprevue', async () => {
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

  it('expose un statut sans sources si la progression echoue', async () => {
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

  it('resout un profil', async () => {
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

  it('repond 400 a une saisie de profil non reconnue', async () => {
    const resolve = vi.fn(async () => {
      throw new ProfileError('input', 'Entrée non reconnue');
    });
    const base = await start({ profiles: { getStats: vi.fn(), resolve } });
    const res = await fetch(`${base}/api/profile/resolve?input=${encodeURIComponent('pas un profil !')}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Entrée non reconnue' });
  });

  it('sert les icones', async () => {
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

  it("relaie le refus d'un nom d'icone", async () => {
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

  it("arrete le serveur seulement avec l'en-tete dedie", async () => {
    const onShutdown = vi.fn();
    const base = await start({ onShutdown });
    const refused = await fetch(`${base}/api/shutdown`, { method: 'POST' });
    expect(refused.status).toBe(403);
    expect(onShutdown).not.toHaveBeenCalled();
    const accepted = await fetch(`${base}/api/shutdown`, { method: 'POST', headers: { 'X-IAM-Action': 'shutdown' } });
    expect(await accepted.json()).toEqual({ ok: true });
    await vi.waitFor(() => expect(onShutdown).toHaveBeenCalledTimes(1));
  });

  it('repond 404 a un arret non configure et aux routes inconnues', async () => {
    const base = await start();
    const shutdown = await fetch(`${base}/api/shutdown`, { method: 'POST', headers: { 'X-IAM-Action': 'shutdown' } });
    expect(shutdown.status).toBe(404);
    const unknown = await fetch(`${base}/api/nope`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'Route API inconnue' });
  });

  it('expose les reglages detectes', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/settings`)).json()).toEqual(SETTINGS);
  });
});

describe('API wiki', () => {
  it("expose l'etat de la base wiki", async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/wiki/status`)).json()).toEqual(ABSENT);
  });

  it('enrichit la liste des succes avec la base wiki', async () => {
    const base = await start({ kb: fakeKb(await testKnowledgeBase()) });
    const list = await (await fetch(`${base}/api/achievements`)).json();
    expect(list[8]).toMatchObject({ id: 9, name: 'The Nail', how: 'mark', character: 'azazel' });
  });

  it('laisse la liste sans enrichissement quand la base est absente', async () => {
    const base = await start();
    const list = await (await fetch(`${base}/api/achievements`)).json();
    expect(list[8]).toMatchObject({ id: 9, how: null, character: null });
  });

  it("sert la fiche d'un succes avec son etat pour le profil demande", async () => {
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
      { id: 'isaac-1', character: 'isaac', mode: 'hard', endings: ['bossRush', 'momsHeart', 'satan', 'lamb', 'megaSatan', 'delirium'], minutes: 85 },
    ]);
  });

  it("donne les prerequis d'un succes de personnage dans la fiche", async () => {
    const base = await start({ kb: fakeKb(await testKnowledgeBase()) });
    const card = await (await fetch(`${base}/api/achievement/491`)).json();
    // #491 : The Beast avec Tainted Isaac.
    expect(card.plan.requirements).toEqual([
      { anyOf: [{ id: 474, name: 'The Broken' }], met: false },
      { anyOf: [{ id: 635, name: 'A Strange Door' }], met: false },
      { anyOf: [{ id: 57, name: 'The Polaroid' }, { id: 78, name: 'The Negative' }], met: true },
    ]);
    expect(card.plan.runs).toEqual([
      { id: 'taintedIsaac-5', character: 'taintedIsaac', mode: 'normal', endings: ['beast'], minutes: 60 },
    ]);
  });

  it('sert une fiche sans partie wiki quand la base est absente', async () => {
    const base = await start();
    const card = await (await fetch(`${base}/api/achievement/9`)).json();
    expect(card).toMatchObject({ achievement: { id: 9, how: null }, wiki: null, kb: ABSENT, plan: null });
  });

  it('sert le plan de routes du profil demande', async () => {
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

  it("diffuse la synchro en NDJSON, avec l'en-tete dedie", async () => {
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

  it('termine le flux apres une synchro en echec', async () => {
    const sync = vi.fn(async (onEvent: (event: WikiSyncEvent) => void) => {
      onEvent({ step: 'error', done: 0, total: 1, message: 'wiki injoignable' });
      throw new Error('wiki injoignable');
    });
    const base = await start({ kb: fakeKb(null, { sync }) });
    const res = await fetch(`${base}/api/wiki/sync`, { method: 'POST', headers: { 'X-IAM-Action': 'wiki-sync' } });
    expect((await res.text()).trim()).toBe(JSON.stringify({ step: 'error', done: 0, total: 1, message: 'wiki injoignable' }));
  });

  it('repond 409 si une synchro tourne deja', async () => {
    const base = await start({ kb: fakeKb(null, { isRunning: vi.fn(() => true) }) });
    const res = await fetch(`${base}/api/wiki/sync`, { method: 'POST', headers: { 'X-IAM-Action': 'wiki-sync' } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Une synchro du wiki est déjà en cours' });
  });
});

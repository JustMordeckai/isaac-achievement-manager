import { once } from 'node:events';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppDeps } from '../../server/app.ts';
import { HttpError } from '../../server/http-error.ts';
import { mergeProgress } from '../../server/sources/progress.ts';
import { ProfileError } from '../../server/sources/steam-profile.ts';
import { ME_ID64, OTHER_ID64 } from './helpers/fixtures.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';

const merged = mergeProgress(fixtureMergeInput());
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
    expect(await res.json()).toEqual({ app: 'isaac-achievement-manager', sources: null });
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
});

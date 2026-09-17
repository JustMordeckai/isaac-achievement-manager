import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WikiSyncEvent } from '../../shared/types.ts';
import { createKbService, SyncBusyError } from '../../server/kb-service.ts';
import type { KnowledgeBase } from '../../server/wiki/kb-types.ts';

let dir: string;
let file: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'iam-kb-'));
  file = path.join(dir, 'kb.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const report = {
  achievements: 641,
  pages: 2,
  missingPages: [],
  unknownTemplates: {},
  miscCount: 108,
  otherUnlockCount: 61,
  cachedPages: 0,
};

function smallKb(syncedAt = '2026-09-17T08:00:00.000Z'): KnowledgeBase {
  return { version: 1, syncedAt, achievements: [], challenges: [], pages: {}, tips: [], report };
}

describe('createKbService', () => {
  it('signale une base absente', async () => {
    const service = createKbService({ file, build: async () => smallKb() });
    expect(await service.get()).toBeNull();
    expect(await service.status()).toEqual({ state: 'absent', syncedAt: null, running: false });
  });

  it('synchronise, écrit la base sans fichier temporaire restant et la relit', async () => {
    const events: WikiSyncEvent[] = [];
    const service = createKbService({
      file,
      build: async (onEvent) => {
        onEvent({ step: 'core', done: 0, total: 1, message: 'début' });
        return smallKb();
      },
    });

    await expect(service.sync((e) => events.push(e))).resolves.toEqual(report);

    expect(events.map((e) => e.step)).toEqual(['core', 'write', 'done']);
    expect(events[2]).toEqual({ step: 'done', done: 1, total: 1, message: 'Synchro terminée', report });
    expect(await readdir(dir)).toEqual(['kb.json']);
    expect(JSON.parse(await readFile(file, 'utf8')).syncedAt).toBe('2026-09-17T08:00:00.000Z');
    expect(await service.status()).toEqual({ state: 'ok', syncedAt: '2026-09-17T08:00:00.000Z', running: false });
    expect((await service.get())?.report).toEqual(report);
  });

  it('refuse une deuxième synchro simultanée et indique la synchro en cours', async () => {
    let release: (kb: KnowledgeBase) => void = () => {};
    const service = createKbService({ file, build: () => new Promise((resolve) => (release = resolve)) });
    const first = service.sync(() => {});
    expect(service.isRunning()).toBe(true);
    expect((await service.status()).running).toBe(true);
    await expect(service.sync(() => {})).rejects.toBeInstanceOf(SyncBusyError);
    release(smallKb());
    await first;
    expect(service.isRunning()).toBe(false);
  });

  it('émet une erreur, garde l’ancienne base et le signale dans l’état', async () => {
    await writeFile(file, JSON.stringify(smallKb('2026-09-01T00:00:00.000Z')));
    const events: WikiSyncEvent[] = [];
    const service = createKbService({
      file,
      build: async () => {
        throw new Error('wiki injoignable');
      },
    });
    await expect(service.sync((e) => events.push(e))).rejects.toThrow('wiki injoignable');
    expect(events).toEqual([{ step: 'error', done: 0, total: 1, message: 'wiki injoignable' }]);
    expect(await service.status()).toEqual({
      state: 'ok',
      syncedAt: '2026-09-01T00:00:00.000Z',
      running: false,
      message: 'Dernière synchro échouée : wiki injoignable',
    });
  });

  it('signale une base illisible ou d’un autre format', async () => {
    const service = createKbService({ file, build: async () => smallKb() });
    await writeFile(file, '{ pas du json');
    expect(await service.status()).toMatchObject({ state: 'error', message: expect.stringMatching(/^Base wiki illisible/) });
    await writeFile(file, JSON.stringify({ ...smallKb(), version: 99 }));
    expect(await service.status()).toMatchObject({
      state: 'error',
      message: "Base wiki d'un autre format (version 99) : relance la synchro",
    });
    expect(await service.get()).toBeNull();
  });
});

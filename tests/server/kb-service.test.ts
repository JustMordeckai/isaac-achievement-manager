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
  it('reports an absent database', async () => {
    const service = createKbService({ file, build: async () => smallKb() });
    expect(await service.get()).toBeNull();
    expect(await service.status('en')).toEqual({ state: 'absent', syncedAt: null, running: false });
  });

  it('syncs, writes the database with no leftover temp file, and rereads it', async () => {
    const events: WikiSyncEvent[] = [];
    const service = createKbService({
      file,
      build: async (onEvent) => {
        onEvent({ step: 'core', done: 0, total: 1, message: 'start' });
        return smallKb();
      },
    });

    await expect(service.sync((e) => events.push(e), 'en')).resolves.toEqual(report);

    expect(events.map((e) => e.step)).toEqual(['core', 'write', 'done']);
    expect(events[2]).toEqual({ step: 'done', done: 1, total: 1, message: 'Sync complete', report });
    expect(await readdir(dir)).toEqual(['kb.json']);
    expect(JSON.parse(await readFile(file, 'utf8')).syncedAt).toBe('2026-09-17T08:00:00.000Z');
    expect(await service.status('en')).toEqual({ state: 'ok', syncedAt: '2026-09-17T08:00:00.000Z', running: false });
    expect((await service.get())?.report).toEqual(report);
  });

  it('refuses a second simultaneous sync and reports the sync in progress', async () => {
    let release: (kb: KnowledgeBase) => void = () => {};
    const service = createKbService({ file, build: () => new Promise((resolve) => (release = resolve)) });
    const first = service.sync(() => {}, 'en');
    expect(service.isRunning()).toBe(true);
    expect((await service.status('en')).running).toBe(true);
    await expect(service.sync(() => {}, 'en')).rejects.toBeInstanceOf(SyncBusyError);
    release(smallKb());
    await first;
    expect(service.isRunning()).toBe(false);
  });

  it('emits an error, keeps the old database and reports it in the state', async () => {
    await writeFile(file, JSON.stringify(smallKb('2026-09-01T00:00:00.000Z')));
    const events: WikiSyncEvent[] = [];
    const service = createKbService({
      file,
      build: async () => {
        throw new Error('wiki unreachable');
      },
    });
    await expect(service.sync((e) => events.push(e), 'en')).rejects.toThrow('wiki unreachable');
    expect(events).toEqual([{ step: 'error', done: 0, total: 1, message: 'wiki unreachable' }]);
    expect(await service.status('en')).toEqual({
      state: 'ok',
      syncedAt: '2026-09-01T00:00:00.000Z',
      running: false,
      message: 'Last sync failed: wiki unreachable',
    });
  });

  it('reports an unreadable database or one in another format', async () => {
    const service = createKbService({ file, build: async () => smallKb() });
    await writeFile(file, '{ not json');
    expect(await service.status('en')).toMatchObject({ state: 'error', message: expect.stringMatching(/^Wiki database unreadable/) });
    await writeFile(file, JSON.stringify({ ...smallKb(), version: 99 }));
    expect(await service.status('en')).toMatchObject({
      state: 'error',
      message: 'Wiki database in another format (version 99): restart the sync',
    });
    expect(await service.get()).toBeNull();

    const failing = createKbService({
      file,
      build: async () => {
        throw new Error('wiki unreachable');
      },
    });
    await expect(failing.sync(() => {}, 'en')).rejects.toThrow('wiki unreachable');
    expect(await failing.status('en')).toMatchObject({
      state: 'error',
      message: 'Wiki database in another format (version 99): restart the sync; last sync failed: wiki unreachable',
    });
  });
});

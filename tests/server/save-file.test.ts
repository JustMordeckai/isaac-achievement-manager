import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listSaveSlots, parseSaveFile, pickDefaultSlot, SaveFormatError } from '../../server/sources/save-file.ts';
import { fixture } from './helpers/fixtures.ts';

const SLOT1 = 'rep+persistentgamedata1.dat';

describe('parseSaveFile', () => {
  const save = parseSaveFile(fixture(SLOT1));

  it('lit exactement les 4 blocs connus puis s’arrête', () => {
    expect(save.chunks).toEqual([
      { type: 1, offset: 32, byteLength: 642, count: 642 },
      { type: 2, offset: 686, byteLength: 2092, count: 523 },
      { type: 3, offset: 2790, byteLength: 56, count: 14 },
      { type: 4, offset: 2858, byteLength: 2932, count: 733 },
    ]);
    expect(save.tailOffset).toBe(5790);
  });

  it('lit les secrets débloqués', () => {
    expect(save.secrets.size).toBe(126);
    expect(save.secrets.has(638)).toBe(true);
    expect(save.secrets.has(641)).toBe(true);
    expect(save.secrets.has(0)).toBe(false);
    expect(save.secrets.has(9)).toBe(false);
  });

  it('lit les compteurs bruts', () => {
    expect(save.counters).toHaveLength(523);
    expect(save.counters.slice(0, 5)).toEqual([0, 16, 10812, 183, 0]);
  });

  it('lit un slot vide', () => {
    const empty = parseSaveFile(fixture('rep+persistentgamedata2.dat'));
    expect(empty.secrets.size).toBe(0);
    expect(empty.chunks.map((c) => c.type)).toEqual([1, 2, 3, 4]);
  });

  it('refuse un en-tête inconnu', () => {
    const bad = fixture(SLOT1);
    bad[0] = 0x58;
    expect(() => parseSaveFile(bad)).toThrow(SaveFormatError);
    expect(() => parseSaveFile(bad)).toThrow(/En-tête/);
    expect(() => parseSaveFile(Uint8Array.from([1, 2, 3]))).toThrow(/En-tête/);
  });

  it('refuse un bloc tronqué ou absent', () => {
    expect(() => parseSaveFile(fixture(SLOT1).subarray(0, 1000))).toThrow(/Bloc 2 tronqué/);
    expect(() => parseSaveFile(fixture(SLOT1).subarray(0, 2846))).toThrow(/Bloc 4 absent/);
  });

  it('refuse un bloc du mauvais type', () => {
    const bad = fixture(SLOT1);
    bad[674] = 9;
    expect(() => parseSaveFile(bad)).toThrow(/Bloc 2 attendu/);
  });

  it('refuse des blocs incohérents', () => {
    const badSecrets = fixture(SLOT1);
    badSecrets[28] = 0x83; // nombre de secrets 642 -> 643
    expect(() => parseSaveFile(badSecrets)).toThrow(/secrets/);
    const badCounters = fixture(SLOT1);
    badCounters[682] = 0x0c; // nombre de compteurs 523 -> 524
    expect(() => parseSaveFile(badCounters)).toThrow(/compteurs/);
  });
});

describe('listSaveSlots et pickDefaultSlot', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'iam-save-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const touch = (name: string, content: string, iso: string) => {
    const file = path.join(dir, name);
    writeFileSync(file, content);
    utimesSync(file, new Date(iso), new Date(iso));
  };

  it('liste les slots Repentance+ et ignore le reste', async () => {
    for (const name of [SLOT1, 'rep+persistentgamedata3.dat', 'rep_persistentgamedata2.dat', 'notes.txt']) {
      touch(name, 'x', '2026-09-16T10:00:00Z');
    }
    const slots = await listSaveSlots(dir);
    expect(slots.map((s) => s.slot)).toEqual([1, 3]);
    expect(slots[0]).toMatchObject({ path: path.join(dir, SLOT1), size: 1 });
  });

  it('choisit le slot modifié le plus récemment', async () => {
    touch(SLOT1, 'x', '2026-09-16T10:00:00Z');
    touch('rep+persistentgamedata2.dat', 'xx', '2026-09-15T10:00:00Z');
    expect(pickDefaultSlot(await listSaveSlots(dir))?.slot).toBe(1);
  });

  it('départage deux dates égales par la taille', async () => {
    touch(SLOT1, 'x', '2026-09-16T10:00:00Z');
    touch('rep+persistentgamedata2.dat', 'xx', '2026-09-16T10:00:00Z');
    expect(pickDefaultSlot(await listSaveSlots(dir))?.slot).toBe(2);
  });

  it('renvoie une liste vide si le dossier est absent', async () => {
    expect(await listSaveSlots(path.join(dir, 'absent'))).toEqual([]);
    expect(pickDefaultSlot([])).toBeNull();
  });
});

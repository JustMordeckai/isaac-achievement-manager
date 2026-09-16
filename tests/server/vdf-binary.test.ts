import { describe, expect, it } from 'vitest';
import { parseBinaryVdf } from '../../server/sources/vdf-binary.ts';
import { fixture } from './helpers/fixtures.ts';
import { vdfBinary } from './helpers/vdf.ts';

describe('parseBinaryVdf', () => {
  it('lit sous-blocs, chaînes, int32 signés et uint64', () => {
    const value = { root: { name: 'Isaac', data: -274202881, big: 76561198083722517n, child: { deep: 'ok' } } };
    expect(parseBinaryVdf(vdfBinary(value))).toEqual(value);
  });

  it('lit un float32', () => {
    // type 0x03, clé "f", valeur 0.75 (0x3f400000 en little endian), fin
    const buf = Uint8Array.from([0x03, 0x66, 0x00, 0x00, 0x00, 0x40, 0x3f, 0x08]);
    expect(parseBinaryVdf(buf)).toEqual({ f: 0.75 });
  });

  it('accepte une fin de fichier sans marqueur au niveau racine', () => {
    expect(parseBinaryVdf(vdfBinary({ a: 'b' }).subarray(0, -1))).toEqual({ a: 'b' });
  });

  it('refuse un sous-bloc tronqué', () => {
    const buf = vdfBinary({ root: { a: 'b' } }).subarray(0, -2);
    expect(() => parseBinaryVdf(buf)).toThrow(/fin de fichier/);
  });

  it('refuse un int32 tronqué', () => {
    expect(() => parseBinaryVdf(Uint8Array.from([0x02, 0x6e, 0x00, 0x01, 0x02]))).toThrow(/fin de fichier/);
  });

  it('refuse un type inconnu', () => {
    expect(() => parseBinaryVdf(Uint8Array.from([0x09, 0x6b, 0x00]))).toThrow(/type 0x9 inconnu/);
  });

  it('refuse une chaîne non terminée', () => {
    expect(() => parseBinaryVdf(Uint8Array.from([0x01, 0x6b]))).toThrow(/non terminée/);
  });

  it('lit le schéma Steam réel', () => {
    const app = parseBinaryVdf(fixture('UserGameStatsSchema_250900.bin'))['250900'] as Record<string, any>;
    expect(app.gamename).toBe('The Binding of Isaac Rebirth');
    expect(app.stats['1'].bits['0'].name).toBe('1');
    expect(app.stats['1'].bits['0'].display.name.english).toBe('Magdalene');
    expect(app.stats['7'].bits).toBeUndefined();
  });

  it('lit les stats Steam réelles', () => {
    const root = parseBinaryVdf(fixture('UserGameStats_123456789_250900.bin')) as Record<string, any>;
    expect(root.cache['1'].data).toBe(-274202881);
    expect(root.cache['1'].AchievementTimes['0']).toBe(1676924125);
  });
});

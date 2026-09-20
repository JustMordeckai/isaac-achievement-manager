import { describe, expect, it } from 'vitest';
import { parseBinaryVdf } from '../../server/sources/vdf-binary.ts';
import { fixture } from './helpers/fixtures.ts';
import { vdfBinary } from './helpers/vdf.ts';

describe('parseBinaryVdf', () => {
  it('reads subchunks, strings, signed int32 and uint64', () => {
    const value = { root: { name: 'Isaac', data: -274202881, big: 76561198083722517n, child: { deep: 'ok' } } };
    expect(parseBinaryVdf(vdfBinary(value))).toEqual(value);
  });

  it('reads a float32', () => {
    // type 0x03, key "f", value 0.75 (0x3f400000 little endian), end
    const buf = Uint8Array.from([0x03, 0x66, 0x00, 0x00, 0x00, 0x40, 0x3f, 0x08]);
    expect(parseBinaryVdf(buf)).toEqual({ f: 0.75 });
  });

  it('accepts an end of file with no marker at the root level', () => {
    expect(parseBinaryVdf(vdfBinary({ a: 'b' }).subarray(0, -1))).toEqual({ a: 'b' });
  });

  it('refuses a truncated subchunk', () => {
    const buf = vdfBinary({ root: { a: 'b' } }).subarray(0, -2);
    expect(() => parseBinaryVdf(buf)).toThrow(/unexpected end of file/);
  });

  it('refuses a truncated int32', () => {
    expect(() => parseBinaryVdf(Uint8Array.from([0x02, 0x6e, 0x00, 0x01, 0x02]))).toThrow(/unexpected end of file/);
  });

  it('refuses an unknown type', () => {
    expect(() => parseBinaryVdf(Uint8Array.from([0x09, 0x6b, 0x00]))).toThrow(/unknown type 0x9/);
  });

  it('refuses an unterminated string', () => {
    expect(() => parseBinaryVdf(Uint8Array.from([0x01, 0x6b]))).toThrow(/unterminated/);
  });

  it('reads the real Steam schema', () => {
    const app = parseBinaryVdf(fixture('UserGameStatsSchema_250900.bin'))['250900'] as Record<string, any>;
    expect(app.gamename).toBe('The Binding of Isaac Rebirth');
    expect(app.stats['1'].bits['0'].name).toBe('1');
    expect(app.stats['1'].bits['0'].display.name.english).toBe('Magdalene');
    expect(app.stats['7'].bits).toBeUndefined();
  });

  it('reads the real Steam stats', () => {
    const root = parseBinaryVdf(fixture('UserGameStats_123456789_250900.bin')) as Record<string, any>;
    expect(root.cache['1'].data).toBe(-274202881);
    expect(root.cache['1'].AchievementTimes['0']).toBe(1676924125);
  });
});

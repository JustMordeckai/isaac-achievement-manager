import { describe, expect, it } from 'vitest';
import { parseSchema, parseUserStats, type SchemaEntry } from '../../server/sources/steam-cache.ts';
import { fixture } from './helpers/fixtures.ts';
import { vdfBinary } from './helpers/vdf.ts';

const schema = parseSchema(fixture('UserGameStatsSchema_250900.bin'));

describe('parseSchema', () => {
  it('lit les 641 succès du schéma', () => {
    expect(schema).toHaveLength(641);
    expect(schema.map((e) => e.def.id)).toEqual(Array.from({ length: 641 }, (_, i) => i + 1));
    expect(schema.filter((e) => e.def.hidden)).toHaveLength(319);
    expect(schema.some((e) => e.block === '7')).toBe(false);
  });

  it('extrait les champs affichés', () => {
    expect(schema[0]).toEqual({
      block: '1',
      bit: 0,
      def: {
        id: 1,
        name: 'Magdalene',
        description: 'Unlocked a new character.',
        hidden: false,
        icon: 'a36d7e92df7e991758907a75dfa55d36b52548c4.jpg',
        iconGray: 'fc5c40f3429120652211c9e95570752ba5810f22.jpg',
        dlc: 'rebirth',
      },
    });
    expect(schema[640].def).toMatchObject({ id: 641, name: 'Item Descriptions', dlc: 'repentancePlus' });
    expect(schema[637].def).toMatchObject({ id: 638, name: 'Play Online', dlc: 'repentance' });
  });

  it('refuse un fichier sans bloc 250900', () => {
    expect(() => parseSchema(vdfBinary({ other: { a: 'b' } }))).toThrow(/250900/);
  });
});

describe('parseUserStats', () => {
  const unlocked = parseUserStats(fixture('UserGameStats_123456789_250900.bin'), schema);

  it('lit les 125 succès débloqués et leurs dates', () => {
    expect(unlocked.size).toBe(125);
    expect(unlocked.get(1)).toBe(1676924125);
    expect(unlocked.get(641)).toBe(1762825435);
    expect(unlocked.get(343)).toBe(1789569051);
    expect(unlocked.has(9)).toBe(false);
    expect([...unlocked.values()].every((t) => t !== null)).toBe(true);
  });

  it('lit le bit 31 d’un int32 négatif et accepte une date absente', () => {
    const mini: SchemaEntry[] = [{ block: '5', bit: 31, def: { ...schema[0].def, id: 999 } }];
    const buf = vdfBinary({ cache: { '5': { data: -2147483648 } } });
    expect(parseUserStats(buf, mini)).toEqual(new Map([[999, null]]));
  });

  it('refuse un fichier sans bloc cache', () => {
    expect(() => parseUserStats(vdfBinary({ x: 'y' }), schema)).toThrow(/cache/);
  });
});

import { describe, expect, it } from 'vitest';
import { parseTextVdf, type VdfTextObject } from '../../server/sources/vdf-text.ts';
import { fixtureText } from './helpers/fixtures.ts';

describe('parseTextVdf', () => {
  it('lit loginusers.vdf', () => {
    const users = parseTextVdf(fixtureText('loginusers.vdf')).users as VdfTextObject;
    expect(Object.keys(users)).toEqual(['76561198083722517', '76561198194833618']);
    const me = users['76561198083722517'] as VdfTextObject;
    expect(me.PersonaName).toBe('Player');
    expect(me.Timestamp).toBe('1789551543');
  });

  it('gère échappements, commentaires, jetons nus et conditions', () => {
    const text = [
      '\uFEFF// commentaire',
      '"root"',
      '{',
      '  "path"  "C:\\\\Program Files (x86)\\\\Steam"',
      '  "quote" "il a dit \\"salut\\""',
      '  bare value [$WIN32]',
      '  "empty" ""',
      '  "child" { "k" "v" } // fin de ligne',
      '}',
    ].join('\r\n');
    expect(parseTextVdf(text)).toEqual({
      root: {
        path: 'C:\\Program Files (x86)\\Steam',
        quote: 'il a dit "salut"',
        bare: 'value',
        empty: '',
        child: { k: 'v' },
      },
    });
  });

  it('signale une accolade fermante manquante', () => {
    expect(() => parseTextVdf('"a" { "b" "c"')).toThrow(/accolade fermante manquante/);
  });

  it('signale une accolade fermante en trop', () => {
    expect(() => parseTextVdf('"a" "b" }')).toThrow(/accolade fermante en trop/);
  });

  it('signale une valeur manquante', () => {
    expect(() => parseTextVdf('"a"')).toThrow(/valeur manquante/);
    expect(() => parseTextVdf('"a" { "b" }')).toThrow(/valeur manquante/);
  });

  it('signale une chaîne non terminée', () => {
    expect(() => parseTextVdf('"a" "b')).toThrow(/chaîne non terminée/);
  });
});

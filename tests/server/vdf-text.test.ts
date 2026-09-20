import { describe, expect, it } from 'vitest';
import { parseTextVdf, type VdfTextObject } from '../../server/sources/vdf-text.ts';
import { fixtureText } from './helpers/fixtures.ts';

describe('parseTextVdf', () => {
  it('reads loginusers.vdf', () => {
    const users = parseTextVdf(fixtureText('loginusers.vdf')).users as VdfTextObject;
    expect(Object.keys(users)).toEqual(['76561198083722517', '76561198194833618']);
    const me = users['76561198083722517'] as VdfTextObject;
    expect(me.PersonaName).toBe('Player');
    expect(me.Timestamp).toBe('1789551543');
  });

  it('handles escapes, comments, bare tokens and conditionals', () => {
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

  it('reports a missing closing brace', () => {
    expect(() => parseTextVdf('"a" { "b" "c"')).toThrow(/missing closing brace/);
  });

  it('reports an extra closing brace', () => {
    expect(() => parseTextVdf('"a" "b" }')).toThrow(/extra closing brace/);
  });

  it('reports a missing value', () => {
    expect(() => parseTextVdf('"a"')).toThrow(/missing value/);
    expect(() => parseTextVdf('"a" { "b" }')).toThrow(/missing value/);
  });

  it('reports an unterminated string', () => {
    expect(() => parseTextVdf('"a" "b')).toThrow(/unterminated string/);
  });
});

import { describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/en.ts';
import { fr } from '../../shared/i18n/fr.ts';
import { DEFAULT_LOCALE, format, LOCALE_NAMES, LOCALES, plural, t, toLocale } from '../../shared/i18n/index.ts';

describe('catalogues', () => {
  it('holds the same keys in both languages', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps English values free of accented letters', () => {
    const accented = Object.entries(en).filter(([, value]) => /[\u00c0-\u017f]/.test(value));
    expect(accented).toEqual([]);
  });

  it('never uses an em dash or an en dash', () => {
    const dashes = [...Object.values(en), ...Object.values(fr)].filter((value) => /[\u2013\u2014]/.test(value));
    expect(dashes).toEqual([]);
  });

  it('serves English first and French second', () => {
    expect(LOCALES).toEqual(['en', 'fr']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('names each language in its own language', () => {
    expect(LOCALE_NAMES).toEqual({ en: 'English', fr: 'Fran\u00e7ais' });
  });
});

describe('toLocale', () => {
  it('accepts a served locale and refuses anything else', () => {
    expect(toLocale('fr')).toBe('fr');
    expect(toLocale('en')).toBe('en');
    expect(toLocale('de')).toBeNull();
    expect(toLocale(null)).toBeNull();
  });
});

describe('format', () => {
  it('replaces every placeholder and leaves an unknown one alone', () => {
    expect(format('{done} of {total}', { done: 3, total: 10 })).toBe('3 of 10');
    expect(format('{done} of {total}', { done: 3 })).toBe('3 of {total}');
    expect(format('no placeholder')).toBe('no placeholder');
  });
});

describe('t', () => {
  it('reads the value of the asked locale', () => {
    expect(t('en', 'app.language')).toBe('Language');
    expect(t('fr', 'app.language')).toBe('Langue');
  });

  it('fills the placeholders of the value', () => {
    expect(t('en', 'app.loadFailed', { message: 'boom' })).toBe('Loading failed: boom');
    expect(t('fr', 'app.loadFailed', { message: 'boum' })).toBe('Chargement impossible : boum');
  });

  it('throws by name on a key that exists in neither catalogue', () => {
    expect(() => t('en', 'nope.missing' as never)).toThrow('Missing message key: nope.missing');
  });
});

describe('plural', () => {
  it('picks the singular for one and the plural for anything else', () => {
    expect(plural('en', 'routes.moreRuns', 1)).toBe('Show 1 more run');
    expect(plural('en', 'routes.moreRuns', 4)).toBe('Show 4 more runs');
    expect(plural('fr', 'routes.moreRuns', 1)).toBe('Afficher 1 run de plus');
    expect(plural('fr', 'routes.moreRuns', 4)).toBe('Afficher 4 runs de plus');
  });

  it('throws by name rather than crashing when the suffixed key is missing', () => {
    expect(() => plural('en', 'app.language', 1)).toThrow('Missing message key: app.language.one');
  });
});

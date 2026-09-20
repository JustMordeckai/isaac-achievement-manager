import { describe, expect, it } from 'vitest';
import { loadRecentProfiles, RECENT_PROFILES_KEY, rememberProfile } from '../../web/src/recent-profiles.ts';
import { applyTheme, loadTheme, THEME_STORAGE_KEY } from '../../web/src/theme.ts';

describe('profils récents', () => {
  it('mémorise sans doublon, le plus récent en tête, 8 au plus', () => {
    for (let i = 0; i < 10; i++) rememberProfile({ steamId64: `7656119800000000${i}`, name: `Joueur ${i}` });
    const list = rememberProfile({ steamId64: '76561198000000005', name: 'Joueur 5 renommé' });
    expect(list).toHaveLength(8);
    expect(list[0]).toEqual({ steamId64: '76561198000000005', name: 'Joueur 5 renommé' });
    expect(list.filter((p) => p.steamId64 === '76561198000000005')).toHaveLength(1);
    expect(loadRecentProfiles()).toEqual(list);
  });

  it('ignore un stockage corrompu', () => {
    localStorage.setItem(RECENT_PROFILES_KEY, '{pas du json');
    expect(loadRecentProfiles()).toEqual([]);
    localStorage.setItem(RECENT_PROFILES_KEY, JSON.stringify([{ steamId64: 1 }, { steamId64: '76561198000000001', name: null }]));
    expect(loadRecentProfiles()).toEqual([{ steamId64: '76561198000000001', name: null }]);
  });
});

describe('thème', () => {
  it('est sombre par défaut et mémorise le choix', () => {
    expect(loadTheme()).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(loadTheme()).toBe('light');
  });
});

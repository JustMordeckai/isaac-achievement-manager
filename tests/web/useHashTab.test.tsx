import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHashAchievement, useHashTab } from '../../web/src/useHashTab.ts';

const navigate = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

describe('useHashTab', () => {
  it('lit l’onglet depuis l’adresse', () => {
    window.location.hash = '#/succes';
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toBe('achievements');
  });

  it('met à jour l’adresse et suit les changements', () => {
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toBe('dashboard');
    act(() => result.current[1]('achievements'));
    expect(window.location.hash).toBe('#/succes');
    expect(result.current[0]).toBe('achievements');
    navigate('#/');
    expect(result.current[0]).toBe('dashboard');
  });

  it('reconnaît l’onglet Paramètres et reste sur Succès quand une fiche est ouverte', () => {
    const { result } = renderHook(() => useHashTab());
    act(() => result.current[1]('settings'));
    expect(window.location.hash).toBe('#/parametres');
    expect(result.current[0]).toBe('settings');
    navigate('#/succes/9');
    expect(result.current[0]).toBe('achievements');
  });
});

describe('useHashTab : routes', () => {
  it('reconnaît l’onglet Routes', () => {
    window.location.hash = '#/routes';
    const { result } = renderHook(() => useHashTab());
    expect(result.current[0]).toBe('routes');
    act(() => result.current[1]('dashboard'));
    expect(window.location.hash).toBe('#/');
    act(() => result.current[1]('routes'));
    expect(window.location.hash).toBe('#/routes');
  });

  it('remonte en haut de page seulement quand l’onglet change', () => {
    const { result } = renderHook(() => useHashTab());
    document.documentElement.scrollTop = 400;
    act(() => result.current[1]('dashboard'));
    expect(document.documentElement.scrollTop).toBe(400);
    act(() => result.current[1]('routes'));
    expect(document.documentElement.scrollTop).toBe(0);
  });
});

describe('useHashAchievement', () => {
  it('lit la fiche ouverte depuis l’adresse', () => {
    window.location.hash = '#/succes/42';
    const { result } = renderHook(() => useHashAchievement());
    expect(result.current[0]).toBe(42);
  });

  it('ouvre et ferme une fiche, et ignore les adresses sans numéro', () => {
    const { result } = renderHook(() => useHashAchievement());
    expect(result.current[0]).toBeNull();
    act(() => result.current[1](9));
    expect(window.location.hash).toBe('#/succes/9');
    expect(result.current[0]).toBe(9);
    act(() => result.current[1](null));
    expect(window.location.hash).toBe('#/succes');
    expect(result.current[0]).toBeNull();
    navigate('#/succes/abc');
    expect(result.current[0]).toBeNull();
    navigate('#/succes/641');
    expect(result.current[0]).toBe(641);
  });
});

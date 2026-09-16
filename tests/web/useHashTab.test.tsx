import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHashTab } from '../../web/src/useHashTab.ts';

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
    act(() => {
      window.location.hash = '#/';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current[0]).toBe('dashboard');
  });
});

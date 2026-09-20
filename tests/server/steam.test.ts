import { describe, expect, it } from 'vitest';
import { accountIdToSteamId64, isSteamId64, steamId64ToAccountId } from '../../server/steam.ts';

describe('SteamID64', () => {
  it('converts with no loss of precision', () => {
    expect(steamId64ToAccountId('76561198083722517')).toBe(123456789);
    expect(accountIdToSteamId64(123456789)).toBe('76561198083722517');
    expect(steamId64ToAccountId('76561198194833618')).toBe(234567890);
    expect(accountIdToSteamId64(123)).toBe('76561197960265851');
  });

  it('validates the format', () => {
    expect(isSteamId64('76561198083722517')).toBe(true);
    expect(isSteamId64('76561197960265728')).toBe(false);
    expect(isSteamId64('76561202255233024')).toBe(false);
    expect(isSteamId64('123')).toBe(false);
    expect(isSteamId64('7656119827189482x')).toBe(false);
  });

  it('refuses to convert an invalid identifier', () => {
    expect(() => steamId64ToAccountId('abc')).toThrow(/Invalid SteamID64/);
  });
});

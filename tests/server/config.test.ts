import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chooseAccount,
  detectSteamEnv,
  DEFAULT_OLLAMA,
  loadSettings,
  ollamaModel,
  ollamaUrl,
  saveSettings,
  steamPaths,
  type SteamAccount,
  type SteamEnv,
} from '../../server/config.ts';
import { accountIdToSteamId64 } from '../../server/steam.ts';
import { parseRegQueryOutput } from '../../server/win-registry.ts';
import { ME_ACCOUNT } from './helpers/fixtures.ts';
import { fakeRegistry, makeSteamDir, removeDir } from './helpers/steam-dir.ts';

describe('parseRegQueryOutput', () => {
  const sz = '\r\nHKEY_CURRENT_USER\Software\Valve\Steam\r\n    SteamPath    REG_SZ    c:/program files (x86)/steam\r\n\r\n';
  const dword = '\r\nHKEY_CURRENT_USER\Software\Valve\Steam\ActiveProcess\r\n    ActiveUser    REG_DWORD    0x075bcd15\r\n\r\n';

  it('reads a string and a DWORD', () => {
    expect(parseRegQueryOutput(sz, 'SteamPath')).toBe('c:/program files (x86)/steam');
    expect(parseRegQueryOutput(dword, 'ActiveUser')).toBe(123456789);
    expect(parseRegQueryOutput(dword, 'activeuser')).toBe(123456789);
  });

  it('returns null for a missing value', () => {
    expect(parseRegQueryOutput(sz, 'Other')).toBeNull();
    expect(parseRegQueryOutput('', 'SteamPath')).toBeNull();
  });
});

describe('detectSteamEnv', () => {
  let steam: string;
  beforeEach(() => {
    steam = makeSteamDir();
  });
  afterEach(() => removeDir(steam));

  it('detects Steam, the active account and the known accounts', () => {
    const env = detectSteamEnv({ readRegistry: fakeRegistry(steam, ME_ACCOUNT), fallbackSteamPaths: [] });
    expect(env.steamPath).toBe(path.normalize(steam));
    expect(env.activeAccountId).toBe(ME_ACCOUNT);
    expect(env.accounts).toEqual([
      { accountId: 123456789, steamId64: '76561198083722517', personaName: 'Player', hasIsaacData: true, lastLogin: 1789551543 },
      { accountId: 234567890, steamId64: '76561198194833618', personaName: 'Second Player', hasIsaacData: false, lastLogin: 1730151425 },
    ]);
  });

  it('recognizes an account that only has saves', () => {
    mkdirSync(path.join(steam, 'userdata', '234567890', '250900'), { recursive: true });
    const env = detectSteamEnv({ readRegistry: fakeRegistry(steam, null), fallbackSteamPaths: [] });
    expect(env.accounts.map((a) => a.hasIsaacData)).toEqual([true, true]);
  });

  it('uses a fallback path when the registry does not respond', () => {
    const env = detectSteamEnv({
      readRegistry: fakeRegistry(null, null),
      fallbackSteamPaths: [path.join(steam, 'absent'), steam],
    });
    expect(env.steamPath).toBe(path.normalize(steam));
    expect(env.activeAccountId).toBeNull();
  });

  it('returns an empty environment without Steam', () => {
    expect(detectSteamEnv({ readRegistry: fakeRegistry(null, null), fallbackSteamPaths: [] })).toEqual({
      steamPath: null,
      activeAccountId: null,
      accounts: [],
    });
  });

  it('adds the requested accounts missing from loginusers.vdf', () => {
    const env = detectSteamEnv({ readRegistry: fakeRegistry(steam, 0), fallbackSteamPaths: [], extraAccountIds: [123] });
    expect(env.activeAccountId).toBeNull();
    expect(env.accounts.find((a) => a.accountId === 123)).toEqual({
      accountId: 123,
      steamId64: '76561197960265851',
      personaName: null,
      hasIsaacData: false,
      lastLogin: 0,
    });
  });

  it('builds the Steam file paths', () => {
    const paths = steamPaths(steam);
    expect(paths.schema).toBe(path.join(steam, 'appcache', 'stats', 'UserGameStatsSchema_250900.bin'));
    expect(paths.stats(ME_ACCOUNT)).toBe(path.join(steam, 'appcache', 'stats', 'UserGameStats_123456789_250900.bin'));
    expect(paths.remote(ME_ACCOUNT)).toBe(path.join(steam, 'userdata', '123456789', '250900', 'remote'));
  });
});

describe('chooseAccount', () => {
  const account = (accountId: number, hasIsaacData: boolean, lastLogin: number): SteamAccount => ({
    accountId,
    steamId64: accountIdToSteamId64(accountId),
    personaName: null,
    hasIsaacData,
    lastLogin,
  });
  const env = (activeAccountId: number | null, accounts: SteamAccount[]): SteamEnv => ({
    steamPath: 'C:/Steam',
    activeAccountId,
    accounts,
  });

  it('prefers the forced account, even without data', () => {
    expect(chooseAccount(env(1, [account(1, true, 5), account(2, false, 1)]), 2)?.accountId).toBe(2);
  });

  it('returns null when the forced account is unknown', () => {
    expect(chooseAccount(env(1, [account(1, true, 5)]), 3)).toBeNull();
  });

  it('takes the active account when it has data', () => {
    expect(chooseAccount(env(2, [account(1, true, 9), account(2, true, 1)]), null)?.accountId).toBe(2);
  });

  it('ignores an active account without data', () => {
    expect(chooseAccount(env(2, [account(1, true, 1), account(2, false, 9)]), null)?.accountId).toBe(1);
  });

  it('takes the most recent login among the accounts with data', () => {
    expect(chooseAccount(env(null, [account(1, true, 1), account(2, true, 9)]), null)?.accountId).toBe(2);
  });

  it('returns null without an account that has data', () => {
    expect(chooseAccount(env(null, [account(1, false, 1)]), null)).toBeNull();
  });
});

describe('loadSettings', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'iam-settings-'));
  });
  afterEach(() => removeDir(dir));
  const write = (content: string) => writeFileSync(path.join(dir, 'settings.json'), content);

  it('uses the default values without a file', () => {
    expect(loadSettings(dir)).toEqual({ port: 5250, accountId: null, ollama: DEFAULT_OLLAMA, locale: 'en' });
    expect(loadSettings(path.join(dir, 'absent'))).toEqual({ port: 5250, accountId: null, ollama: DEFAULT_OLLAMA, locale: 'en' });
  });

  it('reads a valid file', () => {
    write(JSON.stringify({ port: 6000, accountId: 123456789, ollama: { url: 'http://10.0.0.5:11434/', model: 'qwen3.5:4b' } }));
    expect(loadSettings(dir)).toEqual({
      port: 6000,
      accountId: 123456789,
      ollama: { url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' },
      locale: 'en',
    });
  });

  it('ignores invalid values and unreadable JSON', () => {
    write(JSON.stringify({ port: 'x', accountId: -4 }));
    expect(loadSettings(dir)).toEqual({ port: 5250, accountId: null, ollama: DEFAULT_OLLAMA, locale: 'en' });
    write(JSON.stringify({ port: 70000, accountId: 2 ** 32 }));
    expect(loadSettings(dir)).toEqual({ port: 5250, accountId: null, ollama: DEFAULT_OLLAMA, locale: 'en' });
    write('{');
    expect(loadSettings(dir)).toEqual({ port: 5250, accountId: null, ollama: DEFAULT_OLLAMA, locale: 'en' });
    write('null');
    expect(loadSettings(dir)).toEqual({ port: 5250, accountId: null, ollama: DEFAULT_OLLAMA, locale: 'en' });
    write(JSON.stringify({ ollama: { url: 'ftp://nas', model: 'a b' } }));
    expect(loadSettings(dir).ollama).toEqual(DEFAULT_OLLAMA);
  });

  it('defaults to a local Ollama server and a small model', () => {
    expect(DEFAULT_OLLAMA).toEqual({ url: 'http://127.0.0.1:11434', model: 'qwen3.5:4b' });
  });
});

describe('settings locale', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'iam-locale-'));
  });
  afterEach(() => removeDir(dir));
  const write = (content: string) => writeFileSync(path.join(dir, 'settings.json'), content);

  it('reads a served locale', () => {
    write(JSON.stringify({ locale: 'fr' }));
    expect(loadSettings(dir).locale).toBe('fr');
  });

  it('falls back to English for a locale that is not served', () => {
    write(JSON.stringify({ locale: 'de' }));
    expect(loadSettings(dir).locale).toBe('en');
  });

  it('defaults to English without a file', () => {
    expect(loadSettings(dir).locale).toBe('en');
  });

  it('keeps the port and the Ollama settings already in the file', async () => {
    write(JSON.stringify({ port: 6000, ollama: { url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' } }));
    await saveSettings(dir, { locale: 'fr' }, 'en');
    expect(loadSettings(dir)).toEqual({
      port: 6000,
      accountId: null,
      ollama: { url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' },
      locale: 'fr',
    });
  });
});

describe('Ollama settings', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'iam-ollama-'));
  });
  afterEach(() => removeDir(dir));
  const file = () => path.join(dir, 'settings.json');

  it('validates the server address', () => {
    expect(ollamaUrl(' http://127.0.0.1:11434/ ')).toBe('http://127.0.0.1:11434');
    expect(ollamaUrl('https://ollama.lan/api-proxy/')).toBe('https://ollama.lan/api-proxy');
    for (const bad of ['', 'ollama:11434', 'ftp://nas', 'http://user:pw@nas', 'http://nas/?x=1', 42, null]) {
      expect(ollamaUrl(bad)).toBeNull();
    }
  });

  it('validates the model name', () => {
    expect(ollamaModel(' qwen3.5:9b ')).toBe('qwen3.5:9b');
    expect(ollamaModel('hf.co/bartowski/Qwen-GGUF:Q4_K_M')).toBe('hf.co/bartowski/Qwen-GGUF:Q4_K_M');
    for (const bad of ['', 'qwen 9b', 'a'.repeat(201), 3]) expect(ollamaModel(bad)).toBeNull();
  });

  it('writes the settings while keeping the other fields', async () => {
    writeFileSync(file(), JSON.stringify({ port: 5263, extra: true }));
    await saveSettings(dir, { ollama: { url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' } }, 'en');
    const text = readFileSync(file(), 'utf8');
    expect(JSON.parse(text)).toEqual({ port: 5263, extra: true, ollama: { url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' } });
    expect(text.endsWith('}\n')).toBe(true);
    expect(loadSettings(dir).port).toBe(5263);
  });

  it('creates the file when it does not exist', async () => {
    const nested = path.join(dir, 'data');
    await saveSettings(nested, { ollama: DEFAULT_OLLAMA }, 'en');
    expect(JSON.parse(readFileSync(path.join(nested, 'settings.json'), 'utf8'))).toEqual({ ollama: DEFAULT_OLLAMA });
  });

  it('refuses to replace an unreadable file', async () => {
    writeFileSync(file(), '{ "port": ');
    await expect(saveSettings(dir, { ollama: DEFAULT_OLLAMA }, 'en')).rejects.toMatchObject({
      status: 409,
      message: 'data/settings.json is unreadable: fix it before saving from the interface',
    });
    expect(readFileSync(file(), 'utf8')).toBe('{ "port": ');
  });
});

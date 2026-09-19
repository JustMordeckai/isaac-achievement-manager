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
  const dword = '\r\nHKEY_CURRENT_USER\Software\Valve\Steam\ActiveProcess\r\n    ActiveUser    REG_DWORD    0x12931529\r\n\r\n';

  it('lit une chaîne et un DWORD', () => {
    expect(parseRegQueryOutput(sz, 'SteamPath')).toBe('c:/program files (x86)/steam');
    expect(parseRegQueryOutput(dword, 'ActiveUser')).toBe(123456789);
    expect(parseRegQueryOutput(dword, 'activeuser')).toBe(123456789);
  });

  it('renvoie null pour une valeur absente', () => {
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

  it('détecte Steam, le compte actif et les comptes connus', () => {
    const env = detectSteamEnv({ readRegistry: fakeRegistry(steam, ME_ACCOUNT), fallbackSteamPaths: [] });
    expect(env.steamPath).toBe(path.normalize(steam));
    expect(env.activeAccountId).toBe(ME_ACCOUNT);
    expect(env.accounts).toEqual([
      { accountId: 123456789, steamId64: '76561198083722517', personaName: 'Player', hasIsaacData: true, lastLogin: 1789551543 },
      { accountId: 234567890, steamId64: '76561198194833618', personaName: 'Second Player', hasIsaacData: false, lastLogin: 1730151425 },
    ]);
  });

  it('reconnaît un compte qui a seulement des sauvegardes', () => {
    mkdirSync(path.join(steam, 'userdata', '234567890', '250900'), { recursive: true });
    const env = detectSteamEnv({ readRegistry: fakeRegistry(steam, null), fallbackSteamPaths: [] });
    expect(env.accounts.map((a) => a.hasIsaacData)).toEqual([true, true]);
  });

  it('utilise un chemin de secours si le registre ne répond pas', () => {
    const env = detectSteamEnv({
      readRegistry: fakeRegistry(null, null),
      fallbackSteamPaths: [path.join(steam, 'absent'), steam],
    });
    expect(env.steamPath).toBe(path.normalize(steam));
    expect(env.activeAccountId).toBeNull();
  });

  it('renvoie un environnement vide sans Steam', () => {
    expect(detectSteamEnv({ readRegistry: fakeRegistry(null, null), fallbackSteamPaths: [] })).toEqual({
      steamPath: null,
      activeAccountId: null,
      accounts: [],
    });
  });

  it('ajoute les comptes demandés absents de loginusers.vdf', () => {
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

  it('construit les chemins des fichiers Steam', () => {
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

  it('préfère le compte forcé, même sans données', () => {
    expect(chooseAccount(env(1, [account(1, true, 5), account(2, false, 1)]), 2)?.accountId).toBe(2);
  });

  it('renvoie null si le compte forcé est inconnu', () => {
    expect(chooseAccount(env(1, [account(1, true, 5)]), 3)).toBeNull();
  });

  it('prend le compte actif s’il a des données', () => {
    expect(chooseAccount(env(2, [account(1, true, 9), account(2, true, 1)]), null)?.accountId).toBe(2);
  });

  it('ignore un compte actif sans données', () => {
    expect(chooseAccount(env(2, [account(1, true, 1), account(2, false, 9)]), null)?.accountId).toBe(1);
  });

  it('prend la connexion la plus récente parmi les comptes avec données', () => {
    expect(chooseAccount(env(null, [account(1, true, 1), account(2, true, 9)]), null)?.accountId).toBe(2);
  });

  it('renvoie null sans compte avec données', () => {
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

  it('utilise les valeurs par défaut sans fichier', () => {
    expect(loadSettings(dir)).toEqual({ port: 5250, accountId: null, ollama: DEFAULT_OLLAMA, locale: 'en' });
    expect(loadSettings(path.join(dir, 'absent'))).toEqual({ port: 5250, accountId: null, ollama: DEFAULT_OLLAMA, locale: 'en' });
  });

  it('lit un fichier valide', () => {
    write(JSON.stringify({ port: 6000, accountId: 123456789, ollama: { url: 'http://10.0.0.5:11434/', model: 'qwen3.5:4b' } }));
    expect(loadSettings(dir)).toEqual({
      port: 6000,
      accountId: 123456789,
      ollama: { url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' },
      locale: 'en',
    });
  });

  it('ignore les valeurs invalides et un JSON illisible', () => {
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

  it('garde les réglages Ollama par défaut du serveur du LAN', () => {
    expect(DEFAULT_OLLAMA).toEqual({ url: 'http://127.0.0.1:11434', model: 'qwen3.5:9b' });
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
    await saveSettings(dir, { locale: 'fr' });
    expect(loadSettings(dir)).toEqual({
      port: 6000,
      accountId: null,
      ollama: { url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' },
      locale: 'fr',
    });
  });
});

describe('réglages Ollama', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'iam-ollama-'));
  });
  afterEach(() => removeDir(dir));
  const file = () => path.join(dir, 'settings.json');

  it('valide l’adresse du serveur', () => {
    expect(ollamaUrl(' http://127.0.0.1:11434/ ')).toBe('http://127.0.0.1:11434');
    expect(ollamaUrl('https://ollama.lan/api-proxy/')).toBe('https://ollama.lan/api-proxy');
    for (const bad of ['', 'ollama:11434', 'ftp://nas', 'http://user:pw@nas', 'http://nas/?x=1', 42, null]) {
      expect(ollamaUrl(bad)).toBeNull();
    }
  });

  it('valide le nom du modèle', () => {
    expect(ollamaModel(' qwen3.5:9b ')).toBe('qwen3.5:9b');
    expect(ollamaModel('hf.co/bartowski/Qwen-GGUF:Q4_K_M')).toBe('hf.co/bartowski/Qwen-GGUF:Q4_K_M');
    for (const bad of ['', 'qwen 9b', 'a'.repeat(201), 3]) expect(ollamaModel(bad)).toBeNull();
  });

  it('écrit les réglages en gardant les autres champs', async () => {
    writeFileSync(file(), JSON.stringify({ port: 5263, extra: true }));
    await saveSettings(dir, { ollama: { url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' } });
    const text = readFileSync(file(), 'utf8');
    expect(JSON.parse(text)).toEqual({ port: 5263, extra: true, ollama: { url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' } });
    expect(text.endsWith('}\n')).toBe(true);
    expect(loadSettings(dir).port).toBe(5263);
  });

  it('crée le fichier s’il n’existe pas', async () => {
    const nested = path.join(dir, 'data');
    await saveSettings(nested, { ollama: DEFAULT_OLLAMA });
    expect(JSON.parse(readFileSync(path.join(nested, 'settings.json'), 'utf8'))).toEqual({ ollama: DEFAULT_OLLAMA });
  });

  it('refuse de remplacer un fichier illisible', async () => {
    writeFileSync(file(), '{ "port": ');
    await expect(saveSettings(dir, { ollama: DEFAULT_OLLAMA })).rejects.toMatchObject({
      status: 409,
      message: "data/settings.json est illisible : corrige-le avant d'enregistrer depuis l'interface",
    });
    expect(readFileSync(file(), 'utf8')).toBe('{ "port": ');
  });
});

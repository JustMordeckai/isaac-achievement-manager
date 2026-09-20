import { DEFAULT_LOCALE, t, type Locale } from '../../shared/i18n/index.ts';
import type { ResolvedProfile } from '../../shared/types.ts';
import { APP_ID, isSteamId64 } from '../steam.ts';

/** `input`: unrecognized input; `invalid`: unexpected response from Steam. */
export type ProfileErrorKind = 'input' | 'notFound' | 'private' | 'invalid' | 'network';

export class ProfileError extends Error {
  kind: ProfileErrorKind;

  constructor(kind: ProfileErrorKind, message: string) {
    super(message);
    this.name = 'ProfileError';
    this.kind = kind;
  }
}

export interface ProfileAchievement {
  id: number;
  name: string;
  description: string;
  icon: string;
  iconGray: string;
  unlocked: boolean;
  /** Unix timestamp in seconds. */
  unlockedAt: number | null;
}

export interface ProfileStats {
  steamId64: string;
  achievements: ProfileAchievement[];
}

const STEAM_COMMUNITY = 'https://steamcommunity.com';
const NAMED_ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

function decodeText(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  if (cdata) return cdata[1];
  return raw.trim().replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const hex = code[1] === 'x' || code[1] === 'X';
      const codePoint = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** Decoded content of the first <name>...</name> tag, or null. */
function readTag(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? decodeText(match[1]) : null;
}

function fileName(url: string | null): string {
  if (!url) return '';
  return (url.split('/').pop() ?? '').split('?')[0];
}

function throwIfSteamError(xml: string, checkPrivacy: boolean, locale: Locale): void {
  const error = readTag(xml, 'error');
  if (error !== null) {
    if (/private/i.test(error)) throw new ProfileError('private', t(locale, 'errors.profilePrivate'));
    if (/could not be found/i.test(error)) throw new ProfileError('notFound', t(locale, 'errors.steamProfileNotFound'));
    throw new ProfileError('invalid', t(locale, 'errors.steamApiError', { error }));
  }
  const privacy = readTag(xml, 'privacyState');
  if (checkPrivacy && privacy !== null && privacy !== 'public') {
    throw new ProfileError('private', t(locale, 'errors.profilePrivate'));
  }
}

function readSteamId64(xml: string, locale: Locale): string {
  const steamId64 = readTag(xml, 'steamID64');
  if (!steamId64 || !isSteamId64(steamId64)) {
    throw new ProfileError('invalid', t(locale, 'errors.steamNoValidId'));
  }
  return steamId64;
}

export function parseProfileStatsXml(xml: string, locale: Locale = DEFAULT_LOCALE): ProfileStats {
  throwIfSteamError(xml, true, locale);
  const steamId64 = readSteamId64(xml, locale);
  const achievements: ProfileAchievement[] = [];
  for (const [, closed, body] of xml.matchAll(/<achievement closed="([01])">([\s\S]*?)<\/achievement>/g)) {
    const id = Number(readTag(body, 'apiname'));
    if (!Number.isInteger(id) || id <= 0) continue;
    const unlocked = closed === '1';
    const timestamp = Number(readTag(body, 'unlockTimestamp') ?? 0);
    achievements.push({
      id,
      name: readTag(body, 'name') ?? '',
      description: readTag(body, 'description') ?? '',
      icon: fileName(readTag(body, 'iconClosed')),
      iconGray: fileName(readTag(body, 'iconOpen')),
      unlocked,
      unlockedAt: unlocked && timestamp > 0 ? timestamp : null,
    });
  }
  if (achievements.length === 0) {
    throw new ProfileError('invalid', t(locale, 'errors.steamNoAchievements'));
  }
  return { steamId64, achievements: achievements.sort((a, b) => a.id - b.id) };
}

export function parseProfileXml(xml: string, locale: Locale = DEFAULT_LOCALE): ResolvedProfile {
  throwIfSteamError(xml, false, locale);
  return { steamId64: readSteamId64(xml, locale), name: readTag(xml, 'steamID') };
}

export type ProfileInput = { kind: 'id64'; value: string } | { kind: 'vanity'; value: string };

export function parseProfileInput(input: string): ProfileInput | null {
  const text = input.trim();
  if (isSteamId64(text)) return { kind: 'id64', value: text };
  const url = /steamcommunity\.com\/(profiles|id)\/([^/?#\s]+)/i.exec(text);
  if (url) {
    if (url[1].toLowerCase() === 'profiles') {
      return isSteamId64(url[2]) ? { kind: 'id64', value: url[2] } : null;
    }
    try {
      return { kind: 'vanity', value: decodeURIComponent(url[2]) };
    } catch {
      return null;
    }
  }
  return /^[A-Za-z0-9_-]{2,32}$/.test(text) ? { kind: 'vanity', value: text } : null;
}

export interface ProfileClient {
  getStats(steamId64: string, locale?: Locale): Promise<ProfileStats>;
  resolve(input: string, locale?: Locale): Promise<ResolvedProfile>;
}

export interface ProfileClientOptions {
  fetch?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

export function createProfileClient(options: ProfileClientOptions = {}): ProfileClient {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();

  async function getXml(url: string, locale: Locale): Promise<string> {
    let response: Response;
    try {
      response = await doFetch(url, {
        headers: { 'User-Agent': 'IsaacAchievementManager/0.1' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ProfileError('network', t(locale, 'errors.steamUnreachable', { message: error instanceof Error ? error.message : String(error) }));
    }
    if (!response.ok) throw new ProfileError('network', t(locale, 'errors.steamRespondedWith', { status: response.status }));
    return response.text();
  }

  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = load();
    cache.set(key, { at: now(), value });
    value.catch(() => {
      if (cache.get(key)?.value === value) cache.delete(key);
    });
    return value;
  }

  return {
    getStats(steamId64, locale = DEFAULT_LOCALE) {
      return cached(`stats:${steamId64}`, async () =>
        parseProfileStatsXml(await getXml(`${STEAM_COMMUNITY}/profiles/${steamId64}/stats/${APP_ID}/?xml=1`, locale), locale),
      );
    },
    async resolve(input, locale = DEFAULT_LOCALE) {
      const parsed = parseProfileInput(input);
      if (!parsed) {
        throw new ProfileError('input', t(locale, 'errors.profileInputInvalid'));
      }
      const target = parsed.kind === 'id64' ? `profiles/${parsed.value}` : `id/${encodeURIComponent(parsed.value)}`;
      return cached(`profile:${target}`, async () => parseProfileXml(await getXml(`${STEAM_COMMUNITY}/${target}/?xml=1`, locale), locale));
    },
  };
}

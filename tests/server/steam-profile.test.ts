import { describe, expect, it } from 'vitest';
import {
  createProfileClient,
  parseProfileInput,
  parseProfileStatsXml,
  parseProfileXml,
} from '../../server/sources/steam-profile.ts';
import { fixtureText, ME_ID64 } from './helpers/fixtures.ts';

const STATS_XML = fixtureText('profile-stats-me.xml');
const PROFILE_XML = fixtureText('profile-me.xml');
const NOT_FOUND_XML = fixtureText('profile-not-found.xml');

function errorOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('no error thrown');
}

function fakeFetch(handler: (url: string) => Response) {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return { fn, calls };
}

const xml = (body: string) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/xml' } });

describe('parseProfileStatsXml', () => {
  const stats = parseProfileStatsXml(STATS_XML);

  it('reads the 641 achievements of the public profile', () => {
    expect(stats.steamId64).toBe(ME_ID64);
    expect(stats.achievements).toHaveLength(641);
    expect(stats.achievements.filter((a) => a.unlocked)).toHaveLength(125);
    expect(stats.achievements[0]).toEqual({
      id: 1,
      name: 'Magdalene',
      description: 'Unlocked a new character.',
      icon: 'a36d7e92df7e991758907a75dfa55d36b52548c4.jpg',
      iconGray: 'fc5c40f3429120652211c9e95570752ba5810f22.jpg',
      unlocked: true,
      unlockedAt: 1676924125,
    });
    expect(stats.achievements.find((a) => a.id === 9)).toMatchObject({ name: 'The Nail', unlocked: false, unlockedAt: null });
  });

  it('decodes entities outside CDATA', () => {
    const body = `<playerstats><privacyState>public</privacyState><player><steamID64>${ME_ID64}</steamID64></player>
      <achievements><achievement closed="0"><name>Tom &amp; Jerry &#233;</name><apiname>5</apiname>
      <description>A &lt;b&gt;</description></achievement></achievements></playerstats>`;
    expect(parseProfileStatsXml(body).achievements).toEqual([
      { id: 5, name: 'Tom & Jerry é', description: 'A <b>', icon: '', iconGray: '', unlocked: false, unlockedAt: null },
    ]);
  });

  it('leaves a numeric entity outside the Unicode range as is', () => {
    const body = `<playerstats><privacyState>public</privacyState><player><steamID64>${ME_ID64}</steamID64></player>
      <achievements><achievement closed="0"><name>&#x110000;</name><apiname>5</apiname>
      <description>Desc</description></achievement></achievements></playerstats>`;
    expect(parseProfileStatsXml(body).achievements).toEqual([
      { id: 5, name: '&#x110000;', description: 'Desc', icon: '', iconGray: '', unlocked: false, unlockedAt: null },
    ]);
  });

  it('reports a profile that was not found', () => {
    expect(errorOf(() => parseProfileStatsXml(NOT_FOUND_XML))).toMatchObject({ kind: 'notFound', message: 'Steam profile not found' });
  });

  it('reports a private profile', () => {
    const privateStats = '<playerstats><privacyState>private</privacyState></playerstats>';
    const privateError = '<response><error><![CDATA[This profile is private.]]></error></response>';
    expect(errorOf(() => parseProfileStatsXml(privateStats))).toMatchObject({ kind: 'private' });
    expect(errorOf(() => parseProfileStatsXml(privateError))).toMatchObject({ kind: 'private' });
  });

  it('reports an unusable response', () => {
    const other = '<response><error>Something else</error></response>';
    const empty = `<playerstats><privacyState>public</privacyState><player><steamID64>${ME_ID64}</steamID64></player></playerstats>`;
    expect(errorOf(() => parseProfileStatsXml(other))).toMatchObject({ kind: 'invalid', message: expect.stringContaining('Something else') });
    expect(errorOf(() => parseProfileStatsXml(empty))).toMatchObject({ kind: 'invalid' });
    expect(errorOf(() => parseProfileStatsXml('<playerstats></playerstats>'))).toMatchObject({ kind: 'invalid' });
  });
});

describe('parseProfileXml', () => {
  it('reads the SteamID64 and the nickname', () => {
    expect(parseProfileXml(PROFILE_XML)).toEqual({ steamId64: ME_ID64, name: 'Player' });
  });

  it('resolves a private profile (only the stats are blocked)', () => {
    const body = `<profile><steamID64>${ME_ID64}</steamID64><steamID><![CDATA[X]]></steamID><privacyState>private</privacyState></profile>`;
    expect(parseProfileXml(body)).toEqual({ steamId64: ME_ID64, name: 'X' });
  });

  it('reports a profile that was not found', () => {
    expect(errorOf(() => parseProfileXml(NOT_FOUND_XML))).toMatchObject({ kind: 'notFound' });
  });
});

describe('parseProfileInput', () => {
  it.each([
    ['76561198083722517', { kind: 'id64', value: '76561198083722517' }],
    ['  https://steamcommunity.com/profiles/76561198083722517/  ', { kind: 'id64', value: '76561198083722517' }],
    ['steamcommunity.com/profiles/76561198083722517', { kind: 'id64', value: '76561198083722517' }],
    ['https://steamcommunity.com/id/JustMordeckai/', { kind: 'vanity', value: 'JustMordeckai' }],
    ['JustMordeckai', { kind: 'vanity', value: 'JustMordeckai' }],
    ['https://steamcommunity.com/profiles/123/', null],
    ['https://steamcommunity.com/id/%E0%A4%A/', null],
    ['not a profile !', null],
    ['', null],
  ])('%s', (input, expected) => {
    expect(parseProfileInput(input)).toEqual(expected);
  });
});

describe('createProfileClient', () => {
  it('caches the stats for the configured duration', async () => {
    let now = 0;
    const f = fakeFetch(() => xml(STATS_XML));
    const client = createProfileClient({ fetch: f.fn, now: () => now, ttlMs: 1000 });
    await client.getStats(ME_ID64);
    await client.getStats(ME_ID64);
    expect(f.calls).toEqual([`https://steamcommunity.com/profiles/${ME_ID64}/stats/250900/?xml=1`]);
    now = 1001;
    await client.getStats(ME_ID64);
    expect(f.calls).toHaveLength(2);
  });

  it('does not cache failures', async () => {
    let fail = true;
    const f = fakeFetch(() => (fail ? new Response('oops', { status: 503 }) : xml(STATS_XML)));
    const client = createProfileClient({ fetch: f.fn });
    await expect(client.getStats(ME_ID64)).rejects.toMatchObject({ kind: 'network', message: 'Steam responded with 503' });
    fail = false;
    await expect(client.getStats(ME_ID64)).resolves.toMatchObject({ steamId64: ME_ID64 });
  });

  it('reports an unreachable network', async () => {
    const client = createProfileClient({
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    await expect(client.getStats(ME_ID64)).rejects.toMatchObject({ kind: 'network', message: 'Steam unreachable: fetch failed' });
  });

  it('resolves a custom nickname', async () => {
    const f = fakeFetch(() => xml(PROFILE_XML));
    const client = createProfileClient({ fetch: f.fn });
    await expect(client.resolve('https://steamcommunity.com/id/JustMordeckai/')).resolves.toEqual({ steamId64: ME_ID64, name: 'Player' });
    expect(f.calls).toEqual(['https://steamcommunity.com/id/JustMordeckai/?xml=1']);
  });

  it('resolves a SteamID64 through the profile page', async () => {
    const f = fakeFetch(() => xml(PROFILE_XML));
    const client = createProfileClient({ fetch: f.fn });
    await client.resolve(ME_ID64);
    expect(f.calls).toEqual([`https://steamcommunity.com/profiles/${ME_ID64}/?xml=1`]);
  });

  it('refuses an unreadable input without calling Steam', async () => {
    const f = fakeFetch(() => xml(PROFILE_XML));
    const client = createProfileClient({ fetch: f.fn });
    await expect(client.resolve('not a profile !')).rejects.toMatchObject({ kind: 'input' });
    expect(f.calls).toHaveLength(0);
  });
});

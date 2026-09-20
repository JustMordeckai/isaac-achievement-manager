import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWikiClient, WIKI_USER_AGENT } from '../../server/wiki/client.ts';
import { fixtureText } from './helpers/fixtures.ts';

const BATCH = fixtureText('wiki/batch-sample.json');
const BATCH_TITLES = ['the Nail', 'Re-Lax', 'Basement Boy', 'Jacob and Esau', 'Lucky Rock'];

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'iam-wiki-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const json = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'application/json' } });

/** Synthetic response: every requested title exists and holds "text of <title>". */
function echo(url: string): Response {
  const titles = new URL(url).searchParams.get('titles')?.split('|') ?? [];
  const pages = titles.map((title) => ({ title, revisions: [{ slots: { main: { content: `text of ${title}` } } }] }));
  return json(JSON.stringify({ batchcomplete: true, query: { pages } }));
}

describe('createWikiClient', () => {
  // 120 files written to the cache: when the whole suite runs in parallel, this can exceed 5s.
  it('queries the API in batches of 50 with a one second pause and the tool\'s user agent', { timeout: 20_000 }, async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => echo(String(input)));
    const sleep = vi.fn(async () => {});
    const progress: string[] = [];
    const client = createWikiClient({ cacheDir: dir, fetch: fetchMock, sleep });
    const titles = Array.from({ length: 120 }, (_, i) => `Page ${i}`);

    const result = await client.fetchPages(titles, (done, total) => progress.push(`${done}/${total}`));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1000], [1000]]);
    expect(progress).toEqual(['1/3', '2/3', '3/3']);
    const [firstUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const params = new URL(firstUrl).searchParams;
    expect(params.get('action')).toBe('query');
    expect(params.get('formatversion')).toBe('2');
    expect(params.get('redirects')).toBe('1');
    expect(params.get('titles')?.split('|')).toHaveLength(50);
    expect(init.headers).toEqual({ 'User-Agent': WIKI_USER_AGENT });
    expect(result.pages.get('Page 119')).toBe('text of Page 119');
    expect(result.fromCache).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('resolves normalized titles, redirects with an anchor, and missing pages', async () => {
    const client = createWikiClient({ cacheDir: dir, fetch: async () => json(BATCH), sleep: async () => {} });
    const result = await client.fetchPages(BATCH_TITLES);

    expect(result.resolved.get('the Nail')).toEqual({ title: 'The Nail', fragment: null });
    expect(result.resolved.get('Re-Lax')).toEqual({ title: 'Pills', fragment: 'Re-Lax' });
    expect(result.resolved.get('Jacob and Esau')).toEqual({ title: 'Jacob & Esau', fragment: null });
    expect(result.resolved.get('Basement Boy')).toEqual({ title: 'Basement Boy', fragment: null });
    expect(result.pages.get('Basement Boy')).toBeNull();
    expect(result.pages.get('The Nail')).toMatch(/^\{\{infobox activated collectible/);
    expect(result.pages.get('Pills')?.length).toBeGreaterThan(1000);
  });

  it('retries once then falls back to the disk cache, redirects included', async () => {
    await createWikiClient({ cacheDir: dir, fetch: async () => json(BATCH), sleep: async () => {} }).fetchPages(BATCH_TITLES);

    const failing = vi.fn(async () => {
      throw new Error('network down');
    });
    const sleep = vi.fn(async () => {});
    const result = await createWikiClient({ cacheDir: dir, fetch: failing, sleep }).fetchPages([...BATCH_TITLES, 'Unknown']);

    expect(failing).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(result.resolved.get('Re-Lax')).toEqual({ title: 'Pills', fragment: 'Re-Lax' });
    expect(result.pages.get('The Nail')).toMatch(/^\{\{infobox activated collectible/);
    expect(result.pages.get('Basement Boy')).toBeNull();
    expect(result.fromCache).toEqual(BATCH_TITLES);
    expect(result.failed).toEqual(['Unknown']);
  });

  it('succeeds on the second attempt', async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL) => Promise<Response>>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementation(async (input) => echo(String(input)));
    const result = await createWikiClient({ cacheDir: dir, fetch: fetchMock, sleep: async () => {} }).fetchPages(['A']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.pages.get('A')).toBe('text of A');
    expect(result.fromCache).toEqual([]);
  });

  it('treats an HTTP error or an API error as a failure', async () => {
    const http = await createWikiClient({ cacheDir: dir, fetch: async () => json('{}', 503), sleep: async () => {} }).fetchPages(['A']);
    expect(http.failed).toEqual(['A']);
    const api = await createWikiClient({
      cacheDir: dir,
      fetch: async () => json(JSON.stringify({ error: { info: 'Too many titles' } })),
      sleep: async () => {},
    }).fetchPages(['B']);
    expect(api.failed).toEqual(['B']);
  });

  it('falls back to the cache for a page present without content', async () => {
    const truncated = JSON.stringify({ query: { pages: [{ title: 'A' }] } });
    const result = await createWikiClient({ cacheDir: dir, fetch: async () => json(truncated), sleep: async () => {} }).fetchPages(['A']);
    expect(result.failed).toEqual(['A']);
    expect(result.pages.has('A')).toBe(false);
  });

  it('ignores a disk cache write failure without failing the sync', async () => {
    const hash = createHash('sha1').update('A').digest('hex');
    await mkdir(path.join(dir, 'pages', `${hash}.json`), { recursive: true }); // blocks the cache rename
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => echo(String(input)));
    const result = await createWikiClient({ cacheDir: dir, fetch: fetchMock, sleep: async () => {} }).fetchPages(['A']);
    expect(result.pages.get('A')).toBe('text of A');
    expect(result.failed).toEqual([]);
  });

  it('distinguishes in the cache two titles that differ only by case', async () => {
    await createWikiClient({ cacheDir: dir, fetch: async (input) => echo(String(input)), sleep: async () => {} }).fetchPages([
      'Pong',
      'PONG',
    ]);
    expect(await readdir(path.join(dir, 'pages'))).toHaveLength(2);
    const offline = await createWikiClient({
      cacheDir: dir,
      fetch: async () => {
        throw new Error('offline');
      },
      sleep: async () => {},
    }).fetchPages(['PONG']);
    expect(offline.pages.get('PONG')).toBe('text of PONG');
  });
});

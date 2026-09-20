import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checksumFor, createUpdateService, dropPrevious, latestRelease, previousPath, swap } from '../../server/update.ts';
import type { UpdateEvent } from '../../shared/types.ts';

const RELEASES = 'https://api.github.com/repos/JustMordeckai/isaac-achievement-manager/releases/latest';
const EXE_URL = 'https://github.com/JustMordeckai/isaac-achievement-manager/releases/download/v0.2.0/Isaac.exe';
const SUMS_URL = 'https://github.com/JustMordeckai/isaac-achievement-manager/releases/download/v0.2.0/SHA256SUMS.txt';
const NEW_EXE = 'MZ this is the new executable';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function release(assets: Array<{ name: string; size: number; url: string }>, tag = 'v0.2.0') {
  return {
    tag_name: tag,
    html_url: `https://github.com/JustMordeckai/isaac-achievement-manager/releases/tag/${tag}`,
    assets: assets.map((asset) => ({ name: asset.name, size: asset.size, browser_download_url: asset.url })),
  };
}

const FULL_RELEASE = release([
  { name: 'Isaac.exe', size: NEW_EXE.length, url: EXE_URL },
  { name: 'SHA256SUMS.txt', size: 96, url: SUMS_URL },
]);

/** Fake fetch: one answer per url, and the list of the urls that were asked for. */
function fetcher(answers: Record<string, () => Response>): typeof fetch & { urls: string[] } {
  const urls: string[] = [];
  const call = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const answer = answers[url];
    if (!answer) throw new Error(`no answer for ${url}`);
    return answer();
  }) as typeof fetch & { urls: string[] };
  call.urls = urls;
  return call;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function collect(): { events: UpdateEvent[]; send: (event: UpdateEvent) => void } {
  const events: UpdateEvent[] = [];
  return { events, send: (event) => events.push(event) };
}

/** A folder holding a file that stands in for the running executable. */
function fakeExe(content = 'MZ the running executable'): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'iam-update-'));
  const exe = path.join(directory, 'Isaac Achievement Manager.exe');
  writeFileSync(exe, content);
  return exe;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('latestRelease', () => {
  it('reads the version and picks the executable and the checksum file', async () => {
    const files = await latestRelease('en', fetcher({ [RELEASES]: () => json(FULL_RELEASE) }));
    expect(files.version).toBe('0.2.0');
    expect(files.exe).toEqual({ name: 'Isaac.exe', url: EXE_URL, size: NEW_EXE.length });
    expect(files.sums).toBe(SUMS_URL);
  });

  it('accepts a release without any file to install', async () => {
    const files = await latestRelease('en', fetcher({ [RELEASES]: () => json(release([])) }));
    expect(files.exe).toBeNull();
    expect(files.sums).toBeNull();
  });

  it('says what went wrong rather than throwing something unreadable', async () => {
    const refused = fetcher({ [RELEASES]: () => json({ message: 'rate limited' }, 403) });
    await expect(latestRelease('en', refused)).rejects.toThrow('HTTP 403');

    const gibberish = fetcher({ [RELEASES]: () => new Response('<html>', { status: 200 }) });
    await expect(latestRelease('en', gibberish)).rejects.toThrow(/not readable/);

    const offline = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    await expect(latestRelease('en', offline)).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe('checksumFor', () => {
  const digest = sha256(NEW_EXE);

  it('finds the line of a file, with or without the binary star', () => {
    expect(checksumFor(`${digest} *Isaac.exe`, 'Isaac.exe')).toBe(digest);
    expect(checksumFor(`${digest}  Isaac.exe\n`, 'Isaac.exe')).toBe(digest);
    expect(checksumFor(`${digest} *dist/Isaac.exe`, 'Isaac.exe')).toBe(digest);
  });

  it('answers nothing when the file is not in there', () => {
    expect(checksumFor(`${digest} *other.exe`, 'Isaac.exe')).toBeNull();
    expect(checksumFor('not a checksum file', 'Isaac.exe')).toBeNull();
  });
});

describe('swap', () => {
  it('moves the running executable aside and puts the downloaded one in its place', async () => {
    const exe = fakeExe('old');
    const downloaded = `${exe}.new`;
    writeFileSync(downloaded, 'new');

    await swap(exe, downloaded);

    expect(readFileSync(exe, 'utf8')).toBe('new');
    expect(readFileSync(previousPath(exe), 'utf8')).toBe('old');
    expect(existsSync(downloaded)).toBe(false);

    await dropPrevious(exe);
    expect(existsSync(previousPath(exe))).toBe(false);
  });

  it('puts the running executable back when the second move fails', async () => {
    const exe = fakeExe('old');
    await expect(swap(exe, `${exe}.missing`)).rejects.toThrow();
    expect(readFileSync(exe, 'utf8')).toBe('old');
  });
});

describe('check', () => {
  it('compares the published version with the running one', async () => {
    const service = createUpdateService({
      execPath: fakeExe(),
      fetcher: fetcher({ [RELEASES]: () => json(FULL_RELEASE) }),
      version: '0.1.0',
    });
    expect(await service.check('en')).toMatchObject({
      current: '0.1.0',
      latest: '0.2.0',
      newer: true,
      standalone: true,
      downloadable: true,
      installed: false,
    });
  });

  it('reports no update when the release is the running version', async () => {
    const service = createUpdateService({
      execPath: fakeExe(),
      fetcher: fetcher({ [RELEASES]: () => json(FULL_RELEASE) }),
      version: '0.2.0',
    });
    expect(await service.check('en')).toMatchObject({ newer: false });
  });

  it('says the app cannot replace itself when it runs from its sources', async () => {
    const service = createUpdateService({
      execPath: null,
      fetcher: fetcher({ [RELEASES]: () => json(FULL_RELEASE) }),
      version: '0.1.0',
    });
    expect(await service.check('en')).toMatchObject({ newer: true, standalone: false, downloadable: false });
  });
});

describe('install', () => {
  const answers = {
    [RELEASES]: () => json(FULL_RELEASE),
    [SUMS_URL]: () => new Response(`${sha256(NEW_EXE)} *Isaac.exe\n`, { status: 200 }),
    [EXE_URL]: () => new Response(NEW_EXE, { status: 200 }),
  };

  it('downloads the new executable, checks it and puts it in place', async () => {
    const exe = fakeExe('old');
    const service = createUpdateService({ execPath: exe, fetcher: fetcher(answers), version: '0.1.0' });
    const { events, send } = collect();

    await service.install(send, 'en');

    expect(events.at(-1)).toEqual({ step: 'done', message: expect.stringContaining('0.2.0') });
    expect(readFileSync(exe, 'utf8')).toBe(NEW_EXE);
    expect(readFileSync(previousPath(exe), 'utf8')).toBe('old');
    expect(service.isInstalled()).toBe(true);
  });

  it('leaves the running executable alone when the checksum does not match', async () => {
    const exe = fakeExe('old');
    const wrong = { ...answers, [SUMS_URL]: () => new Response(`${sha256('something else')} *Isaac.exe\n`, { status: 200 }) };
    const service = createUpdateService({ execPath: exe, fetcher: fetcher(wrong), version: '0.1.0' });
    const { events, send } = collect();

    await service.install(send, 'en');

    expect(events.at(-1)?.step).toBe('error');
    expect(readFileSync(exe, 'utf8')).toBe('old');
    expect(existsSync(`${exe}.new`)).toBe(false);
    expect(service.isInstalled()).toBe(false);
  });

  it('installs anyway when the release carries no checksum file', async () => {
    const exe = fakeExe('old');
    const withoutSums = {
      [RELEASES]: () => json(release([{ name: 'Isaac.exe', size: NEW_EXE.length, url: EXE_URL }])),
      [EXE_URL]: () => new Response(NEW_EXE, { status: 200 }),
    };
    const service = createUpdateService({ execPath: exe, fetcher: fetcher(withoutSums), version: '0.1.0' });
    const { events, send } = collect();

    await service.install(send, 'en');

    expect(events.at(-1)?.step).toBe('done');
    expect(readFileSync(exe, 'utf8')).toBe(NEW_EXE);
  });

  it('refuses when the download is cut short', async () => {
    const exe = fakeExe('old');
    const short = { ...answers, [EXE_URL]: () => new Response(NEW_EXE.slice(0, 4), { status: 200 }) };
    const service = createUpdateService({ execPath: exe, fetcher: fetcher(short), version: '0.1.0' });
    const { events, send } = collect();

    await service.install(send, 'en');

    expect(events.at(-1)?.step).toBe('error');
    expect(readFileSync(exe, 'utf8')).toBe('old');
  });

  it('refuses to update a copy running from its sources, and a version that is already the latest', async () => {
    const fromSources = createUpdateService({ execPath: null, fetcher: fetcher(answers), version: '0.1.0' });
    const sources = collect();
    await fromSources.install(sources.send, 'en');
    expect(sources.events).toEqual([{ step: 'error', message: expect.stringContaining('git pull') }]);

    const latest = createUpdateService({ execPath: fakeExe(), fetcher: fetcher(answers), version: '0.2.0' });
    const already = collect();
    await latest.install(already.send, 'en');
    expect(already.events.at(-1)).toEqual({ step: 'error', message: expect.stringContaining('latest') });
  });
});

describe('restart', () => {
  it('starts the new executable and stops this one, once an update is in place', async () => {
    const exe = fakeExe('old');
    const relaunch = vi.fn();
    const onRestart = vi.fn();
    const service = createUpdateService({
      execPath: exe,
      fetcher: fetcher({
        [RELEASES]: () => json(FULL_RELEASE),
        [SUMS_URL]: () => new Response(`${sha256(NEW_EXE)} *Isaac.exe\n`, { status: 200 }),
        [EXE_URL]: () => new Response(NEW_EXE, { status: 200 }),
      }),
      version: '0.1.0',
      relaunch,
      onRestart,
    });

    expect(service.restart()).toBe(false);
    expect(relaunch).not.toHaveBeenCalled();

    await service.install(() => {}, 'en');
    expect(service.restart()).toBe(true);
    expect(relaunch).toHaveBeenCalledWith(exe);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { t, type Locale } from '../shared/i18n/index.ts';
import type { UpdateEvent, UpdateState } from '../shared/types.ts';
import { APP_VERSION, REPOSITORY, compareVersions } from '../shared/version.ts';

/**
 * Updating the executable without asking anyone to download anything again: the app reads the latest
 * release on GitHub, downloads the new executable next to the running one, checks its checksum, and
 * swaps the two. Windows refuses to overwrite a running executable but accepts renaming it, which is
 * exactly what the swap does; the old file is dropped on the next start.
 *
 * Everything that touches the outside is injected, so the tests neither call GitHub nor rename a
 * real executable.
 */

const RELEASES = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const SUMS_NAME = 'SHA256SUMS.txt';
/** GitHub asks for a user agent and answers 403 without one. */
const HEADERS = { 'User-Agent': `isaac-achievement-manager/${APP_VERSION}`, Accept: 'application/vnd.github+json' };
/** Beyond this, the answer is not a release: something else is at the other end. */
const MAX_JSON = 1024 * 1024;
/** One progress line every two megabytes: enough to see it move, few enough to stay readable. */
const PROGRESS_STEP = 2 * 1024 * 1024;

export type Fetcher = typeof fetch;

interface ReleaseAsset {
  name?: unknown;
  size?: unknown;
  browser_download_url?: unknown;
}

interface Release {
  tag_name?: unknown;
  html_url?: unknown;
  assets?: unknown;
}

/** The .exe of a release, and the file holding its checksum when the release carries one. */
export interface ReleaseFiles {
  version: string;
  page: string;
  exe: { name: string; url: string; size: number } | null;
  sums: string | null;
}

/** Reads the latest release; throws with a readable message when GitHub says anything else. */
export async function latestRelease(locale: Locale, fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<ReleaseFiles> {
  let response: Response;
  try {
    response = await fetcher(RELEASES, { headers: HEADERS, signal });
  } catch (error) {
    throw new Error(t(locale, 'update.unreachable', { message: messageOf(error) }));
  }
  if (!response.ok) throw new Error(t(locale, 'update.refused', { status: response.status }));
  const text = (await response.text()).slice(0, MAX_JSON);
  let release: Release;
  try {
    release = JSON.parse(text) as Release;
  } catch {
    throw new Error(t(locale, 'update.unreadable'));
  }
  const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/i, '') : '';
  if (!version) throw new Error(t(locale, 'update.unreadable'));
  const assets = Array.isArray(release.assets) ? (release.assets as ReleaseAsset[]) : [];
  const named = (test: (name: string) => boolean) =>
    assets.find((asset) => typeof asset.name === 'string' && typeof asset.browser_download_url === 'string' && test(asset.name));
  const exe = named((name) => name.toLowerCase().endsWith('.exe'));
  const sums = named((name) => name === SUMS_NAME);
  return {
    version,
    page: typeof release.html_url === 'string' ? release.html_url : `https://github.com/${REPOSITORY}/releases`,
    exe: exe
      ? {
          name: String(exe.name),
          url: String(exe.browser_download_url),
          size: typeof exe.size === 'number' ? exe.size : 0,
        }
      : null,
    sums: sums ? String(sums.browser_download_url) : null,
  };
}

/** The sha256 written for `name` in a SHA256SUMS file, or null when the file says nothing about it. */
export function checksumFor(sums: string, name: string): string | null {
  for (const line of sums.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (match && path.basename(match[2].trim()) === name) return match[1].toLowerCase();
  }
  return null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface UpdateService {
  /** Current version, and the published one when it is newer. */
  check(locale: Locale): Promise<UpdateState>;
  /** Downloads the published executable and puts it in place of the running one. */
  install(onEvent: (event: UpdateEvent) => void, locale: Locale, signal?: AbortSignal): Promise<void>;
  /** True once the swap is done: only a restart is left. */
  isInstalled(): boolean;
  isRunning(): boolean;
  /** Starts the new executable and stops this one; does nothing when no update is in place. */
  restart(): boolean;
}

export interface UpdateOptions {
  /** Path of the running executable, and null when the app runs from its sources. */
  execPath: string | null;
  fetcher?: Fetcher;
  /** Starts the executable again, once the file has been replaced. */
  relaunch?: (execPath: string) => void;
  /** Called after the new executable has been started, to stop this one. */
  onRestart?: () => void;
  version?: string;
}

/** Name of the file the download writes, and of the one the running executable is moved to. */
export const downloadPath = (execPath: string) => `${execPath}.new`;
export const previousPath = (execPath: string) => `${execPath}.old`;

/** Removes the executable left behind by the previous update, if any. Called at startup. */
export async function dropPrevious(execPath: string | null): Promise<void> {
  if (!execPath) return;
  await rm(previousPath(execPath), { force: true }).catch(() => {});
}

export function createUpdateService({
  execPath,
  fetcher = fetch,
  relaunch = defaultRelaunch,
  onRestart,
  version = APP_VERSION,
}: UpdateOptions): UpdateService {
  let running = false;
  let installed = false;

  async function check(locale: Locale): Promise<UpdateState> {
    const release = await latestRelease(locale, fetcher);
    return {
      current: version,
      latest: release.version,
      newer: compareVersions(release.version, version) > 0,
      standalone: execPath !== null,
      downloadable: execPath !== null && release.exe !== null,
      page: release.page,
      installed,
    };
  }

  async function install(onEvent: (event: UpdateEvent) => void, locale: Locale, signal?: AbortSignal): Promise<void> {
    if (running) {
      onEvent({ step: 'error', message: t(locale, 'update.busy') });
      return;
    }
    if (!execPath) {
      onEvent({ step: 'error', message: t(locale, 'update.fromSources') });
      return;
    }
    running = true;
    try {
      await download(execPath, onEvent, locale, signal);
    } catch (error) {
      onEvent({ step: 'error', message: messageOf(error) });
    } finally {
      running = false;
    }
  }

  async function download(exe: string, onEvent: (event: UpdateEvent) => void, locale: Locale, signal?: AbortSignal) {
    const release = await latestRelease(locale, fetcher, signal);
    if (compareVersions(release.version, version) <= 0) {
      onEvent({ step: 'error', message: t(locale, 'update.alreadyLatest') });
      return;
    }
    if (!release.exe) {
      onEvent({ step: 'error', message: t(locale, 'update.noAsset') });
      return;
    }
    const expected = release.sums ? await wantedChecksum(release.sums, release.exe.name, fetcher, signal) : null;

    onEvent({ step: 'progress', message: t(locale, 'update.downloading', { version: release.version }), done: 0, total: release.exe.size });
    const temporary = downloadPath(exe);
    await rm(temporary, { force: true });
    const digest = await writeAsset(release.exe.url, temporary, release.exe.size, onEvent, locale, fetcher, signal);

    const written = (await stat(temporary)).size;
    if (release.exe.size > 0 && written !== release.exe.size) {
      await rm(temporary, { force: true });
      onEvent({ step: 'error', message: t(locale, 'update.sizeMismatch') });
      return;
    }
    if (expected && expected !== digest) {
      await rm(temporary, { force: true });
      onEvent({ step: 'error', message: t(locale, 'update.checksumMismatch') });
      return;
    }

    onEvent({ step: 'progress', message: t(locale, 'update.installing') });
    await swap(exe, temporary);
    installed = true;
    onEvent({ step: 'done', message: t(locale, 'update.ready', { version: release.version }) });
  }

  async function wantedChecksum(url: string, name: string, get: Fetcher, signal?: AbortSignal): Promise<string | null> {
    try {
      const response = await get(url, { headers: HEADERS, signal });
      if (!response.ok) return null;
      return checksumFor((await response.text()).slice(0, MAX_JSON), name);
    } catch {
      // No checksum file: the size check is what is left.
      return null;
    }
  }

  function restart(): boolean {
    if (!installed || !execPath) return false;
    relaunch(execPath);
    onRestart?.();
    return true;
  }

  return { check, install, isInstalled: () => installed, isRunning: () => running, restart };
}

/**
 * Writes the asset to `target` and returns its sha256. The progress is sent every few megabytes
 * rather than on every chunk, which would flood the stream.
 */
async function writeAsset(
  url: string,
  target: string,
  total: number,
  onEvent: (event: UpdateEvent) => void,
  locale: Locale,
  fetcher: Fetcher,
  signal?: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: HEADERS, signal, redirect: 'follow' });
  } catch (error) {
    throw new Error(t(locale, 'update.unreachable', { message: messageOf(error) }));
  }
  if (!response.ok || !response.body) throw new Error(t(locale, 'update.refused', { status: response.status }));

  const hash = createHash('sha256');
  const file = createWriteStream(target);
  const reader = response.body.getReader();
  let done = 0;
  let sent = 0;
  try {
    for (;;) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      hash.update(value);
      done += value.byteLength;
      if (!file.write(value)) await once(file, 'drain');
      if (done - sent >= PROGRESS_STEP) {
        sent = done;
        onEvent({ step: 'progress', message: t(locale, 'update.downloadingFile'), done, total });
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    file.end();
    await once(file, 'close');
  }
  return hash.digest('hex');
}

/**
 * Puts the downloaded file in place of the running one. Windows keeps a running executable locked
 * against writes and deletes, so the file is renamed out of the way instead; if the second rename
 * fails, the first one is undone and the app stays as it was.
 */
export async function swap(exe: string, downloaded: string): Promise<void> {
  const previous = previousPath(exe);
  await rm(previous, { force: true });
  await rename(exe, previous);
  try {
    await rename(downloaded, exe);
  } catch (error) {
    await rename(previous, exe).catch(() => {});
    throw error;
  }
}

/**
 * Starts the replaced executable, detached, so it outlives the process that is about to stop. The
 * browser is left alone: the page that asked for the update is still open and comes back on its own
 * once the new server answers.
 */
function defaultRelaunch(execPath: string): void {
  spawn(execPath, ['--no-open'], { detached: true, stdio: 'ignore' }).unref();
}

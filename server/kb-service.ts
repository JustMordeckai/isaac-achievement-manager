import { readFile, stat } from 'node:fs/promises';
import { DEFAULT_LOCALE, t, type Locale } from '../shared/i18n/index.ts';
import type { KbStatus, WikiSyncEvent, WikiSyncReport } from '../shared/types.ts';
import { writeFileAtomic } from './fs-atomic.ts';
import { KB_VERSION, type KnowledgeBase } from './wiki/kb-types.ts';

export class SyncBusyError extends Error {
  constructor(locale: Locale) {
    super(t(locale, 'wiki.syncBusy'));
    this.name = 'SyncBusyError';
  }
}

export interface KbService {
  /** Current wiki database, reread only when the file has changed. */
  get(): Promise<KnowledgeBase | null>;
  status(locale: Locale): Promise<KbStatus>;
  isRunning(): boolean;
  /** Starts a sync; the final event is `done` or `error`. */
  sync(onEvent: (event: WikiSyncEvent) => void, locale: Locale): Promise<WikiSyncReport>;
}

export interface KbServiceOptions {
  file: string;
  build: (onEvent: (event: WikiSyncEvent) => void, locale: Locale) => Promise<KnowledgeBase>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createKbService({ file, build }: KbServiceOptions): KbService {
  let cache: { mtimeMs: number; size: number; kb: KnowledgeBase } | null = null;
  let running = false;
  let lastError: string | null = null;

  async function load(locale: Locale): Promise<{ kb: KnowledgeBase | null; error: string | null }> {
    let info;
    try {
      info = await stat(file);
    } catch {
      cache = null;
      return { kb: null, error: null };
    }
    if (cache && cache.mtimeMs === info.mtimeMs && cache.size === info.size) return { kb: cache.kb, error: null };
    try {
      const kb = JSON.parse(await readFile(file, 'utf8')) as KnowledgeBase;
      if (kb.version !== KB_VERSION) {
        return { kb: null, error: t(locale, 'wiki.wrongVersion', { version: kb.version }) };
      }
      cache = { mtimeMs: info.mtimeMs, size: info.size, kb };
      return { kb, error: null };
    } catch (error) {
      return { kb: null, error: t(locale, 'wiki.unreadable', { message: messageOf(error) }) };
    }
  }

  return {
    async get() {
      return (await load(DEFAULT_LOCALE)).kb;
    },

    async status(locale) {
      const { kb, error } = await load(locale);
      const failure = lastError ? { message: t(locale, 'wiki.lastSyncFailed', { error: lastError }) } : {};
      if (kb) return { state: 'ok', syncedAt: kb.syncedAt, running, ...failure };
      if (error) {
        const message = lastError ? t(locale, 'wiki.errorAndLastSyncFailed', { error, lastError }) : error;
        return { state: 'error', syncedAt: null, running, message };
      }
      return { state: 'absent', syncedAt: null, running, ...failure };
    },

    isRunning() {
      return running;
    },

    async sync(onEvent, locale) {
      if (running) throw new SyncBusyError(locale);
      running = true;
      try {
        const kb = await build(onEvent, locale);
        onEvent({ step: 'write', done: 0, total: 1, message: t(locale, 'wiki.writingDatabase') });
        await writeFileAtomic(file, JSON.stringify(kb));
        lastError = null;
        onEvent({ step: 'done', done: 1, total: 1, message: t(locale, 'wiki.syncDone'), report: kb.report });
        return kb.report;
      } catch (error) {
        lastError = messageOf(error);
        onEvent({ step: 'error', done: 0, total: 1, message: lastError });
        throw error;
      } finally {
        running = false;
      }
    },
  };
}

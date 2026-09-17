import { readFile, stat } from 'node:fs/promises';
import type { KbStatus, WikiSyncEvent, WikiSyncReport } from '../shared/types.ts';
import { writeFileAtomic } from './fs-atomic.ts';
import { KB_VERSION, type KnowledgeBase } from './wiki/kb-types.ts';

export class SyncBusyError extends Error {
  constructor() {
    super('Une synchro du wiki est déjà en cours');
    this.name = 'SyncBusyError';
  }
}

export interface KbService {
  /** Base wiki actuelle, relue seulement si le fichier a changé. */
  get(): Promise<KnowledgeBase | null>;
  status(): Promise<KbStatus>;
  isRunning(): boolean;
  /** Lance une synchro ; l'événement final est `done` ou `error`. */
  sync(onEvent: (event: WikiSyncEvent) => void): Promise<WikiSyncReport>;
}

export interface KbServiceOptions {
  file: string;
  build: (onEvent: (event: WikiSyncEvent) => void) => Promise<KnowledgeBase>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createKbService({ file, build }: KbServiceOptions): KbService {
  let cache: { mtimeMs: number; size: number; kb: KnowledgeBase } | null = null;
  let running = false;
  let lastError: string | null = null;

  async function load(): Promise<{ kb: KnowledgeBase | null; error: string | null }> {
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
        return { kb: null, error: `Base wiki d'un autre format (version ${kb.version}) : relance la synchro` };
      }
      cache = { mtimeMs: info.mtimeMs, size: info.size, kb };
      return { kb, error: null };
    } catch (error) {
      return { kb: null, error: `Base wiki illisible : ${messageOf(error)}` };
    }
  }

  return {
    async get() {
      return (await load()).kb;
    },

    async status() {
      const { kb, error } = await load();
      const failure = lastError ? { message: `Dernière synchro échouée : ${lastError}` } : {};
      if (kb) return { state: 'ok', syncedAt: kb.syncedAt, running, ...failure };
      if (error) return { state: 'error', syncedAt: null, running, message: error };
      return { state: 'absent', syncedAt: null, running, ...failure };
    },

    isRunning() {
      return running;
    },

    async sync(onEvent) {
      if (running) throw new SyncBusyError();
      running = true;
      try {
        const kb = await build(onEvent);
        onEvent({ step: 'write', done: 0, total: 1, message: 'Enregistrement de la base' });
        await writeFileAtomic(file, JSON.stringify(kb));
        lastError = null;
        onEvent({ step: 'done', done: 1, total: 1, message: 'Synchro terminée', report: kb.report });
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

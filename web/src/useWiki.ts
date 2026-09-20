import { useCallback, useEffect, useRef, useState } from 'react';
import type { KbStatus, SettingsInfo, WikiSyncEvent, WikiSyncReport } from '../../shared/types.ts';
import { api } from './api.ts';
import { useLocale } from './i18n.tsx';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** État de la base wiki, relu à chaque changement de `reloadKey`. */
export function useKbStatus(reloadKey: number): KbStatus | null {
  const [status, setStatus] = useState<KbStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api.wikiStatus(controller.signal).then(setStatus, (error: unknown) => {
      if (controller.signal.aborted) return;
      setStatus({ state: 'error', syncedAt: null, running: false, message: `État du wiki indisponible : ${messageOf(error)}` });
    });
    return () => controller.abort();
  }, [reloadKey]);
  return status;
}

export type SettingsState = { status: 'loading' } | { status: 'ready'; info: SettingsInfo } | { status: 'error'; message: string };

/** Réglages détectés par le serveur, lus une fois. */
export function useSettings(): SettingsState {
  const [state, setState] = useState<SettingsState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    api.settings(controller.signal).then(
      (info) => setState({ status: 'ready', info }),
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: messageOf(error) });
      },
    );
    return () => controller.abort();
  }, []);
  return state;
}

export type WikiSyncState =
  | { kind: 'idle' }
  | { kind: 'running'; event: WikiSyncEvent | null }
  | { kind: 'done'; report: WikiSyncReport }
  | { kind: 'failed'; message: string };

/**
 * Synchro du wiki lancée depuis l'interface. L'état vit au niveau de l'application pour survivre
 * à un changement d'onglet ; `onFinished` est appelé après un succès comme après un échec.
 */
export function useWikiSync(onFinished: () => void): [WikiSyncState, () => void] {
  const locale = useLocale();
  const [state, setState] = useState<WikiSyncState>({ kind: 'idle' });
  const running = useRef(false);
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setState({ kind: 'running', event: null });
    api
      .syncWiki(locale, (event) => setState({ kind: 'running', event }))
      .then(
        (last) =>
          setState(
            last.step === 'done' && last.report
              ? { kind: 'done', report: last.report }
              : { kind: 'failed', message: last.message },
          ),
        (error: unknown) => setState({ kind: 'failed', message: messageOf(error) }),
      )
      .finally(() => {
        running.current = false;
        finished.current();
      });
  }, []);

  return [state, start];
}

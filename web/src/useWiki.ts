import { useCallback, useEffect, useRef, useState } from 'react';
import type { KbStatus, SettingsInfo, WikiSyncEvent, WikiSyncReport } from '../../shared/types.ts';
import { t } from '../../shared/i18n/index.ts';
import { api } from './api.ts';
import { useLocale } from './i18n.tsx';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** State of the wiki base, read again on every change of `reloadKey`. */
export function useKbStatus(reloadKey: number): KbStatus | null {
  const locale = useLocale();
  const [status, setStatus] = useState<KbStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api.wikiStatus(controller.signal).then(setStatus, (error: unknown) => {
      if (controller.signal.aborted) return;
      setStatus({
        state: 'error',
        syncedAt: null,
        running: false,
        message: t(locale, 'app.wikiStateUnavailable', { message: messageOf(error) }),
      });
    });
    return () => controller.abort();
  }, [reloadKey, locale]);
  return status;
}

export type SettingsState = { status: 'loading' } | { status: 'ready'; info: SettingsInfo } | { status: 'error'; message: string };

/** Settings the server detected, read once. */
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
 * Wiki sync started from the interface. The state lives at the application level so it survives a
 * tab change; `onFinished` is called after a success as well as after a failure.
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

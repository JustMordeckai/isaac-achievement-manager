import { useCallback, useEffect, useState } from 'react';
import type { UpdateEvent, UpdateState } from '../../shared/types.ts';
import { api } from './api.ts';
import { useLocale } from './i18n.tsx';

/** What the update banner is doing right now. */
export type UpdateJob =
  | { kind: 'idle' }
  | { kind: 'running'; message: string; done?: number; total?: number }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'restarting' };

export interface UpdateHook {
  /** null while the first check runs, and when it fails: an update is an offer, not a requirement. */
  state: UpdateState | null;
  job: UpdateJob;
  checking: boolean;
  check(): void;
  install(): void;
  restart(): void;
}

/** How often the page asks whether the new server is up, once the restart is asked for. */
const RESTART_POLL_MS = 1000;

/**
 * Reads what the latest release holds, downloads it and restarts the app on it. The check runs on
 * its own at startup so nobody has to look for it, and says nothing when GitHub cannot be reached.
 */
export function useUpdate(): UpdateHook {
  const locale = useLocale();
  const [state, setState] = useState<UpdateState | null>(null);
  const [job, setJob] = useState<UpdateJob>({ kind: 'idle' });
  const [checks, setChecks] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    api.update(controller.signal).then(
      (next) => {
        if (controller.signal.aborted) return;
        setState(next);
        setChecking(false);
      },
      () => {
        // No network, GitHub down, rate limit: the banner stays out of the way.
        if (controller.signal.aborted) return;
        setState(null);
        setChecking(false);
      },
    );
    return () => controller.abort();
  }, [checks]);

  const install = useCallback(() => {
    setJob({ kind: 'running', message: '' });
    api
      .installUpdate(locale, (event: UpdateEvent) => {
        if (event.step === 'progress') setJob({ kind: 'running', message: event.message, done: event.done, total: event.total });
      })
      .then(
        (last) => setJob(last.step === 'done' ? { kind: 'done', message: last.message } : { kind: 'failed', message: last.message }),
        (error: unknown) => setJob({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }),
      );
  }, [locale]);

  const restart = useCallback(() => {
    setJob({ kind: 'restarting' });
    // The answer arrives, then the server stops: a failure here means it stopped a bit early, which
    // is exactly what was asked for. The page then waits for the new one to answer and reloads.
    void api.restart().catch(() => {});
    const timer = window.setInterval(() => {
      void fetch('/api/settings')
        .then((res) => {
          if (res.ok) {
            window.clearInterval(timer);
            window.location.reload();
          }
        })
        .catch(() => {});
    }, RESTART_POLL_MS);
  }, []);

  return {
    state,
    job,
    checking,
    check: useCallback(() => setChecks((n) => n + 1), []),
    install,
    restart,
  };
}

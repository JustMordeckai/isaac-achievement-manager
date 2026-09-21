import { useCallback, useEffect, useState } from 'react';
import type { AdvisorSetupEvent, AdvisorSetupState } from '@shared/types.ts';
import { api } from '@/lib/api.ts';
import { useLocale } from '@/i18n.tsx';

/** What the setup card is doing right now. */
export type SetupJob =
  | { kind: 'idle' }
  | { kind: 'running'; message: string; done?: number; total?: number }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; message: string };

export interface AdvisorSetupHook {
  /** null while the first detection runs. */
  state: AdvisorSetupState | null;
  job: SetupJob;
  install(): void;
  pull(model: string): void;
}

/**
 * Detects what the machine has, then runs the install or the download and follows their progress.
 * `onFinished` fires after a job that went through, so the caller can read the advisor state again.
 */
export function useAdvisorSetup(
  reloadKey: number,
  onFinished: (job: 'install' | 'pull', model: string) => void,
): AdvisorSetupHook {
  const locale = useLocale();
  const [state, setState] = useState<AdvisorSetupState | null>(null);
  const [job, setJob] = useState<SetupJob>({ kind: 'idle' });
  const [detections, setDetections] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.advisorSetup(controller.signal).then(
      (next) => {
        if (!controller.signal.aborted) setState(next);
      },
      () => {
        // The setup card is an offer, not a requirement: a failed detection just leaves it out.
        if (!controller.signal.aborted) setState(null);
      },
    );
    return () => controller.abort();
  }, [reloadKey, detections]);

  const run = useCallback(
    (kind: 'install' | 'pull', model: string, start: (onEvent: (event: AdvisorSetupEvent) => void) => Promise<AdvisorSetupEvent>) => {
      setJob({ kind: 'running', message: '' });
      start((event) => {
        if (event.step === 'progress') setJob({ kind: 'running', message: event.message, done: event.done, total: event.total });
      }).then(
        (last) => {
          setJob(last.step === 'done' ? { kind: 'done', message: last.message } : { kind: 'failed', message: last.message });
          if (last.step === 'done') {
            setDetections((n) => n + 1);
            onFinished(kind, model);
          }
        },
        (error: unknown) => setJob({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }),
      );
    },
    [onFinished],
  );

  return {
    state,
    job,
    install: useCallback(() => run('install', '', (onEvent) => api.installOllama(locale, onEvent)), [run, locale]),
    pull: useCallback(
      (model: string) => run('pull', model, (onEvent) => api.pullModel(model, locale, onEvent)),
      [run, locale],
    ),
  };
}

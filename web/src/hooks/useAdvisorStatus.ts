import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@shared/i18n/index.ts';
import type { AdvisorStatus } from '@shared/types.ts';
import { useLocale } from '@/i18n.tsx';
import { api } from '@/lib/api.ts';
import { messageOf } from '@/lib/errors.ts';

export interface AdvisorStatusState {
  /** null during the first read. */
  status: AdvisorStatus | null;
  /** A new check is running. */
  checking: boolean;
  recheck(): void;
  /** When the last check finished, reachable server or not; null while the first one runs. */
  checkedAt: number | null;
  /** Replaces the state after the settings have been saved. */
  replace(status: AdvisorStatus): void;
}

/** State of the Ollama server, read again on every change of `reloadKey` or on request. */
export function useAdvisorStatus(reloadKey: number): AdvisorStatusState {
  const locale = useLocale();
  // The language only words the error: a change of language reads the status again through
  // `reloadKey`, once the server has taken it, so it must not start a check of its own.
  const latestLocale = useRef(locale);
  useEffect(() => {
    latestLocale.current = locale;
  }, [locale]);
  const [status, setStatus] = useState<AdvisorStatus | null>(null);
  const [checks, setChecks] = useState(0);
  const [checking, setChecking] = useState(true);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    api.advisorStatus(controller.signal).then(
      (next) => {
        // Check given up on: a late answer must not overwrite the most recent one.
        if (controller.signal.aborted) return;
        setStatus(next);
        setChecking(false);
        setCheckedAt(Date.now());
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        // The settings already known stay on screen: only the state changes.
        setStatus((prev) => ({
          state: 'error',
          url: prev?.url ?? '',
          model: prev?.model ?? '',
          models: prev?.models ?? [],
          message: t(latestLocale.current, 'advisor.statusUnavailable', { message: messageOf(error) }),
        }));
        setChecking(false);
        setCheckedAt(Date.now());
      },
    );
    return () => controller.abort();
  }, [reloadKey, checks]);
  const recheck = useCallback(() => setChecks((n) => n + 1), []);
  return { status, checking, checkedAt, recheck, replace: setStatus };
}

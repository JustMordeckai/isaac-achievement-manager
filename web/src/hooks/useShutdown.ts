import { useCallback, useState } from 'react';
import { t } from '@shared/i18n/index.ts';
import { api } from '@/lib/api.ts';
import { useLocale } from '@/i18n.tsx';
import { messageOf } from '@/lib/errors.ts';

export type ShutdownState = { kind: 'running' } | { kind: 'stopped' } | { kind: 'failed'; message: string };

export interface ShutdownHook {
  state: ShutdownState;
  /** Asks the reader to confirm, then tells the server to stop. */
  request(): void;
}

/** Stopping the local server from the interface; the page then has nothing left to talk to. */
export function useShutdown(): ShutdownHook {
  const locale = useLocale();
  const [state, setState] = useState<ShutdownState>({ kind: 'running' });
  const request = useCallback(() => {
    if (!window.confirm(t(locale, 'app.confirmStop'))) return;
    void api.shutdown().then(
      () => setState({ kind: 'stopped' }),
      (error: unknown) => setState({ kind: 'failed', message: messageOf(error) }),
    );
  }, [locale]);
  return { state, request };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WikiSyncEvent, WikiSyncReport } from '@shared/types.ts';
import { useLocale } from '@/i18n.tsx';
import { api } from '@/lib/api.ts';
import { messageOf } from '@/lib/errors.ts';

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
  }, [locale]);

  return [state, start];
}

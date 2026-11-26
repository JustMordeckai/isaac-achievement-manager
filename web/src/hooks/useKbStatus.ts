import { useEffect, useRef, useState } from 'react';
import { t } from '@shared/i18n/index.ts';
import type { KbStatus } from '@shared/types.ts';
import { useLocale } from '@/i18n.tsx';
import { api } from '@/lib/api.ts';
import { messageOf } from '@/lib/errors.ts';

/** State of the wiki base, read again on every change of `reloadKey`. */
export function useKbStatus(reloadKey: number): KbStatus | null {
  const locale = useLocale();
  // The language only words the error: a change of language reads the status again through
  // `reloadKey`, once the server has taken it, so it must not start a read of its own.
  const latestLocale = useRef(locale);
  useEffect(() => {
    latestLocale.current = locale;
  }, [locale]);
  const [status, setStatus] = useState<KbStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api.wikiStatus(controller.signal).then(setStatus, (error: unknown) => {
      if (controller.signal.aborted) return;
      setStatus({
        state: 'error',
        syncedAt: null,
        running: false,
        message: t(latestLocale.current, 'app.wikiStateUnavailable', { message: messageOf(error) }),
      });
    });
    return () => controller.abort();
  }, [reloadKey]);
  return status;
}

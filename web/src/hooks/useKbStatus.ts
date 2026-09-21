import { useEffect, useState } from 'react';
import { t } from '@shared/i18n/index.ts';
import type { KbStatus } from '@shared/types.ts';
import { useLocale } from '@/i18n.tsx';
import { api } from '@/lib/api.ts';
import { messageOf } from '@/lib/errors.ts';

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

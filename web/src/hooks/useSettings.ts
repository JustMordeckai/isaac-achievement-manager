import { useEffect, useState } from 'react';
import type { SettingsInfo } from '@shared/types.ts';
import { api } from '@/lib/api.ts';
import { messageOf } from '@/lib/errors.ts';

export type SettingsState =
  | { status: 'loading' }
  | { status: 'ready'; info: SettingsInfo }
  | { status: 'error'; message: string };

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

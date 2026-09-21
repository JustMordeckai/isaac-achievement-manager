import type { ReactNode } from 'react';
import { ErrorPanel } from '@/components/common/ErrorPanel/ErrorPanel.tsx';
import { useT } from '@/i18n.tsx';
import type { ProgressData, ProgressState } from '@/hooks/useProgress.ts';

export interface ProgressGateProps {
  state: ProgressState;
  onRetry(): void;
  /** Back to the local profile after another profile failed; null when that is already the case. */
  onResetProfile: (() => void) | null;
  children(data: ProgressData): ReactNode;
}

/** The two screens built on the progress only render once it is there; both share this wait. */
export function ProgressGate({ state, onRetry, onResetProfile, children }: ProgressGateProps) {
  const t = useT();
  if (state.status === 'loading') return <p className="placeholder">{t('app.loadingProgress')}</p>;
  if (state.status === 'error') {
    return (
      <ErrorPanel
        title={t('app.progressFailed')}
        message={state.message}
        retryLabel={t('app.retry')}
        onRetry={onRetry}
        onResetProfile={onResetProfile}
        resetLabel={t('app.backToMyProfile')}
      />
    );
  }
  return <>{children(state.data)}</>;
}

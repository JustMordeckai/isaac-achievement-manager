import { ErrorPanel } from '@/components/common/ErrorPanel/ErrorPanel.tsx';
import { SettingsBanner } from '@/components/common/SettingsBanner/SettingsBanner.tsx';
import { OffRouteSections } from '@/components/routes/OffRouteSections/OffRouteSections.tsx';
import { RunList } from '@/components/routes/RunList/RunList.tsx';
import { useT } from '@/i18n.tsx';
import type { RoutesState } from '@/hooks/useRoutes.ts';

export interface RoutesProps {
  state: RoutesState;
  onOpenSettings(): void;
  onOpenAchievement(id: number): void;
  onAsk(question: string): void;
  onRetry(): void;
  /** Back to the local profile after another profile failed; null when that is already the case. */
  onResetProfile: (() => void) | null;
}

/** Routes screen: suggested runs then the achievements off the routes. */
export function Routes({ state, onOpenSettings, onOpenAchievement, onAsk, onRetry, onResetProfile }: RoutesProps) {
  const t = useT();
  if (state.status === 'loading') return <p className="placeholder">{t('routes.computing')}</p>;
  if (state.status === 'error') {
    return (
      <ErrorPanel
        title={t('routes.failedTitle')}
        message={state.message}
        retryLabel={t('routes.retry')}
        onRetry={onRetry}
        onResetProfile={onResetProfile}
        resetLabel={t('routes.backToMyProfile')}
      />
    );
  }
  const { plan, kb } = state.data;
  if (!plan) {
    return (
      <SettingsBanner
        role="status"
        text={kb.state === 'error' ? t('routes.kbUnusable', { message: kb.message ?? t('dashboard.unknownError') }) : t('routes.kbAbsent')}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  return (
    <div className="routes">
      <RunList plan={plan} onOpen={onOpenAchievement} onAsk={onAsk} />
      <OffRouteSections offRoute={plan.offRoute} onOpen={onOpenAchievement} />
    </div>
  );
}

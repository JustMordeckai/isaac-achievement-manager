import type { KbStatus, ProgressSummary } from '@shared/types.ts';
import { SettingsBanner } from '@/components/common/SettingsBanner/SettingsBanner.tsx';
import { BestRuns } from '@/components/dashboard/BestRuns/BestRuns.tsx';
import { DlcBreakdown } from '@/components/dashboard/DlcBreakdown/DlcBreakdown.tsx';
import { ProgressHero } from '@/components/dashboard/ProgressHero/ProgressHero.tsx';
import { RecentUnlocks } from '@/components/dashboard/RecentUnlocks/RecentUnlocks.tsx';
import { useT } from '@/i18n.tsx';
import type { FilterPatch } from '@/lib/filter.ts';
import type { RoutesState } from '@/hooks/useRoutes.ts';

export interface DashboardProps {
  summary: ProgressSummary;
  kb: KbStatus | null;
  routes: RoutesState;
  onShowAchievements(patch: FilterPatch): void;
  onOpenSettings(): void;
  onShowRoutes(): void;
  onOpenAchievement(id: number): void;
  onAsk(question: string): void;
}

/** Home screen: where the profile stands, and what to play next. */
export function Dashboard({
  summary,
  kb,
  routes,
  onShowAchievements,
  onOpenSettings,
  onShowRoutes,
  onOpenAchievement,
  onAsk,
}: DashboardProps) {
  const t = useT();
  return (
    <div className="dashboard">
      {/* The rest of the dashboard works without a wiki base; only the plan needs one. */}
      {kb && kb.state !== 'ok' && (
        <SettingsBanner
          className="kb-banner"
          text={
            kb.state === 'absent'
              ? t('dashboard.kbAbsent')
              : t('dashboard.kbUnusable', { message: kb.message ?? t('dashboard.unknownError') })
          }
          onOpenSettings={onOpenSettings}
        />
      )}
      <ProgressHero summary={summary} onShowAchievements={onShowAchievements} />
      <DlcBreakdown summary={summary} onShowAchievements={onShowAchievements} />
      <RecentUnlocks recent={summary.recent} />
      <BestRuns routes={routes} onShowRoutes={onShowRoutes} onOpenAchievement={onOpenAchievement} onAsk={onAsk} />
    </div>
  );
}

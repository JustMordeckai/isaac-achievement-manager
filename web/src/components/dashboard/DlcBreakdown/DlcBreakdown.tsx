import { DLC_ORDER } from '@shared/dlc.ts';
import type { ProgressSummary } from '@shared/types.ts';
import { ProgressBar } from '@/components/common/ProgressBar/ProgressBar.tsx';
import { useT } from '@/i18n.tsx';
import { DLC_LABELS } from '@/lib/labels.ts';
import type { FilterPatch } from '@/lib/filter.ts';

export interface DlcBreakdownProps {
  summary: ProgressSummary;
  onShowAchievements(patch: FilterPatch): void;
}

/** One row per DLC the profile owns; a row opens the list already filtered on it. */
export function DlcBreakdown({ summary, onShowAchievements }: DlcBreakdownProps) {
  const t = useT();
  const dlcs = DLC_ORDER.filter((dlc) => summary.byDlc[dlc].total > 0);
  return (
    <section className="card" aria-labelledby="dlc-title">
      <h2 id="dlc-title">{t('dashboard.byDlc')}</h2>
      <ul className="dlc-list">
        {dlcs.map((dlc) => {
          const stats = summary.byDlc[dlc];
          return (
            <li key={dlc}>
              <button
                type="button"
                className="dlc-row"
                aria-label={t('dashboard.dlcRow', { dlc: DLC_LABELS[dlc], unlocked: stats.unlocked, total: stats.total })}
                onClick={() => onShowAchievements({ status: 'missing', dlc, onlyDesync: false })}
              >
                <span className="dlc-row__name">{DLC_LABELS[dlc]}</span>
                <span className="dlc-row__count">
                  {stats.unlocked} / {stats.total}
                </span>
                <ProgressBar value={stats.unlocked} max={stats.total} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

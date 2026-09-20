import { DLC_ORDER } from '../../../shared/dlc.ts';
import type { Desync, DesyncKind, Dlc, KbStatus, ProgressSummary } from '../../../shared/types.ts';
import { AchievementIcon } from '../components/AchievementIcon.tsx';
import { CharacterGrid } from '../components/CharacterGrid.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { RunCard } from '../components/RunCard.tsx';
import { useLocale, useT, useTPlural } from '../i18n.tsx';
import { desyncLabel, DLC_LABELS, formatDate, percent } from '../labels.ts';
import type { RoutesState } from '../useRoutes.ts';

export interface FilterPatch {
  status?: 'all' | 'unlocked' | 'missing';
  dlc?: Dlc | 'all';
  onlyDesync?: boolean;
}

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

const BEST_RUNS = 3;

/** Best playable runs and the note of the characters; nothing without a wiki base (the banner already says so). */
function PlanSections({
  routes,
  onShowRoutes,
  onOpenAchievement,
  onAsk,
}: Pick<DashboardProps, 'routes' | 'onShowRoutes' | 'onOpenAchievement' | 'onAsk'>) {
  const t = useT();
  if (routes.status === 'loading') {
    return (
      <section className="card wide" aria-labelledby="best-runs-title">
        <h2 id="best-runs-title">{t('dashboard.bestRuns')}</h2>
        <p className="placeholder">{t('dashboard.computingRoutes')}</p>
      </section>
    );
  }
  if (routes.status === 'error') {
    return (
      <p className="banner banner--error wide" role="alert">
        {t('dashboard.routesFailed', { message: routes.message })}
      </p>
    );
  }
  const plan = routes.data.plan;
  if (!plan) return null;
  const best = plan.runs.filter((r) => r.missing.length === 0).slice(0, BEST_RUNS);
  return (
    <>
      <section className="card wide" aria-labelledby="best-runs-title">
        <h2 id="best-runs-title">{t('dashboard.bestRuns')}</h2>
        {best.length === 0 ? (
          <p className="muted">{plan.runs.length === 0 ? t('dashboard.noRun') : t('dashboard.noPlayableRun')}</p>
        ) : (
          <div className="run-list run-list--compact">
            {best.map((run) => (
              <RunCard key={run.id} run={run} onOpenAchievement={onOpenAchievement} onAsk={onAsk} />
            ))}
          </div>
        )}
        <button type="button" className="btn" onClick={onShowRoutes}>
          {t('dashboard.seeAllRoutes')}
        </button>
      </section>
      <section className="card wide" aria-labelledby="marks-title">
        <h2 id="marks-title">{t('dashboard.marksTitle')}</h2>
        <CharacterGrid characters={plan.characters} source={plan.marksSource} />
      </section>
    </>
  );
}

const DESYNC_ORDER: DesyncKind[] = ['saveOnly', 'steamOnly', 'profileAhead', 'cacheAhead'];
const SHOWN_PER_KIND = 10;

function DesyncGroups({ desyncs }: { desyncs: Desync[] }) {
  const locale = useLocale();
  const tp = useTPlural();
  return (
    <div className="desync-groups">
      {DESYNC_ORDER.map((kind) => {
        const items = desyncs.filter((d) => d.kind === kind);
        if (items.length === 0) return null;
        const more = items.length - SHOWN_PER_KIND;
        return (
          <div key={kind} className="desync-group">
            <h3>
              {desyncLabel(locale, kind)} ({items.length})
            </h3>
            <ul className="chips">
              {items.slice(0, SHOWN_PER_KIND).map((d) => (
                <li key={d.id} className="chip">
                  #{d.id} {d.name}
                </li>
              ))}
              {more > 0 && <li className="chip chip--more">{tp('dashboard.moreDesync', more)}</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Banner shown while the wiki base is unusable; the rest of the dashboard works without it. */
function KbBanner({ kb, onOpenSettings }: { kb: KbStatus; onOpenSettings(): void }) {
  const t = useT();
  if (kb.state === 'ok') return null;
  return (
    <div className="banner banner--info kb-banner">
      <p>
        {kb.state === 'absent'
          ? t('dashboard.kbAbsent')
          : t('dashboard.kbUnusable', { message: kb.message ?? t('dashboard.unknownError') })}
      </p>
      <button type="button" className="btn" onClick={onOpenSettings}>
        {t('app.openSettings')}
      </button>
    </div>
  );
}

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
  const locale = useLocale();
  const t = useT();
  const tp = useTPlural();
  const missing = summary.total - summary.unlocked;
  const dlcs = DLC_ORDER.filter((dlc) => summary.byDlc[dlc].total > 0);

  return (
    <div className="dashboard">
      {kb && <KbBanner kb={kb} onOpenSettings={onOpenSettings} />}
      <section className="card hero" aria-labelledby="progress-title">
        <h2 id="progress-title">{t('dashboard.progress')}</h2>
        <p className="hero__count">
          <strong>{summary.unlocked}</strong> / {summary.total} {t('dashboard.achievements')}
        </p>
        <ProgressBar value={summary.unlocked} max={summary.total} label={t('dashboard.progressBarLabel')} />
        <p className="hero__meta">
          {tp('dashboard.percentMissing', missing, { percent: percent(locale, summary.unlocked, summary.total) })}
        </p>
        {missing > 0 && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onShowAchievements({ status: 'missing', dlc: 'all', onlyDesync: false })}
          >
            {tp('dashboard.seeMissing', missing)}
          </button>
        )}
      </section>

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

      <section className="card" aria-labelledby="recent-title">
        <h2 id="recent-title">{t('dashboard.recent')}</h2>
        {summary.recent.length === 0 ? (
          <p className="muted">{t('dashboard.noUnlockDate')}</p>
        ) : (
          <ol className="recent-list">
            {summary.recent.map((item) => (
              <li key={item.id}>
                <AchievementIcon file={item.icon} alt="" />
                <span className="recent-list__name">{item.name}</span>
                <time dateTime={item.unlockedAt}>{formatDate(locale, item.unlockedAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <PlanSections routes={routes} onShowRoutes={onShowRoutes} onOpenAchievement={onOpenAchievement} onAsk={onAsk} />

      <section className="card" aria-labelledby="desync-title">
        <h2 id="desync-title">{t('dashboard.desyncTitle')}</h2>
        {summary.desyncs.length === 0 ? (
          <p className="muted">{t('dashboard.noDesync')}</p>
        ) : (
          <>
            <DesyncGroups desyncs={summary.desyncs} />
            {summary.desyncs.some((d) => d.kind === 'steamOnly') && <p className="hint">{t('dashboard.altF2Tip')}</p>}
            {summary.desyncs.some((d) => d.kind === 'saveOnly' || d.kind === 'steamOnly') && (
              <button
                type="button"
                className="btn"
                onClick={() => onShowAchievements({ status: 'all', dlc: 'all', onlyDesync: true })}
              >
                {t('dashboard.seeInList')}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

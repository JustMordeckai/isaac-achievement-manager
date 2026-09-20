import { DLC_ORDER } from '../../../shared/dlc.ts';
import type { Desync, DesyncKind, Dlc, KbStatus, ProgressSummary } from '../../../shared/types.ts';
import { AchievementIcon } from '../components/AchievementIcon.tsx';
import { CharacterGrid } from '../components/CharacterGrid.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { RunCard } from '../components/RunCard.tsx';
import { useLocale } from '../i18n.tsx';
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

/** Meilleures runs jouables et note des personnages ; rien sans base wiki (le bandeau le signale déjà). */
function PlanSections({
  routes,
  onShowRoutes,
  onOpenAchievement,
  onAsk,
}: Pick<DashboardProps, 'routes' | 'onShowRoutes' | 'onOpenAchievement' | 'onAsk'>) {
  if (routes.status === 'loading') {
    return (
      <section className="card wide" aria-labelledby="best-runs-title">
        <h2 id="best-runs-title">Meilleures runs</h2>
        <p className="placeholder">Calcul des routes…</p>
      </section>
    );
  }
  if (routes.status === 'error') {
    return (
      <p className="banner banner--error wide" role="alert">
        Impossible de calculer les routes : {routes.message}
      </p>
    );
  }
  const plan = routes.data.plan;
  if (!plan) return null;
  const best = plan.runs.filter((r) => r.missing.length === 0).slice(0, BEST_RUNS);
  return (
    <>
      <section className="card wide" aria-labelledby="best-runs-title">
        <h2 id="best-runs-title">Meilleures runs</h2>
        {best.length === 0 ? (
          <p className="muted">
            {plan.runs.length === 0 ? 'Aucune run à proposer.' : "Aucune run jouable : débloque d'abord les prérequis indiqués dans les routes."}
          </p>
        ) : (
          <div className="run-list run-list--compact">
            {best.map((run) => (
              <RunCard key={run.id} run={run} onOpenAchievement={onOpenAchievement} onAsk={onAsk} />
            ))}
          </div>
        )}
        <button type="button" className="btn" onClick={onShowRoutes}>
          Voir toutes les routes
        </button>
      </section>
      <section className="card wide" aria-labelledby="marks-title">
        <h2 id="marks-title">Marques de complétion</h2>
        <CharacterGrid characters={plan.characters} source={plan.marksSource} />
      </section>
    </>
  );
}

const DESYNC_ORDER: DesyncKind[] = ['saveOnly', 'steamOnly', 'profileAhead', 'cacheAhead'];
const SHOWN_PER_KIND = 10;

function DesyncGroups({ desyncs }: { desyncs: Desync[] }) {
  const locale = useLocale();
  return (
    <div className="desync-groups">
      {DESYNC_ORDER.map((kind) => {
        const items = desyncs.filter((d) => d.kind === kind);
        if (items.length === 0) return null;
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
              {items.length > SHOWN_PER_KIND && (
                <li className="chip chip--more">et {items.length - SHOWN_PER_KIND} {items.length - SHOWN_PER_KIND === 1 ? 'autre' : 'autres'}</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Bandeau affiché tant que la base wiki n'est pas utilisable ; le reste du tableau de bord fonctionne sans. */
function KbBanner({ kb, onOpenSettings }: { kb: KbStatus; onOpenSettings(): void }) {
  if (kb.state === 'ok') return null;
  return (
    <div className="banner banner--info kb-banner">
      <p>
        {kb.state === 'absent'
          ? "Base wiki absente : synchronise-la pour afficher les fiches, les méthodes d'obtention et les filtres par personnage."
          : `Base wiki inutilisable : ${kb.message ?? 'erreur inconnue'}`}
      </p>
      <button type="button" className="btn" onClick={onOpenSettings}>
        Ouvrir les paramètres
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
  const missing = summary.total - summary.unlocked;
  const dlcs = DLC_ORDER.filter((dlc) => summary.byDlc[dlc].total > 0);

  return (
    <div className="dashboard">
      {kb && <KbBanner kb={kb} onOpenSettings={onOpenSettings} />}
      <section className="card hero" aria-labelledby="progress-title">
        <h2 id="progress-title">Progression</h2>
        <p className="hero__count">
          <strong>{summary.unlocked}</strong> / {summary.total} succès
        </p>
        <ProgressBar value={summary.unlocked} max={summary.total} label="Progression globale" />
        <p className="hero__meta">
          {percent(locale, summary.unlocked, summary.total)}, {missing} {missing <= 1 ? 'manquant' : 'manquants'}
        </p>
        {missing > 0 && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onShowAchievements({ status: 'missing', dlc: 'all', onlyDesync: false })}
          >
            {missing === 1 ? 'Voir le succès manquant' : `Voir les ${missing} succès manquants`}
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="dlc-title">
        <h2 id="dlc-title">Par extension</h2>
        <ul className="dlc-list">
          {dlcs.map((dlc) => {
            const stats = summary.byDlc[dlc];
            return (
              <li key={dlc}>
                <button
                  type="button"
                  className="dlc-row"
                  aria-label={`${DLC_LABELS[dlc]} : ${stats.unlocked} sur ${stats.total}, voir les manquants`}
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
        <h2 id="recent-title">Derniers déblocages</h2>
        {summary.recent.length === 0 ? (
          <p className="muted">Aucune date de déblocage connue.</p>
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
        <h2 id="desync-title">Écarts entre sources</h2>
        {summary.desyncs.length === 0 ? (
          <p className="muted">Aucun écart : sauvegarde, cache Steam et profil en ligne concordent.</p>
        ) : (
          <>
            <DesyncGroups desyncs={summary.desyncs} />
            {summary.desyncs.some((d) => d.kind === 'steamOnly') && (
              <p className="hint">
                Astuce du wiki : sur l'écran des statistiques du jeu, Alt+F2 recopie dans la sauvegarde les succès
                Steam qui y manquent.
              </p>
            )}
            {summary.desyncs.some((d) => d.kind === 'saveOnly' || d.kind === 'steamOnly') && (
              <button
                type="button"
                className="btn"
                onClick={() => onShowAchievements({ status: 'all', dlc: 'all', onlyDesync: true })}
              >
                Voir dans la liste
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

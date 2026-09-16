import { DLC_ORDER } from '../../../shared/dlc.ts';
import type { Desync, DesyncKind, Dlc, ProgressSummary } from '../../../shared/types.ts';
import { AchievementIcon } from '../components/AchievementIcon.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { DESYNC_LABELS, DLC_LABELS, formatDate, percent } from '../labels.ts';

export interface FilterPatch {
  status?: 'all' | 'unlocked' | 'missing';
  dlc?: Dlc | 'all';
  onlyDesync?: boolean;
}

export interface DashboardProps {
  summary: ProgressSummary;
  onShowAchievements(patch: FilterPatch): void;
}

const DESYNC_ORDER: DesyncKind[] = ['saveOnly', 'steamOnly', 'profileAhead', 'cacheAhead'];
const SHOWN_PER_KIND = 10;

function DesyncGroups({ desyncs }: { desyncs: Desync[] }) {
  return (
    <div className="desync-groups">
      {DESYNC_ORDER.map((kind) => {
        const items = desyncs.filter((d) => d.kind === kind);
        if (items.length === 0) return null;
        return (
          <div key={kind} className="desync-group">
            <h3>
              {DESYNC_LABELS[kind]} ({items.length})
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

export function Dashboard({ summary, onShowAchievements }: DashboardProps) {
  const missing = summary.total - summary.unlocked;
  const dlcs = DLC_ORDER.filter((dlc) => summary.byDlc[dlc].total > 0);

  return (
    <div className="dashboard">
      <section className="card hero" aria-labelledby="progress-title">
        <h2 id="progress-title">Progression</h2>
        <p className="hero__count">
          <strong>{summary.unlocked}</strong> / {summary.total} succès
        </p>
        <ProgressBar value={summary.unlocked} max={summary.total} label="Progression globale" />
        <p className="hero__meta">
          {percent(summary.unlocked, summary.total)} · {missing} {missing === 1 ? 'manquant' : 'manquants'}
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onShowAchievements({ status: 'missing', dlc: 'all', onlyDesync: false })}
        >
          {missing === 1 ? 'Voir le succès manquant' : `Voir les ${missing} succès manquants`}
        </button>
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
                  onClick={() => onShowAchievements({ status: 'missing', dlc, onlyDesync: false })}
                >
                  <span className="dlc-row__name">{DLC_LABELS[dlc]}</span>
                  <span className="dlc-row__count">
                    {stats.unlocked} / {stats.total}
                  </span>
                  <ProgressBar value={stats.unlocked} max={stats.total} label={`Progression ${DLC_LABELS[dlc]}`} />
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
                <time dateTime={item.unlockedAt}>{formatDate(item.unlockedAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>

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
            <button
              type="button"
              className="btn"
              onClick={() => onShowAchievements({ status: 'all', dlc: 'all', onlyDesync: true })}
            >
              Voir dans la liste
            </button>
          </>
        )}
      </section>
    </div>
  );
}

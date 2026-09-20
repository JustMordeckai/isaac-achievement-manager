import { useState } from 'react';
import { CHARACTERS, type CharacterId } from '../../../shared/characters.ts';
import { DLC_ORDER } from '../../../shared/dlc.ts';
import type { KbStatus, OffRoute, RoutePlan } from '../../../shared/types.ts';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { RequirementNames } from '../components/RequirementNames.tsx';
import { RunCard } from '../components/RunCard.tsx';
import { useT, useTPlural } from '../i18n.tsx';
import { characterName, DLC_LABELS } from '../labels.ts';
import type { RoutesState } from '../useRoutes.ts';

export interface RoutesProps {
  state: RoutesState;
  onOpenSettings(): void;
  onOpenAchievement(id: number): void;
  onAsk(question: string): void;
  onRetry(): void;
  /** Back to the local profile after another profile failed; null when that is already the case. */
  onResetProfile: (() => void) | null;
}

const PAGE_SIZE = 20;

function AchievementLink({ id, name, onOpen }: { id: number; name: string; onOpen(id: number): void }) {
  return (
    <button type="button" className="link-button" onClick={() => onOpen(id)}>
      <span lang="en">{name}</span>
    </button>
  );
}

function OffRouteSections({ offRoute, onOpen }: { offRoute: OffRoute; onOpen(id: number): void }) {
  const t = useT();
  const closetCharacters = [...new Set(offRoute.closets.map((c) => c.character))];
  return (
    <section className="off-route" aria-labelledby="off-route-title">
      <h2 id="off-route-title">{t('routes.offTitle')}</h2>
      <details className="card">
        <summary>{t('routes.challenges', { count: offRoute.challenges.length })}</summary>
        <ul className="todo-list">
          {offRoute.challenges.map((c) => (
            <li key={c.id}>
              <AchievementLink id={c.id} name={c.name} onOpen={onOpen} />
              {t('routes.challengeNumber', { number: c.number })}
              {c.title && (
                <>
                  {' '}
                  <span lang="en">{c.title}</span>
                </>
              )}
              {c.character && (
                <>
                  {t('routes.challengeWith')}
                  <span lang="en">{c.character}</span>
                </>
              )}
              {c.goal && (
                <>
                  {t('routes.challengeGoal')}
                  <span lang="en">{c.goal}</span>
                </>
              )}
              {c.curse && (
                <>
                  {t('routes.challengeCurse')}
                  <span lang="en">{c.curse}</span>
                </>
              )}
              {c.startingItems.length > 0 && (
                <>
                  {t('routes.challengeItems')}
                  <span lang="en">{c.startingItems.join(', ')}</span>
                </>
              )}
              {c.requirement && !c.requirement.met && (
                <span className="todo-list__missing">
                  {' '}
                  {t('routes.challengeUnlockFirst')}
                  <RequirementNames requirements={[c.requirement]} />)
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>
      <details className="card">
        <summary>{t('routes.counters', { count: offRoute.counters.length })}</summary>
        <ul className="todo-list">
          {offRoute.counters.map((c) => (
            <li key={c.id} className="todo-list__counter">
              <span>
                <AchievementLink id={c.id} name={c.name} onOpen={onOpen} />
                {t('routes.colonSpace')}
                <span lang="en">{c.condition}</span>
              </span>
              {c.value !== null && (
                <>
                  <span className="todo-list__value">
                    {Math.min(c.value, c.total)} / {c.total}
                  </span>
                  <ProgressBar value={Math.min(c.value, c.total)} max={c.total} />
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
      <details className="card">
        <summary>{t('routes.closets', { count: offRoute.closets.length })}</summary>
        <p className="hint">
          {t('routes.closetsHintStart')}
          <span lang="en">The Beast</span>
          {t('routes.closetsHintMiddle')}
          <span lang="en">Red Key</span>
          {t('routes.closetsHintOr1')}
          <span lang="en">Cracked Key</span>
          {t('routes.closetsHintOr2')}
          <span lang="en">Soul of Cain</span>
          {t('routes.closetsHintEnd')}
          {!offRoute.redKey && (
            <>
              {' '}
              {t('routes.redKeyStart')}
              <span lang="en">Mom</span>
              {t('routes.redKeyMiddle')}
              <span lang="en">Red Key</span>
              {t('routes.redKeyEnd')}
              <span lang="en">Home</span>
              {t('routes.closetsHintEnd')}
            </>
          )}
        </p>
        <ul className="todo-list">
          {closetCharacters.map((character: CharacterId) => (
            <li key={character}>
              <span lang="en">{characterName(character)}</span>
              {t('routes.colonSpace')}
              {offRoute.closets
                .filter((c) => c.character === character)
                .map((c) => (
                  <AchievementLink key={c.id} id={c.id} name={c.name} onOpen={onOpen} />
                ))}
            </li>
          ))}
        </ul>
      </details>
      <details className="card">
        <summary>{t('routes.misc', { count: offRoute.misc.length })}</summary>
        {DLC_ORDER.map((dlc) => {
          const items = offRoute.misc.filter((m) => m.dlc === dlc);
          if (items.length === 0) return null;
          return (
            <div key={dlc}>
              <h3>{DLC_LABELS[dlc]}</h3>
              <ul className="todo-list">
                {items.map((m) => (
                  <li key={m.id}>
                    <AchievementLink id={m.id} name={m.name} onOpen={onOpen} />
                    {m.condition && (
                      <>
                        {t('routes.colonSpace')}
                        <span lang="en">{m.condition}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </details>
    </section>
  );
}

interface RunListProps {
  plan: RoutePlan;
  onOpen(id: number): void;
  onAsk(question: string): void;
}

function RunList({ plan, onOpen, onAsk }: RunListProps) {
  const t = useT();
  const tp = useTPlural();
  const [character, setCharacter] = useState<CharacterId | 'all'>('all');
  const [withLocked, setWithLocked] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const present = new Set(plan.runs.map((r) => r.character));
  // After a refresh, a character no longer in the plan filters nothing: back to "All".
  const selected = character !== 'all' && present.has(character) ? character : 'all';
  const runs = plan.runs.filter(
    (r) => (selected === 'all' || r.character === selected) && (withLocked || r.missing.length === 0),
  );
  const playable = plan.runs.filter((r) => r.missing.length === 0).length;
  const more = Math.min(PAGE_SIZE, runs.length - shown);

  return (
    <section aria-labelledby="runs-title">
      <div className="card routes-head">
        <h2 id="runs-title">{t('routes.title')}</h2>
        <p className="muted">
          {tp('routes.playable', playable, { total: plan.runs.length })}
        </p>
        <form className="filters" onSubmit={(e) => e.preventDefault()}>
          <label className="field">
            <span>{t('routes.character')}</span>
            <select
              value={selected}
              onChange={(e) => {
                setCharacter(e.target.value as CharacterId | 'all');
                setShown(PAGE_SIZE);
              }}
            >
              <option value="all">{t('routes.allCharacters')}</option>
              {CHARACTERS.filter((c) => present.has(c.id)).map((c) => (
                <option key={c.id} value={c.id} lang="en">
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={withLocked}
              onChange={(e) => {
                setWithLocked(e.target.checked);
                setShown(PAGE_SIZE);
              }}
            />
            {t('routes.withLocked')}
          </label>
        </form>
      </div>
      {runs.length === 0 ? (
        <p className="placeholder">
          {plan.runs.length === 0
            ? t('routes.noRunAtAll')
            : t('routes.noRunForChoice')}
        </p>
      ) : (
        <div className="run-list">
          {runs.slice(0, shown).map((run) => (
            <RunCard key={run.id} run={run} onOpenAchievement={onOpen} onAsk={onAsk} />
          ))}
        </div>
      )}
      {runs.length > shown && (
        <button type="button" className="btn load-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          {tp('routes.moreRuns', more)}
        </button>
      )}
    </section>
  );
}

function KbMissing({ kb, onOpenSettings }: { kb: KbStatus; onOpenSettings(): void }) {
  const t = useT();
  return (
    <div className="banner banner--info" role="status">
      <p>
        {kb.state === 'error'
          ? t('routes.kbUnusable', { message: kb.message ?? t('dashboard.unknownError') })
          : t('routes.kbAbsent')}
      </p>
      <button type="button" className="btn" onClick={onOpenSettings}>
        {t('app.openSettings')}
      </button>
    </div>
  );
}

/** Routes screen: suggested runs then the achievements off the routes. */
export function Routes({ state, onOpenSettings, onOpenAchievement, onAsk, onRetry, onResetProfile }: RoutesProps) {
  const t = useT();
  if (state.status === 'loading') return <p className="placeholder">{t('routes.computing')}</p>;
  if (state.status === 'error') {
    return (
      <div className="card error-panel" role="alert">
        <h2>{t('routes.failedTitle')}</h2>
        <p>{state.message}</p>
        <div className="error-panel__actions">
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            {t('routes.retry')}
          </button>
          {onResetProfile && (
            <button type="button" className="btn" onClick={onResetProfile}>
              {t('routes.backToMyProfile')}
            </button>
          )}
        </div>
      </div>
    );
  }
  const { plan, kb } = state.data;
  if (!plan) return <KbMissing kb={kb} onOpenSettings={onOpenSettings} />;
  return (
    <div className="routes">
      <RunList plan={plan} onOpen={onOpenAchievement} onAsk={onAsk} />
      <OffRouteSections offRoute={plan.offRoute} onOpen={onOpenAchievement} />
    </div>
  );
}

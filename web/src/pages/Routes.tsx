import { useState } from 'react';
import { CHARACTERS, type CharacterId } from '../../../shared/characters.ts';
import { DLC_ORDER } from '../../../shared/dlc.ts';
import type { KbStatus, OffRoute, RoutePlan } from '../../../shared/types.ts';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { RunCard } from '../components/RunCard.tsx';
import { characterName, DLC_LABELS, requirementText } from '../labels.ts';
import type { RoutesState } from '../useRoutes.ts';

export interface RoutesProps {
  state: RoutesState;
  onOpenSettings(): void;
  onOpenAchievement(id: number): void;
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
  const closetCharacters = [...new Set(offRoute.closets.map((c) => c.character))];
  return (
    <section className="off-route" aria-labelledby="off-route-title">
      <h2 id="off-route-title">Hors routes</h2>
      <details className="card">
        <summary>Défis ({offRoute.challenges.length})</summary>
        <ul className="todo-list">
          {offRoute.challenges.map((c) => (
            <li key={c.id}>
              <AchievementLink id={c.id} name={c.name} onOpen={onOpen} /> : défi n° {c.number}
              {c.title && (
                <>
                  {' '}
                  <span lang="en">{c.title}</span>
                </>
              )}
              {c.character && (
                <>
                  , avec <span lang="en">{c.character}</span>
                </>
              )}
              {c.goal && (
                <>
                  , objectif <span lang="en">{c.goal}</span>
                </>
              )}
              {c.curse && (
                <>
                  , malédiction <span lang="en">{c.curse}</span>
                </>
              )}
              {c.startingItems.length > 0 && (
                <>
                  , objets de départ : <span lang="en">{c.startingItems.join(', ')}</span>
                </>
              )}
              {c.requirement && !c.requirement.met && (
                <span className="todo-list__missing">
                  {' '}
                  (à débloquer d'abord : <span lang="en">{requirementText(c.requirement)}</span>)
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>
      <details className="card">
        <summary>Compteurs ({offRoute.counters.length})</summary>
        <ul className="todo-list">
          {offRoute.counters.map((c) => (
            <li key={c.id} className="todo-list__counter">
              <span>
                <AchievementLink id={c.id} name={c.name} onOpen={onOpen} /> : <span lang="en">{c.condition}</span>
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
        <summary>Placards de Home ({offRoute.closets.length})</summary>
        <p className="hint">
          Ils s'ouvrent pendant la route de <span lang="en">The Beast</span>, avec une{' '}
          <span lang="en">Red Key</span>, une <span lang="en">Cracked Key</span> ou{' '}
          <span lang="en">Soul of Cain</span>.
          {!offRoute.redKey && (
            <>
              {' '}
              Le coffre de Mom donne la <span lang="en">Red Key</span> au premier passage à <span lang="en">Home</span>.
            </>
          )}
        </p>
        <ul className="todo-list">
          {closetCharacters.map((character: CharacterId) => (
            <li key={character}>
              <span lang="en">{characterName(character)}</span> :{' '}
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
        <summary>Divers ({offRoute.misc.length})</summary>
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
                        {' '}
                        : <span lang="en">{m.condition}</span>
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

function RunList({ plan, onOpen }: { plan: RoutePlan; onOpen(id: number): void }) {
  const [character, setCharacter] = useState<CharacterId | 'all'>('all');
  const [withLocked, setWithLocked] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const present = new Set(plan.runs.map((r) => r.character));
  // Après une actualisation, un personnage sorti du plan ne filtre plus rien : retour à « Tous ».
  const selected = character !== 'all' && present.has(character) ? character : 'all';
  const runs = plan.runs.filter(
    (r) => (selected === 'all' || r.character === selected) && (withLocked || r.missing.length === 0),
  );
  const playable = plan.runs.filter((r) => r.missing.length === 0).length;
  const more = Math.min(PAGE_SIZE, runs.length - shown);

  return (
    <section aria-labelledby="runs-title">
      <div className="card routes-head">
        <h2 id="runs-title">Runs conseillées</h2>
        <p className="muted">
          {playable} {playable <= 1 ? 'run jouable' : 'runs jouables'} tout de suite sur {plan.runs.length}, triées par
          succès obtenus par heure. Les durées sont des estimations.
        </p>
        <form className="filters" onSubmit={(e) => e.preventDefault()}>
          <label className="field">
            <span>Personnage</span>
            <select
              value={selected}
              onChange={(e) => {
                setCharacter(e.target.value as CharacterId | 'all');
                setShown(PAGE_SIZE);
              }}
            >
              <option value="all">Tous</option>
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
            Afficher aussi les runs à débloquer
          </label>
        </form>
      </div>
      {runs.length === 0 ? (
        <p className="placeholder">
          {plan.runs.length === 0
            ? 'Aucune run à proposer : les succès liés aux marques sont tous obtenus.'
            : "Aucune run jouable pour ce choix : affiche les runs à débloquer pour voir quoi débloquer d'abord."}
        </p>
      ) : (
        <div className="run-list">
          {runs.slice(0, shown).map((run) => (
            <RunCard key={run.id} run={run} onOpenAchievement={onOpen} />
          ))}
        </div>
      )}
      {runs.length > shown && (
        <button type="button" className="btn load-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Afficher {more} {more === 1 ? 'run' : 'runs'} de plus
        </button>
      )}
    </section>
  );
}

function KbMissing({ kb, onOpenSettings }: { kb: KbStatus; onOpenSettings(): void }) {
  return (
    <div className="banner banner--info" role="status">
      <p>
        {kb.state === 'error'
          ? `Base wiki inutilisable : ${kb.message ?? 'erreur inconnue'}`
          : 'Base wiki absente : les routes se calculent à partir du wiki. Synchronise-la depuis les paramètres.'}
      </p>
      <button type="button" className="btn" onClick={onOpenSettings}>
        Ouvrir les paramètres
      </button>
    </div>
  );
}

/** Écran Routes : runs conseillées puis succès hors routes. */
export function Routes({ state, onOpenSettings, onOpenAchievement }: RoutesProps) {
  if (state.status === 'loading') return <p className="placeholder">Calcul des routes…</p>;
  if (state.status === 'error') {
    return (
      <p className="banner banner--error" role="alert">
        Impossible de calculer les routes : {state.message}
      </p>
    );
  }
  const { plan, kb } = state.data;
  if (!plan) return <KbMissing kb={kb} onOpenSettings={onOpenSettings} />;
  return (
    <div className="routes">
      <RunList plan={plan} onOpen={onOpenAchievement} />
      <OffRouteSections offRoute={plan.offRoute} onOpen={onOpenAchievement} />
    </div>
  );
}

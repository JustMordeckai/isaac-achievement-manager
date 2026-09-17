import type { PlannedRun } from '../../../shared/types.ts';
import { characterName, endingList, formatMinutes, requirementText, RUN_MODE_LABELS } from '../labels.ts';

export interface RunCardProps {
  run: PlannedRun;
  onOpenAchievement(id: number): void;
}

function perHour(score: number): string {
  return score.toFixed(1).replace('.', ',');
}

interface AchievementChipsProps {
  label: string;
  list: PlannedRun['achievements'];
  onOpen(id: number): void;
}

/** Succès de la run en boutons qui ouvrent leur fiche. */
function AchievementChips({ label, list, onOpen }: AchievementChipsProps) {
  return (
    <ul className="chips run__achievements" aria-label={label}>
      {list.map((a) => (
        <li key={a.id}>
          <button type="button" className="chip chip--link" onClick={() => onOpen(a.id)}>
            <span lang="en">{a.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Une run planifiée : personnage, fins, succès obtenus, prérequis et chemin dépliable. */
export function RunCard({ run, onOpenAchievement }: RunCardProps) {
  const titleId = `run-${run.id}`;
  const count = run.achievements.length;
  const preparation = count === 0 && run.prepares.length > 0;
  return (
    <article className="card run" aria-labelledby={titleId}>
      <header className="run__head">
        <h3 id={titleId}>
          <span lang="en">{characterName(run.character)}</span>
        </h3>
        <span className={`badge run__mode${run.mode === 'normal' ? '' : ' run__mode--strong'}`}>
          {RUN_MODE_LABELS[run.mode]}
        </span>
        <span className="run__time">environ {formatMinutes(run.minutes)}</span>
      </header>
      <p className="run__endings">
        Battre <span lang="en">{endingList(run.endings)}</span>
      </p>
      {preparation ? (
        <>
          <p className="muted">Run de préparation : aucun succès tout de suite, elle rapproche de</p>
          <AchievementChips label="Succès préparés" list={run.prepares} onOpen={onOpenAchievement} />
        </>
      ) : (
        <>
          <p className="muted">
            {count} succès, soit {perHour(run.score)} par heure (pondéré par la difficulté estimée du personnage)
          </p>
          <AchievementChips label="Succès obtenus" list={run.achievements} onOpen={onOpenAchievement} />
        </>
      )}
      {run.missing.length > 0 && (
        <p className="run__missing">
          À débloquer d'abord : <span lang="en">{run.missing.map(requirementText).join(', ')}</span>
        </p>
      )}
      {run.note && <p className="hint">{run.note}</p>}
      <details className="run__path">
        <summary>
          Chemin en {run.steps.length} {run.steps.length === 1 ? 'étape' : 'étapes'}
        </summary>
        <ol>
          {run.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
    </article>
  );
}

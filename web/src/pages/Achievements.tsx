import { useEffect, useMemo, useState } from 'react';
import { DLC_ORDER } from '../../../shared/dlc.ts';
import type { AchievementState, Dlc } from '../../../shared/types.ts';
import { AchievementIcon } from '../components/AchievementIcon.tsx';
import { DLC_LABELS, formatDate } from '../labels.ts';
import {
  filterAchievements,
  type AchievementFilter,
  type SecretFilter,
  type SortOrder,
  type StatusFilter,
} from '../lib/filter.ts';

const PAGE_SIZE = 100;

export interface AchievementsProps {
  achievements: AchievementState[];
  filter: AchievementFilter;
  onFilterChange(filter: AchievementFilter): void;
}

function AchievementRow({ achievement: a }: { achievement: AchievementState }) {
  return (
    <li className={`ach ${a.unlocked ? 'ach--unlocked' : 'ach--locked'}`}>
      <AchievementIcon file={a.icon} alt="" />
      <div className="ach__body">
        <p className="ach__title">
          <span className="ach__id">#{a.id}</span> <span className="ach__name">{a.name}</span>
          {a.hidden && <span className="tag">secret</span>}
        </p>
        <p className="ach__desc">{a.description}</p>
      </div>
      <div className="ach__meta">
        <span className="tag tag--dlc">{DLC_LABELS[a.dlc]}</span>
        {a.unlocked ? (
          a.unlockedAt ? (
            <span className="ach__state">
              Débloqué le <time dateTime={a.unlockedAt}>{formatDate(a.unlockedAt)}</time>
            </span>
          ) : (
            <span className="ach__state">Débloqué</span>
          )
        ) : (
          <span className="ach__state ach__state--missing">Manquant</span>
        )}
        {a.inSave === true && !a.unlocked && <span className="tag tag--warn">dans la sauvegarde</span>}
        {a.inSave === false && a.unlocked && <span className="tag tag--warn">absent de la sauvegarde</span>}
      </div>
    </li>
  );
}

export function Achievements({ achievements, filter, onFilterChange }: AchievementsProps) {
  const visible = useMemo(() => filterAchievements(achievements, filter), [achievements, filter]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [filter]);
  const update = (patch: Partial<AchievementFilter>) => onFilterChange({ ...filter, ...patch });

  return (
    <div className="achievements">
      <form className="card filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="field field--grow">
          <span>Recherche</span>
          <input
            type="search"
            value={filter.search}
            placeholder="Nom, description ou #numéro"
            onChange={(e) => update({ search: e.target.value })}
          />
        </label>
        <label className="field">
          <span>État</span>
          <select value={filter.status} onChange={(e) => update({ status: e.target.value as StatusFilter })}>
            <option value="missing">Manquants</option>
            <option value="unlocked">Débloqués</option>
            <option value="all">Tous</option>
          </select>
        </label>
        <label className="field">
          <span>Extension</span>
          <select value={filter.dlc} onChange={(e) => update({ dlc: e.target.value as Dlc | 'all' })}>
            <option value="all">Toutes</option>
            {DLC_ORDER.map((dlc) => (
              <option key={dlc} value={dlc}>
                {DLC_LABELS[dlc]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Secrets</span>
          <select value={filter.secret} onChange={(e) => update({ secret: e.target.value as SecretFilter })}>
            <option value="all">Tous</option>
            <option value="only">Secrets uniquement</option>
            <option value="exclude">Sans les secrets</option>
          </select>
        </label>
        <label className="field">
          <span>Tri</span>
          <select value={filter.sort} onChange={(e) => update({ sort: e.target.value as SortOrder })}>
            <option value="id">Numéro</option>
            <option value="name">Nom</option>
            <option value="recent">Déblocage récent</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={filter.onlyDesync} onChange={(e) => update({ onlyDesync: e.target.checked })} />
          Écarts sauvegarde/Steam
        </label>
      </form>

      <p className="result-count" aria-live="polite">
        {visible.length} succès
      </p>

      {visible.length === 0 ? (
        <p className="placeholder">Aucun succès ne correspond à ces filtres.</p>
      ) : (
        <ul className="ach-list" aria-label="Succès">
          {visible.slice(0, limit).map((a) => (
            <AchievementRow key={a.id} achievement={a} />
          ))}
        </ul>
      )}

      {visible.length > limit && (
        <button type="button" className="btn load-more" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
          Afficher plus ({visible.length - limit} {visible.length - limit === 1 ? 'restant' : 'restants'})
        </button>
      )}
    </div>
  );
}

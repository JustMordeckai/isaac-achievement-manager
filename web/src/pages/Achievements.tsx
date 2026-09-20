import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CHARACTERS, type CharacterId } from '../../../shared/characters.ts';
import { DLC_ORDER } from '../../../shared/dlc.ts';
import type { AchievementEntry, Dlc, HowKind } from '../../../shared/types.ts';
import { AchievementIcon } from '../components/AchievementIcon.tsx';
import { useLocale } from '../i18n.tsx';
import { DLC_LABELS, formatDate, HOW_ORDER, howLabel } from '../labels.ts';
import {
  filterAchievements,
  type AchievementFilter,
  type SecretFilter,
  type SortOrder,
  type StatusFilter,
} from '../lib/filter.ts';

const PAGE_SIZE = 100;

export interface AchievementsProps {
  achievements: AchievementEntry[];
  filter: AchievementFilter;
  onFilterChange(filter: AchievementFilter): void;
  /** Succès en écart entre la sauvegarde et Steam. */
  desyncIds: ReadonlySet<number>;
  /** Succès dont la fiche est ouverte. */
  selectedId: number | null;
  onOpen(id: number): void;
  /** Fiche affichée à côté de la liste. */
  panel: ReactNode;
}

function AchievementRow({ achievement: a, selected, onOpen }: { achievement: AchievementEntry; selected: boolean; onOpen(): void }) {
  const locale = useLocale();
  return (
    <li className={`ach ${a.unlocked ? 'ach--unlocked' : 'ach--locked'}${selected ? ' ach--selected' : ''}`}>
      <AchievementIcon file={a.icon} alt="" />
      <div className="ach__body">
        <p className="ach__title">
          <span className="ach__id">#{a.id}</span>{' '}
          <button
            type="button"
            id={`ach-${a.id}`}
            className="ach__name"
            lang="en"
            aria-current={selected ? 'true' : undefined}
            onClick={onOpen}
          >
            {a.name}
          </button>
          {a.hidden && <span className="tag">secret</span>}
        </p>
        <p className="ach__desc" lang="en">
          {a.description}
        </p>
      </div>
      <div className="ach__meta">
        <span className="tag tag--dlc">{DLC_LABELS[a.dlc]}</span>
        {a.how && a.how !== 'misc' && <span className="tag">{howLabel(locale, a.how)}</span>}
        {a.unlocked ? (
          a.unlockedAt ? (
            <span className="ach__state">
              Débloqué le <time dateTime={a.unlockedAt}>{formatDate(locale, a.unlockedAt)}</time>
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

export function Achievements(props: AchievementsProps) {
  const locale = useLocale();
  const { achievements, filter, onFilterChange, desyncIds, selectedId, onOpen, panel } = props;
  const visible = useMemo(() => filterAchievements(achievements, filter, desyncIds), [achievements, filter, desyncIds]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [filter]);
  const update = (patch: Partial<AchievementFilter>) => onFilterChange({ ...filter, ...patch });

  // Sans base wiki, `how` et `character` valent null partout : les filtres correspondants n'ont pas de sens.
  const hasWiki = achievements.some((a) => a.how !== null);
  const characters = useMemo(() => {
    const present = new Set(achievements.map((a) => a.character));
    return CHARACTERS.filter((c) => present.has(c.id));
  }, [achievements]);

  // À la fermeture de la fiche, le focus revient sur le succès qui l'avait ouverte.
  const previous = useRef(selectedId);
  useEffect(() => {
    const last = previous.current;
    previous.current = selectedId;
    if (last !== null && selectedId === null) document.getElementById(`ach-${last}`)?.focus();
  }, [selectedId]);

  return (
    <div className={panel ? 'achievements achievements--with-card' : 'achievements'}>
      <div className="achievements__list">
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
          {hasWiki && (
            <>
              <label className="field">
                <span>Méthode</span>
                <select value={filter.how} onChange={(e) => update({ how: e.target.value as HowKind | 'all' })}>
                  <option value="all">Toutes</option>
                  {HOW_ORDER.map((how) => (
                    <option key={how} value={how}>
                      {howLabel(locale, how)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Personnage</span>
                <select
                  value={filter.character}
                  onChange={(e) => update({ character: e.target.value as CharacterId | 'all' })}
                >
                  <option value="all">Tous</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
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
              <AchievementRow key={a.id} achievement={a} selected={a.id === selectedId} onOpen={() => onOpen(a.id)} />
            ))}
          </ul>
        )}

        {visible.length > limit && (
          <button type="button" className="btn load-more" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            Afficher plus ({visible.length - limit} {visible.length - limit === 1 ? 'restant' : 'restants'})
          </button>
        )}
      </div>
      {panel}
    </div>
  );
}

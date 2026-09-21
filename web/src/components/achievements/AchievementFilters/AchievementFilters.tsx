import { useMemo } from 'react';
import { CHARACTERS, type CharacterId } from '@shared/characters.ts';
import { DLC_ORDER } from '@shared/dlc.ts';
import type { AchievementEntry, Dlc, HowKind } from '@shared/types.ts';
import { useLocale, useT } from '@/i18n.tsx';
import { DLC_LABELS, HOW_ORDER, howLabel } from '@/lib/labels.ts';
import type { AchievementFilter, SecretFilter, SortOrder, StatusFilter } from '@/lib/filter.ts';

export interface AchievementFiltersProps {
  /** The whole list, to offer only the values it actually holds. */
  achievements: AchievementEntry[];
  filter: AchievementFilter;
  onFilterChange(filter: AchievementFilter): void;
}

/** Search box and the drop-downs that narrow the list down. */
export function AchievementFilters({ achievements, filter, onFilterChange }: AchievementFiltersProps) {
  const locale = useLocale();
  const t = useT();
  const update = (patch: Partial<AchievementFilter>) => onFilterChange({ ...filter, ...patch });

  // With no wiki base, `how` and `character` are null everywhere: those filters would mean nothing.
  const hasWiki = achievements.some((a) => a.how !== null);
  const characters = useMemo(() => {
    const present = new Set(achievements.map((a) => a.character));
    return CHARACTERS.filter((c) => present.has(c.id));
  }, [achievements]);

  return (
    <form className="card filters" role="search" onSubmit={(e) => e.preventDefault()}>
      <label className="field field--grow">
        <span>{t('achievements.search')}</span>
        <input
          type="search"
          value={filter.search}
          placeholder={t('achievements.searchPlaceholder')}
          onChange={(e) => update({ search: e.target.value })}
        />
      </label>
      <label className="field">
        <span>{t('achievements.status')}</span>
        <select value={filter.status} onChange={(e) => update({ status: e.target.value as StatusFilter })}>
          <option value="missing">{t('achievements.statusMissing')}</option>
          <option value="unlocked">{t('achievements.statusUnlocked')}</option>
          <option value="all">{t('achievements.all')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t('achievements.dlc')}</span>
        <select value={filter.dlc} onChange={(e) => update({ dlc: e.target.value as Dlc | 'all' })}>
          <option value="all">{t('achievements.all')}</option>
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
            <span>{t('achievements.how')}</span>
            <select value={filter.how} onChange={(e) => update({ how: e.target.value as HowKind | 'all' })}>
              <option value="all">{t('achievements.all')}</option>
              {HOW_ORDER.map((how) => (
                <option key={how} value={how}>
                  {howLabel(locale, how)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('achievements.character')}</span>
            <select value={filter.character} onChange={(e) => update({ character: e.target.value as CharacterId | 'all' })}>
              <option value="all">{t('achievements.all')}</option>
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
        <span>{t('achievements.secrets')}</span>
        <select value={filter.secret} onChange={(e) => update({ secret: e.target.value as SecretFilter })}>
          <option value="all">{t('achievements.all')}</option>
          <option value="only">{t('achievements.secretsOnly')}</option>
          <option value="exclude">{t('achievements.secretsExclude')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t('achievements.sort')}</span>
        <select value={filter.sort} onChange={(e) => update({ sort: e.target.value as SortOrder })}>
          <option value="id">{t('achievements.sortId')}</option>
          <option value="name">{t('achievements.sortName')}</option>
          <option value="recent">{t('achievements.sortRecent')}</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={filter.onlyDesync} onChange={(e) => update({ onlyDesync: e.target.checked })} />
        {t('achievements.onlyDesync')}
      </label>
    </form>
  );
}

import type { AchievementState, Dlc } from '../../../shared/types.ts';

export type StatusFilter = 'all' | 'unlocked' | 'missing';
export type SecretFilter = 'all' | 'only' | 'exclude';
export type SortOrder = 'id' | 'name' | 'recent';

export interface AchievementFilter {
  status: StatusFilter;
  dlc: Dlc | 'all';
  secret: SecretFilter;
  search: string;
  onlyDesync: boolean;
  sort: SortOrder;
}

export const DEFAULT_FILTER: AchievementFilter = {
  status: 'missing',
  dlc: 'all',
  secret: 'all',
  search: '',
  onlyDesync: false,
  sort: 'id',
};

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function compare(sort: SortOrder) {
  return (a: AchievementState, b: AchievementState): number => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'en') || a.id - b.id;
    if (sort === 'recent') {
      if (a.unlockedAt && b.unlockedAt) return b.unlockedAt.localeCompare(a.unlockedAt) || a.id - b.id;
      if (a.unlockedAt) return -1;
      if (b.unlockedAt) return 1;
    }
    return a.id - b.id;
  };
}

export function filterAchievements(list: AchievementState[], filter: AchievementFilter): AchievementState[] {
  const query = normalizeText(filter.search.trim());
  const idMatch = /^#?(\d+)$/.exec(query);
  const wantedId = idMatch ? Number(idMatch[1]) : null;
  return list
    .filter((a) => {
      if (filter.status !== 'all' && (filter.status === 'unlocked') !== a.unlocked) return false;
      if (filter.dlc !== 'all' && a.dlc !== filter.dlc) return false;
      if (filter.secret === 'only' && !a.hidden) return false;
      if (filter.secret === 'exclude' && a.hidden) return false;
      if (filter.onlyDesync && (a.inSave === null || a.inSave === a.unlocked)) return false;
      if (query === '') return true;
      if (wantedId !== null) return a.id === wantedId;
      return normalizeText(a.name).includes(query) || normalizeText(a.description).includes(query);
    })
    .sort(compare(filter.sort));
}

export interface SavedProfile {
  steamId64: string;
  name: string | null;
}

export const RECENT_PROFILES_KEY = 'iam-recent-profiles';
const MAX_PROFILES = 8;

function isSavedProfile(value: unknown): value is SavedProfile {
  if (typeof value !== 'object' || value === null) return false;
  const { steamId64, name } = value as Record<string, unknown>;
  return typeof steamId64 === 'string' && (name === null || typeof name === 'string');
}

export function loadRecentProfiles(): SavedProfile[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_PROFILES_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter(isSavedProfile).slice(0, MAX_PROFILES).map(({ steamId64, name }) => ({ steamId64, name }))
      : [];
  } catch {
    return [];
  }
}

export function rememberProfile(profile: SavedProfile): SavedProfile[] {
  const entry = { steamId64: profile.steamId64, name: profile.name };
  const list = [entry, ...loadRecentProfiles().filter((p) => p.steamId64 !== entry.steamId64)].slice(0, MAX_PROFILES);
  try {
    localStorage.setItem(RECENT_PROFILES_KEY, JSON.stringify(list));
  } catch {
    // Stockage indisponible : la liste reste valable pour cette page.
  }
  return list;
}

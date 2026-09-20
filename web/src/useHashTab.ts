import { useCallback, useEffect, useState } from 'react';

export type Tab = 'dashboard' | 'achievements' | 'routes' | 'advisor' | 'settings';

const HASHES: Record<Tab, string> = {
  dashboard: '#/',
  achievements: '#/achievements',
  routes: '#/routes',
  advisor: '#/advisor',
  settings: '#/settings',
};
const CARD_HASH = /^#\/achievements\/(\d+)$/;

function tabFromHash(hash: string): Tab {
  if (hash.startsWith(HASHES.achievements)) return 'achievements';
  if (hash.startsWith(HASHES.routes)) return 'routes';
  if (hash.startsWith(HASHES.advisor)) return 'advisor';
  if (hash.startsWith(HASHES.settings)) return 'settings';
  return 'dashboard';
}

function achievementFromHash(hash: string): number | null {
  const match = CARD_HASH.exec(hash);
  return match ? Number(match[1]) : null;
}

/** Value derived from the address, followed on every change of the fragment. */
function useHashValue<T>(read: (hash: string) => T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => read(window.location.hash));
  useEffect(() => {
    const onChange = () => setValue(read(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [read]);
  return [value, setValue];
}

export function useHashTab(): [Tab, (tab: Tab) => void] {
  const [tab, setTab] = useHashValue(tabFromHash);
  const select = useCallback(
    (next: Tab) => {
      // A new tab is shown from the top of the page.
      if (tabFromHash(window.location.hash) !== next) document.documentElement.scrollTop = 0;
      window.location.hash = HASHES[next];
      setTab(next);
    },
    [setTab],
  );
  return [tab, select];
}

/** Card that is open (`#/achievements/<id>`), null otherwise; closing it goes back to the list. */
export function useHashAchievement(): [number | null, (id: number | null) => void] {
  const [id, setId] = useHashValue(achievementFromHash);
  const select = useCallback(
    (next: number | null) => {
      window.location.hash = next === null ? HASHES.achievements : `${HASHES.achievements}/${next}`;
      setId(next);
    },
    [setId],
  );
  return [id, select];
}

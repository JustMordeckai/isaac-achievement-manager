import { useCallback, useEffect, useState } from 'react';

export type Tab = 'dashboard' | 'achievements' | 'routes' | 'settings';

const HASHES: Record<Tab, string> = {
  dashboard: '#/',
  achievements: '#/succes',
  routes: '#/routes',
  settings: '#/parametres',
};
const CARD_HASH = /^#\/succes\/(\d+)$/;

function tabFromHash(hash: string): Tab {
  if (hash.startsWith(HASHES.achievements)) return 'achievements';
  if (hash.startsWith(HASHES.routes)) return 'routes';
  if (hash.startsWith(HASHES.settings)) return 'settings';
  return 'dashboard';
}

function achievementFromHash(hash: string): number | null {
  const match = CARD_HASH.exec(hash);
  return match ? Number(match[1]) : null;
}

/** Valeur dérivée de l'adresse, suivie à chaque changement de fragment. */
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
      // Un nouvel onglet s'affiche depuis le haut de la page.
      if (tabFromHash(window.location.hash) !== next) document.documentElement.scrollTop = 0;
      window.location.hash = HASHES[next];
      setTab(next);
    },
    [setTab],
  );
  return [tab, select];
}

/** Fiche ouverte (`#/succes/<id>`), null sinon ; fermer la fiche revient à la liste. */
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

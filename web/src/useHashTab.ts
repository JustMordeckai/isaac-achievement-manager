import { useCallback, useEffect, useState } from 'react';

export type Tab = 'dashboard' | 'achievements';

const HASHES: Record<Tab, string> = { dashboard: '#/', achievements: '#/succes' };

function tabFromHash(hash: string): Tab {
  return hash.startsWith(HASHES.achievements) ? 'achievements' : 'dashboard';
}

export function useHashTab(): [Tab, (tab: Tab) => void] {
  const [tab, setTab] = useState<Tab>(() => tabFromHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setTab(tabFromHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const select = useCallback((next: Tab) => {
    window.location.hash = HASHES[next];
    setTab(next);
  }, []);

  return [tab, select];
}

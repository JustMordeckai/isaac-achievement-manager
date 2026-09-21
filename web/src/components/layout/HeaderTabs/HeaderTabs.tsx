import type { MessageKey } from '@shared/i18n/index.ts';
import { useT } from '@/i18n.tsx';
import type { Tab } from '@/hooks/useHashTab.ts';

export interface HeaderTabsProps {
  tab: Tab;
  onTabChange(tab: Tab): void;
}

const TABS: Array<{ id: Tab; key: MessageKey }> = [
  { id: 'dashboard', key: 'app.tabDashboard' },
  { id: 'achievements', key: 'app.tabAchievements' },
  { id: 'routes', key: 'app.tabRoutes' },
  { id: 'advisor', key: 'app.tabAdvisor' },
  { id: 'settings', key: 'app.tabSettings' },
];

/** The one navigation of the application; the open tab carries aria-current. */
export function HeaderTabs({ tab, onTabChange }: HeaderTabsProps) {
  const t = useT();
  return (
    <nav className="tabs" aria-label={t('app.sections')}>
      {TABS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className="tab"
          aria-current={tab === entry.id ? 'page' : undefined}
          onClick={() => onTabChange(entry.id)}
        >
          {t(entry.key)}
        </button>
      ))}
    </nav>
  );
}

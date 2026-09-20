import { useLayoutEffect, useRef } from 'react';
import type { MessageKey } from '../../../shared/i18n/index.ts';
import type { AdvisorStatus, KbStatus, ProgressSummary } from '../../../shared/types.ts';
import type { ProfileQuery } from '../api.ts';
import { LanguagePicker, useT } from '../i18n.tsx';
import type { Theme } from '../theme.ts';
import type { Tab } from '../useHashTab.ts';
import { ProfilePicker } from './ProfilePicker.tsx';
import { SourceBadges } from './SourceBadges.tsx';

export interface HeaderProps {
  summary: ProgressSummary | null;
  kb: KbStatus | null;
  advisor: AdvisorStatus | null;
  /** SteamID64 of the local account served under "My profile", when it is known. */
  meSteamId: string | null;
  query: ProfileQuery;
  onQueryChange(query: ProfileQuery): void;
  refreshing: boolean;
  onRefresh(): void;
  theme: Theme;
  onToggleTheme(): void;
  tab: Tab;
  onTabChange(tab: Tab): void;
  onStop(): void;
}

const TABS: Array<{ id: Tab; key: MessageKey }> = [
  { id: 'dashboard', key: 'app.tabDashboard' },
  { id: 'achievements', key: 'app.tabAchievements' },
  { id: 'routes', key: 'app.tabRoutes' },
  { id: 'advisor', key: 'app.tabAdvisor' },
  { id: 'settings', key: 'app.tabSettings' },
];

/** Publishes the height of the header (CSS variable --header-height) to place the card and the scroll. */
function useHeaderHeight() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty('--header-height', `${element.offsetHeight}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--header-height');
    };
  }, []);
  return ref;
}

export function Header(props: HeaderProps) {
  const t = useT();
  const { summary, query } = props;
  const save = summary?.save ?? null;
  const ref = useHeaderHeight();

  return (
    <header className="header" ref={ref}>
      <div className="header__top">
        <h1 className="brand">{t('app.brand')}</h1>
        <nav className="tabs" aria-label={t('app.sections')}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="tab"
              aria-current={props.tab === tab.id ? 'page' : undefined}
              onClick={() => props.onTabChange(tab.id)}
            >
              {t(tab.key)}
            </button>
          ))}
        </nav>
        <div className="header__actions">
          <button type="button" className="btn" onClick={props.onRefresh} disabled={props.refreshing}>
            {props.refreshing ? t('app.refreshing') : t('app.refresh')}
          </button>
          <LanguagePicker />
          <button type="button" className="btn btn--ghost" onClick={props.onToggleTheme}>
            {props.theme === 'dark' ? t('app.toLightTheme') : t('app.toDarkTheme')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={props.onStop}>
            {t('app.stop')}
          </button>
        </div>
      </div>
      <div className="header__bottom">
        <ProfilePicker
          profile={query.profile}
          accounts={summary?.accounts ?? []}
          meSteamId={props.meSteamId}
          currentName={summary?.profile.name ?? null}
          onChange={(profile) => props.onQueryChange({ profile, slot: null })}
        />
        {save && save.slots.length > 1 && (
          <label className="field">
            <span>{t('app.save')}</span>
            <select
              value={query.slot ?? save.slot}
              onChange={(e) => props.onQueryChange({ profile: query.profile, slot: Number(e.target.value) })}
            >
              {save.slots.map((slot) => (
                <option key={slot} value={slot}>
                  {t('app.slot', { slot })}
                </option>
              ))}
            </select>
          </label>
        )}
        <SourceBadges sources={summary?.sources ?? null} wiki={props.kb} advisor={props.advisor} />
      </div>
    </header>
  );
}

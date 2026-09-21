import type { AdvisorStatus, KbStatus, ProgressSummary } from '@shared/types.ts';
import type { ProfileQuery } from '@/lib/api.ts';
import { PowerIcon, RefreshIcon } from '@/components/common/Icons/Icons.tsx';
import { HeaderTabs } from '@/components/layout/HeaderTabs/HeaderTabs.tsx';
import { ProfileBar } from '@/components/layout/ProfileBar/ProfileBar.tsx';
import { ThemeSwitch } from '@/components/layout/ThemeSwitch/ThemeSwitch.tsx';
import { LanguagePicker, useT } from '@/i18n.tsx';
import type { Theme } from '@/lib/theme.ts';
import type { Tab } from '@/hooks/useHashTab.ts';
import { useHeaderHeight } from './useHeaderHeight.ts';

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

export function Header(props: HeaderProps) {
  const t = useT();
  const ref = useHeaderHeight();
  const refreshLabel = props.refreshing ? t('app.refreshing') : t('app.refresh');

  return (
    <header className="header" ref={ref}>
      <div className="header__top">
        <h1 className="brand">{t('app.brand')}</h1>
        <HeaderTabs tab={props.tab} onTabChange={props.onTabChange} />
        <div className="header__actions">
          <LanguagePicker />
          <ThemeSwitch theme={props.theme} onToggle={props.onToggleTheme} />
          <button
            type="button"
            className="icon-btn"
            aria-label={refreshLabel}
            title={refreshLabel}
            onClick={props.onRefresh}
            disabled={props.refreshing}
          >
            <RefreshIcon />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            aria-label={t('app.stop')}
            title={t('app.stop')}
            onClick={props.onStop}
          >
            <PowerIcon />
          </button>
        </div>
      </div>
      <ProfileBar
        summary={props.summary}
        kb={props.kb}
        advisor={props.advisor}
        meSteamId={props.meSteamId}
        query={props.query}
        onQueryChange={props.onQueryChange}
      />
    </header>
  );
}

import { useLayoutEffect, useRef } from 'react';
import type { AdvisorStatus, KbStatus, ProgressSummary } from '../../../shared/types.ts';
import type { ProfileQuery } from '../api.ts';
import type { Theme } from '../theme.ts';
import type { Tab } from '../useHashTab.ts';
import { ProfilePicker } from './ProfilePicker.tsx';
import { SourceBadges } from './SourceBadges.tsx';

export interface HeaderProps {
  summary: ProgressSummary | null;
  kb: KbStatus | null;
  advisor: AdvisorStatus | null;
  /** SteamID64 du compte local servi sous « Mon profil », s'il est connu. */
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

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'dashboard', label: 'Tableau de bord' },
  { id: 'achievements', label: 'Succès' },
  { id: 'routes', label: 'Routes' },
  { id: 'advisor', label: 'Conseiller' },
  { id: 'settings', label: 'Paramètres' },
];

/** Publie la hauteur de l'en-tête (variable CSS --header-height) pour placer la fiche et le défilement. */
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
  const { summary, query } = props;
  const save = summary?.save ?? null;
  const ref = useHeaderHeight();
  return (
    <header className="header" ref={ref}>
      <div className="header__top">
        <h1 className="brand">Isaac Achievement Manager</h1>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tab"
              aria-current={props.tab === t.id ? 'page' : undefined}
              onClick={() => props.onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="header__actions">
          <button type="button" className="btn" onClick={props.onRefresh} disabled={props.refreshing}>
            {props.refreshing ? 'Actualisation…' : 'Actualiser'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={props.onToggleTheme}>
            {props.theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={props.onStop}>
            Arrêter
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
            <span>Sauvegarde</span>
            <select
              value={query.slot ?? save.slot}
              onChange={(e) => props.onQueryChange({ profile: query.profile, slot: Number(e.target.value) })}
            >
              {save.slots.map((slot) => (
                <option key={slot} value={slot}>
                  Slot {slot}
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

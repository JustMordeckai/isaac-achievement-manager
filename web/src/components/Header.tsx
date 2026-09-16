import type { ProgressSummary } from '../../../shared/types.ts';
import type { ProfileQuery } from '../api.ts';
import type { Theme } from '../theme.ts';
import type { Tab } from '../useHashTab.ts';
import { ProfilePicker } from './ProfilePicker.tsx';
import { SourceBadges } from './SourceBadges.tsx';

export interface HeaderProps {
  summary: ProgressSummary | null;
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
];

export function Header(props: HeaderProps) {
  const { summary, query } = props;
  const save = summary?.save ?? null;
  return (
    <header className="header">
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
        {summary && <SourceBadges sources={summary.sources} />}
      </div>
    </header>
  );
}

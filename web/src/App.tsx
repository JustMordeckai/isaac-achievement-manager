import { useEffect, useState } from 'react';
import { api, type ProfileQuery } from './api.ts';
import { Header } from './components/Header.tsx';
import { DEFAULT_FILTER, type AchievementFilter } from './lib/filter.ts';
import { Achievements } from './pages/Achievements.tsx';
import { Dashboard, type FilterPatch } from './pages/Dashboard.tsx';
import { applyTheme, loadTheme, type Theme } from './theme.ts';
import { useHashTab } from './useHashTab.ts';
import { useProgress } from './useProgress.ts';

type StopState = { kind: 'running' } | { kind: 'stopped' } | { kind: 'failed'; message: string };

export function App() {
  const [query, setQuery] = useState<ProfileQuery>({ profile: 'me', slot: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<AchievementFilter>(DEFAULT_FILTER);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [stop, setStop] = useState<StopState>({ kind: 'running' });
  const [tab, setTab] = useHashTab();
  const state = useProgress(query, reloadKey);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  if (stop.kind === 'stopped') {
    return (
      <main className="stopped">
        <h1>Serveur arrêté</h1>
        <p>Tu peux fermer cet onglet. Pour relancer l'application : « Isaac Manager.vbs » ou « npm start ».</p>
      </main>
    );
  }

  async function requestStop() {
    if (!window.confirm('Arrêter le serveur Isaac Achievement Manager ?')) return;
    try {
      await api.shutdown();
      setStop({ kind: 'stopped' });
    } catch (error) {
      setStop({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  }

  function showAchievements(patch: FilterPatch) {
    setFilter((current) => ({ ...current, ...patch }));
    setTab('achievements');
  }

  const reload = () => setReloadKey((key) => key + 1);
  const summary = state.status === 'ready' ? state.data.summary : null;
  const busy = state.status === 'loading' || (state.status === 'ready' && state.refreshing);

  return (
    <div className="app">
      <Header
        summary={summary}
        query={query}
        onQueryChange={setQuery}
        refreshing={busy}
        onRefresh={reload}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        tab={tab}
        onTabChange={setTab}
        onStop={() => void requestStop()}
      />
      <main className="main">
        {stop.kind === 'failed' && (
          <p className="banner banner--error" role="alert">
            Arrêt impossible : {stop.message}
          </p>
        )}
        {state.status === 'loading' && <p className="placeholder">Chargement de la progression…</p>}
        {state.status === 'error' && (
          <div className="card error-panel" role="alert">
            <h2>Impossible de charger la progression</h2>
            <p>{state.message}</p>
            <div className="error-panel__actions">
              <button type="button" className="btn btn--primary" onClick={reload}>
                Réessayer
              </button>
              {query.profile !== 'me' && (
                <button type="button" className="btn" onClick={() => setQuery({ profile: 'me', slot: null })}>
                  Revenir à mon profil
                </button>
              )}
            </div>
          </div>
        )}
        {state.status === 'ready' && tab === 'dashboard' && (
          <Dashboard summary={state.data.summary} onShowAchievements={showAchievements} />
        )}
        {state.status === 'ready' && tab === 'achievements' && (
          <Achievements achievements={state.data.achievements} filter={filter} onFilterChange={setFilter} />
        )}
      </main>
    </div>
  );
}

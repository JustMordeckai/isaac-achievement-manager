import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ProfileQuery } from './api.ts';
import { AchievementCardPanel } from './components/AchievementCardPanel.tsx';
import { Header } from './components/Header.tsx';
import { DEFAULT_FILTER, type AchievementFilter } from './lib/filter.ts';
import { Achievements } from './pages/Achievements.tsx';
import { Dashboard, type FilterPatch } from './pages/Dashboard.tsx';
import { Routes } from './pages/Routes.tsx';
import { Settings } from './pages/Settings.tsx';
import { applyTheme, loadTheme, type Theme } from './theme.ts';
import { useHashAchievement, useHashTab } from './useHashTab.ts';
import { useProgress } from './useProgress.ts';
import { useRoutes } from './useRoutes.ts';
import { useKbStatus, useSettings, useWikiSync } from './useWiki.ts';

type StopState = { kind: 'running' } | { kind: 'stopped' } | { kind: 'failed'; message: string };

const NO_DESYNC: ReadonlySet<number> = new Set();

export function App() {
  const [query, setQuery] = useState<ProfileQuery>({ profile: 'me', slot: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<AchievementFilter>(DEFAULT_FILTER);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [stop, setStop] = useState<StopState>({ kind: 'running' });
  const [tab, setTab] = useHashTab();
  const [cardId, setCardId] = useHashAchievement();
  const state = useProgress(query, reloadKey);
  const routes = useRoutes(query, reloadKey);
  const kb = useKbStatus(reloadKey);
  const settings = useSettings();
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  // Après une synchro, la liste est relue pour recevoir les méthodes et personnages du wiki.
  const [sync, startSync] = useWikiSync(reload);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const summary = state.status === 'ready' ? state.data.summary : null;
  const desyncIds = useMemo(
    () =>
      summary
        ? new Set(summary.desyncs.filter((d) => d.kind === 'saveOnly' || d.kind === 'steamOnly').map((d) => d.id))
        : NO_DESYNC,
    [summary],
  );

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

  // Actualiser reste occupé tant que la progression ou les routes se (re)chargent.
  const busy =
    state.status === 'loading' ||
    (state.status === 'ready' && state.refreshing) ||
    routes.status === 'loading' ||
    (routes.status === 'ready' && routes.refreshing);
  const meSteamId = settings.status === 'ready' ? (settings.info.account?.steamId64 ?? null) : null;
  const openSettings = () => setTab('settings');
  const openRoutes = () => setTab('routes');
  const resetProfile = query.profile !== 'me' ? () => setQuery({ profile: 'me', slot: null }) : null;

  return (
    <div className="app">
      <Header
        summary={summary}
        kb={kb}
        meSteamId={meSteamId}
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
        {tab === 'settings' && <Settings settings={settings} kb={kb} sync={sync} onSync={startSync} />}
        {tab === 'routes' && (
          <Routes
            state={routes}
            onOpenSettings={openSettings}
            onOpenAchievement={setCardId}
            onRetry={reload}
            onResetProfile={resetProfile}
          />
        )}
        {(tab === 'dashboard' || tab === 'achievements') && (
          <>
            {state.status === 'loading' && <p className="placeholder">Chargement de la progression…</p>}
            {state.status === 'error' && (
              <div className="card error-panel" role="alert">
                <h2>Impossible de charger la progression</h2>
                <p>{state.message}</p>
                <div className="error-panel__actions">
                  <button type="button" className="btn btn--primary" onClick={reload}>
                    Réessayer
                  </button>
                  {resetProfile && (
                    <button type="button" className="btn" onClick={resetProfile}>
                      Revenir à mon profil
                    </button>
                  )}
                </div>
              </div>
            )}
            {state.status === 'ready' && tab === 'dashboard' && (
              <Dashboard
                summary={state.data.summary}
                kb={kb}
                routes={routes}
                onShowAchievements={showAchievements}
                onOpenSettings={openSettings}
                onShowRoutes={openRoutes}
                onOpenAchievement={setCardId}
              />
            )}
            {state.status === 'ready' && tab === 'achievements' && (
              <Achievements
                achievements={state.data.achievements}
                filter={filter}
                onFilterChange={setFilter}
                desyncIds={desyncIds}
                selectedId={cardId}
                onOpen={setCardId}
                panel={
                  cardId !== null && (
                    <AchievementCardPanel
                      key={cardId}
                      id={cardId}
                      query={query}
                      reloadKey={reloadKey}
                      onClose={() => setCardId(null)}
                      onOpenSettings={openSettings}
                      onOpenRoutes={openRoutes}
                    />
                  )
                }
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

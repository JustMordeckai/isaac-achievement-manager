import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '../../shared/i18n/index.ts';
import { api, type ProfileQuery } from './api.ts';
import { AchievementCardPanel } from './components/AchievementCardPanel.tsx';
import { Header } from './components/Header.tsx';
import { loadLocale, LocaleProvider, storeLocale } from './i18n.tsx';
import { DEFAULT_FILTER, type AchievementFilter } from './lib/filter.ts';
import { Achievements } from './pages/Achievements.tsx';
import { Advisor } from './pages/Advisor.tsx';
import { Dashboard, type FilterPatch } from './pages/Dashboard.tsx';
import { Routes } from './pages/Routes.tsx';
import { Settings } from './pages/Settings.tsx';
import { applyTheme, loadTheme, type Theme } from './theme.ts';
import { useAdvisorChat, useAdvisorStatus } from './useAdvisor.ts';
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
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useHashTab();
  const [cardId, setCardId] = useHashAchievement();
  const state = useProgress(query, reloadKey);
  const routes = useRoutes(query, reloadKey);
  const kb = useKbStatus(reloadKey);
  const settings = useSettings();
  const advisor = useAdvisorStatus(reloadKey);
  const chat = useAdvisorChat();
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  // Après une synchro, la liste est relue pour recevoir les méthodes et personnages du wiki.
  const [sync, startSync] = useWikiSync(reload);
  const [locale, setLocale] = useState<Locale>(loadLocale);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // The first paint already uses the remembered (or browser-guessed) locale, exactly like the
  // theme; once the server answers, its value takes over and is remembered for the next visit.
  useEffect(() => {
    if (settings.status !== 'ready') return;
    setLocale(settings.info.locale);
    storeLocale(settings.info.locale);
  }, [settings.status]);

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
  // « Demander au conseiller » : la question attend dans le champ, l'utilisateur la relit avant d'envoyer.
  const askAdvisor = (question: string) => {
    setDraft(question);
    setTab('advisor');
  };
  const handleLocaleChange = (next: Locale) => {
    setLocale(next);
    storeLocale(next);
  };

  return (
    <LocaleProvider locale={locale}>
      <div className="app">
        <Header
          summary={summary}
          kb={kb}
          advisor={advisor.status}
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
          onLocaleChange={handleLocaleChange}
        />
        <main className="main">
          {stop.kind === 'failed' && (
            <p className="banner banner--error" role="alert">
              Arrêt impossible : {stop.message}
            </p>
          )}
          {tab === 'settings' && (
            <Settings settings={settings} kb={kb} sync={sync} onSync={startSync} advisor={advisor} onLocaleChange={handleLocaleChange} />
          )}
          {tab === 'routes' && (
            <Routes
              state={routes}
              onOpenSettings={openSettings}
              onOpenAchievement={setCardId}
              onAsk={askAdvisor}
              onRetry={reload}
              onResetProfile={resetProfile}
            />
          )}
          {tab === 'advisor' && (
            <Advisor
              chat={chat}
              query={query}
              status={advisor.status}
              checking={advisor.checking}
              kb={kb}
              draft={draft}
              onDraftChange={setDraft}
              onRecheck={advisor.recheck}
              onOpenSettings={openSettings}
              onOpenAchievement={setCardId}
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
                  onAsk={askAdvisor}
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
                        onAsk={askAdvisor}
                      />
                    )
                  }
                />
              )}
            </>
          )}
        </main>
      </div>
    </LocaleProvider>
  );
}

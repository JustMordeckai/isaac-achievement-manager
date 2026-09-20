import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Locale } from '../../shared/i18n/index.ts';
import { api, type ProfileQuery } from './api.ts';
import { AchievementCardPanel } from './components/AchievementCardPanel.tsx';
import { Header } from './components/Header.tsx';
import { UpdateBanner } from './components/UpdateBanner.tsx';
import { loadLocale, LocaleProvider, storeLocale, useT } from './i18n.tsx';
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
import { useUpdate } from './useUpdate.ts';
import { useKbStatus, useSettings, useWikiSync } from './useWiki.ts';

type StopState = { kind: 'running' } | { kind: 'stopped' } | { kind: 'failed'; message: string };

const NO_DESYNC: ReadonlySet<number> = new Set();

export function App() {
  const t = useT();
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
  const update = useUpdate();
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  // After a sync, the list is read again to pick up the ways to earn and the characters of the wiki.
  const [sync, startSync] = useWikiSync(reload);
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const localeChosenRef = useRef(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // The first paint already uses the remembered (or browser-guessed) locale, exactly like the
  // theme; once the server answers, its value takes over and is remembered for the next visit,
  // unless the reader already picked a language this session (localeChosenRef), in which case
  // that pick always wins.
  useEffect(() => {
    if (settings.status !== 'ready' || localeChosenRef.current) return;
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
        <h1>{t('app.stoppedTitle')}</h1>
        <p>{t('app.stoppedText')}</p>
      </main>
    );
  }

  async function requestStop() {
    if (!window.confirm(t('app.confirmStop'))) return;
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

  // Refresh stays busy while the progress or the routes are loading.
  const busy =
    state.status === 'loading' ||
    (state.status === 'ready' && state.refreshing) ||
    routes.status === 'loading' ||
    (routes.status === 'ready' && routes.refreshing);
  const meSteamId = settings.status === 'ready' ? (settings.info.account?.steamId64 ?? null) : null;
  const openSettings = () => setTab('settings');
  const openRoutes = () => setTab('routes');
  const resetProfile = query.profile !== 'me' ? () => setQuery({ profile: 'me', slot: null }) : null;
  // "Ask the advisor": the question waits in the field, the reader checks it before sending.
  const askAdvisor = (question: string) => {
    setDraft(question);
    setTab('advisor');
  };
  const handleLocaleChange = (next: Locale) => {
    localeChosenRef.current = true;
    setLocale(next);
    storeLocale(next);
  };
  // The interface switches at once, but the plan, the cards and the source messages are written by
  // the server: they are read again as soon as the server has taken the new language.
  const handleLocaleSaved = reload;

  return (
    <LocaleProvider locale={locale} onLocaleChange={handleLocaleChange} onLocaleSaved={handleLocaleSaved}>
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
        />
        <main className="main">
          <UpdateBanner update={update} />
          {stop.kind === 'failed' && (
            <p className="banner banner--error" role="alert">
              {t('app.stopFailed', { message: stop.message })}
            </p>
          )}
          {tab === 'settings' && (
            <Settings settings={settings} kb={kb} sync={sync} onSync={startSync} advisor={advisor} update={update} />
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
              {state.status === 'loading' && <p className="placeholder">{t('app.loadingProgress')}</p>}
              {state.status === 'error' && (
                <div className="card error-panel" role="alert">
                  <h2>{t('app.progressFailed')}</h2>
                  <p>{state.message}</p>
                  <div className="error-panel__actions">
                    <button type="button" className="btn btn--primary" onClick={reload}>
                      {t('app.retry')}
                    </button>
                    {resetProfile && (
                      <button type="button" className="btn" onClick={resetProfile}>
                        {t('app.backToMyProfile')}
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

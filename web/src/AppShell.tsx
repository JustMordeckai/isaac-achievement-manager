import { useEffect, useState } from 'react';
import type { ProfileQuery } from '@/lib/api.ts';
import { AchievementCardPanel } from '@/components/achievements/AchievementCardPanel/AchievementCardPanel.tsx';
import { Header } from '@/components/layout/Header/Header.tsx';
import { ProgressGate } from '@/components/layout/ProgressGate/ProgressGate.tsx';
import { StoppedScreen } from '@/components/layout/StoppedScreen/StoppedScreen.tsx';
import { UpdateBanner } from '@/components/layout/UpdateBanner/UpdateBanner.tsx';
import { useT } from '@/i18n.tsx';
import { DEFAULT_FILTER, type AchievementFilter, type FilterPatch } from '@/lib/filter.ts';
import { Achievements } from '@/pages/Achievements.tsx';
import { Advisor } from '@/pages/Advisor.tsx';
import { Dashboard } from '@/pages/Dashboard.tsx';
import { Routes } from '@/pages/Routes.tsx';
import { Settings } from '@/pages/Settings.tsx';
import { applyTheme, loadTheme, type Theme } from '@/lib/theme.ts';
import { useAdvisorChat } from '@/hooks/useAdvisorChat.ts';
import { useAdvisorStatus } from '@/hooks/useAdvisorStatus.ts';
import { useDesyncIds } from '@/hooks/useDesyncIds.ts';
import { useHashAchievement, useHashTab } from '@/hooks/useHashTab.ts';
import { useProgress } from '@/hooks/useProgress.ts';
import { useRoutes } from '@/hooks/useRoutes.ts';
import { useShutdown } from '@/hooks/useShutdown.ts';
import { useUpdate } from '@/hooks/useUpdate.ts';
import { useKbStatus } from '@/hooks/useKbStatus.ts';
import type { SettingsState } from '@/hooks/useSettings.ts';
import { useWikiSync } from '@/hooks/useWikiSync.ts';

export interface AppShellProps {
  /** Read one level up, because the interface language follows it. */
  settings: SettingsState;
  reloadKey: number;
  onReload(): void;
}

/** Everything under the language: the header, the open tab, and the state they share. */
export function AppShell({ settings, reloadKey, onReload }: AppShellProps) {
  const t = useT();
  const [query, setQuery] = useState<ProfileQuery>({ profile: 'me', slot: null });
  const [filter, setFilter] = useState<AchievementFilter>(DEFAULT_FILTER);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useHashTab();
  const [cardId, setCardId] = useHashAchievement();
  const progress = useProgress(query, reloadKey);
  const routes = useRoutes(query, reloadKey);
  const kb = useKbStatus(reloadKey);
  const advisor = useAdvisorStatus(reloadKey);
  const chat = useAdvisorChat();
  const update = useUpdate();
  const shutdown = useShutdown();
  // After a sync, the list is read again to pick up the ways to earn and the characters of the wiki.
  const [sync, startSync] = useWikiSync(onReload);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const summary = progress.status === 'ready' ? progress.data.summary : null;
  const desyncIds = useDesyncIds(summary);

  if (shutdown.state.kind === 'stopped') return <StoppedScreen />;

  // Refresh stays busy while the progress or the routes are loading.
  const busy =
    progress.status === 'loading' ||
    (progress.status === 'ready' && progress.refreshing) ||
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
  const showAchievements = (patch: FilterPatch) => {
    setFilter((current) => ({ ...current, ...patch }));
    setTab('achievements');
  };

  return (
    <div className="app">
      <Header
        summary={summary}
        kb={kb}
        advisor={advisor.status}
        meSteamId={meSteamId}
        query={query}
        onQueryChange={setQuery}
        refreshing={busy}
        onRefresh={onReload}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        tab={tab}
        onTabChange={setTab}
        onStop={shutdown.request}
      />
      <main className="main">
        <UpdateBanner update={update} />
        {shutdown.state.kind === 'failed' && (
          <p className="banner banner--error" role="alert">
            {t('app.stopFailed', { message: shutdown.state.message })}
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
            onRetry={onReload}
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
          <ProgressGate state={progress} onRetry={onReload} onResetProfile={resetProfile}>
            {(data) =>
              tab === 'dashboard' ? (
                <Dashboard
                  summary={data.summary}
                  kb={kb}
                  routes={routes}
                  onShowAchievements={showAchievements}
                  onOpenSettings={openSettings}
                  onShowRoutes={openRoutes}
                  onOpenAchievement={setCardId}
                  onAsk={askAdvisor}
                />
              ) : (
                <Achievements
                  achievements={data.achievements}
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
              )
            }
          </ProgressGate>
        )}
      </main>
    </div>
  );
}

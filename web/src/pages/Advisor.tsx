import type { AdvisorStatus, KbStatus } from '@shared/types.ts';
import type { ProfileQuery } from '@/lib/api.ts';
import { AdvisorChat } from '@/components/advisor/AdvisorChat/AdvisorChat.tsx';
import { AdvisorServerState } from '@/components/advisor/AdvisorServerState/AdvisorServerState.tsx';
import { SettingsBanner } from '@/components/common/SettingsBanner/SettingsBanner.tsx';
import { useT } from '@/i18n.tsx';
import type { AdvisorChatState } from '@/hooks/useAdvisorChat.ts';

export interface AdvisorProps {
  chat: AdvisorChatState;
  query: ProfileQuery;
  status: AdvisorStatus | null;
  checking: boolean;
  kb: KbStatus | null;
  draft: string;
  onDraftChange(text: string): void;
  onRecheck(): void;
  onOpenSettings(): void;
  onOpenAchievement(id: number): void;
}

/** Advisor screen: free questions to the Ollama model, answers streamed back. */
export function Advisor({
  chat,
  query,
  status,
  checking,
  kb,
  draft,
  onDraftChange,
  onRecheck,
  onOpenSettings,
  onOpenAchievement,
}: AdvisorProps) {
  const t = useT();
  return (
    <div className="advisor">
      <section className="card" aria-labelledby="advisor-title">
        <h2 id="advisor-title">{t('advisor.title')}</h2>
        <p>{t('advisor.intro')}</p>
        <AdvisorServerState
          status={status}
          checking={checking}
          onRecheck={onRecheck}
          onOpenSettings={onOpenSettings}
        />
        {kb && kb.state !== 'ok' && (
          <SettingsBanner
            text={t('advisor.kbMissing')}
            buttonLabel={t('advisor.openSettings')}
            onOpenSettings={onOpenSettings}
          />
        )}
      </section>

      <AdvisorChat
        chat={chat}
        query={query}
        draft={draft}
        onDraftChange={onDraftChange}
        onOpenAchievement={onOpenAchievement}
      />
    </div>
  );
}

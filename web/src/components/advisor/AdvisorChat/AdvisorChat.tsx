import type { ProfileQuery } from '@/lib/api.ts';
import { AdvisorComposer } from '@/components/advisor/AdvisorComposer/AdvisorComposer.tsx';
import { AdvisorExchange } from '@/components/advisor/AdvisorExchange/AdvisorExchange.tsx';
import { AdvisorSuggestions } from '@/components/advisor/AdvisorSuggestions/AdvisorSuggestions.tsx';
import { useT } from '@/i18n.tsx';
import type { AdvisorChat as AdvisorChatState } from '@/hooks/useAdvisorChat.ts';
import { useAdvisorComposer } from './useAdvisorComposer.ts';

export interface AdvisorChatProps {
  chat: AdvisorChatState;
  query: ProfileQuery;
  draft: string;
  onDraftChange(text: string): void;
  onOpenAchievement(id: number): void;
}

/** The conversation itself: what was asked, what came back, and the field for the next question. */
export function AdvisorChat({ chat, query, draft, onDraftChange, onOpenAchievement }: AdvisorChatProps) {
  const t = useT();
  const composer = useAdvisorComposer({
    draft,
    onDraftChange,
    busy: chat.busy,
    onSend: (question) => chat.ask(question, query),
  });

  return (
    <section className="card" aria-labelledby="chat-title">
      <h2 id="chat-title">{t('advisor.conversation')}</h2>
      {chat.exchanges.length === 0 && <AdvisorSuggestions onPick={composer.suggest} />}
      {/* Always in the DOM: a live region born with its content does not announce the first answer. */}
      <ol className="chat" aria-label={t('advisor.exchangesLabel')} aria-busy={chat.busy} aria-live="polite">
        {chat.exchanges.map((exchange) => (
          <AdvisorExchange
            key={exchange.id}
            exchange={exchange}
            onRetry={() => chat.retry(exchange.id, query)}
            onOpenAchievement={onOpenAchievement}
          />
        ))}
      </ol>
      <AdvisorComposer
        field={composer.field}
        draft={draft}
        onDraftChange={onDraftChange}
        onSubmit={composer.submit}
        onKeyDown={composer.keyDown}
        busy={chat.busy}
        onStop={chat.stop}
        canClear={chat.exchanges.length > 0}
        onClear={chat.clear}
      />
    </section>
  );
}

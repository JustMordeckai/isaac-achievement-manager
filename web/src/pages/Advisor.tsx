import { type FormEvent, type KeyboardEvent, useEffect, useRef } from 'react';
import type { MessageKey } from '../../../shared/i18n/index.ts';
import type { AdvisorStatus, KbStatus } from '../../../shared/types.ts';
import type { ProfileQuery } from '../api.ts';
import { useT } from '../i18n.tsx';
import type { AdvisorChat, Exchange } from '../useAdvisor.ts';

export interface AdvisorProps {
  chat: AdvisorChat;
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

export const QUESTION_MAX_CHARS = 2000;

const SUGGESTIONS: MessageKey[] = [
  'advisor.suggestionFirstRun',
  'advisor.suggestionCharacters',
  'advisor.suggestionMarks',
];

type ServerStateProps = Pick<AdvisorProps, 'status' | 'checking' | 'onRecheck' | 'onOpenSettings'>;

function ServerState({ status, checking, onRecheck, onOpenSettings }: ServerStateProps) {
  const t = useT();
  if (!status) return <p className="placeholder">{t('advisor.checkingServer')}</p>;
  if (status.state === 'ok') {
    return <p className="muted">{t('advisor.modelOn', { model: status.model, url: status.url })}</p>;
  }
  return (
    <div className="banner banner--error advisor__server">
      <p>{status.message ?? t('advisor.serverUnavailable')}</p>
      <div className="error-panel__actions">
        <button type="button" className="btn" onClick={onRecheck} disabled={checking}>
          {checking ? t('advisor.checking') : t('advisor.recheck')}
        </button>
        <button type="button" className="btn" onClick={onOpenSettings}>
          {t('advisor.openSettings')}
        </button>
      </div>
    </div>
  );
}

interface ExchangeViewProps {
  exchange: Exchange;
  onRetry(): void;
  onOpenAchievement(id: number): void;
}

function ExchangeView({ exchange, onRetry, onOpenAchievement }: ExchangeViewProps) {
  const t = useT();
  const { state, answer, sources } = exchange;
  return (
    <li className="chat__exchange">
      <div className="chat__message chat__message--user">
        <p className="chat__author">{t('advisor.you')}</p>
        <p className="chat__text">{exchange.question}</p>
      </div>
      <div className="chat__message chat__message--advisor">
        <p className="chat__author">{t('advisor.author')}</p>
        {state === 'waiting' && <p className="placeholder">{t('advisor.preparing')}</p>}
        {answer !== '' && <p className="chat__text">{answer}</p>}
        {state === 'done' && answer === '' && <p className="hint">{t('advisor.noAnswer')}</p>}
        {state === 'stopped' && <p className="hint">{t('advisor.stopped')}</p>}
        {state === 'failed' && (
          <div className="banner banner--error" role="alert">
            <p>{exchange.error}</p>
            <button type="button" className="btn" onClick={onRetry}>
              {t('advisor.retry')}
            </button>
          </div>
        )}
        {sources.length > 0 && state !== 'waiting' && (
          <div className="chat__sources">
            <p className="hint">{t('advisor.cardsSent')}</p>
            <ul className="chips" aria-label={t('advisor.cardsSentLabel')}>
              {sources.map((source) => (
                <li key={source.id}>
                  <button type="button" className="chip chip--link" onClick={() => onOpenAchievement(source.id)}>
                    <span lang="en">{source.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
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
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Arriving on the tab (or from "Ask the advisor"): cursor at the end of the question.
    const element = field.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  function send(event: FormEvent | KeyboardEvent) {
    event.preventDefault();
    if (chat.busy || draft.trim() === '') return;
    chat.ask(draft, query);
    onDraftChange('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) send(event);
  }

  function suggest(text: string) {
    onDraftChange(text);
    field.current?.focus();
  }

  return (
    <div className="advisor">
      <section className="card" aria-labelledby="advisor-title">
        <h2 id="advisor-title">{t('advisor.title')}</h2>
        <p>{t('advisor.intro')}</p>
        <ServerState status={status} checking={checking} onRecheck={onRecheck} onOpenSettings={onOpenSettings} />
        {kb && kb.state !== 'ok' && (
          <div className="banner banner--info">
            <p>{t('advisor.kbMissing')}</p>
            <button type="button" className="btn" onClick={onOpenSettings}>
              {t('advisor.openSettings')}
            </button>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="chat-title">
        <h2 id="chat-title">{t('advisor.conversation')}</h2>
        {chat.exchanges.length === 0 && (
          <div className="chat__empty">
            <p className="muted">{t('advisor.examples')}</p>
            <ul className="chat__suggestions">
              {SUGGESTIONS.map((key) => (
                <li key={key}>
                  <button type="button" className="link-button" onClick={() => suggest(t(key))}>
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Always in the DOM: a live region born with its content does not announce the first answer. */}
        <ol className="chat" aria-label={t('advisor.exchangesLabel')} aria-busy={chat.busy} aria-live="polite">
          {chat.exchanges.map((exchange) => (
            <ExchangeView
              key={exchange.id}
              exchange={exchange}
              onRetry={() => chat.retry(exchange.id, query)}
              onOpenAchievement={onOpenAchievement}
            />
          ))}
        </ol>
        <form className="chat__form" onSubmit={send}>
          <label className="chat__label" htmlFor="advisor-question">
            {t('advisor.questionLabel')}
          </label>
          <textarea
            id="advisor-question"
            ref={field}
            rows={3}
            maxLength={QUESTION_MAX_CHARS}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            aria-describedby="advisor-question-hint"
          />
          <p id="advisor-question-hint" className="hint">
            {t('advisor.questionHint')}
          </p>
          <div className="chat__actions">
            {chat.busy ? (
              <button type="button" className="btn" onClick={chat.stop}>
                {t('advisor.stop')}
              </button>
            ) : (
              <button type="submit" className="btn btn--primary" disabled={draft.trim() === ''}>
                {t('advisor.send')}
              </button>
            )}
            {/* During an answer too: clearing the conversation cuts the answer in flight. */}
            {chat.exchanges.length > 0 && (
              <button type="button" className="btn btn--ghost" onClick={chat.clear}>
                {t('advisor.clear')}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

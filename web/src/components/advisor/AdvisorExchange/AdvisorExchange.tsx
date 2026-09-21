import { useT } from '@/i18n.tsx';
import type { Exchange } from '@/hooks/useAdvisorChat.ts';

export interface AdvisorExchangeProps {
  exchange: Exchange;
  onRetry(): void;
  onOpenAchievement(id: number): void;
}

/** One question and the answer that came back, with the cards the model was given. */
export function AdvisorExchange({ exchange, onRetry, onOpenAchievement }: AdvisorExchangeProps) {
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

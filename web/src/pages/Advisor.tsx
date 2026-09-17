import { type FormEvent, type KeyboardEvent, useEffect, useRef } from 'react';
import type { AdvisorStatus, KbStatus } from '../../../shared/types.ts';
import type { ProfileQuery } from '../api.ts';
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

const SUGGESTIONS = [
  'Quelle run faire en premier ?',
  'Quels personnages débloquer ensuite, et comment ?',
  'Quelles marques me manquent le plus ?',
];

type ServerStateProps = Pick<AdvisorProps, 'status' | 'checking' | 'onRecheck' | 'onOpenSettings'>;

function ServerState({ status, checking, onRecheck, onOpenSettings }: ServerStateProps) {
  if (!status) return <p className="placeholder">Vérification du serveur Ollama…</p>;
  if (status.state === 'ok') {
    return (
      <p className="muted">
        Modèle {status.model} sur {status.url}.
      </p>
    );
  }
  return (
    <div className="banner banner--error advisor__server">
      <p>{status.message ?? 'Serveur Ollama indisponible.'}</p>
      <div className="error-panel__actions">
        <button type="button" className="btn" onClick={onRecheck} disabled={checking}>
          {checking ? 'Vérification…' : 'Vérifier à nouveau'}
        </button>
        <button type="button" className="btn" onClick={onOpenSettings}>
          Ouvrir les paramètres
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
  const { state, answer, sources } = exchange;
  return (
    <li className="chat__exchange">
      <div className="chat__message chat__message--user">
        <p className="chat__author">Toi</p>
        <p className="chat__text">{exchange.question}</p>
      </div>
      <div className="chat__message chat__message--advisor">
        <p className="chat__author">Conseiller</p>
        {state === 'waiting' && (
          <p className="placeholder">
            Préparation de la réponse… Le premier message peut prendre une dizaine de secondes, le temps de charger le
            modèle.
          </p>
        )}
        {answer !== '' && <p className="chat__text">{answer}</p>}
        {state === 'done' && answer === '' && <p className="hint">Le conseiller n'a rien répondu.</p>}
        {state === 'stopped' && <p className="hint">Réponse interrompue.</p>}
        {state === 'failed' && (
          <div className="banner banner--error" role="alert">
            <p>{exchange.error}</p>
            <button type="button" className="btn" onClick={onRetry}>
              Réessayer
            </button>
          </div>
        )}
        {sources.length > 0 && state !== 'waiting' && (
          <div className="chat__sources">
            <p className="hint">Fiches transmises au modèle :</p>
            <ul className="chips" aria-label="Fiches transmises au modèle">
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

/** Écran Conseiller : questions libres au modèle Ollama, réponses en streaming. */
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
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Arrivée sur l'onglet (ou depuis « Demander au conseiller ») : curseur en fin de question.
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
        <h2 id="advisor-title">Conseiller</h2>
        <p>
          Pose une question sur ta progression : le conseiller répond à partir de tes succès, des routes conseillées et
          de la base wiki. Il peut se tromper, vérifie dans les fiches.
        </p>
        <ServerState status={status} checking={checking} onRecheck={onRecheck} onOpenSettings={onOpenSettings} />
        {kb && kb.state !== 'ok' && (
          <div className="banner banner--info">
            <p>Base wiki absente ou inutilisable : le conseiller ne connaît que ta progression.</p>
            <button type="button" className="btn" onClick={onOpenSettings}>
              Ouvrir les paramètres
            </button>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="chat-title">
        <h2 id="chat-title">Conversation</h2>
        {chat.exchanges.length === 0 && (
          <div className="chat__empty">
            <p className="muted">Exemples de questions :</p>
            <ul className="chat__suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button type="button" className="link-button" onClick={() => suggest(suggestion)}>
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Toujours dans le DOM : une région live née avec son contenu n'annonce pas la première réponse. */}
        <ol className="chat" aria-label="Échanges" aria-busy={chat.busy} aria-live="polite">
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
            Ta question
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
            Entrée pour envoyer, Maj+Entrée pour aller à la ligne. La conversation s'efface au rechargement de la page.
          </p>
          <div className="chat__actions">
            {chat.busy ? (
              <button type="button" className="btn" onClick={chat.stop}>
                Arrêter la réponse
              </button>
            ) : (
              <button type="submit" className="btn btn--primary" disabled={draft.trim() === ''}>
                Envoyer
              </button>
            )}
            {/* Pendant une réponse aussi : effacer la conversation coupe la réponse en cours. */}
            {chat.exchanges.length > 0 && (
              <button type="button" className="btn btn--ghost" onClick={chat.clear}>
                Effacer la conversation
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

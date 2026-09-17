import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdvisorStatus, ChatMessage } from '../../shared/types.ts';
import { api, type ProfileQuery } from './api.ts';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface AdvisorStatusState {
  /** null pendant la première lecture. */
  status: AdvisorStatus | null;
  /** Une nouvelle vérification est en cours. */
  checking: boolean;
  recheck(): void;
  /** Remplace l'état après un enregistrement des réglages. */
  replace(status: AdvisorStatus): void;
}

/** État du serveur Ollama, relu à chaque changement de `reloadKey` ou sur demande. */
export function useAdvisorStatus(reloadKey: number): AdvisorStatusState {
  const [status, setStatus] = useState<AdvisorStatus | null>(null);
  const [checks, setChecks] = useState(0);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    api.advisorStatus(controller.signal).then(
      (next) => {
        setStatus(next);
        setChecking(false);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        // Les réglages déjà connus restent affichés : seul l'état change.
        setStatus((prev) => ({
          state: 'error',
          url: prev?.url ?? '',
          model: prev?.model ?? '',
          models: prev?.models ?? [],
          message: `État du conseiller indisponible : ${messageOf(error)}`,
        }));
        setChecking(false);
      },
    );
    return () => controller.abort();
  }, [reloadKey, checks]);
  const recheck = useCallback(() => setChecks((n) => n + 1), []);
  return { status, checking, recheck, replace: setStatus };
}

export type ExchangeState = 'waiting' | 'streaming' | 'done' | 'stopped' | 'failed';

/** Une question et sa réponse. */
export interface Exchange {
  id: number;
  question: string;
  answer: string;
  /** Fiches de succès transmises au modèle. */
  sources: Array<{ id: number; name: string }>;
  state: ExchangeState;
  error: string | null;
}

export interface AdvisorChat {
  exchanges: Exchange[];
  /** Une réponse est en attente ou en cours. */
  busy: boolean;
  ask(question: string, query: ProfileQuery): void;
  /** Repose la question d'un échange en échec, qui est remplacé. */
  retry(id: number, query: ProfileQuery): void;
  stop(): void;
  clear(): void;
}

/** Échanges repris comme historique (le serveur en accepte 10 messages). */
export const HISTORY_EXCHANGES = 5;
const MAX_MESSAGE_CHARS = 8000;

function historyOf(exchanges: Exchange[]): ChatMessage[] {
  return exchanges
    .filter((e) => (e.state === 'done' || e.state === 'stopped') && e.answer.trim() !== '')
    .slice(-HISTORY_EXCHANGES)
    .flatMap((e): ChatMessage[] => [
      { role: 'user', content: e.question },
      { role: 'assistant', content: e.answer.slice(0, MAX_MESSAGE_CHARS) },
    ]);
}

/**
 * Conversation avec le conseiller. Elle vit au niveau de l'application pour survivre à un changement
 * d'onglet ; elle n'est pas enregistrée (un rechargement de la page l'efface).
 */
export function useAdvisorChat(): AdvisorChat {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const current = useRef(exchanges);
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    current.current = exchanges;
  }, [exchanges]);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback((question: string, query: ProfileQuery, previous: Exchange[]) => {
    const id = nextId.current++;
    const abort = new AbortController();
    controller.current = abort;
    const update = (patch: (e: Exchange) => Partial<Exchange>) =>
      setExchanges((list) => list.map((e) => (e.id === id ? { ...e, ...patch(e) } : e)));
    const entry: Exchange = { id, question, answer: '', sources: [], state: 'waiting', error: null };
    current.current = [...previous, entry];
    setExchanges(current.current);
    api
      .askAdvisor(
        { question, history: historyOf(previous), profile: query.profile, slot: query.slot },
        (event) => {
          if (event.kind === 'context') update(() => ({ sources: event.sources }));
          if (event.kind === 'delta') update((e) => ({ answer: e.answer + event.text, state: 'streaming' }));
        },
        abort.signal,
      )
      .then(
        (last) => update(() => (last.kind === 'error' ? { state: 'failed', error: last.message } : { state: 'done' })),
        (error: unknown) =>
          update(() => (abort.signal.aborted ? { state: 'stopped' } : { state: 'failed', error: messageOf(error) })),
      )
      .finally(() => {
        if (controller.current === abort) controller.current = null;
      });
  }, []);

  const busy = exchanges.some((e) => e.state === 'waiting' || e.state === 'streaming');

  const ask = useCallback(
    (question: string, query: ProfileQuery) => {
      const text = question.trim();
      if (text === '' || controller.current) return;
      start(text, query, current.current);
    },
    [start],
  );

  const retry = useCallback(
    (id: number, query: ProfileQuery) => {
      const failed = current.current.find((e) => e.id === id);
      if (!failed || controller.current) return;
      start(failed.question, query, current.current.filter((e) => e.id !== id));
    },
    [start],
  );

  const stop = useCallback(() => controller.current?.abort(), []);

  const clear = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    current.current = [];
    setExchanges([]);
  }, []);

  return { exchanges, busy, ask, retry, stop, clear };
}

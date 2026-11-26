import { useCallback, useEffect, useRef, useState } from 'react';
import { LOCALES, t } from '@shared/i18n/index.ts';
import type { ChatMessage } from '@shared/types.ts';
import { useLocale } from '@/i18n.tsx';
import { api, type ProfileQuery } from '@/lib/api.ts';
import { messageOf } from '@/lib/errors.ts';

export type ExchangeState = 'waiting' | 'streaming' | 'done' | 'stopped' | 'failed';

/** One question and its answer. */
export interface Exchange {
  id: number;
  question: string;
  answer: string;
  /** Achievement cards sent to the model. */
  sources: Array<{ id: number; name: string }>;
  state: ExchangeState;
  error: string | null;
}

export interface AdvisorChatState {
  exchanges: Exchange[];
  /** An answer is pending or under way. */
  busy: boolean;
  ask(question: string, query: ProfileQuery): void;
  /** Asks the question of a failed exchange again; that exchange is replaced. */
  retry(id: number, query: ProfileQuery): void;
  stop(): void;
  clear(): void;
}

/** Exchanges carried over as history (the server accepts 10 messages of it). */
export const HISTORY_EXCHANGES = 5;
const MAX_MESSAGE_CHARS = 4000;
/**
 * Notice the server appends to an answer it cut short (`truncatedNotice` of server/advisor/ollama.ts).
 * Both languages are stripped: the server writes it in the locale of the settings, which the reader
 * can change between two questions.
 */
const TRUNCATED_SUFFIXES = LOCALES.map((code) => `\n\n${t(code, 'advisor.truncated')}`);

/** The answer as the model wrote it: the screen keeps the truncation notice, the history does not. */
function historyAnswer(answer: string): string {
  const suffix = TRUNCATED_SUFFIXES.find((notice) => answer.endsWith(notice));
  const text = suffix ? answer.slice(0, -suffix.length) : answer;
  return text.slice(0, MAX_MESSAGE_CHARS);
}

function historyOf(exchanges: Exchange[]): ChatMessage[] {
  return exchanges
    .filter((e) => e.state === 'done' || e.state === 'stopped')
    .map((e) => ({ question: e.question, answer: historyAnswer(e.answer) }))
    .filter((e) => e.answer.trim() !== '')
    .slice(-HISTORY_EXCHANGES)
    .flatMap((e): ChatMessage[] => [
      { role: 'user', content: e.question },
      { role: 'assistant', content: e.answer },
    ]);
}

/**
 * Conversation with the advisor. It lives at the application level so it survives a tab change;
 * it is never saved (reloading the page clears it).
 */
export function useAdvisorChat(): AdvisorChatState {
  const locale = useLocale();
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const current = useRef(exchanges);
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    current.current = exchanges;
  }, [exchanges]);

  useEffect(() => () => controller.current?.abort(), []);

  /** New exchange: appended, or put in place of the `replaced` exchange when its question is asked again. */
  const start = useCallback((question: string, query: ProfileQuery, replaced: number | null) => {
    const id = nextId.current++;
    const abort = new AbortController();
    controller.current = abort;
    const update = (patch: (e: Exchange) => Partial<Exchange>) =>
      setExchanges((list) => list.map((e) => (e.id === id ? { ...e, ...patch(e) } : e)));
    const entry: Exchange = { id, question, answer: '', sources: [], state: 'waiting', error: null };
    const before = current.current;
    const previous = replaced === null ? before : before.filter((e) => e.id !== replaced);
    current.current = replaced === null ? [...before, entry] : before.map((e) => (e.id === replaced ? entry : e));
    setExchanges(current.current);
    api
      .askAdvisor(
        { question, history: historyOf(previous), profile: query.profile, slot: query.slot },
        locale,
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
  }, [locale]);

  const busy = exchanges.some((e) => e.state === 'waiting' || e.state === 'streaming');

  const ask = useCallback(
    (question: string, query: ProfileQuery) => {
      const text = question.trim();
      if (text === '' || controller.current) return;
      start(text, query, null);
    },
    [start],
  );

  const retry = useCallback(
    (id: number, query: ProfileQuery) => {
      const failed = current.current.find((e) => e.id === id);
      if (!failed || controller.current) return;
      start(failed.question, query, id);
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

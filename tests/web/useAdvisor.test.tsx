import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LOCALES, t } from '../../shared/i18n/index.ts';
import type { AdvisorEvent, AdvisorStatus } from '../../shared/types.ts';
import type { ProfileQuery } from '../../web/src/api.ts';
import { HISTORY_EXCHANGES, useAdvisorChat, useAdvisorStatus } from '../../web/src/useAdvisor.ts';
import { ADVISOR_OFFLINE, ADVISOR_OK } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

const ME: ProfileQuery = { profile: 'me', slot: 1 };

const ndjson = (events: AdvisorEvent[]) => new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(''));

const ANSWER: AdvisorEvent[] = [
  { kind: 'context', sources: [{ id: 45, name: 'Guardian Angel' }] },
  { kind: 'delta', text: 'Start with ' },
  { kind: 'delta', text: 'Magdalene.' },
  { kind: 'done' },
];

/** Stream driven by the test: every call to `push` sends one line. */
function controlledStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body),
    push: (event: AdvisorEvent) => controller?.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)),
    close: () => controller?.close(),
  };
}

describe('useAdvisorStatus', () => {
  it('reads the state, reads it again on request and on every key change', async () => {
    let status = ADVISOR_OFFLINE;
    const mock = stubFetch({ 'GET /api/advisor/status': () => status });
    const { result, rerender } = renderHook(({ key }) => useAdvisorStatus(key), { initialProps: { key: 0 } });
    expect(result.current.status).toBeNull();
    expect(result.current.checking).toBe(true);
    await vi.waitFor(() => expect(result.current.status).toEqual(ADVISOR_OFFLINE));
    expect(result.current.checking).toBe(false);
    status = ADVISOR_OK;
    act(() => result.current.recheck());
    await vi.waitFor(() => expect(result.current.status).toEqual(ADVISOR_OK));
    rerender({ key: 1 });
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(3));
  });

  it('keeps the known settings when the read fails, and accepts a new state', async () => {
    let fail = false;
    stubFetch({ 'GET /api/advisor/status': () => (fail ? jsonResponse({ error: 'boom' }, 500) : ADVISOR_OK) });
    const { result } = renderHook(() => useAdvisorStatus(0));
    await vi.waitFor(() => expect(result.current.status).toEqual(ADVISOR_OK));
    fail = true;
    act(() => result.current.recheck());
    await vi.waitFor(() =>
      expect(result.current.status).toEqual({
        ...ADVISOR_OK,
        state: 'error',
        message: 'Advisor state unavailable: boom',
      }),
    );
    act(() => result.current.replace(ADVISOR_OFFLINE));
    expect(result.current.status).toEqual(ADVISOR_OFFLINE);
  });

  it('ignores the result of a check that was given up on', async () => {
    let late: (status: AdvisorStatus) => void = () => {};
    let calls = 0;
    stubFetch({
      'GET /api/advisor/status': () => {
        calls += 1;
        return calls === 1 ? new Promise<AdvisorStatus>((resolve) => (late = resolve)) : ADVISOR_OK;
      },
    });
    const { result } = renderHook(() => useAdvisorStatus(0));
    act(() => result.current.recheck());
    await vi.waitFor(() => expect(result.current.status).toEqual(ADVISOR_OK));
    // The first check, given up on, must not overwrite the most recent one.
    await act(async () => {
      late(ADVISOR_OFFLINE);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.status).toEqual(ADVISOR_OK);
  });
});

describe('useAdvisorChat', () => {
  it('streams the answer then sends the exchange back as history', async () => {
    const bodies: unknown[] = [];
    stubFetch({
      'POST /api/advisor': (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return ndjson(ANSWER);
      },
    });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('  Which run should I do?  ', ME));
    expect(result.current.busy).toBe(true);
    expect(result.current.exchanges[0]).toMatchObject({ question: 'Which run should I do?', answer: '', state: 'waiting' });
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('done'));
    expect(result.current.exchanges[0]).toMatchObject({
      answer: 'Start with Magdalene.',
      sources: [{ id: 45, name: 'Guardian Angel' }],
      error: null,
    });
    expect(result.current.busy).toBe(false);
    act(() => result.current.ask('And then?', ME));
    await vi.waitFor(() => expect(result.current.exchanges[1]?.state).toBe('done'));
    expect(bodies).toEqual([
      { question: 'Which run should I do?', history: [], profile: 'me', slot: 1 },
      {
        question: 'And then?',
        history: [
          { role: 'user', content: 'Which run should I do?' },
          { role: 'assistant', content: 'Start with Magdalene.' },
        ],
        profile: 'me',
        slot: 1,
      },
    ]);
  });

  it('ignores an empty question or one asked during an answer', async () => {
    const stream = controlledStream();
    const mock = stubFetch({ 'POST /api/advisor': () => stream.response });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('   ', ME));
    expect(result.current.exchanges).toEqual([]);
    act(() => result.current.ask('First', ME));
    act(() => result.current.ask('Second', ME));
    expect(result.current.exchanges).toHaveLength(1);
    await act(async () => {
      stream.push({ kind: 'delta', text: 'Answer' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.exchanges[0]).toMatchObject({ answer: 'Answer', state: 'streaming' });
    await act(async () => {
      stream.push({ kind: 'done' });
      stream.close();
    });
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('done'));
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('stops an answer under way and keeps it in the history', async () => {
    const stream = controlledStream();
    let calls = 0;
    const bodies: unknown[] = [];
    stubFetch({
      'POST /api/advisor': (_url, init) => {
        calls += 1;
        bodies.push(JSON.parse(String(init?.body)));
        if (calls > 1) return ndjson(ANSWER);
        init?.signal?.addEventListener('abort', () => stream.close());
        return stream.response;
      },
    });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('Long question', ME));
    await act(async () => {
      stream.push({ kind: 'delta', text: 'Start of the answer' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => result.current.stop());
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('stopped'));
    expect(result.current.exchanges[0].answer).toBe('Start of the answer');
    act(() => result.current.ask('More', ME));
    await vi.waitFor(() => expect(result.current.exchanges[1]?.state).toBe('done'));
    expect((bodies[1] as { history: unknown[] }).history).toEqual([
      { role: 'user', content: 'Long question' },
      { role: 'assistant', content: 'Start of the answer' },
    ]);
  });

  it('clears the conversation during an answer and frees the send button', async () => {
    const stream = controlledStream();
    let calls = 0;
    stubFetch({
      'POST /api/advisor': (_url, init) => {
        calls += 1;
        if (calls > 1) return ndjson(ANSWER);
        init?.signal?.addEventListener('abort', () => stream.close());
        return stream.response;
      },
    });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('Long question', ME));
    expect(result.current.busy).toBe(true);
    act(() => result.current.clear());
    expect(result.current.exchanges).toEqual([]);
    expect(result.current.busy).toBe(false);
    act(() => result.current.ask('Another question', ME));
    await vi.waitFor(() => expect(result.current.exchanges[0]?.state).toBe('done'));
    expect(result.current.exchanges).toHaveLength(1);
  });

  it.each(LOCALES)('strips the truncation notice written in %s from the history', async (code) => {
    const notice = `\n\n${t(code, 'advisor.truncated')}`;
    const bodies: Array<{ history: Array<{ content: string }> }> = [];
    stubFetch({
      'POST /api/advisor': (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return ndjson([{ kind: 'delta', text: 'Start with Magdalene.' }, { kind: 'delta', text: notice }, { kind: 'done' }]);
      },
    });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('Which run should I do?', ME));
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('done'));
    // The notice stays on screen, but the model must not read it back as something it wrote.
    expect(result.current.exchanges[0].answer).toBe(`Start with Magdalene.${notice}`);
    act(() => result.current.ask('And then?', ME));
    await vi.waitFor(() => expect(result.current.exchanges[1]?.state).toBe('done'));
    expect(bodies[1].history).toEqual([
      { role: 'user', content: 'Which run should I do?' },
      { role: 'assistant', content: 'Start with Magdalene.' },
    ]);
  });

  it('puts the exchange asked again back in its own place in the conversation', async () => {
    let fail = true;
    stubFetch({
      'POST /api/advisor': () =>
        fail ? jsonResponse({ error: 'Ollama unreachable at http://127.0.0.1:11434' }, 503) : ndjson(ANSWER),
    });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('First', ME));
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('failed'));
    fail = false;
    act(() => result.current.ask('Second', ME));
    await vi.waitFor(() => expect(result.current.exchanges[1]?.state).toBe('done'));
    act(() => result.current.retry(result.current.exchanges[0].id, ME));
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('done'));
    expect(result.current.exchanges.map((e) => e.question)).toEqual(['First', 'Second']);
  });

  it('reports a failure and asks the question again', async () => {
    let fail = true;
    stubFetch({
      'POST /api/advisor': () =>
        fail ? jsonResponse({ error: 'Ollama unreachable at http://127.0.0.1:11434' }, 503) : ndjson(ANSWER),
    });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('Which run should I do?', ME));
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('failed'));
    expect(result.current.exchanges[0].error).toBe('Ollama unreachable at http://127.0.0.1:11434');
    fail = false;
    const failedId = result.current.exchanges[0].id;
    act(() => result.current.retry(failedId, ME));
    expect(result.current.exchanges).toHaveLength(1);
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('done'));
    expect(result.current.exchanges[0]).toMatchObject({ question: 'Which run should I do?', answer: 'Start with Magdalene.' });
  });

  it('marks an error sent in the stream as a failure, and keeps it out of the history', async () => {
    const bodies: Array<{ history: unknown[] }> = [];
    let calls = 0;
    stubFetch({
      'POST /api/advisor': (_url, init) => {
        calls += 1;
        bodies.push(JSON.parse(String(init?.body)));
        return calls === 1
          ? ndjson([{ kind: 'delta', text: 'Sta' }, { kind: 'error', message: 'Ollama error: out of memory' }])
          : ndjson(ANSWER);
      },
    });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('Question', ME));
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('failed'));
    expect(result.current.exchanges[0]).toMatchObject({ answer: 'Sta', error: 'Ollama error: out of memory' });
    act(() => result.current.ask('Other', ME));
    await vi.waitFor(() => expect(result.current.exchanges[1]?.state).toBe('done'));
    expect(bodies[1].history).toEqual([]);
  });

  it('limits the history to the last exchanges and clears the conversation', async () => {
    const bodies: Array<{ history: unknown[] }> = [];
    stubFetch({
      'POST /api/advisor': (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return ndjson(ANSWER);
      },
    });
    const { result } = renderHook(() => useAdvisorChat());
    for (let i = 0; i <= HISTORY_EXCHANGES + 1; i++) {
      act(() => result.current.ask(`Question ${i}`, ME));
      await vi.waitFor(() => expect(result.current.exchanges[i]?.state).toBe('done'));
    }
    expect(HISTORY_EXCHANGES).toBe(5);
    const last = bodies[bodies.length - 1].history as Array<{ content: string }>;
    expect(last).toHaveLength(10);
    expect(last[0].content).toBe('Question 1');
    act(() => result.current.clear());
    expect(result.current.exchanges).toEqual([]);
  });
});

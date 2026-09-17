import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdvisorEvent } from '../../shared/types.ts';
import type { ProfileQuery } from '../../web/src/api.ts';
import { HISTORY_EXCHANGES, useAdvisorChat, useAdvisorStatus } from '../../web/src/useAdvisor.ts';
import { ADVISOR_OFFLINE, ADVISOR_OK } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

const ME: ProfileQuery = { profile: 'me', slot: 1 };

const ndjson = (events: AdvisorEvent[]) => new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(''));

const ANSWER: AdvisorEvent[] = [
  { kind: 'context', sources: [{ id: 45, name: 'Guardian Angel' }] },
  { kind: 'delta', text: 'Commence par ' },
  { kind: 'delta', text: 'Magdalene.' },
  { kind: 'done' },
];

/** Flux contrôlé par le test : chaque appel à `push` envoie une ligne. */
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
  it('lit l’état, le relit sur demande et à chaque changement de clé', async () => {
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

  it('garde les réglages connus quand la lecture échoue, et accepte un nouvel état', async () => {
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
        message: 'État du conseiller indisponible : boom',
      }),
    );
    act(() => result.current.replace(ADVISOR_OFFLINE));
    expect(result.current.status).toEqual(ADVISOR_OFFLINE);
  });
});

describe('useAdvisorChat', () => {
  it('diffuse la réponse puis renvoie l’échange comme historique', async () => {
    const bodies: unknown[] = [];
    stubFetch({
      'POST /api/advisor': (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return ndjson(ANSWER);
      },
    });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('  Quelle run faire ?  ', ME));
    expect(result.current.busy).toBe(true);
    expect(result.current.exchanges[0]).toMatchObject({ question: 'Quelle run faire ?', answer: '', state: 'waiting' });
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('done'));
    expect(result.current.exchanges[0]).toMatchObject({
      answer: 'Commence par Magdalene.',
      sources: [{ id: 45, name: 'Guardian Angel' }],
      error: null,
    });
    expect(result.current.busy).toBe(false);
    act(() => result.current.ask('Et ensuite ?', ME));
    await vi.waitFor(() => expect(result.current.exchanges[1]?.state).toBe('done'));
    expect(bodies).toEqual([
      { question: 'Quelle run faire ?', history: [], profile: 'me', slot: 1 },
      {
        question: 'Et ensuite ?',
        history: [
          { role: 'user', content: 'Quelle run faire ?' },
          { role: 'assistant', content: 'Commence par Magdalene.' },
        ],
        profile: 'me',
        slot: 1,
      },
    ]);
  });

  it('ignore une question vide ou posée pendant une réponse', async () => {
    const stream = controlledStream();
    const mock = stubFetch({ 'POST /api/advisor': () => stream.response });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('   ', ME));
    expect(result.current.exchanges).toEqual([]);
    act(() => result.current.ask('Première', ME));
    act(() => result.current.ask('Seconde', ME));
    expect(result.current.exchanges).toHaveLength(1);
    await act(async () => {
      stream.push({ kind: 'delta', text: 'Réponse' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.exchanges[0]).toMatchObject({ answer: 'Réponse', state: 'streaming' });
    await act(async () => {
      stream.push({ kind: 'done' });
      stream.close();
    });
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('done'));
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('arrête une réponse en cours et la garde dans l’historique', async () => {
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
    act(() => result.current.ask('Longue question', ME));
    await act(async () => {
      stream.push({ kind: 'delta', text: 'Début de réponse' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => result.current.stop());
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('stopped'));
    expect(result.current.exchanges[0].answer).toBe('Début de réponse');
    act(() => result.current.ask('Suite', ME));
    await vi.waitFor(() => expect(result.current.exchanges[1]?.state).toBe('done'));
    expect((bodies[1] as { history: unknown[] }).history).toEqual([
      { role: 'user', content: 'Longue question' },
      { role: 'assistant', content: 'Début de réponse' },
    ]);
  });

  it('signale un échec et repose la question', async () => {
    let fail = true;
    stubFetch({
      'POST /api/advisor': () =>
        fail ? jsonResponse({ error: 'Ollama injoignable sur http://127.0.0.1:11434' }, 503) : ndjson(ANSWER),
    });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('Quelle run faire ?', ME));
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('failed'));
    expect(result.current.exchanges[0].error).toBe('Ollama injoignable sur http://127.0.0.1:11434');
    fail = false;
    const failedId = result.current.exchanges[0].id;
    act(() => result.current.retry(failedId, ME));
    expect(result.current.exchanges).toHaveLength(1);
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('done'));
    expect(result.current.exchanges[0]).toMatchObject({ question: 'Quelle run faire ?', answer: 'Commence par Magdalene.' });
  });

  it('marque en échec une erreur envoyée dans le flux, sans la reprendre dans l’historique', async () => {
    const bodies: Array<{ history: unknown[] }> = [];
    let calls = 0;
    stubFetch({
      'POST /api/advisor': (_url, init) => {
        calls += 1;
        bodies.push(JSON.parse(String(init?.body)));
        return calls === 1
          ? ndjson([{ kind: 'delta', text: 'Déb' }, { kind: 'error', message: "Erreur d'Ollama : out of memory" }])
          : ndjson(ANSWER);
      },
    });
    const { result } = renderHook(() => useAdvisorChat());
    act(() => result.current.ask('Question', ME));
    await vi.waitFor(() => expect(result.current.exchanges[0].state).toBe('failed'));
    expect(result.current.exchanges[0]).toMatchObject({ answer: 'Déb', error: "Erreur d'Ollama : out of memory" });
    act(() => result.current.ask('Autre', ME));
    await vi.waitFor(() => expect(result.current.exchanges[1]?.state).toBe('done'));
    expect(bodies[1].history).toEqual([]);
  });

  it('limite l’historique aux derniers échanges et efface la conversation', async () => {
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

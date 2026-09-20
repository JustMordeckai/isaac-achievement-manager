import { t, type Locale } from '../../shared/i18n/index.ts';
import { ndjsonLines } from '../../shared/ndjson.ts';
import type { ChatMessage } from '../../shared/types.ts';

/**
 * Context asked for on every call: without it, Ollama sizes it from the free VRAM (sometimes 16k).
 * 32k is plenty (prompt 12,000 tokens at most, history 12,000, answer 1,500) and fits in the server's
 * VRAM: measured on 2026-09-17 on the same question, first token in 26 s at 32k, nothing in 240 s at 64k.
 */
export const NUM_CTX = 32768;
/** Longest answer, in tokens: a small model can loop forever (about 80 s at 18 tokens per second). */
export const NUM_PREDICT = 1500;
/** Longest wait with no new data during an answer, model loading included. */
export const IDLE_TIMEOUT_MS = 120_000;
/** Longest wait for the list of models. */
export const STATUS_TIMEOUT_MS = 3000;

/** Added to an answer the length limit cut short. */
export function truncatedNotice(locale: Locale): string {
  return t(locale, 'advisor.truncated');
}

export type OllamaErrorKind = 'unreachable' | 'model' | 'upstream' | 'timeout';

export class OllamaError extends Error {
  kind: OllamaErrorKind;

  constructor(kind: OllamaErrorKind, message: string) {
    super(message);
    this.name = 'OllamaError';
    this.kind = kind;
  }
}

export interface OllamaMessage {
  role: 'system' | ChatMessage['role'];
  content: string;
}

function endpoint(url: string, path: string): string {
  return new URL(path, url.endsWith('/') ? url : `${url}/`).toString();
}

function unreachable(url: string, error: unknown, locale: Locale, timeoutMs: number = STATUS_TIMEOUT_MS): OllamaError {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new OllamaError('unreachable', t(locale, 'advisor.unreachableTimeout', { url, seconds: timeoutMs / 1000 }));
  }
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  const message =
    typeof code === 'string' ? t(locale, 'advisor.unreachableCode', { url, code }) : t(locale, 'advisor.unreachable', { url });
  return new OllamaError('unreachable', message);
}

/** JSON body, or null when it is not JSON. A truncated or oversized read is passed on as it is. */
async function jsonBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

async function errorText(res: Response): Promise<string> {
  const body: unknown = await jsonBody(res);
  const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof error === 'string' ? error : `HTTP ${res.status}`;
}

/** Full name of a model: Ollama appends ":latest" when the tag is missing. */
export function fullModelName(model: string): string {
  return model.includes(':') ? model : `${model}:latest`;
}

export function modelMissingMessage(locale: Locale, model: string): string {
  return t(locale, 'advisor.modelMissing', { model });
}

/** Models installed on the server (GET /api/tags), sorted by name. `timeoutMs` is mostly there for the tests. */
export async function listModels(url: string, locale: Locale, timeoutMs: number = STATUS_TIMEOUT_MS): Promise<string[]> {
  let body: unknown;
  try {
    const res = await fetch(endpoint(url, 'api/tags'), { signal: AbortSignal.timeout(timeoutMs) });
    // An answer that drags on (headers received, body never finished) must stay "unreachable", not "upstream".
    if (!res.ok) {
      throw new OllamaError('upstream', t(locale, 'advisor.upstreamStatus', { status: res.status, message: await errorText(res) }));
    }
    body = await jsonBody(res);
  } catch (error) {
    if (error instanceof OllamaError) throw error;
    throw unreachable(url, error, locale, timeoutMs);
  }
  const models = typeof body === 'object' && body !== null ? (body as { models?: unknown }).models : undefined;
  if (!Array.isArray(models)) {
    throw new OllamaError('upstream', t(locale, 'advisor.notOllama', { url }));
  }
  return models
    .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as { name?: unknown }).name : undefined))
    .filter((name): name is string => typeof name === 'string')
    .sort();
}

export interface ChatOptions {
  url: string;
  model: string;
  messages: OllamaMessage[];
  /** Abort asked for by the caller (browser gone, Stop button). */
  signal: AbortSignal;
  /** Locale of the messages this call can fail with. */
  locale: Locale;
  idleTimeoutMs?: number;
}

/**
 * Opens a streaming answer (POST /api/chat). The promise fails before any text when Ollama is
 * unreachable or the model is missing; the generator then yields the chunks of the answer.
 * After an abort through `signal`, the abort error is passed on as it is.
 * The idle timer is armed before the call and only released by the generator's `finally`:
 * every caller must therefore walk the generator to its end or abort it.
 */
export async function openChat({
  url,
  model,
  messages,
  signal,
  locale,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
}: ChatOptions): Promise<AsyncGenerator<string>> {
  const idle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(), idleTimeoutMs);
  };
  const fail = (error: unknown): never => {
    clearTimeout(timer);
    if (idle.signal.aborted && !signal.aborted) {
      const seconds = Math.ceil(idleTimeoutMs / 1000);
      throw new OllamaError('timeout', t(locale, 'advisor.idle', { seconds }));
    }
    throw error;
  };

  touch();
  let res: Response;
  try {
    res = await fetch(endpoint(url, 'api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        think: false,
        options: { num_ctx: NUM_CTX, num_predict: NUM_PREDICT },
      }),
      signal: AbortSignal.any([signal, idle.signal]),
    });
  } catch (error) {
    return fail(signal.aborted ? error : unreachable(url, error, locale));
  }
  if (!res.ok || !res.body) {
    // The timer stays armed: a server that never finishes its error body must fail as "timeout".
    let message: string;
    try {
      message = await errorText(res);
    } catch (error) {
      return fail(error);
    }
    clearTimeout(timer);
    if (res.status === 404 && /not found/i.test(message)) throw new OllamaError('model', modelMissingMessage(locale, model));
    throw new OllamaError('upstream', t(locale, 'advisor.upstreamStatus', { status: res.status, message }));
  }

  const body = res.body;
  return (async function* () {
    try {
      for await (const line of ndjsonLines(body)) {
        touch();
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          throw new OllamaError('upstream', t(locale, 'advisor.unreadable'));
        }
        // A line that is valid JSON but not an object (`null`, a number...) is unreadable too.
        if (typeof parsed !== 'object' || parsed === null) throw new OllamaError('upstream', t(locale, 'advisor.unreadable'));
        const data = parsed as { message?: { content?: unknown }; done?: unknown; done_reason?: unknown; error?: unknown };
        if (typeof data.error === 'string') throw new OllamaError('upstream', t(locale, 'advisor.upstreamError', { error: data.error }));
        const text = data.message?.content;
        if (typeof text === 'string' && text !== '') yield text;
        if (data.done === true) {
          if (data.done_reason === 'length') yield `\n\n${truncatedNotice(locale)}`;
          return;
        }
      }
      throw new OllamaError('upstream', t(locale, 'advisor.interrupted'));
    } catch (error) {
      return fail(error);
    } finally {
      clearTimeout(timer);
    }
  })();
}

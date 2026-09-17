import { ndjsonLines } from '../../shared/ndjson.ts';
import type { ChatMessage } from '../../shared/types.ts';

/** Contexte demandé à chaque appel : sans lui, Ollama le règle selon la VRAM libre (parfois 16k). */
export const NUM_CTX = 65536;
/** Longueur maximale d'une réponse, en jetons : un petit modèle peut boucler sans fin (environ 80 s à 18 jetons par seconde). */
export const NUM_PREDICT = 1500;
/** Ajouté à une réponse coupée par la limite de longueur. */
export const TRUNCATED_NOTICE = '(Réponse coupée : limite de longueur atteinte.)';
/** Attente maximale sans nouvelle donnée pendant une réponse, chargement du modèle compris. */
export const IDLE_TIMEOUT_MS = 120_000;
/** Attente maximale de la liste des modèles. */
export const STATUS_TIMEOUT_MS = 3000;

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

function unreachable(url: string, error: unknown): OllamaError {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new OllamaError('unreachable', `Ollama injoignable sur ${url} (pas de réponse en ${STATUS_TIMEOUT_MS / 1000} s)`);
  }
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return new OllamaError('unreachable', `Ollama injoignable sur ${url}${typeof code === 'string' ? ` (${code})` : ''}`);
}

async function errorText(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof error === 'string' ? error : `HTTP ${res.status}`;
}

/** Nom complet d'un modèle : Ollama ajoute « :latest » quand l'étiquette manque. */
export function fullModelName(model: string): string {
  return model.includes(':') ? model : `${model}:latest`;
}

export function modelMissingMessage(model: string): string {
  return `Modèle ${model} absent du serveur Ollama : lance « ollama pull ${model} » sur ce serveur`;
}

/** Modèles installés sur le serveur (GET /api/tags), triés par nom. */
export async function listModels(url: string): Promise<string[]> {
  let res: Response;
  let body: unknown;
  try {
    res = await fetch(endpoint(url, 'api/tags'), { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    body = res.ok ? await res.json().catch(() => null) : null;
  } catch (error) {
    throw unreachable(url, error);
  }
  if (!res.ok) throw new OllamaError('upstream', `Ollama a répondu ${res.status} : ${await errorText(res)}`);
  const models = typeof body === 'object' && body !== null ? (body as { models?: unknown }).models : undefined;
  if (!Array.isArray(models)) {
    throw new OllamaError('upstream', `Réponse inattendue de ${url} : est-ce bien un serveur Ollama ?`);
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
  /** Abandon demandé par l'appelant (navigateur déconnecté, bouton Arrêter). */
  signal: AbortSignal;
  idleTimeoutMs?: number;
}

/**
 * Ouvre une réponse en streaming (POST /api/chat). La promesse échoue avant tout texte si Ollama est
 * injoignable ou si le modèle manque ; le générateur renvoie ensuite les morceaux de la réponse.
 * Après un abandon par `signal`, l'erreur d'abandon remonte telle quelle.
 */
export async function openChat({
  url,
  model,
  messages,
  signal,
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
      throw new OllamaError(
        'timeout',
        `Ollama ne répond plus (rien reçu depuis ${seconds} s) : le serveur est peut-être occupé par une autre demande`,
      );
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
    return fail(signal.aborted ? error : unreachable(url, error));
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const message = await errorText(res);
    if (res.status === 404 && /not found/i.test(message)) throw new OllamaError('model', modelMissingMessage(model));
    throw new OllamaError('upstream', `Ollama a répondu ${res.status} : ${message}`);
  }

  const body = res.body;
  return (async function* () {
    try {
      for await (const line of ndjsonLines(body)) {
        touch();
        let data: { message?: { content?: unknown }; done?: unknown; done_reason?: unknown; error?: unknown };
        try {
          data = JSON.parse(line);
        } catch {
          throw new OllamaError('upstream', "Réponse d'Ollama illisible");
        }
        if (typeof data.error === 'string') throw new OllamaError('upstream', `Erreur d'Ollama : ${data.error}`);
        const text = data.message?.content;
        if (typeof text === 'string' && text !== '') yield text;
        if (data.done === true) {
          if (data.done_reason === 'length') yield `\n\n${TRUNCATED_NOTICE}`;
          return;
        }
      }
      throw new OllamaError('upstream', "Réponse d'Ollama interrompue avant la fin");
    } catch (error) {
      return fail(error);
    } finally {
      clearTimeout(timer);
    }
  })();
}

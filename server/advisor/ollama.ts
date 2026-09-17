import { ndjsonLines } from '../../shared/ndjson.ts';
import type { ChatMessage } from '../../shared/types.ts';

/**
 * Contexte demandé à chaque appel : sans lui, Ollama le règle selon la VRAM libre (parfois 16k).
 * 32k suffit largement (consigne 12 000 jetons au plus, historique 12 000, réponse 1 500) et tient dans la
 * VRAM du serveur : mesuré le 2026-09-17 sur la même question, premier jeton en 26 s à 32k, rien en 240 s à 64k.
 */
export const NUM_CTX = 32768;
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

function unreachable(url: string, error: unknown, timeoutMs: number = STATUS_TIMEOUT_MS): OllamaError {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new OllamaError('unreachable', `Ollama injoignable sur ${url} (pas de réponse en ${timeoutMs / 1000} s)`);
  }
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return new OllamaError('unreachable', `Ollama injoignable sur ${url}${typeof code === 'string' ? ` (${code})` : ''}`);
}

/** Corps JSON, ou null si ce n'est pas du JSON. Une lecture coupée ou trop longue remonte telle quelle. */
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

/** Nom complet d'un modèle : Ollama ajoute « :latest » quand l'étiquette manque. */
export function fullModelName(model: string): string {
  return model.includes(':') ? model : `${model}:latest`;
}

export function modelMissingMessage(model: string): string {
  return `Modèle ${model} absent du serveur Ollama : lance « ollama pull ${model} » sur ce serveur`;
}

/** Modèles installés sur le serveur (GET /api/tags), triés par nom. `timeoutMs` sert surtout aux tests. */
export async function listModels(url: string, timeoutMs: number = STATUS_TIMEOUT_MS): Promise<string[]> {
  let body: unknown;
  try {
    const res = await fetch(endpoint(url, 'api/tags'), { signal: AbortSignal.timeout(timeoutMs) });
    // Une réponse qui traîne (en-têtes reçus, corps jamais fini) doit rester « injoignable », pas « upstream ».
    if (!res.ok) throw new OllamaError('upstream', `Ollama a répondu ${res.status} : ${await errorText(res)}`);
    body = await jsonBody(res);
  } catch (error) {
    if (error instanceof OllamaError) throw error;
    throw unreachable(url, error, timeoutMs);
  }
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
 * Le minuteur d'inactivité est armé avant l'appel et n'est libéré que par le `finally` du générateur :
 * tout appelant doit donc parcourir le générateur jusqu'à sa fin ou l'abandonner.
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
    // Le minuteur reste armé : un serveur qui ne finit jamais son corps d'erreur doit échouer en « timeout ».
    let message: string;
    try {
      message = await errorText(res);
    } catch (error) {
      return fail(error);
    }
    clearTimeout(timer);
    if (res.status === 404 && /not found/i.test(message)) throw new OllamaError('model', modelMissingMessage(model));
    throw new OllamaError('upstream', `Ollama a répondu ${res.status} : ${message}`);
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
          throw new OllamaError('upstream', "Réponse d'Ollama illisible");
        }
        // Une ligne valide en JSON mais qui n'est pas un objet (`null`, un nombre...) est illisible aussi.
        if (typeof parsed !== 'object' || parsed === null) throw new OllamaError('upstream', "Réponse d'Ollama illisible");
        const data = parsed as { message?: { content?: unknown }; done?: unknown; done_reason?: unknown; error?: unknown };
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

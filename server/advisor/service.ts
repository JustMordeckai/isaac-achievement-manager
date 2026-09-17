import type { AdvisorStatus, OllamaSettings } from '../../shared/types.ts';
import { fullModelName, listModels, modelMissingMessage, OllamaError, type OllamaMessage, openChat } from './ollama.ts';

export interface AdvisorService {
  /** Interroge le serveur Ollama à chaque appel (pas de cache). */
  status(): Promise<AdvisorStatus>;
  /** Enregistre de nouveaux réglages, les applique sans redémarrage et renvoie l'état obtenu. */
  configure(settings: OllamaSettings): Promise<AdvisorStatus>;
  chat(messages: OllamaMessage[], signal: AbortSignal): Promise<AsyncGenerator<string>>;
}

export interface AdvisorServiceOptions {
  settings: OllamaSettings;
  /** Écrit les réglages dans data/settings.json. */
  save(settings: OllamaSettings): Promise<void>;
  idleTimeoutMs?: number;
}

export function createAdvisorService({ settings, save, idleTimeoutMs }: AdvisorServiceOptions): AdvisorService {
  let current: OllamaSettings = { ...settings };

  async function status(): Promise<AdvisorStatus> {
    const { url, model } = current;
    try {
      const models = await listModels(url);
      if (models.some((name) => fullModelName(name) === fullModelName(model))) return { state: 'ok', url, model, models };
      return { state: 'error', url, model, models, message: modelMissingMessage(model) };
    } catch (error) {
      const state = error instanceof OllamaError && error.kind === 'unreachable' ? 'absent' : 'error';
      return { state, url, model, models: [], message: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    status,
    async configure(next) {
      await save(next);
      current = { ...next };
      return status();
    },
    chat(messages, signal) {
      return openChat({ ...current, messages, signal, idleTimeoutMs });
    },
  };
}

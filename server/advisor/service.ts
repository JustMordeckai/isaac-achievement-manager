import type { Locale } from '../../shared/i18n/index.ts';
import type { AdvisorStatus, OllamaSettings } from '../../shared/types.ts';
import { fullModelName, listModels, modelMissingMessage, OllamaError, type OllamaMessage, openChat } from './ollama.ts';

export interface AdvisorService {
  /** Asks the Ollama server on every call (no cache). */
  status(locale: Locale): Promise<AdvisorStatus>;
  /** Saves new settings, applies them without a restart and returns the state they produce. */
  configure(settings: OllamaSettings, locale: Locale): Promise<AdvisorStatus>;
  chat(messages: OllamaMessage[], signal: AbortSignal, locale: Locale): Promise<AsyncGenerator<string>>;
  /** Settings in use, address included: the setup downloads the model on that same server. */
  settings(): OllamaSettings;
}

export interface AdvisorServiceOptions {
  settings: OllamaSettings;
  /** Writes the settings to data/settings.json. */
  save(settings: OllamaSettings): Promise<void>;
  idleTimeoutMs?: number;
}

export function createAdvisorService({ settings, save, idleTimeoutMs }: AdvisorServiceOptions): AdvisorService {
  let current: OllamaSettings = { ...settings };

  async function status(locale: Locale): Promise<AdvisorStatus> {
    const { url, model } = current;
    try {
      const models = await listModels(url, locale);
      if (models.some((name) => fullModelName(name) === fullModelName(model))) return { state: 'ok', url, model, models };
      return { state: 'error', url, model, models, message: modelMissingMessage(locale, model) };
    } catch (error) {
      const state = error instanceof OllamaError && error.kind === 'unreachable' ? 'absent' : 'error';
      return { state, url, model, models: [], message: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    status,
    settings: () => ({ ...current }),
    async configure(next, locale) {
      await save(next);
      current = { ...next };
      return status(locale);
    },
    chat(messages, signal, locale) {
      return openChat({ ...current, messages, signal, locale, idleTimeoutMs });
    },
  };
}

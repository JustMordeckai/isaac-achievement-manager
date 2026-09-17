import type { AdvisorRequest, ChatMessage, OllamaSettings } from '../../shared/types.ts';
import { ollamaModel, ollamaUrl } from '../config.ts';
import { HttpError } from '../http-error.ts';

export const MAX_QUESTION_CHARS = 2000;
export const MAX_HISTORY = 10;
export const MAX_MESSAGE_CHARS = 4000;

function fields(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Corps JSON attendu');
  return body as Record<string, unknown>;
}

function historyEntry(entry: unknown): ChatMessage {
  const { role, content } = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
  if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || content.length > MAX_MESSAGE_CHARS) {
    throw new HttpError(400, `Message d'historique invalide (${MAX_MESSAGE_CHARS} caractères au plus)`);
  }
  return { role, content };
}

/** Valide le corps de POST /api/advisor (400 sinon). */
export function parseAdvisorRequest(body: unknown): AdvisorRequest {
  const { question, history, profile, slot } = fields(body);
  if (typeof question !== 'string' || question.trim() === '') throw new HttpError(400, 'Question vide');
  if (question.length > MAX_QUESTION_CHARS) {
    throw new HttpError(400, `Question trop longue (${MAX_QUESTION_CHARS} caractères au plus)`);
  }
  if (!Array.isArray(history) || history.length > MAX_HISTORY) {
    throw new HttpError(400, `Historique invalide (${MAX_HISTORY} messages au plus)`);
  }
  if (typeof profile !== 'string' || profile === '' || profile.length > 100) throw new HttpError(400, 'Profil invalide');
  if (slot !== null && !(Number.isInteger(slot) && (slot as number) >= 1 && (slot as number) <= 3)) {
    throw new HttpError(400, 'Paramètre slot invalide (1 à 3)');
  }
  return { question: question.trim(), history: history.map(historyEntry), profile, slot: slot as number | null };
}

/** Valide le corps de POST /api/advisor/settings (400 sinon). */
export function parseOllamaSettings(body: unknown): OllamaSettings {
  const { url, model } = fields(body);
  const cleanUrl = ollamaUrl(url);
  if (!cleanUrl) throw new HttpError(400, 'Adresse Ollama invalide (attendu : http://hôte:port)');
  const cleanModel = ollamaModel(model);
  if (!cleanModel) throw new HttpError(400, 'Nom de modèle invalide');
  return { url: cleanUrl, model: cleanModel };
}

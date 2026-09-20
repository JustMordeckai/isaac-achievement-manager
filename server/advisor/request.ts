import { t, type Locale } from '../../shared/i18n/index.ts';
import type { AdvisorRequest, ChatMessage, OllamaSettings } from '../../shared/types.ts';
import { ollamaModel, ollamaUrl } from '../config.ts';
import { HttpError } from '../http-error.ts';

export const MAX_QUESTION_CHARS = 2000;
export const MAX_HISTORY = 10;
export const MAX_MESSAGE_CHARS = 4000;

function fields(body: unknown, locale: Locale): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, t(locale, 'errors.bodyExpected'));
  }
  return body as Record<string, unknown>;
}

function historyEntry(entry: unknown, locale: Locale): ChatMessage {
  const { role, content } = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
  if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || content.length > MAX_MESSAGE_CHARS) {
    throw new HttpError(400, t(locale, 'advisor.historyEntryInvalid', { max: MAX_MESSAGE_CHARS }));
  }
  return { role, content };
}

/** Validates the body of POST /api/advisor (400 otherwise). */
export function parseAdvisorRequest(body: unknown, locale: Locale): AdvisorRequest {
  const { question, history, profile, slot } = fields(body, locale);
  if (typeof question !== 'string' || question.trim() === '') throw new HttpError(400, t(locale, 'advisor.questionEmpty'));
  if (question.length > MAX_QUESTION_CHARS) {
    throw new HttpError(400, t(locale, 'advisor.questionTooLong', { max: MAX_QUESTION_CHARS }));
  }
  if (!Array.isArray(history) || history.length > MAX_HISTORY) {
    throw new HttpError(400, t(locale, 'advisor.historyTooLong', { max: MAX_HISTORY }));
  }
  if (typeof profile !== 'string' || profile === '' || profile.length > 100) {
    throw new HttpError(400, t(locale, 'advisor.profileInvalid'));
  }
  if (slot !== null && !(Number.isInteger(slot) && (slot as number) >= 1 && (slot as number) <= 3)) {
    throw new HttpError(400, t(locale, 'errors.slotInvalid'));
  }
  return {
    question: question.trim(),
    history: history.map((entry) => historyEntry(entry, locale)),
    profile,
    slot: slot as number | null,
  };
}

/** Validates the body of POST /api/advisor/settings (400 otherwise). */
export function parseOllamaSettings(body: unknown, locale: Locale): OllamaSettings {
  const { url, model } = fields(body, locale);
  const cleanUrl = ollamaUrl(url);
  if (!cleanUrl) throw new HttpError(400, t(locale, 'advisor.urlInvalid'));
  const cleanModel = ollamaModel(model);
  if (!cleanModel) throw new HttpError(400, t(locale, 'advisor.modelInvalid'));
  return { url: cleanUrl, model: cleanModel };
}

import express, { type NextFunction, type Request, type Response } from 'express';
import { t, toLocale, type Locale } from '../shared/i18n/index.ts';
import type {
  AchievementCard,
  AdvisorEvent,
  ApiError,
  RoutesResponse,
  SettingsInfo,
  StatusResponse,
  WikiSyncEvent,
} from '../shared/types.ts';
import { buildAdvisorContext } from './advisor/context.ts';
import { OllamaError, type OllamaErrorKind, type OllamaMessage } from './advisor/ollama.ts';
import { parseAdvisorRequest, parseOllamaSettings } from './advisor/request.ts';
import type { AdvisorService } from './advisor/service.ts';
import { saveSettings } from './config.ts';
import { HttpError } from './http-error.ts';
import type { IconCache } from './icons.ts';
import type { KbService } from './kb-service.ts';
import { cardPlan } from './planner/card-plan.ts';
import { buildPlan } from './planner/plan.ts';
import { profileErrorToHttp, type ProgressService } from './progress-service.ts';
import { ProfileError, type ProfileClient } from './sources/steam-profile.ts';
import { buildAchievementWiki, enrichAchievements } from './wiki/card.ts';

export const APP_NAME = 'isaac-achievement-manager';

export interface AppDeps {
  progress: Pick<ProgressService, 'get'>;
  profiles: ProfileClient;
  icons: IconCache;
  kb: KbService;
  advisor: AdvisorService;
  settings: SettingsInfo;
  /** Called once the response to POST /api/shutdown has been sent. */
  onShutdown?: () => void;
}

function readQuery(req: Request, locale: Locale): { profile: string; slot: number | null } {
  const { profile, slot } = req.query;
  const selected = typeof profile === 'string' && profile !== '' ? profile : 'me';
  if (slot === undefined || slot === '') return { profile: selected, slot: null };
  const value = typeof slot === 'string' && /^\d+$/.test(slot) ? Number(slot) : Number.NaN;
  if (!(value >= 1 && value <= 3)) throw new HttpError(400, t(locale, 'errors.slotInvalid'));
  return { profile: selected, slot: value };
}

/**
 * Requires the action header of a POST request, before any body is read: a third-party site
 * cannot send it without a prior CORS request, never allowed here; the host check blocks DNS rebinding.
 */
function requireAction(action: string, settings: Pick<SettingsInfo, 'locale'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    next(
      req.get('X-IAM-Action') === action
        ? undefined
        : new HttpError(403, t(settings.locale, 'errors.actionHeaderRequired', { action })),
    );
  };
}

const GATEWAY_STATUS: Partial<Record<OllamaErrorKind, number>> = { unreachable: 503, timeout: 504 };

const parseJson = express.json({ limit: '256kb' });

/** JSON body parsing, with a localized error for a body that is unreadable (400) or too large (413). */
function jsonBody(settings: Pick<SettingsInfo, 'locale'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    parseJson(req, res, (error?: unknown) => {
      if (!error) return next();
      const tooLarge = (error as { status?: unknown }).status === 413;
      next(new HttpError(tooLarge ? 413 : 400, tooLarge ? t(settings.locale, 'errors.bodyTooLarge') : t(settings.locale, 'errors.bodyUnreadable')));
    });
  };
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // DNS rebinding check: after a rebinding, a third-party page becomes same-origin with
  // 127.0.0.1 and could read /api/progress or call /api/shutdown. Placed before any route,
  // this middleware also covers the static and Vite middlewares added afterwards by server/index.ts.
  app.use((req, res, next) => {
    if (req.hostname === '127.0.0.1' || req.hostname === 'localhost') return next();
    res.status(403).json({ error: t(deps.settings.locale, 'errors.hostNotAllowed') } satisfies ApiError);
  });

  const api = express.Router();

  api.get('/ping', (_req, res) => {
    res.json({ app: APP_NAME });
  });

  api.get('/status', async (_req, res) => {
    let sources: StatusResponse['sources'] = null;
    try {
      sources = (await deps.progress.get('me', null, deps.settings.locale)).summary.sources;
    } catch {
      sources = null;
    }
    res.json({ app: APP_NAME, sources, wiki: await deps.kb.status(deps.settings.locale) } satisfies StatusResponse);
  });

  api.get('/settings', (_req, res) => {
    res.json(deps.settings);
  });

  api.post('/settings', requireAction('settings', deps.settings), jsonBody(deps.settings), async (req, res) => {
    const raw: unknown = req.body;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new HttpError(400, t(deps.settings.locale, 'errors.bodyExpected'));
    }
    const body = raw as Record<string, unknown>;
    const locale = toLocale(body.locale);
    if (!locale) throw new HttpError(400, t(deps.settings.locale, 'errors.localeInvalid', { locale: String(body.locale) }));
    await saveSettings(deps.settings.dataDir, { locale }, deps.settings.locale);
    deps.settings.locale = locale;
    res.json(deps.settings);
  });

  api.get('/progress', async (req, res) => {
    const { profile, slot } = readQuery(req, deps.settings.locale);
    res.json((await deps.progress.get(profile, slot, deps.settings.locale)).summary);
  });

  api.get('/achievements', async (req, res) => {
    const { profile, slot } = readQuery(req, deps.settings.locale);
    const [progress, kb] = await Promise.all([deps.progress.get(profile, slot, deps.settings.locale), deps.kb.get()]);
    res.json(enrichAchievements(progress.achievements, kb));
  });

  api.get('/achievement/:id', async (req, res) => {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : 0;
    if (id <= 0) throw new HttpError(400, t(deps.settings.locale, 'errors.achievementIdInvalid'));
    const { profile, slot } = readQuery(req, deps.settings.locale);
    const [progress, kb, status] = await Promise.all([
      deps.progress.get(profile, slot, deps.settings.locale),
      deps.kb.get(),
      deps.kb.status(deps.settings.locale),
    ]);
    const achievement = progress.achievements.find((a) => a.id === id);
    if (!achievement) throw new HttpError(404, t(deps.settings.locale, 'errors.achievementNotFound', { id }));
    const [entry] = enrichAchievements([achievement], kb);
    const plan = kb ? cardPlan(kb, buildPlan({ kb, ...progress, locale: deps.settings.locale }), progress.achievements, id) : null;
    res.json({ achievement: entry, wiki: kb ? buildAchievementWiki(kb, id) : null, kb: status, plan } satisfies AchievementCard);
  });

  api.get('/routes', async (req, res) => {
    const { profile, slot } = readQuery(req, deps.settings.locale);
    const [progress, kb, status] = await Promise.all([
      deps.progress.get(profile, slot, deps.settings.locale),
      deps.kb.get(),
      deps.kb.status(deps.settings.locale),
    ]);
    res.json({ kb: status, plan: kb ? buildPlan({ kb, ...progress, locale: deps.settings.locale }) : null } satisfies RoutesResponse);
  });

  api.get('/profile/resolve', async (req, res) => {
    const input = typeof req.query.input === 'string' ? req.query.input : '';
    try {
      res.json(await deps.profiles.resolve(input, deps.settings.locale));
    } catch (error) {
      throw error instanceof ProfileError ? profileErrorToHttp(error) : error;
    }
  });

  api.get('/icons/:file', async (req, res) => {
    const bytes = await deps.icons.get(req.params.file, deps.settings.locale);
    res.set('Cache-Control', 'public, max-age=604800, immutable').type('image/jpeg').send(Buffer.from(bytes));
  });

  api.get('/wiki/status', async (_req, res) => {
    res.json(await deps.kb.status(deps.settings.locale));
  });

  api.post('/wiki/sync', requireAction('wiki-sync', deps.settings), async (_req, res) => {
    if (deps.kb.isRunning()) throw new HttpError(409, t(deps.settings.locale, 'wiki.syncBusy'));
    res.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.flushHeaders();
    // The sync keeps running if the browser disconnects: we only stop writing.
    res.on('error', () => {});
    const send = (event: WikiSyncEvent) => {
      if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
    };
    try {
      await deps.kb.sync(send, deps.settings.locale);
    } catch {
      // The "error" event has already been sent in the stream.
    }
    if (!res.destroyed) res.end();
  });

  api.get('/advisor/status', async (_req, res) => {
    res.json(await deps.advisor.status(deps.settings.locale));
  });

  api.post('/advisor/settings', requireAction('advisor-settings', deps.settings), jsonBody(deps.settings), async (req, res) => {
    res.json(await deps.advisor.configure(parseOllamaSettings(req.body, deps.settings.locale), deps.settings.locale));
  });

  api.post('/advisor', requireAction('advisor', deps.settings), jsonBody(deps.settings), async (req, res) => {
    const controller = new AbortController();
    // Browser gone (Stop button, tab closed): we also cut the generation on Ollama.
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    const request = parseAdvisorRequest(req.body, deps.settings.locale);
    const [progress, kb] = await Promise.all([
      deps.progress.get(request.profile, request.slot, deps.settings.locale),
      deps.kb.get(),
    ]);
    // English plan for the model: only the language rule in the prompt depends on the reader's locale.
    const plan = kb ? buildPlan({ kb, ...progress, locale: 'en' }) : null;
    const context = buildAdvisorContext({ question: request.question, progress, kb, plan, locale: deps.settings.locale });
    const messages: OllamaMessage[] = [
      { role: 'system', content: context.system },
      ...request.history,
      { role: 'user', content: request.question },
    ];
    let reply: AsyncGenerator<string>;
    try {
      reply = await deps.advisor.chat(messages, controller.signal, deps.settings.locale);
    } catch (error) {
      if (controller.signal.aborted) return;
      // Before any text, a real HTTP status: 503 server unreachable, 504 no response, 502 otherwise (missing model...).
      if (error instanceof OllamaError) throw new HttpError(GATEWAY_STATUS[error.kind] ?? 502, error.message);
      throw error;
    }
    res.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.flushHeaders();
    res.on('error', () => {});
    const send = (event: AdvisorEvent) => {
      if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
    };
    send({ kind: 'context', sources: context.sources });
    try {
      for await (const text of reply) send({ kind: 'delta', text });
      send({ kind: 'done' });
    } catch (error) {
      if (!controller.signal.aborted) send({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    if (!res.destroyed) res.end();
  });

  api.post('/shutdown', requireAction('shutdown', deps.settings), (_req, res) => {
    const { onShutdown } = deps;
    if (!onShutdown) throw new HttpError(404, t(deps.settings.locale, 'errors.shutdownUnavailable'));
    res.on('finish', onShutdown);
    res.json({ ok: true });
  });

  api.use((_req: Request, res: Response) => {
    res.status(404).json({ error: t(deps.settings.locale, 'errors.routeNotFound') } satisfies ApiError);
  });

  api.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: error instanceof Error ? error.message : String(error) } satisfies ApiError);
  });

  app.use('/api', api);
  return app;
}

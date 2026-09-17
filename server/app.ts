import express, { type NextFunction, type Request, type Response } from 'express';
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
  /** Appelé une fois la réponse de POST /api/shutdown envoyée. */
  onShutdown?: () => void;
}

function readQuery(req: Request): { profile: string; slot: number | null } {
  const { profile, slot } = req.query;
  const selected = typeof profile === 'string' && profile !== '' ? profile : 'me';
  if (slot === undefined || slot === '') return { profile: selected, slot: null };
  const value = typeof slot === 'string' && /^\d+$/.test(slot) ? Number(slot) : Number.NaN;
  if (!(value >= 1 && value <= 3)) throw new HttpError(400, 'Paramètre slot invalide (1 à 3)');
  return { profile: selected, slot: value };
}

/**
 * Exige l'en-tête d'action d'une requête POST, avant toute lecture du corps : un site tiers ne peut pas
 * l'envoyer sans requête CORS préalable, jamais autorisée ici ; le contrôle d'hôte bloque le rebinding DNS.
 */
function requireAction(action: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    next(req.get('X-IAM-Action') === action ? undefined : new HttpError(403, `En-tête X-IAM-Action: ${action} requis`));
  };
}

const GATEWAY_STATUS: Partial<Record<OllamaErrorKind, number>> = { unreachable: 503, timeout: 504 };

const parseJson = express.json({ limit: '256kb' });

/** Corps JSON, avec des erreurs en français (400 illisible, 413 trop gros). */
function jsonBody(req: Request, res: Response, next: NextFunction): void {
  parseJson(req, res, (error?: unknown) => {
    if (!error) return next();
    const tooLarge = (error as { status?: unknown }).status === 413;
    next(new HttpError(tooLarge ? 413 : 400, tooLarge ? 'Requête trop volumineuse' : 'Corps JSON illisible'));
  });
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Contrôle du DNS rebinding : après un rebinding, une page tierce devient same-origin avec
  // 127.0.0.1 et pourrait lire /api/progress ou appeler /api/shutdown. Placé avant toute route,
  // ce middleware couvre aussi les middlewares statiques et Vite ajoutés ensuite par server/index.ts.
  app.use((req, res, next) => {
    if (req.hostname === '127.0.0.1' || req.hostname === 'localhost') return next();
    res.status(403).json({ error: 'Hôte non autorisé' } satisfies ApiError);
  });

  const api = express.Router();

  api.get('/ping', (_req, res) => {
    res.json({ app: APP_NAME });
  });

  api.get('/status', async (_req, res) => {
    let sources: StatusResponse['sources'] = null;
    try {
      sources = (await deps.progress.get('me', null)).summary.sources;
    } catch {
      sources = null;
    }
    res.json({ app: APP_NAME, sources, wiki: await deps.kb.status() } satisfies StatusResponse);
  });

  api.get('/settings', (_req, res) => {
    res.json(deps.settings);
  });

  api.get('/progress', async (req, res) => {
    const { profile, slot } = readQuery(req);
    res.json((await deps.progress.get(profile, slot)).summary);
  });

  api.get('/achievements', async (req, res) => {
    const { profile, slot } = readQuery(req);
    const [progress, kb] = await Promise.all([deps.progress.get(profile, slot), deps.kb.get()]);
    res.json(enrichAchievements(progress.achievements, kb));
  });

  api.get('/achievement/:id', async (req, res) => {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : 0;
    if (id <= 0) throw new HttpError(400, 'Identifiant de succès invalide');
    const { profile, slot } = readQuery(req);
    const [progress, kb, status] = await Promise.all([deps.progress.get(profile, slot), deps.kb.get(), deps.kb.status()]);
    const achievement = progress.achievements.find((a) => a.id === id);
    if (!achievement) throw new HttpError(404, `Succès #${id} inconnu`);
    const [entry] = enrichAchievements([achievement], kb);
    const plan = kb ? cardPlan(kb, buildPlan({ kb, ...progress }), progress.achievements, id) : null;
    res.json({ achievement: entry, wiki: kb ? buildAchievementWiki(kb, id) : null, kb: status, plan } satisfies AchievementCard);
  });

  api.get('/routes', async (req, res) => {
    const { profile, slot } = readQuery(req);
    const [progress, kb, status] = await Promise.all([deps.progress.get(profile, slot), deps.kb.get(), deps.kb.status()]);
    res.json({ kb: status, plan: kb ? buildPlan({ kb, ...progress }) : null } satisfies RoutesResponse);
  });

  api.get('/profile/resolve', async (req, res) => {
    const input = typeof req.query.input === 'string' ? req.query.input : '';
    try {
      res.json(await deps.profiles.resolve(input));
    } catch (error) {
      throw error instanceof ProfileError ? profileErrorToHttp(error) : error;
    }
  });

  api.get('/icons/:file', async (req, res) => {
    const bytes = await deps.icons.get(req.params.file);
    res.set('Cache-Control', 'public, max-age=604800, immutable').type('image/jpeg').send(Buffer.from(bytes));
  });

  api.get('/wiki/status', async (_req, res) => {
    res.json(await deps.kb.status());
  });

  api.post('/wiki/sync', requireAction('wiki-sync'), async (_req, res) => {
    if (deps.kb.isRunning()) throw new HttpError(409, 'Une synchro du wiki est déjà en cours');
    res.status(200).setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.flushHeaders();
    // La synchro continue si le navigateur se déconnecte : on cesse seulement d'écrire.
    res.on('error', () => {});
    const send = (event: WikiSyncEvent) => {
      if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
    };
    try {
      await deps.kb.sync(send);
    } catch {
      // L'événement « error » a déjà été envoyé dans le flux.
    }
    if (!res.destroyed) res.end();
  });

  api.get('/advisor/status', async (_req, res) => {
    res.json(await deps.advisor.status());
  });

  api.post('/advisor/settings', requireAction('advisor-settings'), jsonBody, async (req, res) => {
    res.json(await deps.advisor.configure(parseOllamaSettings(req.body)));
  });

  api.post('/advisor', requireAction('advisor'), jsonBody, async (req, res) => {
    const request = parseAdvisorRequest(req.body);
    const [progress, kb] = await Promise.all([deps.progress.get(request.profile, request.slot), deps.kb.get()]);
    const plan = kb ? buildPlan({ kb, ...progress }) : null;
    const context = buildAdvisorContext({ question: request.question, progress, kb, plan });
    const controller = new AbortController();
    // Navigateur parti (bouton Arrêter, onglet fermé) : on coupe aussi la génération sur Ollama.
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    const messages: OllamaMessage[] = [
      { role: 'system', content: context.system },
      ...request.history,
      { role: 'user', content: request.question },
    ];
    let reply: AsyncGenerator<string>;
    try {
      reply = await deps.advisor.chat(messages, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      // Avant tout texte, un vrai statut HTTP : 503 serveur injoignable, 504 aucune réponse, 502 sinon (modèle absent...).
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

  api.post('/shutdown', requireAction('shutdown'), (_req, res) => {
    const { onShutdown } = deps;
    if (!onShutdown) throw new HttpError(404, 'Arrêt indisponible');
    res.on('finish', onShutdown);
    res.json({ ok: true });
  });

  api.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route API inconnue' } satisfies ApiError);
  });

  api.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: error instanceof Error ? error.message : String(error) } satisfies ApiError);
  });

  app.use('/api', api);
  return app;
}

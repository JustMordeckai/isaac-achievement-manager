import express, { type NextFunction, type Request, type Response } from 'express';
import type { ApiError, StatusResponse } from '../shared/types.ts';
import { HttpError } from './http-error.ts';
import type { IconCache } from './icons.ts';
import { profileErrorToHttp, type ProgressService } from './progress-service.ts';
import { ProfileError, type ProfileClient } from './sources/steam-profile.ts';

export const APP_NAME = 'isaac-achievement-manager';

export interface AppDeps {
  progress: ProgressService;
  profiles: ProfileClient;
  icons: IconCache;
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

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  const api = express.Router();

  api.get('/status', async (_req, res) => {
    let sources: StatusResponse['sources'] = null;
    try {
      sources = (await deps.progress.get('me', null)).summary.sources;
    } catch {
      sources = null;
    }
    res.json({ app: APP_NAME, sources } satisfies StatusResponse);
  });

  api.get('/progress', async (req, res) => {
    const { profile, slot } = readQuery(req);
    res.json((await deps.progress.get(profile, slot)).summary);
  });

  api.get('/achievements', async (req, res) => {
    const { profile, slot } = readQuery(req);
    res.json((await deps.progress.get(profile, slot)).achievements);
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

  api.post('/shutdown', (req, res) => {
    // En-tête personnalisé : un site tiers ne peut pas l'envoyer sans requête CORS préalable, jamais autorisée ici.
    if (req.get('X-IAM-Action') !== 'shutdown') throw new HttpError(403, 'En-tête X-IAM-Action: shutdown requis');
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

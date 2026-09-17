import path from 'node:path';
import type { AchievementDef } from '../../shared/types.ts';
import { createKbService, type KbService } from '../kb-service.ts';
import { createWikiClient } from './client.ts';
import { buildKnowledgeBase } from './sync.ts';

export interface WikiKbOptions {
  dataDir: string;
  /** Lu à chaque synchro : le schéma Steam peut apparaître après le démarrage. */
  steamDefs: () => Promise<AchievementDef[] | null>;
}

/** Base wiki du dossier de données : data/kb.json et le cache data/wiki-cache/. */
export function createWikiKb({ dataDir, steamDefs }: WikiKbOptions): KbService {
  const client = createWikiClient({ cacheDir: path.join(dataDir, 'wiki-cache') });
  return createKbService({
    file: path.join(dataDir, 'kb.json'),
    build: async (onEvent) => buildKnowledgeBase({ client, steamDefs: await steamDefs(), onEvent }),
  });
}

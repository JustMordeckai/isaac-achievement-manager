import path from 'node:path';
import type { AchievementDef } from '../../shared/types.ts';
import { createKbService, type KbService } from '../kb-service.ts';
import { createWikiClient } from './client.ts';
import { buildKnowledgeBase } from './sync.ts';

export interface WikiKbOptions {
  dataDir: string;
  /** Read at each sync: the Steam schema can appear after startup. */
  steamDefs: () => Promise<AchievementDef[] | null>;
}

/** Wiki database of the data directory: data/kb.json and the data/wiki-cache/ cache. */
export function createWikiKb({ dataDir, steamDefs }: WikiKbOptions): KbService {
  const client = createWikiClient({ cacheDir: path.join(dataDir, 'wiki-cache') });
  return createKbService({
    file: path.join(dataDir, 'kb.json'),
    build: async (onEvent, locale) => buildKnowledgeBase({ client, steamDefs: await steamDefs(), onEvent, locale }),
  });
}

import { parseSchema } from '../../../server/sources/steam-cache.ts';
import type { KnowledgeBase } from '../../../server/wiki/kb-types.ts';
import { buildKnowledgeBase } from '../../../server/wiki/sync.ts';
import { fakeWikiClient } from './fake-wiki.ts';
import { fixture } from './fixtures.ts';

let cached: Promise<KnowledgeBase> | null = null;

/** Wiki base built once from the fixtures (641 achievements). */
export function testKnowledgeBase(): Promise<KnowledgeBase> {
  cached ??= buildKnowledgeBase({
    client: fakeWikiClient(),
    steamDefs: parseSchema(fixture('UserGameStatsSchema_250900.bin')).map((entry) => entry.def),
    now: () => new Date('2026-09-17T08:00:00Z'),
  });
  return cached;
}

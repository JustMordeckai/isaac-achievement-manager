import type { FetchPagesResult, WikiClient } from '../../../server/wiki/client.ts';
import { linkedPages, samplePages, wikiText } from './wiki.ts';

/**
 * Fake wiki client built on the fixtures: the full pages of the sample, the core pages
 * (Achievements, Achievement Tips, Template:Nav challenge), and for the other linked titles a
 * minimal page reduced to its infobox, from the linked-pages.json index.
 */
export function fakeWikiClient(
  options: { achievements?: string | null; failed?: string[] } = {},
): WikiClient & { calls: string[][] } {
  const sample = samplePages();
  const index = linkedPages();
  const core: Record<string, string | null> = {
    Achievements: options.achievements === undefined ? wikiText('Achievements.wiki') : options.achievements,
    'Achievement Tips': wikiText('Achievement_Tips.wiki'),
    'Template:Nav challenge': wikiText('Template_Nav_challenge.wiki'),
  };
  const byTitle = new Map(Object.values(index).map((entry) => [entry.title, entry]));
  const failed = new Set(options.failed ?? []);
  const calls: string[][] = [];

  return {
    calls,
    async fetchPages(titles, onBatch) {
      calls.push(titles);
      const result: FetchPagesResult = { resolved: new Map(), pages: new Map(), fromCache: [], failed: [] };
      for (const requested of titles) {
        if (failed.has(requested)) {
          result.failed.push(requested);
          continue;
        }
        const entry = index[requested];
        const target = entry ? { title: entry.title, fragment: entry.fragment } : { title: requested, fragment: null };
        result.resolved.set(requested, target);
        const known = byTitle.get(target.title);
        const synthetic = known && !known.missing ? `${known.infobox ? `{{infobox ${known.infobox}\n}}\n` : ''}Page ${known.title}.` : null;
        const text = target.title in core ? core[target.title] : (sample[target.title] ?? synthetic);
        result.pages.set(target.title, text);
      }
      const batches = Math.max(1, Math.ceil(titles.length / 50));
      for (let done = 1; done <= batches; done++) onBatch?.(done, batches);
      return result;
    },
  };
}

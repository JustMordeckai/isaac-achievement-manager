import type { FetchPagesResult, WikiClient } from '../../../server/wiki/client.ts';
import { linkedPages, samplePages, wikiText } from './wiki.ts';

/**
 * Faux client wiki construit sur les fixtures : pages complètes de l'échantillon, pages de base
 * (Achievements, Achievement Tips, Template:Nav challenge), et pour les autres titres liés une page
 * minimale réduite à son infobox, d'après l'index linked-pages.json.
 */
export function fakeWikiClient(
  options: { achievements?: string | null } = {},
): WikiClient & { calls: string[][] } {
  const sample = samplePages();
  const index = linkedPages();
  const core: Record<string, string | null> = {
    Achievements: options.achievements === undefined ? wikiText('Achievements.wiki') : options.achievements,
    'Achievement Tips': wikiText('Achievement_Tips.wiki'),
    'Template:Nav challenge': wikiText('Template_Nav_challenge.wiki'),
  };
  const byTitle = new Map(Object.values(index).map((entry) => [entry.title, entry]));
  const calls: string[][] = [];

  return {
    calls,
    async fetchPages(titles, onBatch) {
      calls.push(titles);
      const result: FetchPagesResult = { resolved: new Map(), pages: new Map(), fromCache: [], failed: [] };
      for (const requested of titles) {
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

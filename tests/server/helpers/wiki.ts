import type { LinkedPageInfo } from '../../../server/planner/classify.ts';
import { fixtureText } from './fixtures.ts';

/** Wikitext of a page saved in tests/fixtures/wiki (for instance "Achievements.wiki"). */
export function wikiText(name: string): string {
  return fixtureText(`wiki/${name}`);
}

/** Sample of real pages, title to wikitext. */
export function samplePages(): Record<string, string> {
  return JSON.parse(fixtureText('wiki/pages-sample.json')) as Record<string, string>;
}

/** Index of the 550 pages linked from the entries (asked title to resolved page and infobox type). */
export function linkedPages(): Record<string, LinkedPageInfo> {
  return JSON.parse(fixtureText('wiki/linked-pages.json')) as Record<string, LinkedPageInfo>;
}

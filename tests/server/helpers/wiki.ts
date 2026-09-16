import { fixtureText } from './fixtures.ts';

/** Wikitext d'une page enregistrée dans tests/fixtures/wiki (ex. "Achievements.wiki"). */
export function wikiText(name: string): string {
  return fixtureText(`wiki/${name}`);
}

/** Échantillon de pages réelles, titre vers wikitext. */
export function samplePages(): Record<string, string> {
  return JSON.parse(fixtureText('wiki/pages-sample.json')) as Record<string, string>;
}

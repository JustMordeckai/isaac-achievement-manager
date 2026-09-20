import { characterById } from '../../shared/characters.ts';
import { endingById, endingByName } from '../../shared/endings.ts';
import type { AchievementEntry, AchievementState, AchievementWiki, TipSource } from '../../shared/types.ts';
import type { KnowledgeBase } from './kb-types.ts';

const WIKI_BASE = 'https://bindingofisaacrebirth.fandom.com/wiki/';

/** URL of a wiki page (spaces as underscores, special characters encoded). */
export function wikiUrl(title: string, fragment: string | null = null): string {
  const page = encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':');
  return fragment ? `${WIKI_BASE}${page}#${encodeURIComponent(fragment.replace(/ /g, '_'))}` : `${WIKI_BASE}${page}`;
}

/** Adds the kind of condition and the character of the wiki base to every achievement of the list. */
export function enrichAchievements(list: AchievementState[], kb: KnowledgeBase | null): AchievementEntry[] {
  const byId = new Map(kb?.achievements.map((a) => [a.id, a]));
  return list.map((achievement) => {
    const entry = byId.get(achievement.id);
    return { ...achievement, how: entry?.how.kind ?? null, character: entry?.character ?? null };
  });
}

/** Pages whose tips complete the card, in the order they are shown (the linked page aside). */
function relatedPages(kb: KnowledgeBase, id: number): string[] {
  const entry = kb.achievements.find((a) => a.id === id);
  if (!entry) return [];
  const how = entry.how;
  switch (how.kind) {
    case 'mark':
      return [endingById(how.ending).page, characterById(how.character).page];
    case 'multi-mark':
      return [...how.endings.map((ending) => endingById(ending).page), characterById(how.character).page];
    case 'hard-all':
      return [characterById(how.character).page];
    case 'closet':
      return ['Home', characterById(how.character).page];
    case 'challenge': {
      const challenge = kb.challenges.find((c) => c.number === how.number);
      return challenge ? [challenge.title] : [];
    }
    case 'boss':
      return how.bosses.flatMap((boss) => {
        const ending = endingByName(boss);
        return ending ? [ending.page] : [];
      });
    default:
      return [];
  }
}

export function buildAchievementWiki(kb: KnowledgeBase, id: number): AchievementWiki | null {
  const entry = kb.achievements.find((a) => a.id === id);
  if (!entry || !entry.inWiki) return null;

  const tips: TipSource[] = [];
  const seen = new Set<string>();
  for (const title of [entry.page, ...relatedPages(kb, id)]) {
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const page = kb.pages[title];
    if (page && page.sections.length > 0) tips.push({ page: title, url: wikiUrl(title), sections: page.sections });
  }
  const general = kb.tips.filter((tip) => tip.ids.includes(id)).map((tip) => tip.section);
  if (general.length > 0) tips.push({ page: 'Achievement Tips', url: wikiUrl('Achievement Tips'), sections: general });

  const linked = entry.page ? kb.pages[entry.page] : undefined;
  return {
    name: entry.name,
    condition: entry.condition,
    how: entry.how,
    unlocks: entry.unlocks,
    unlockPage: linked
      ? {
          title: linked.title,
          url: wikiUrl(linked.title, entry.fragment),
          intro: entry.excerpt ?? linked.intro,
          effect: linked.effect,
          quality: linked.quality,
        }
      : null,
    tips,
    sourceUrl: wikiUrl('Achievements'),
  };
}

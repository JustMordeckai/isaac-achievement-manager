import { characterByName, characterNames, type CharacterId } from '../../shared/characters.ts';
import { endingByName, type EndingId } from '../../shared/endings.ts';
import type { How, Unlock, UnlockKind } from '../../shared/types.ts';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CHARACTER = `(${characterNames().map(escapeRegExp).join('|')})`;

const CHALLENGE = /^Complete (?:the )?.+? \(challenge #(\d+)\)\.?$/i;
const CLOSET = new RegExp(`hidden closet in Home as ${CHARACTER}\\.?$`, 'i');
const HARD_ALL = new RegExp(
  `^Earn all .*?(?:Hard mode Completion Marks?|Completion Marks? on Hard mode) as ${CHARACTER}\\.?$`,
  'i',
);
const MARK = new RegExp(`^(?:Defeat|Complete) (.+?) as ${CHARACTER}\\.?$`, 'i');
const TIMES = /\b(\d+)\+? times\b/i;
const COUNTED_ACTION =
  /^(?:Donate|Destroy|Take|Visit|Sleep in|Open|Kill|Defeat|Blow up|Participate in|Complete|Use) (\d+)\+? /i;
const WITHIN_RUN =
  /\b(?:in (?:one|a single|a) run|at (?:one|the same) time|in a row|streak|same room|in one room|in a single|for \d+ floors|in under|without)\b/i;
const COMPOUND = /(?:\band|,) (?:unlock|defeat|destroy)\b/i;
const BOSS_EXCLUDED = /\d|\b(?:as|using|without|in under|unlock)\b/i;

function characterId(name: string): CharacterId {
  const character = characterByName(name);
  if (!character) throw new Error(`Unrecognized character: ${name}`);
  return character.id;
}

/** Splits a list of names on commas, "and", "or" and "/". */
function splitList(list: string): string[] {
  return list
    .split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+|\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function endingsOf(list: string): EndingId[] | null {
  const parts = splitList(list);
  const ids: EndingId[] = [];
  for (const part of parts) {
    const ending = endingByName(part);
    if (!ending) return null;
    if (!ids.includes(ending.id)) ids.push(ending.id);
  }
  return ids.length > 0 ? ids : null;
}

/** Sorts a cleaned condition (first line) by the way the achievement is earned. */
export function classifyHow(condition: string): How {
  const text = condition.split('\n')[0].trim();

  const challenge = CHALLENGE.exec(text);
  if (challenge) return { kind: 'challenge', number: Number(challenge[1]) };

  const closet = CLOSET.exec(text);
  if (closet) return { kind: 'closet', character: characterId(closet[1]) };

  const hardAll = HARD_ALL.exec(text);
  if (hardAll) return { kind: 'hard-all', character: characterId(hardAll[1]) };

  const mark = MARK.exec(text);
  if (mark) {
    const hard = / on hard mode$/i.test(mark[1]);
    const endings = endingsOf(mark[1].replace(/ on hard mode$/i, ''));
    if (endings) {
      const character = characterId(mark[2]);
      return endings.length === 1
        ? { kind: 'mark', character, ending: endings[0], hard }
        : { kind: 'multi-mark', character, endings, hard };
    }
  }

  if (!WITHIN_RUN.test(text) && !COMPOUND.test(text)) {
    const counted = TIMES.exec(text) ?? COUNTED_ACTION.exec(text);
    if (counted) return { kind: 'counter', total: Number(counted[1]) };
  }

  const boss = /^Defeat (.+)$/i.exec(text);
  if (boss && !BOSS_EXCLUDED.test(boss[1])) {
    const bosses = splitList(boss[1]);
    return { kind: 'boss', bosses };
  }

  return { kind: 'misc' };
}

/** Page linked from an achievement, as the sync resolved it. */
export interface LinkedPageInfo {
  /** Title of the page after the redirect. */
  title: string;
  fragment: string | null;
  missing: boolean;
  /** Normalized infobox type ("passive collectible", "trinket"...), null with no infobox. */
  infobox: string | null;
}

const INFOBOX_KINDS: Record<string, UnlockKind> = {
  'passive collectible': 'item',
  'activated collectible': 'item',
  trinket: 'trinket',
  pickup: 'card',
  character: 'character',
  characters: 'character',
  challenge: 'challenge',
  stage: 'floor',
};

const PAGE_KINDS: Record<string, UnlockKind> = { Pills: 'pill', 'Cards and Runes': 'card', 'Co-op': 'baby' };

function kindFromDescription(description: string): UnlockKind | null {
  if (/co-player baby/i.test(description)) return 'baby';
  if (/^Unlocked a new character/i.test(description)) return 'character';
  if (/^Unlocked (?:Challenge #\d+|a new challenge)/i.test(description)) return 'challenge';
  if (/^Unlocked a new starting item/i.test(description)) return 'starting-item';
  if (/^Alt stage|^Unlocked a new area|^Unlocked a hidden chapter|^Chapter \d+ .* unlocked/i.test(description)) {
    return 'floor';
  }
  if (/New mode unlocked|just got harder/i.test(description)) return 'mode';
  return null;
}

/** Usable page: present and other than the Achievements page (where achievements with no page redirect). */
export function isUsablePage(linked: LinkedPageInfo | null): linked is LinkedPageInfo {
  return linked !== null && !linked.missing && linked.title !== 'Achievements';
}

/** Infers what an achievement unlocks from its wiki description and the type of its linked page. */
export function classifyUnlock(displayName: string, description: string, linked: LinkedPageInfo | null): Unlock {
  const page = isUsablePage(linked) ? linked : null;
  const kind =
    kindFromDescription(description) ??
    (page && page.infobox ? INFOBOX_KINDS[page.infobox] : undefined) ??
    (page ? PAGE_KINDS[page.title] : undefined) ??
    'other';
  let name = displayName;
  if (page && ['item', 'trinket', 'card', 'pill', 'character', 'challenge', 'floor'].includes(kind)) {
    name = page.fragment ?? page.title.replace(/\s*\([^)]*\)$/, '');
  }
  return { kind, name };
}

/** Character an achievement is about, when there is one. */
export function characterOf(how: How): CharacterId | null {
  return 'character' in how ? how.character : null;
}

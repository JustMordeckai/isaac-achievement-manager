import type { TextBlock, TipSection } from '../../shared/types.ts';
import type { WikiAchievementRow } from './parse-achievements.ts';
import {
  cleanInline,
  findTemplates,
  normalizeTemplateName,
  sectionEnd,
  splitSections,
  templateParams,
  toBlocks,
  type RawSection,
  type TemplateCounter,
} from './wikitext.ts';

/** Past that, a section is cut short and the card points to the wiki. */
export const MAX_SECTION_CHARS = 5000;
const MAX_INTRO_BLOCKS = 3;

/** Useful content of a wiki page, stored in kb.json. */
export interface KbPage {
  title: string;
  /** Normalized infobox type ("passive collectible", "character"...), null with no infobox. */
  infobox: string | null;
  /** Effect in one line (description field of items, trinkets and cards). */
  effect: string | null;
  quality: string | null;
  intro: TextBlock[];
  /** Tip sections that are kept (Strategy, Tips, Difficulty...). */
  sections: TipSection[];
}

const TIP_TITLES = /^(?:general\s+)?(?:strateg(?:y|ies)|tips?)$|^difficulty$|^unlock(?:ing\b.*)?$|^hidden closet$/i;
const CHALLENGE_ONLY_TITLES = /^notes$/i;
const HATNOTE = /^(?:not to be confused|for .+, see\b|see also\b)/i;

export function pageInfobox(wikitext: string): { type: string | null; params: Record<string, string> } {
  const opening = /\{\{\s*(infobox[ _][^|}\n]+)/i.exec(wikitext);
  if (!opening) return { type: null, params: {} };
  const match = findTemplates(wikitext, opening[1])[0];
  if (!match) return { type: null, params: {} };
  return { type: normalizeTemplateName(opening[1]).replace(/^infobox /, ''), params: templateParams(match.raw).params };
}

/** Builds a tip section from a section and its subsections. */
export function buildSection(group: RawSection[], unknown?: TemplateCounter): TipSection {
  const [head, ...children] = group;
  const blocks: TextBlock[] = [...toBlocks(head.body, unknown)];
  let skipBelow: number | null = null;
  for (const child of children) {
    if (skipBelow !== null && child.level > skipBelow) continue;
    skipBelow = null;
    if (child.obsolete) {
      skipBelow = child.level;
      continue;
    }
    const body = toBlocks(child.body, unknown);
    if (body.length === 0) continue;
    blocks.push({ kind: 'heading', level: child.level - head.level, text: child.title }, ...body);
  }
  const kept: TextBlock[] = [];
  let length = 0;
  let truncated = false;
  for (const block of blocks) {
    if (length + block.text.length > MAX_SECTION_CHARS && kept.length > 0) {
      truncated = true;
      break;
    }
    kept.push(block);
    length += block.text.length;
  }
  return { title: head.title, blocks: kept, truncated };
}

function intro(lead: string, unknown?: TemplateCounter): TextBlock[] {
  const blocks = toBlocks(lead, unknown).filter((block) => !(block.kind === 'paragraph' && HATNOTE.test(block.text)));
  return blocks.slice(0, MAX_INTRO_BLOCKS);
}

/** Cleaned infobox field; variants on several lines are joined by `separator`. */
function fieldText(value: string | undefined, unknown?: TemplateCounter, separator = ' '): string | null {
  if (!value) return null;
  const text = cleanInline(value, unknown).text.replace(/\n+/g, separator).trim();
  return text || null;
}

export function parsePage(title: string, wikitext: string, unknown?: TemplateCounter): KbPage {
  const { type, params } = pageInfobox(wikitext);
  const { lead, sections } = splitSections(wikitext);
  const kept: TipSection[] = [];
  for (let index = 0; index < sections.length; index = sectionEnd(sections, index)) {
    const section = sections[index];
    if (section.obsolete) continue;
    const wanted = TIP_TITLES.test(section.title) || (type === 'challenge' && CHALLENGE_ONLY_TITLES.test(section.title));
    if (!wanted) {
      // The subsections of a section that is skipped can hold tips, so they are looked at too.
      const end = sectionEnd(sections, index);
      if (end > index + 1) {
        for (let child = index + 1; child < end; child = sectionEnd(sections, child)) {
          if (!sections[child].obsolete && TIP_TITLES.test(sections[child].title)) {
            kept.push(buildSection(sections.slice(child, sectionEnd(sections, child)), unknown));
          }
        }
      }
      continue;
    }
    kept.push(buildSection(sections.slice(index, sectionEnd(sections, index)), unknown));
  }
  return {
    title,
    infobox: type,
    effect: fieldText(params.description, unknown),
    quality: fieldText(params.quality, unknown),
    intro: intro(lead, unknown),
    sections: kept.filter((section) => section.blocks.length > 0),
  };
}

/** Blocks of the section whose title matches the anchor (redirects to a section). */
export function sectionBlocks(wikitext: string, anchor: string, unknown?: TemplateCounter): TextBlock[] | null {
  const { sections } = splitSections(wikitext);
  const wanted = anchor.replace(/_/g, ' ').trim().toLowerCase();
  const index = sections.findIndex((section) => section.title.toLowerCase() === wanted);
  if (index < 0) return null;
  const blocks = buildSection(sections.slice(index, sectionEnd(sections, index)), unknown).blocks.slice(0, 6);
  // A section that is only a gallery says nothing: the card then falls back on the intro of the page.
  return blocks.length > 0 ? blocks : null;
}

export interface ChallengeRef {
  number: number;
  title: string;
  name: string;
}

/** Numbered list of the challenges (Template:Nav challenge). */
export function parseChallengeNav(wikitext: string): ChallengeRef[] {
  const refs: ChallengeRef[] = [];
  for (const match of wikitext.matchAll(/(\d+)\.\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    refs.push({ number: Number(match[1]), title: match[2].trim(), name: (match[3] ?? match[2]).trim() });
  }
  return refs.sort((a, b) => a.number - b.number);
}

export interface KbChallenge {
  number: number;
  /** Title of the challenge page. */
  title: string;
  name: string;
  character: string;
  goal: string;
  blindfolded: boolean;
  startingItems: string[];
  curse: string | null;
  /** What the challenge unlocks (unlocks field). */
  reward: string | null;
  /** Wiki name of the achievement that unlocks the challenge, null when it is available from the start. */
  unlockedBy: string | null;
}

export function parseChallenge(ref: ChallengeRef, wikitext: string, unknown?: TemplateCounter): KbChallenge {
  const { params } = pageInfobox(wikitext);
  const lines = (value: string | undefined) =>
    value
      ? cleanInline(value, unknown)
          .text.split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  return {
    number: ref.number,
    title: ref.title,
    name: ref.name,
    // Default values of the Infobox challenge template: Isaac, and Mom as the goal.
    character: fieldText(params.character, unknown) ?? 'Isaac',
    goal: fieldText(params['special goal'], unknown) ?? fieldText(params.goal, unknown) ?? 'Mom',
    blindfolded: /^\s*yes\s*$/i.test(params.blindfolded ?? ''),
    startingItems: [...lines(params.item), ...lines(params.trinket), ...lines(params.pickup)],
    curse: fieldText(params.curse, unknown, ', '),
    reward: fieldText(params.unlocks, unknown),
    unlockedBy: fieldText(params['unlocked by'], unknown),
  };
}

/** Section of the Achievement Tips page tied to one or more achievements. */
export interface TipAttachment {
  ids: number[];
  section: TipSection;
}

function nameIndex(rows: WikiAchievementRow[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (const row of rows) {
    for (const name of new Set([row.wikiName, row.displayName])) {
      const key = name.toLowerCase();
      index.set(key, [...(index.get(key) ?? []), row.id]);
    }
  }
  return index;
}

/**
 * Ties the level 2 sections of the Achievement Tips page to the achievements: through the
 * {{a|...}} or {{achievement|...}} templates in the body, through the names in the title, or, for
 * definition lists ("; Name : text"), one entry per achievement.
 */
export function parseAchievementTips(
  wikitext: string,
  rows: WikiAchievementRow[],
  unknown?: TemplateCounter,
): TipAttachment[] {
  const names = nameIndex(rows);
  const idsOf = (name: string) => names.get(name.trim().toLowerCase()) ?? [];
  const { sections } = splitSections(wikitext);
  const attachments: TipAttachment[] = [];
  for (let index = 0; index < sections.length; index = sectionEnd(sections, index)) {
    const head = sections[index];
    if (head.level !== 2 || head.obsolete) continue;
    const group = sections.slice(index, sectionEnd(sections, index));

    const entries = termEntries(head.body, unknown);
    if (entries.length > 0) {
      for (const entry of entries) {
        const ids = idsOf(entry.term);
        if (ids.length === 0) continue;
        attachments.push({ ids, section: { title: entry.term, blocks: toBlocks(entry.text, unknown), truncated: false } });
      }
      continue;
    }

    const ids = new Set<number>();
    for (const match of head.body.matchAll(/\{\{\s*(?:a|achievement)\s*\|([^|}]+)/gi)) {
      for (const id of idsOf(match[1])) ids.add(id);
    }
    for (const part of head.title.split(/\s*&\s*|\s+and\s+|\s*,\s*/)) {
      for (const id of idsOf(part)) ids.add(id);
    }
    if (ids.size === 0) continue;
    attachments.push({ ids: [...ids].sort((a, b) => a - b), section: buildSection(group, unknown) });
  }
  return attachments;
}

function termEntries(body: string, unknown?: TemplateCounter): Array<{ term: string; text: string }> {
  const entries: Array<{ term: string; text: string }> = [];
  let current: { term: string; lines: string[] } | null = null;
  for (const line of body.split('\n')) {
    const term = /^;\s*(.*)$/.exec(line);
    if (term) {
      if (current) entries.push({ term: current.term, text: current.lines.join('\n') });
      const cleaned = cleanInline(term[1], unknown).text;
      const colon = cleaned.indexOf(':');
      current = {
        term: (colon < 0 ? cleaned : cleaned.slice(0, colon)).trim(),
        lines: colon < 0 ? [] : [cleaned.slice(colon + 1).trim()],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) entries.push({ term: current.term, text: current.lines.join('\n') });
  return entries;
}

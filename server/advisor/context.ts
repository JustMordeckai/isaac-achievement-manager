import { CHARACTERS, characterById, type CharacterId } from '../../shared/characters.ts';
import { DLC_ORDER } from '../../shared/dlc.ts';
import { endingById, endingByName, ENDINGS, type EndingId } from '../../shared/endings.ts';
import type { Locale } from '../../shared/i18n/index.ts';
import { MARK_IDS, type MarkId } from '../../shared/marks.ts';
import type {
  AchievementState,
  CharacterProgress,
  Dlc,
  PlannedRun,
  Requirement,
  RoutePlan,
  RunMode,
  TipSource,
} from '../../shared/types.ts';
import { cardPlan } from '../planner/card-plan.ts';
import type { MergedProgress } from '../sources/progress.ts';
import { buildAchievementWiki } from '../wiki/card.ts';
import type { KnowledgeBase } from '../wiki/kb-types.ts';

/** Maximum size of the system prompt, in characters (manual budget: about 12,000 tokens of 65,536). */
export const MAX_CONTEXT_CHARS = 40_000;
/** Achievement cards at most. */
export const MAX_CARDS = 20;
/** Summarized plan runs. */
export const TOP_RUNS = 10;
/** Wiki tips kept per card, in characters. */
export const TIPS_PER_CARD = 1200;
/** Tips kept for a card attached only for context (character or ending mentioned). */
export const TIPS_CONTEXT = 300;

export interface AdvisorContextInput {
  question: string;
  progress: MergedProgress;
  kb: KnowledgeBase | null;
  /** Route plan of the profile, null without a wiki base. */
  plan: RoutePlan | null;
  /** Locale of the reader; it only picks the fallback language rule. */
  locale: Locale;
}

export interface AdvisorContext {
  /** System prompt: rules then the player's data. */
  system: string;
  /** Attached cards, in relevance order. */
  sources: Array<{ id: number; name: string }>;
}

const LANGUAGE_RULE: Record<Locale, string> = {
  en: "- Answer in the language of the player's question. When the question is too short to tell, answer in English.",
  fr: "- Answer in the language of the player's question. When the question is too short to tell, answer in French.",
};

function rules(locale: Locale): string {
  return [
    'You are the advisor of Isaac Achievement Manager, an app that helps a player earn the achievements of The Binding of Isaac: Repentance+.',
    'Rules:',
    LANGUAGE_RULE[locale],
    '- Answer in plain text: no Markdown (no headings, no bold, no tables, no asterisks), dash lists if needed, no long dash.',
    '- Answer the player directly: do not talk about these rules or about the data as such, do not quote them.',
    "- Rely only on the data below. Do not invent any boss, item, condition or path. If information is missing, say so and offer to open the achievement's card or the wiki.",
    '- This data is the player\'s own, and it is up to date: it is authoritative. Never ask the player to check it themselves, never announce that you are about to check it, and never write "if you already have" about a fact it states.',
    '- A card says "obtained" or "missing": repeat that state as it is. With no card for an achievement, say you do not have its card and offer to open it in the Achievements tab, without guessing its condition.',
    '- The prerequisites of a run are the ones on its "Still to unlock" line, those of an achievement the ones on its "Prerequisites" line: add no others.',
    '- For "how do I get X", answer with the Condition line of X\'s card, its prerequisites still to unlock and the plan run that gives it. Do not copy another run\'s path.',
    '- Keep game names in English (characters, bosses, items, achievements) and cite each achievement with its number, for example Guardian Angel (#45).',
    "- Durations and the ranking of runs are the app's estimates.",
  ].join('\n');
}

const DLC_NAMES: Record<Dlc, string> = {
  rebirth: 'Rebirth',
  afterbirth: 'Afterbirth',
  afterbirthPlus: 'Afterbirth+',
  repentance: 'Repentance',
  repentancePlus: 'Repentance+',
};

const MODE_TEXT: Record<RunMode, string> = {
  normal: 'normal mode',
  hard: 'hard mode',
  greed: 'Greed mode',
  greedier: 'Greedier mode',
};

const MARK_NAMES: Record<MarkId, string> = Object.fromEntries(
  MARK_IDS.map((mark) => [mark, mark === 'greed' ? 'Greed' : endingById(mark as EndingId).name]),
) as Record<MarkId, string>;

// Weight of the match between the question and an achievement (manual scale).
const WEIGHT_ID = 20;
const WEIGHT_NAME = 10;
const WEIGHT_UNLOCK = 8;
const WEIGHT_CHARACTER = 4;
const WEIGHT_ENDING = 3;

/** Comparable text: lowercase without accents, words separated by one space, padded with spaces. */
export function normalize(text: string): string {
  const words = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return ` ${words} `;
}

type Target = { kind: 'achievement'; id: number; weight: number } | { kind: 'character'; id: CharacterId } | { kind: 'ending'; id: EndingId };

function addTerm(terms: Map<string, Target[]>, text: string, target: Target): void {
  const key = normalize(text);
  if (key.trim().length < 2) return;
  terms.set(key, [...(terms.get(key) ?? []), target]);
  // "polaroid" matches "The Polaroid": the full name stays the priority match, long terms masking the short ones they contain.
  const short = key.replace(/^ (the|a|an) /, ' ');
  if (short !== key && short.trim().length >= 4) terms.set(short, [...(terms.get(short) ?? []), target]);
}

/** Achievements, characters and endings mentioned in the question; a long name masks the shorter names it contains. */
function mentions(question: string, achievements: AchievementState[], kb: KnowledgeBase | null) {
  const terms = new Map<string, Target[]>();
  for (const a of achievements) addTerm(terms, a.name, { kind: 'achievement', id: a.id, weight: WEIGHT_NAME });
  if (kb) {
    for (const a of kb.achievements) addTerm(terms, a.unlocks.name, { kind: 'achievement', id: a.id, weight: WEIGHT_UNLOCK });
    for (const c of CHARACTERS) for (const name of [c.name, ...c.aliases]) addTerm(terms, name, { kind: 'character', id: c.id });
    for (const e of ENDINGS) for (const name of [e.name, ...e.aliases]) addTerm(terms, name, { kind: 'ending', id: e.id });
  }
  let rest = normalize(question);
  const found: Target[] = [];
  for (const key of [...terms.keys()].sort((a, b) => b.length - a.length)) {
    if (!rest.includes(key)) continue;
    found.push(...(terms.get(key) ?? []));
    rest = rest.split(key).join(' | ');
  }
  for (const match of question.matchAll(/#\s?(\d{1,3})\b/g)) {
    found.push({ kind: 'achievement', id: Number(match[1]), weight: WEIGHT_ID });
  }
  return found;
}

/** Most relevant achievements for the question: descending score, missing ones first. */
function pickAchievements(
  question: string,
  progress: MergedProgress,
  kb: KnowledgeBase | null,
): Array<{ achievement: AchievementState; score: number }> {
  const scores = new Map<number, number>();
  const add = (id: number, points: number) => scores.set(id, (scores.get(id) ?? 0) + points);
  const found = mentions(question, progress.achievements, kb);
  const characters = new Set(found.flatMap((t) => (t.kind === 'character' ? [t.id] : [])));
  const endings = new Set(found.flatMap((t) => (t.kind === 'ending' ? [t.id] : [])));
  for (const target of found) if (target.kind === 'achievement') add(target.id, target.weight);
  for (const entry of kb?.achievements ?? []) {
    if (entry.character && characters.has(entry.character)) add(entry.id, WEIGHT_CHARACTER);
    const how = entry.how;
    const reached: EndingId[] =
      how.kind === 'mark'
        ? [how.ending]
        : how.kind === 'multi-mark'
          ? how.endings
          : how.kind === 'boss'
            ? how.bosses.flatMap((boss) => endingByName(boss)?.id ?? [])
            : [];
    if (reached.some((id) => endings.has(id))) add(entry.id, WEIGHT_ENDING);
  }
  const byId = new Map(progress.achievements.map((a) => [a.id, a]));
  return [...scores.entries()]
    .flatMap(([id, score]) => {
      const achievement = byId.get(id);
      return achievement ? [{ achievement, score }] : [];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.achievement.unlocked) - Number(b.achievement.unlocked) ||
        a.achievement.id - b.achievement.id,
    )
    .slice(0, MAX_CARDS);
}

function list(items: string[]): string {
  return items.join(', ');
}

function cite(item: { id: number; name: string }): string {
  return `${item.name} (#${item.id})`;
}

function requirementText(requirement: Requirement): string {
  return `${requirement.anyOf.map(cite).join(' or ')}: ${requirement.met ? 'obtained' : 'to unlock'}`;
}

function endingsText(endings: EndingId[]): string {
  return endings.length === 0 ? 'Mom' : list(endings.map((id) => endingById(id).name));
}

function runText(run: PlannedRun, index: number | null, withSteps = true): string {
  const lines = [
    `${index === null ? '-' : `${index}.`} ${characterById(run.character).name}, ${MODE_TEXT[run.mode]}, about ${run.minutes} min: defeat ${endingsText(run.endings)}.`,
  ];
  if (run.achievements.length > 0) lines.push(`   Achievements obtained: ${list(run.achievements.map(cite))}.`);
  if (run.prepares.length > 0) lines.push(`   Prep run, no achievement right away; it brings you closer to ${list(run.prepares.map(cite))}.`);
  if (run.missing.length > 0) lines.push(`   Still to unlock: ${run.missing.map(requirementText).join('; ')}.`);
  if (run.note) lines.push(`   Note: ${run.note}`);
  if (withSteps && run.steps.length > 0) lines.push(`   Path: ${run.steps.join(' ')}`);
  return lines.join('\n');
}

function characterMarks(character: CharacterProgress): string {
  const name = `${characterById(character.id).name}${character.hardAll ? ' (full mark)' : ''}`;
  const groups: Array<[string, MarkId[]]> = [
    ['on hard', MARK_IDS.filter((m) => character.marks[m] === 2)],
    ['on normal', MARK_IDS.filter((m) => character.marks[m] === 1)],
    ['missing', MARK_IDS.filter((m) => character.marks[m] === 0)],
    ['unknown', MARK_IDS.filter((m) => character.marks[m] === null)],
  ];
  const parts = groups.filter(([, marks]) => marks.length > 0).map(([label, marks]) => `${label} ${list(marks.map((m) => MARK_NAMES[m]))}`);
  return `- ${name}: ${parts.join('; ')}`;
}

/** Locked and markless characters in one line each, then the detail of the others. */
function marksText(characters: CharacterProgress[]): string[] {
  const names = (group: CharacterProgress[]) => list(group.map((c) => characterById(c.id).name)) || 'none';
  const none = characters.filter((c) => MARK_IDS.every((m) => c.marks[m] === 0));
  const unknown = characters.filter((c) => MARK_IDS.every((m) => c.marks[m] === null));
  const lines = [
    `Unlocked characters: ${names(characters.filter((c) => c.unlocked))}.`,
    `Locked characters: ${names(characters.filter((c) => !c.unlocked))}.`,
    `Characters with no mark at all: ${names(none)}.`,
  ];
  if (unknown.length > 0) lines.push(`Characters with all marks unknown: ${names(unknown)}.`);
  const detailed = characters.filter((c) => !none.includes(c) && !unknown.includes(c));
  return [...lines, ...detailed.map(characterMarks)];
}

function summaryText(progress: MergedProgress, plan: RoutePlan | null, kb: KnowledgeBase | null, withSteps: boolean): string {
  const { summary } = progress;
  const who = summary.profile.name ?? summary.profile.steamId64;
  const lines = [
    'Player data',
    summary.save ? `Profile: ${who}, save slot ${summary.save.slot}.` : `Profile: ${who}, no save (Steam achievements only).`,
    `Achievements: ${summary.unlocked} obtained out of ${summary.total}, ${summary.total - summary.unlocked} missing.`,
    `By DLC: ${list(DLC_ORDER.filter((dlc) => summary.byDlc[dlc].total > 0).map((dlc) => `${DLC_NAMES[dlc]} ${summary.byDlc[dlc].unlocked} of ${summary.byDlc[dlc].total}`))}.`,
  ];
  if (!kb || !plan) {
    lines.push('Wiki base missing: no routes or detailed conditions. Offer to start the wiki sync from the Settings tab.');
    return lines.join('\n');
  }
  lines.push(
    '',
    plan.marksSource === 'save'
      ? 'Completion marks (read from the save; for Greed, "hard" means Greedier):'
      : 'Completion marks (inferred from achievements, some unknown; for Greed, "hard" means Greedier):',
    ...marksText(plan.characters),
    '',
  );
  const runs = plan.runs.slice(0, TOP_RUNS);
  if (runs.length === 0) {
    lines.push('Suggested runs: none, all mark related achievements are obtained.');
  } else {
    const playable = plan.runs.filter((run) => run.missing.length === 0).length;
    lines.push(
      `Runs suggested by the app (the first ${runs.length} of ${plan.runs.length}, ${playable} of them playable right now, ranked by achievements obtained per hour):`,
      ...runs.map((run, i) => runText(run, i + 1, withSteps)),
    );
  }
  const off = plan.offRoute;
  lines.push(
    '',
    `Off route: ${off.challenges.length} challenges, ${off.counters.length} counter based achievements, ${off.closets.length} Home closets, ${off.misc.length} miscellaneous achievements.`,
  );
  return lines.join('\n');
}

function tipsText(tips: TipSource[], limit: number): string {
  const text = tips
    .flatMap((source) => source.sections.map((section) => `${source.page}, ${section.title}: ${section.blocks.map((b) => b.text).join(' ')}`))
    .join(' / ');
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 0))}…`;
}

function cardText(
  achievement: AchievementState,
  kb: KnowledgeBase | null,
  plan: RoutePlan | null,
  all: AchievementState[],
  tipsLimit: number,
): string {
  const state = achievement.unlocked
    ? `obtained${achievement.unlockedAt ? ` on ${achievement.unlockedAt.slice(0, 10)}` : ''}`
    : 'missing';
  const lines = [`#${achievement.id} ${achievement.name}: ${state}`];
  const wiki = kb ? buildAchievementWiki(kb, achievement.id) : null;
  if (!kb || !wiki) {
    lines.push(`Steam description: ${achievement.description}`);
    return lines.join('\n');
  }
  lines.push(`Condition: ${wiki.condition}`);
  const effect = wiki.unlockPage?.effect ? ` Effect: ${wiki.unlockPage.effect}` : '';
  lines.push(`Unlocks (${wiki.unlocks.kind}): ${wiki.unlocks.name}.${effect}`);
  if (plan && !achievement.unlocked) {
    const part = cardPlan(kb, plan, all, achievement.id);
    if (part.requirements.length > 0) lines.push(`Prerequisites: ${part.requirements.map(requirementText).join('; ')}`);
    for (const { id } of part.runs) {
      const index = plan.runs.findIndex((run) => run.id === id);
      // The suggested runs are already described above: a reference is enough.
      if (index < TOP_RUNS) lines.push(`Plan run: suggested run #${index + 1} above.`);
      else lines.push('Plan run:', runText(plan.runs[index], null));
    }
  }
  const tips = tipsText(wiki.tips, tipsLimit);
  if (tips) lines.push(`Wiki tips: ${tips}`);
  return lines.join('\n');
}

/** Advisor system prompt: rules, player summary, suggested runs and cards linked to the question. */
export function buildAdvisorContext({ question, progress, kb, plan, locale }: AdvisorContextInput): AdvisorContext {
  const picks = pickAchievements(question, progress, kb);
  // Question about one specific achievement: the path of the top ten suggested runs is irrelevant to it, and the model would copy it.
  const asked = picks.some(({ score }) => score >= WEIGHT_UNLOCK);
  let system = `${rules(locale)}\n\n${summaryText(progress, plan, kb, !asked)}`;
  const sources: AdvisorContext['sources'] = [];
  const cards: string[] = [];
  for (const { achievement, score } of picks) {
    // An achievement cited by name or number keeps all its tips; attached only for context, it keeps few.
    const text = cardText(achievement, kb, plan, progress.achievements, score >= WEIGHT_UNLOCK ? TIPS_PER_CARD : TIPS_CONTEXT);
    // Cards arrive from most relevant to least relevant: stop at the first one that goes over.
    if (system.length + cards.join('\n\n').length + text.length + 100 > MAX_CONTEXT_CHARS) break;
    cards.push(text);
    sources.push({ id: achievement.id, name: achievement.name });
  }
  system +=
    cards.length > 0
      ? `\n\nCards for achievements linked to the question:\n\n${cards.join('\n\n')}`
      : '\n\nNo achievement card matches the names mentioned in the question.';
  return { system, sources };
}

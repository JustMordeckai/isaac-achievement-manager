import { CHARACTERS, characterById, type CharacterId } from '../../shared/characters.ts';
import { DLC_ORDER } from '../../shared/dlc.ts';
import { endingById, endingByName, ENDINGS, type EndingId } from '../../shared/endings.ts';
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

/** Taille maximale de la consigne système, en caractères (barème manuel : environ 12 000 jetons sur 65 536). */
export const MAX_CONTEXT_CHARS = 40_000;
/** Fiches de succès au plus. */
export const MAX_CARDS = 20;
/** Runs du plan résumées. */
export const TOP_RUNS = 10;
/** Astuces du wiki gardées par fiche, en caractères. */
export const TIPS_PER_CARD = 1200;

export interface AdvisorContextInput {
  question: string;
  progress: MergedProgress;
  kb: KnowledgeBase | null;
  /** Plan de routes du profil, null sans base wiki. */
  plan: RoutePlan | null;
}

export interface AdvisorContext {
  /** Consigne système : règles puis données du joueur. */
  system: string;
  /** Fiches jointes, dans l'ordre de pertinence. */
  sources: Array<{ id: number; name: string }>;
}

const RULES = [
  "Tu es le conseiller d'Isaac Achievement Manager, une application qui aide un joueur à obtenir les succès de The Binding of Isaac: Repentance+.",
  'Règles :',
  '- Réponds en français, en texte simple : pas de Markdown (ni titres, ni gras, ni tableaux), des listes à tirets si besoin, pas de tiret long.',
  "- Appuie-toi uniquement sur les données ci-dessous. N'invente ni boss, ni objet, ni condition, ni chemin. Si une information manque, dis-le et propose d'ouvrir la fiche du succès ou le wiki.",
  '- Garde les noms du jeu en anglais (personnages, boss, objets, succès) et cite chaque succès avec son numéro, par exemple Guardian Angel (#45).',
  "- Les durées et le classement des runs sont des estimations de l'application.",
].join('\n');

const DLC_NAMES: Record<Dlc, string> = {
  rebirth: 'Rebirth',
  afterbirth: 'Afterbirth',
  afterbirthPlus: 'Afterbirth+',
  repentance: 'Repentance',
  repentancePlus: 'Repentance+',
};

const MODE_TEXT: Record<RunMode, string> = {
  normal: 'mode normal',
  hard: 'mode difficile',
  greed: 'mode Greed',
  greedier: 'mode Greedier',
};

const MARK_NAMES: Record<MarkId, string> = Object.fromEntries(
  MARK_IDS.map((mark) => [mark, mark === 'greed' ? 'Greed' : endingById(mark as EndingId).name]),
) as Record<MarkId, string>;

// Poids de la correspondance entre la question et un succès (barème manuel).
const WEIGHT_ID = 20;
const WEIGHT_NAME = 10;
const WEIGHT_UNLOCK = 8;
const WEIGHT_CHARACTER = 4;
const WEIGHT_ENDING = 3;

/** Texte comparable : minuscules sans accents, mots séparés par une espace, bordé d'espaces. */
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
}

/** Succès, personnages et fins cités dans la question ; un nom long masque les noms plus courts qu'il contient. */
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

/** Succès les plus pertinents pour la question : score décroissant, manquants d'abord. */
function pickAchievements(question: string, progress: MergedProgress, kb: KnowledgeBase | null): AchievementState[] {
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
    .slice(0, MAX_CARDS)
    .map((entry) => entry.achievement);
}

function list(items: string[]): string {
  return items.join(', ');
}

function cite(item: { id: number; name: string }): string {
  return `${item.name} (#${item.id})`;
}

function requirementText(requirement: Requirement): string {
  return `${requirement.anyOf.map(cite).join(' ou ')} : ${requirement.met ? 'obtenu' : 'à débloquer'}`;
}

function endingsText(endings: EndingId[]): string {
  return endings.length === 0 ? 'Mom' : list(endings.map((id) => endingById(id).name));
}

function runText(run: PlannedRun, index: number | null): string {
  const lines = [
    `${index === null ? '-' : `${index}.`} ${characterById(run.character).name}, ${MODE_TEXT[run.mode]}, environ ${run.minutes} min : battre ${endingsText(run.endings)}.`,
  ];
  if (run.achievements.length > 0) lines.push(`   Succès obtenus : ${list(run.achievements.map(cite))}.`);
  if (run.prepares.length > 0) lines.push(`   Run de préparation, aucun succès tout de suite ; elle rapproche de ${list(run.prepares.map(cite))}.`);
  if (run.missing.length > 0) lines.push(`   À débloquer d'abord : ${run.missing.map(requirementText).join(' ; ')}.`);
  if (run.note) lines.push(`   Rappel : ${run.note}`);
  if (run.steps.length > 0) lines.push(`   Chemin : ${run.steps.join(' ')}`);
  return lines.join('\n');
}

function characterMarks(character: CharacterProgress): string {
  const name = `${characterById(character.id).name}${character.hardAll ? ' (note complète)' : ''}`;
  const groups: Array<[string, MarkId[]]> = [
    ['en difficile', MARK_IDS.filter((m) => character.marks[m] === 2)],
    ['en normal', MARK_IDS.filter((m) => character.marks[m] === 1)],
    ['absentes', MARK_IDS.filter((m) => character.marks[m] === 0)],
    ['inconnues', MARK_IDS.filter((m) => character.marks[m] === null)],
  ];
  const parts = groups.filter(([, marks]) => marks.length > 0).map(([label, marks]) => `${label} ${list(marks.map((m) => MARK_NAMES[m]))}`);
  return `- ${name} : ${parts.join(' ; ')}`;
}

/** Personnages verrouillés et sans marque en une ligne chacun, puis le détail des autres. */
function marksText(characters: CharacterProgress[]): string[] {
  const names = (group: CharacterProgress[]) => list(group.map((c) => characterById(c.id).name)) || 'aucun';
  const none = characters.filter((c) => MARK_IDS.every((m) => c.marks[m] === 0));
  const unknown = characters.filter((c) => MARK_IDS.every((m) => c.marks[m] === null));
  const lines = [
    `Personnages verrouillés : ${names(characters.filter((c) => !c.unlocked))}.`,
    `Personnages sans aucune marque : ${names(none)}.`,
  ];
  if (unknown.length > 0) lines.push(`Personnages aux marques toutes inconnues : ${names(unknown)}.`);
  const detailed = characters.filter((c) => !none.includes(c) && !unknown.includes(c));
  return [...lines, ...detailed.map(characterMarks)];
}

function summaryText(progress: MergedProgress, plan: RoutePlan | null, kb: KnowledgeBase | null): string {
  const { summary } = progress;
  const who = summary.profile.name ?? summary.profile.steamId64;
  const lines = [
    'Données du joueur',
    summary.save ? `Profil : ${who}, sauvegarde du slot ${summary.save.slot}.` : `Profil : ${who}, sans sauvegarde (succès Steam seulement).`,
    `Succès : ${summary.unlocked} obtenus sur ${summary.total}, ${summary.total - summary.unlocked} manquants.`,
    `Par extension : ${list(DLC_ORDER.filter((dlc) => summary.byDlc[dlc].total > 0).map((dlc) => `${DLC_NAMES[dlc]} ${summary.byDlc[dlc].unlocked} sur ${summary.byDlc[dlc].total}`))}.`,
  ];
  if (!kb || !plan) {
    lines.push("Base wiki absente : pas de routes ni de conditions détaillées. Propose de lancer la synchro du wiki depuis l'onglet Paramètres.");
    return lines.join('\n');
  }
  lines.push(
    '',
    plan.marksSource === 'save'
      ? 'Marques de complétion (lues dans la sauvegarde ; pour Greed, « en difficile » veut dire Greedier) :'
      : 'Marques de complétion (déduites des succès, certaines inconnues ; pour Greed, « en difficile » veut dire Greedier) :',
    ...marksText(plan.characters),
    '',
  );
  const runs = plan.runs.slice(0, TOP_RUNS);
  if (runs.length === 0) {
    lines.push('Runs conseillées : aucune, les succès liés aux marques sont tous obtenus.');
  } else {
    const playable = plan.runs.filter((run) => run.missing.length === 0).length;
    lines.push(
      `Runs conseillées par l'application (les ${runs.length} premières sur ${plan.runs.length}, dont ${playable} jouables tout de suite, triées par succès obtenus par heure) :`,
      ...runs.map((run, i) => runText(run, i + 1)),
    );
  }
  const off = plan.offRoute;
  lines.push(
    '',
    `Hors routes : ${off.challenges.length} défis, ${off.counters.length} succès à compteur, ${off.closets.length} placards de Home, ${off.misc.length} succès divers.`,
  );
  return lines.join('\n');
}

function tipsText(tips: TipSource[]): string {
  const text = tips
    .flatMap((source) => source.sections.map((section) => `${source.page}, ${section.title} : ${section.blocks.map((b) => b.text).join(' ')}`))
    .join(' / ');
  if (text.length <= TIPS_PER_CARD) return text;
  const cut = text.slice(0, TIPS_PER_CARD);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 0))}…`;
}

function cardText(achievement: AchievementState, kb: KnowledgeBase | null, plan: RoutePlan | null, all: AchievementState[]): string {
  const state = achievement.unlocked
    ? `obtenu${achievement.unlockedAt ? ` le ${achievement.unlockedAt.slice(0, 10)}` : ''}`
    : 'manquant';
  const lines = [`#${achievement.id} ${achievement.name} : ${state}`];
  const wiki = kb ? buildAchievementWiki(kb, achievement.id) : null;
  if (!kb || !wiki) {
    lines.push(`Description Steam : ${achievement.description}`);
    return lines.join('\n');
  }
  lines.push(`Condition : ${wiki.condition}`);
  const effect = wiki.unlockPage?.effect ? ` Effet : ${wiki.unlockPage.effect}` : '';
  lines.push(`Débloque (${wiki.unlocks.kind}) : ${wiki.unlocks.name}.${effect}`);
  if (plan && !achievement.unlocked) {
    const part = cardPlan(kb, plan, all, achievement.id);
    if (part.requirements.length > 0) lines.push(`Prérequis : ${part.requirements.map(requirementText).join(' ; ')}`);
    for (const { id } of part.runs) {
      const index = plan.runs.findIndex((run) => run.id === id);
      // Les runs conseillées sont déjà décrites plus haut : un renvoi suffit.
      if (index < TOP_RUNS) lines.push(`Run du plan : la run conseillée n° ${index + 1} ci-dessus.`);
      else lines.push('Run du plan :', runText(plan.runs[index], null));
    }
  }
  const tips = tipsText(wiki.tips);
  if (tips) lines.push(`Astuces du wiki : ${tips}`);
  return lines.join('\n');
}

/** Consigne système du conseiller : règles, résumé du joueur, runs conseillées et fiches liées à la question. */
export function buildAdvisorContext({ question, progress, kb, plan }: AdvisorContextInput): AdvisorContext {
  let system = `${RULES}\n\n${summaryText(progress, plan, kb)}`;
  const sources: AdvisorContext['sources'] = [];
  const cards: string[] = [];
  for (const achievement of pickAchievements(question, progress, kb)) {
    const text = cardText(achievement, kb, plan, progress.achievements);
    // Les fiches arrivent de la plus pertinente à la moins pertinente : on s'arrête à la première qui dépasse.
    if (system.length + cards.join('\n\n').length + text.length + 100 > MAX_CONTEXT_CHARS) break;
    cards.push(text);
    sources.push({ id: achievement.id, name: achievement.name });
  }
  system +=
    cards.length > 0
      ? `\n\nFiches des succès liés à la question :\n\n${cards.join('\n\n')}`
      : '\n\nAucune fiche de succès ne correspond aux noms cités dans la question.';
  return { system, sources };
}

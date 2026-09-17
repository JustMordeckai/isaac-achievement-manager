import { CHARACTERS } from '../../shared/characters.ts';
import { ENDINGS } from '../../shared/endings.ts';
import type { AchievementDef, WikiSyncEvent, WikiSyncReport } from '../../shared/types.ts';
import { characterOf, classifyHow, classifyUnlock, isUsablePage, type LinkedPageInfo } from '../planner/classify.ts';
import type { WikiClient } from './client.ts';
import { KB_VERSION, type KbAchievement, type KnowledgeBase } from './kb-types.ts';
import { parseAchievementsPage } from './parse-achievements.ts';
import {
  pageInfobox,
  parseAchievementTips,
  parseChallenge,
  parseChallengeNav,
  parsePage,
  sectionBlocks,
  type KbChallenge,
  type KbPage,
} from './parse-pages.ts';
import type { TemplateCounter } from './wikitext.ts';

export const CORE_PAGES = {
  achievements: 'Achievements',
  tips: 'Achievement Tips',
  challenges: 'Template:Nav challenge',
} as const;

/** Pages consultées pour les astuces des marques de complétion et des placards de Home. */
export const EXTRA_PAGES = [...new Set([...ENDINGS.map((e) => e.page), ...CHARACTERS.map((c) => c.page), 'Home'])];

export interface SyncDeps {
  client: WikiClient;
  /** Schéma Steam local : sert pour les succès absents du wiki (#641). */
  steamDefs: AchievementDef[] | null;
  now?: () => Date;
  onEvent?: (event: WikiSyncEvent) => void;
}

/** Message d'échec quand des pages restent injoignables (ni téléchargées ni en cache). */
function unreachableError(titles: string[]): Error {
  const sorted = [...titles].sort();
  const shown = sorted.slice(0, 5);
  const remaining = sorted.length - shown.length;
  let list = shown.join(', ');
  if (remaining > 0) list += ` et ${remaining} autre${remaining > 1 ? 's' : ''}`;
  const count = titles.length === 1 ? '1 page' : `${titles.length} pages`;
  return new Error(`Wiki injoignable pour ${count} sans copie en cache : ${list}. Relance la synchro plus tard.`);
}

export async function buildKnowledgeBase(deps: SyncDeps): Promise<KnowledgeBase> {
  const emit = deps.onEvent ?? (() => {});
  const unknown: TemplateCounter = new Map();

  emit({ step: 'core', done: 0, total: 1, message: 'Téléchargement de la liste des succès' });
  const core = await deps.client.fetchPages(Object.values(CORE_PAGES));
  if (core.failed.length > 0) throw unreachableError(core.failed);
  const contentOf = (requested: string) => {
    const target = core.resolved.get(requested);
    return target ? (core.pages.get(target.title) ?? null) : null;
  };
  const achievementsText = contentOf(CORE_PAGES.achievements);
  if (!achievementsText) throw new Error('Page « Achievements » indisponible : wiki injoignable et aucun cache');
  const rows = parseAchievementsPage(achievementsText, unknown);
  if (rows.length === 0) throw new Error('Page « Achievements » sans fiche de succès : le format du wiki a changé');
  const refs = parseChallengeNav(contentOf(CORE_PAGES.challenges) ?? '');
  emit({ step: 'core', done: 1, total: 1, message: `${rows.length} succès et ${refs.length} défis trouvés` });

  const titles = [...new Set([...refs.map((r) => r.title), ...rows.map((r) => r.link), ...EXTRA_PAGES])];
  emit({ step: 'pages', done: 0, total: Math.ceil(titles.length / 50), message: `${titles.length} pages à télécharger` });
  const fetched = await deps.client.fetchPages(titles, (done, total) =>
    emit({ step: 'pages', done, total, message: `Lot ${done} sur ${total}` }),
  );
  if (fetched.failed.length > 0) throw unreachableError(fetched.failed);

  emit({ step: 'build', done: 0, total: 1, message: 'Analyse des pages' });
  const textOf = (requested: string): { title: string; fragment: string | null; text: string | null } | null => {
    const target = fetched.resolved.get(requested);
    if (!target) return null;
    return { ...target, text: fetched.pages.get(target.title) ?? null };
  };

  const pages: Record<string, KbPage> = {};
  const addPage = (title: string, text: string) => {
    if (title !== CORE_PAGES.achievements && !pages[title]) pages[title] = parsePage(title, text, unknown);
  };

  const achievements: KbAchievement[] = rows.map((row) => {
    const target = textOf(row.link);
    const fragment = row.linkFragment ?? target?.fragment ?? null;
    const linked: LinkedPageInfo | null = target
      ? {
          title: target.title,
          fragment,
          missing: target.text === null,
          infobox: target.text ? pageInfobox(target.text).type : null,
        }
      : null;
    const usable = isUsablePage(linked) && target?.text ? target : null;
    if (usable?.text) addPage(usable.title, usable.text);
    const how = classifyHow(row.condition);
    return {
      id: row.id,
      wikiName: row.wikiName,
      name: row.displayName,
      description: row.description,
      condition: row.condition,
      how,
      unlocks: classifyUnlock(row.displayName, row.description, linked),
      character: characterOf(how),
      page: usable ? usable.title : null,
      fragment: usable ? fragment : null,
      excerpt: usable?.text && fragment ? sectionBlocks(usable.text, fragment, unknown) : null,
      inWiki: true,
    };
  });

  for (const title of EXTRA_PAGES) {
    const target = textOf(title);
    if (target?.text) addPage(target.title, target.text);
  }

  const challenges: KbChallenge[] = [];
  for (const ref of refs) {
    const target = textOf(ref.title);
    if (!target?.text) continue;
    challenges.push(parseChallenge(ref, target.text, unknown));
    addPage(target.title, target.text);
  }

  const known = new Set(achievements.map((a) => a.id));
  for (const def of deps.steamDefs ?? []) {
    if (known.has(def.id)) continue;
    achievements.push({
      id: def.id,
      wikiName: def.name,
      name: def.name,
      description: def.description,
      condition: '',
      how: { kind: 'misc' },
      unlocks: { kind: 'other', name: def.name },
      character: null,
      page: null,
      fragment: null,
      excerpt: null,
      inWiki: false,
    });
  }
  achievements.sort((a, b) => a.id - b.id);

  const tipsText = contentOf(CORE_PAGES.tips);
  const tips = tipsText ? parseAchievementTips(tipsText, rows, unknown) : [];

  const missingPages = titles.filter((title) => {
    const target = fetched.resolved.get(title);
    return !target || fetched.pages.get(target.title) === null;
  });
  const report: WikiSyncReport = {
    achievements: achievements.length,
    pages: Object.keys(pages).length,
    missingPages: missingPages.sort(),
    unknownTemplates: Object.fromEntries([...unknown].sort((a, b) => b[1] - a[1])),
    miscCount: achievements.filter((a) => a.inWiki && a.how.kind === 'misc').length,
    otherUnlockCount: achievements.filter((a) => a.inWiki && a.unlocks.kind === 'other').length,
    cachedPages: core.fromCache.length + fetched.fromCache.length,
  };
  emit({ step: 'build', done: 1, total: 1, message: `${report.pages} pages analysées` });

  return {
    version: KB_VERSION,
    syncedAt: (deps.now ?? (() => new Date()))().toISOString(),
    achievements,
    challenges,
    pages,
    tips,
    report,
  };
}

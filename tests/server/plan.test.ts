import { describe, expect, it } from 'vitest';
import { inferMarks } from '../../server/planner/marks.ts';
import { buildPlan } from '../../server/planner/plan.ts';
import { mergeProgress, type SaveProgress } from '../../server/sources/progress.ts';
import { endingByName, type EndingId } from '../../shared/endings.ts';
import type { Locale } from '../../shared/i18n/index.ts';
import { type CharacterMarks, MARK_IDS, markForEnding, type MarkId } from '../../shared/marks.ts';
import type { PlannedRun, RoutePlan } from '../../shared/types.ts';
import { fixtureMergeInput } from './helpers/merge-input.ts';
import { testKnowledgeBase } from './helpers/kb.ts';

const merged = mergeProgress(fixtureMergeInput());

async function planWithSave(unlock: (id: number) => boolean | null, save: SaveProgress | null, locale: Locale = 'en') {
  const kb = await testKnowledgeBase();
  const achievements = merged.achievements.map((a) => ({ ...a, unlocked: unlock(a.id) ?? a.unlocked }));
  return buildPlan({ kb, achievements, save, locale });
}

function planFor(unlock: (id: number) => boolean | null, withSave: boolean, locale: Locale = 'en') {
  return planWithSave(unlock, withSave ? merged.save : null, locale);
}

/** Fixture save where Isaac has every mark on hard, except the ones given. */
function saveWithIsaacMarks(marks: Partial<CharacterMarks>): SaveProgress {
  if (!merged.save?.marks) throw new Error('The fixture save must contain marks.');
  const hard = Object.fromEntries(MARK_IDS.map((mark) => [mark, 2])) as CharacterMarks;
  return { ...merged.save, marks: { ...merged.save.marks, isaac: { ...hard, ...marks } } };
}

/** A character's runs in the order the planner chose them. */
function runsOf(plan: RoutePlan, character: string): PlannedRun[] {
  const rank = (run: PlannedRun) => Number(run.id.slice(run.id.lastIndexOf('-') + 1));
  return plan.runs.filter((r) => r.character === character).sort((a, b) => rank(a) - rank(b));
}

describe('buildPlan', () => {
  it("schedules Player's runs from his save", async () => {
    const plan = await planFor(() => null, true);
    expect(plan.marksSource).toBe('save');
    expect(plan.runs).toHaveLength(190);
    expect(plan.runs.filter((r) => r.missing.length === 0)).toHaveLength(31);
    const isaac = plan.runs.filter((r) => r.character === 'isaac');
    expect(isaac.map((r) => [r.id, r.mode, r.endings.join('+'), r.achievements.map((a) => a.id)])).toEqual([
      ['isaac-1', 'hard', 'bossRush+momsHeart+satan+lamb+megaSatan+delirium', [70, 205, 282, 338, 340]],
      ['isaac-2', 'hard', 'mother', [440, 405, 510, 511, 635]],
      ['isaac-5', 'greedier', 'ultraGreedier', [253, 296]],
      ['isaac-3', 'hard', 'momsHeart+isaac+blueBaby', [49, 41]],
      ['isaac-4', 'hard', 'beast', [441, 474]],
    ]);
    expect(isaac[0]).toMatchObject({ minutes: 85, score: 3.529, missing: [] });
    expect(isaac[1].missing).toEqual([{ anyOf: [{ id: 407, name: 'A Secret Exit' }], met: false }]);
  });

  it('ranks playable runs before the others, by descending score', async () => {
    const { runs } = await planFor(() => null, true);
    const playable = runs.filter((r) => r.missing.length === 0);
    expect(runs.slice(0, playable.length)).toEqual(playable);
    for (let i = 1; i < playable.length; i++) expect(playable[i - 1].score).toBeGreaterThanOrEqual(playable[i].score);
    expect(runs[0]).toMatchObject({ id: 'magdalene-1', score: 4.33 });
    expect(runs[0].steps).toHaveLength(10);
  });

  it('never promises the same achievement twice and covers every missing achievement', async () => {
    const plan = await planFor(() => null, true);
    const inRuns = plan.runs.flatMap((r) => r.achievements.map((a) => a.id));
    expect(new Set(inRuns).size).toBe(inRuns.length);
    const prepared = plan.runs.flatMap((r) => r.prepares.map((a) => a.id));
    const off = [...plan.offRoute.challenges, ...plan.offRoute.counters, ...plan.offRoute.closets, ...plan.offRoute.misc];
    const covered = new Set([...inRuns, ...prepared, ...off.map((x) => x.id)]);
    const locked = merged.achievements.filter((a) => !a.unlocked).map((a) => a.id);
    expect(locked.filter((id) => !covered.has(id))).toEqual([]);
  });

  it.each([
    ['the save', true],
    ['the inferred marks', false],
  ])('never makes playable a run whose achievement depends on a planned run (%s)', async (_, withSave) => {
    const kb = await testKnowledgeBase();
    const plan = await planFor(() => null, withSave);
    const unlocked = new Set(merged.achievements.filter((a) => a.unlocked).map((a) => a.id));
    const marks = withSave ? merged.save?.marks : inferMarks(kb, unlocked);
    if (!marks) throw new Error('The fixture save must contain marks.');
    const hows = new Map(kb.achievements.map((a) => [a.id, a.how]));
    // Level a run brings to a mark, and endings already beaten according to the real state alone.
    const reached = (run: PlannedRun, mark: MarkId) =>
      Math.max(
        0,
        ...run.endings
          .filter((e) => markForEnding(e).mark === mark)
          .map((e) => (run.mode === 'hard' ? 2 : markForEnding(e).level)),
      );
    const level = (run: PlannedRun, mark: MarkId) => Math.max(marks[run.character][mark], reached(run, mark));
    const has = (run: PlannedRun, ending: EndingId, hard: boolean) =>
      level(run, markForEnding(ending).mark) >= (hard ? 2 : markForEnding(ending).level);
    const beaten = (ending: EndingId) =>
      Object.values(marks).some((m) => m[markForEnding(ending).mark] >= markForEnding(ending).level);
    const dependent = plan.runs
      .filter((run) => run.missing.length === 0)
      .flatMap((run) =>
        run.achievements
          .filter(({ id }) => {
            const how = hows.get(id);
            if (how?.kind === 'multi-mark') return !how.endings.every((e) => has(run, e, how.hard));
            if (how?.kind === 'hard-all') return !MARK_IDS.every((mark) => level(run, mark) === 2);
            if (how?.kind === 'boss') {
              return !how.bosses.every((boss) => {
                const ending = endingByName(boss);
                return boss === 'Mom' || (ending !== null && (run.endings.includes(ending.id) || beaten(ending.id)));
              });
            }
            return false;
          })
          .map(({ id }) => `${run.id} #${id}`),
      );
    expect(dependent).toEqual([]);
  });

  it('blocks the run that completes the card thanks to a blocked run', async () => {
    // Isaac: Mother and Greed on normal. Without A Secret Exit (#407), the Mother run is blocked,
    // so the Greedier run that would get Buddy Baby (#253) right after is blocked too.
    const plan = await planWithSave((id) => ![253, 407, 440].includes(id), saveWithIsaacMarks({ mother: 1, greed: 1 }));
    const blocked = [{ anyOf: [{ id: 407, name: 'A Secret Exit' }], met: false }];
    expect(plan.runs).toHaveLength(2);
    expect(runsOf(plan, 'isaac').map((r) => [r.id, r.endings, r.achievements.map((a) => a.id), r.missing])).toEqual([
      ['isaac-1', ['mother'], [440], blocked],
      ['isaac-2', ['ultraGreedier'], [253], blocked],
    ]);
  });

  it('adds a preparation run when the completed card needs several runs', async () => {
    // Isaac: everything on hard except Mother and The Beast, which are not beaten in the same run.
    const plan = await planWithSave((id) => id !== 253, saveWithIsaacMarks({ mother: 1, beast: 1 }));
    expect(plan.runs).toHaveLength(2);
    const runs = runsOf(plan, 'isaac');
    expect(runs.map((r) => [r.id, r.mode, r.endings, r.achievements, r.prepares, r.score, r.missing])).toEqual([
      ['isaac-1', 'hard', ['mother'], [], [{ id: 253, name: 'Buddy Baby' }], 0, []],
      ['isaac-2', 'hard', ['beast'], [{ id: 253, name: 'Buddy Baby' }], [], 1, []],
    ]);
  });

  it('prepares the completed card of a remote profile', async () => {
    const plan = await planFor((id) => id !== 253, false);
    const runs = runsOf(plan, 'isaac');
    expect(plan.runs).toHaveLength(runs.length);
    expect(runs.map((r) => [r.endings.join('+'), r.achievements.map((a) => a.id), r.prepares.map((a) => a.id)])).toEqual([
      ['bossRush+momsHeart+hush+isaac+blueBaby+megaSatan+delirium', [], [253]],
      ['momsHeart+satan+lamb', [], [253]],
      ['mother', [], [253]],
      ['beast', [253], []],
    ]);
  });

  it('prepares a multi-mark achievement that does not fit in one run', async () => {
    // Mom's Lock (#548): Isaac, ???, Satan and The Lamb with Tainted Isaac.
    const plan = await planFor((id) => id !== 548, false);
    const runs = runsOf(plan, 'taintedIsaac');
    expect(plan.runs).toHaveLength(runs.length);
    expect(runs.map((r) => [r.mode, r.endings, r.achievements.map((a) => a.id), r.prepares])).toEqual([
      ['normal', ['momsHeart', 'isaac', 'blueBaby'], [], [{ id: 548, name: "Mom's Lock" }]],
      ['normal', ['momsHeart', 'satan', 'lamb'], [548], []],
    ]);
  });

  it('credits a multi-boss achievement to the second run that completes it', async () => {
    const plan = await planFor(() => null, true);
    // Golden God!: beat ??? and The Lamb, which are not done in the same run.
    const run = plan.runs.find((r) => r.achievements.some((a) => a.id === 41));
    expect(run?.endings).toEqual(['momsHeart', 'isaac', 'blueBaby']);
  });

  it('offers to beat Mom for a new profile', async () => {
    const plan = await planFor(() => false, false);
    expect(plan.marksSource).toBe('inferred');
    const playable = plan.runs.filter((r) => r.missing.length === 0);
    expect(playable.map((r) => [r.character, r.endings])).toEqual([
      ['isaac', []],
      ['isaac', ['ultraGreed']],
    ]);
    expect(playable[0].achievements.map((a) => a.id)).toEqual([4, 5, 6, 166, 265, 266, 269, 272, 274, 278]);
    expect(playable[0].steps).toEqual(['Go through Basement, Caves and Depths, then beat Mom in Depths II.']);
    const magdalene = plan.runs.find((r) => r.character === 'magdalene');
    expect(magdalene?.missing[0]).toEqual({ anyOf: [{ id: 1, name: 'Magdalene' }], met: false });

    // Same plan, in the reader's language: proves buildPlan threads locale through to the run text.
    const frPlan = await planFor(() => false, false, 'fr');
    const frPlayable = frPlan.runs.filter((r) => r.missing.length === 0);
    expect(frPlayable[0].steps).toEqual(['Traverser Basement, Caves et Depths, puis battre Mom en Depths II.']);
  });

  it('offers nothing once everything is unlocked', async () => {
    const plan = await planFor(() => true, false);
    expect(plan.runs).toEqual([]);
    expect(plan.offRoute).toEqual({ challenges: [], counters: [], closets: [], redKey: true, misc: [] });
    expect(plan.characters.every((c) => c.unlocked && c.hardAll !== false)).toBe(true);
  });

  it('infers marks from achievements with no save', async () => {
    const plan = await planFor(() => null, false);
    expect(plan.marksSource).toBe('inferred');
    expect(plan.characters[0]).toEqual({
      id: 'isaac',
      unlocked: true,
      marks: {
        momsHeart: 2,
        isaac: 1,
        satan: 1,
        bossRush: 0,
        blueBaby: 0,
        lamb: 1,
        megaSatan: 0,
        greed: 1,
        hush: 1,
        delirium: 0,
        mother: 0,
        beast: 0,
      },
      hardAll: false,
    });
    expect(plan.characters.find((c) => c.id === 'taintedIsaac')?.marks.momsHeart).toBeNull();
    expect(plan.characters.find((c) => c.id === 'taintedIsaac')?.hardAll).toBeNull();
  });

  it('credits a counted win only once it is enough', async () => {
    const plan = await planFor(() => null, true);
    // Mom's Heart beaten 16 times: the 21 and 30 thresholds do not land within a single run.
    const counted = plan.runs.flatMap((r) => r.achievements.map((a) => a.id)).filter((id) => [344, 345].includes(id));
    expect(counted).toEqual([]);
    const oneMore = mergeProgress(fixtureMergeInput());
    const save = oneMore.save ? { ...oneMore.save, counters: oneMore.save.counters.map((v, i) => (i === 1 ? 20 : v)) } : null;
    const kb = await testKnowledgeBase();
    const next = buildPlan({ kb, achievements: oneMore.achievements, save, locale: 'en' });
    expect(next.runs.find((r) => r.achievements.some((a) => a.id === 344))?.endings).toContain('momsHeart');
  });
});

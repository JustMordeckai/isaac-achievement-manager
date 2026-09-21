import { t, type Locale, type MessageKey } from '@shared/i18n/index.ts';
import type { PlannedRun, RunMode } from '@shared/types.ts';
import { characterName, endingList } from '@/lib/labels.ts';

const MODES: Record<RunMode, MessageKey> = {
  normal: 'advisor.question.modeNormal',
  hard: 'advisor.question.modeHard',
  greed: 'advisor.question.modeGreed',
  greedier: 'advisor.question.modeGreedier',
};

function cite(achievement: { id: number; name: string }): string {
  return `${achievement.name} (#${achievement.id})`;
}

/** "a, b and c". */
function joinWithAnd(locale: Locale, items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${t(locale, 'advisor.question.and')} ${items[items.length - 1]}`;
}

/** Question prefilled by the "Ask the advisor" button of a run. */
export function runQuestion(locale: Locale, run: PlannedRun): string {
  const goal =
    run.achievements.length > 0
      ? t(locale, 'advisor.question.goalAchievements', { list: joinWithAnd(locale, run.achievements.map(cite)) })
      : t(locale, 'advisor.question.goalPrepares', { list: joinWithAnd(locale, run.prepares.map(cite)) });
  return t(locale, 'advisor.question.run', {
    character: characterName(run.character),
    mode: t(locale, MODES[run.mode]),
    endings: endingList(run.endings),
    goal,
  });
}

/** Question prefilled from the card of a missing achievement. */
export function achievementQuestion(locale: Locale, achievement: { id: number; name: string }): string {
  return t(locale, 'advisor.question.achievement', { achievement: cite(achievement) });
}

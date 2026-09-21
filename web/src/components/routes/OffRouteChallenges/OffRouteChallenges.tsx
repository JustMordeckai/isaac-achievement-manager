import type { ChallengeTodo } from '@shared/types.ts';
import { RequirementNames } from '@/components/common/RequirementNames/RequirementNames.tsx';
import { AchievementLink } from '@/components/routes/AchievementLink/AchievementLink.tsx';
import { useT } from '@/i18n.tsx';

export interface OffRouteChallengesProps {
  challenges: ChallengeTodo[];
  onOpen(id: number): void;
}

/** The challenges still to clear, each with what the game asks of them. */
export function OffRouteChallenges({ challenges, onOpen }: OffRouteChallengesProps) {
  const t = useT();
  return (
    <details className="card">
      <summary>{t('routes.challenges', { count: challenges.length })}</summary>
      <ul className="todo-list">
        {challenges.map((c) => (
          <li key={c.id}>
            <AchievementLink id={c.id} name={c.name} onOpen={onOpen} />
            {t('routes.challengeNumber', { number: c.number })}
            {c.title && (
              <>
                {' '}
                <span lang="en">{c.title}</span>
              </>
            )}
            {c.character && (
              <>
                {t('routes.challengeWith')}
                <span lang="en">{c.character}</span>
              </>
            )}
            {c.goal && (
              <>
                {t('routes.challengeGoal')}
                <span lang="en">{c.goal}</span>
              </>
            )}
            {c.curse && (
              <>
                {t('routes.challengeCurse')}
                <span lang="en">{c.curse}</span>
              </>
            )}
            {c.startingItems.length > 0 && (
              <>
                {t('routes.challengeItems')}
                <span lang="en">{c.startingItems.join(', ')}</span>
              </>
            )}
            {c.requirement && !c.requirement.met && (
              <span className="todo-list__missing">
                {' '}
                {t('routes.challengeUnlockFirst')}
                <RequirementNames requirements={[c.requirement]} />)
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

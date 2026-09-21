import type { CharacterId } from '@shared/characters.ts';
import type { ClosetTodo } from '@shared/types.ts';
import { AchievementLink } from '@/components/routes/AchievementLink/AchievementLink.tsx';
import { useT } from '@/i18n.tsx';
import { characterName } from '@/lib/labels.ts';

export interface OffRouteClosetsProps {
  closets: ClosetTodo[];
  /** Red Key unlocked; without it the hint explains how to reach Home in the first place. */
  redKey: boolean;
  onOpen(id: number): void;
}

/** The closet achievements, grouped by the character that has to open them. */
export function OffRouteClosets({ closets, redKey, onOpen }: OffRouteClosetsProps) {
  const t = useT();
  const characters = [...new Set(closets.map((c) => c.character))];
  return (
    <details className="card">
      <summary>{t('routes.closets', { count: closets.length })}</summary>
      <p className="hint">
        {t('routes.closetsHintStart')}
        <span lang="en">The Beast</span>
        {t('routes.closetsHintMiddle')}
        <span lang="en">Red Key</span>
        {t('routes.closetsHintOr1')}
        <span lang="en">Cracked Key</span>
        {t('routes.closetsHintOr2')}
        <span lang="en">Soul of Cain</span>
        {t('routes.closetsHintEnd')}
        {!redKey && (
          <>
            {' '}
            {t('routes.redKeyStart')}
            <span lang="en">Mom</span>
            {t('routes.redKeyMiddle')}
            <span lang="en">Red Key</span>
            {t('routes.redKeyEnd')}
            <span lang="en">Home</span>
            {t('routes.closetsHintEnd')}
          </>
        )}
      </p>
      <ul className="todo-list">
        {characters.map((character: CharacterId) => (
          <li key={character}>
            <span lang="en">{characterName(character)}</span>
            {t('routes.colonSpace')}
            {closets
              .filter((c) => c.character === character)
              .map((c) => (
                <AchievementLink key={c.id} id={c.id} name={c.name} onOpen={onOpen} />
              ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

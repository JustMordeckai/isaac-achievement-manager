import { characterById } from '../../../shared/characters.ts';
import type { MessageKey } from '../../../shared/i18n/index.ts';
import { MARK_IDS, type MarkId, type MarkLevel } from '../../../shared/marks.ts';
import type { CharacterProgress, MarksSource } from '../../../shared/types.ts';
import { useLocale, useT } from '../i18n.tsx';
import { MARK_LABELS, marksSourceLabel } from '../labels.ts';

export interface CharacterGridProps {
  characters: CharacterProgress[];
  source: MarksSource;
}

/** Level of one mark, as a key; Greed and Greedier are names of the game and stay as they are. */
function levelText(t: (key: MessageKey) => string, mark: MarkId, level: MarkLevel | null): string {
  if (level === null) return t('dashboard.marks.unknown');
  if (level === 0) return t('dashboard.marks.none');
  if (mark === 'greed') return level === 2 ? 'Greedier' : 'Greed';
  return level === 2 ? t('dashboard.marks.hard') : t('dashboard.marks.normal');
}

function levelClass(level: MarkLevel | null): string {
  if (level === null) return 'mark--unknown';
  return ['mark--none', 'mark--normal', 'mark--hard'][level];
}

/** Completion note of the 34 characters, one column per mark. */
export function CharacterGrid({ characters, source }: CharacterGridProps) {
  const locale = useLocale();
  const t = useT();
  return (
    <div className="character-grid">
      <div className="character-grid__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('dashboard.marks.character')}</th>
              {MARK_IDS.map((mark) => (
                <th key={mark} scope="col">
                  <abbr title={MARK_LABELS[mark].name} lang="en">
                    {MARK_LABELS[mark].short}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {characters.map((character) => (
              <tr key={character.id} className={character.unlocked ? undefined : 'character-grid__locked'}>
                <th scope="row">
                  <span lang="en">{characterById(character.id).name}</span>
                  {!character.unlocked && (
                    <>
                      {' '}
                      <span className="tag">{t('dashboard.marks.locked')}</span>
                    </>
                  )}
                  {character.hardAll && (
                    <>
                      {' '}
                      <span className="tag tag--ok">{t('dashboard.marks.fullNote')}</span>
                    </>
                  )}
                </th>
                {MARK_IDS.map((mark) => {
                  const level = character.marks[mark];
                  const text = levelText(t, mark, level);
                  return (
                    <td
                      key={mark}
                      className={`mark ${levelClass(level)}`}
                      title={t('dashboard.marks.cell', { mark: MARK_LABELS[mark].name, level: text })}
                    >
                      <span className="visually-hidden">
                        <span lang="en">{MARK_LABELS[mark].name}</span>
                        {t('dashboard.marks.levelSuffix', { level: text })}
                      </span>
                      {level === null && <span aria-hidden="true">?</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        {t('dashboard.marks.legend')} {marksSourceLabel(locale, source)}
      </p>
    </div>
  );
}

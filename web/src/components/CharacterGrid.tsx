import { characterById } from '../../../shared/characters.ts';
import { MARK_IDS, type MarkId, type MarkLevel } from '../../../shared/marks.ts';
import type { CharacterProgress, MarksSource } from '../../../shared/types.ts';
import { MARK_LABELS, MARKS_SOURCE_LABELS } from '../labels.ts';

export interface CharacterGridProps {
  characters: CharacterProgress[];
  source: MarksSource;
}

function levelText(mark: MarkId, level: MarkLevel | null): string {
  if (level === null) return 'inconnue';
  if (level === 0) return 'absente';
  if (mark === 'greed') return level === 2 ? 'Greedier' : 'Greed';
  return level === 2 ? 'difficile' : 'normal';
}

function levelClass(level: MarkLevel | null): string {
  if (level === null) return 'mark--unknown';
  return ['mark--none', 'mark--normal', 'mark--hard'][level];
}

/** Note de complétion des 34 personnages, une colonne par marque. */
export function CharacterGrid({ characters, source }: CharacterGridProps) {
  return (
    <div className="character-grid">
      <div className="character-grid__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Personnage</th>
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
                      <span className="tag">verrouillé</span>
                    </>
                  )}
                  {character.hardAll && (
                    <>
                      {' '}
                      <span className="tag tag--ok">note complète</span>
                    </>
                  )}
                </th>
                {MARK_IDS.map((mark) => {
                  const level = character.marks[mark];
                  const text = levelText(mark, level);
                  return (
                    <td key={mark} className={`mark ${levelClass(level)}`} title={`${MARK_LABELS[mark].name} : ${text}`}>
                      <span className="visually-hidden">
                        <span lang="en">{MARK_LABELS[mark].name}</span> : {text}
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
        Case pleine : difficile (Greedier pour Greed) ; contour : normal (Greed) ; vide : absente ; ? : inconnue.{' '}
        {MARKS_SOURCE_LABELS[source]}
      </p>
    </div>
  );
}

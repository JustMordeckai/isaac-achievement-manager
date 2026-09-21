import type { MessageKey } from '@shared/i18n/index.ts';
import { useT } from '@/i18n.tsx';

export interface AdvisorSuggestionsProps {
  onPick(question: string): void;
}

const SUGGESTIONS: MessageKey[] = [
  'advisor.suggestionFirstRun',
  'advisor.suggestionCharacters',
  'advisor.suggestionMarks',
];

/** What an empty conversation offers instead of a blank field. */
export function AdvisorSuggestions({ onPick }: AdvisorSuggestionsProps) {
  const t = useT();
  return (
    <div className="chat__empty">
      <p className="muted">{t('advisor.examples')}</p>
      <ul className="chat__suggestions">
        {SUGGESTIONS.map((key) => (
          <li key={key}>
            <button type="button" className="link-button" onClick={() => onPick(t(key))}>
              {t(key)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

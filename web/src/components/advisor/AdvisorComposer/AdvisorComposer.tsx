import type { FormEvent, KeyboardEvent, RefObject } from 'react';
import { useT } from '@/i18n.tsx';

export interface AdvisorComposerProps {
  field: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraftChange(text: string): void;
  onSubmit(event: FormEvent): void;
  onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void;
  /** An answer is under way: the send button becomes a stop button. */
  busy: boolean;
  onStop(): void;
  /** Clearing is offered only once something has been asked. */
  canClear: boolean;
  onClear(): void;
}

const QUESTION_MAX_CHARS = 2000;

/** The question field and what can be done with it: send, stop, clear the conversation. */
export function AdvisorComposer({
  field,
  draft,
  onDraftChange,
  onSubmit,
  onKeyDown,
  busy,
  onStop,
  canClear,
  onClear,
}: AdvisorComposerProps) {
  const t = useT();
  return (
    <form className="chat__form" onSubmit={onSubmit}>
      <label className="chat__label" htmlFor="advisor-question">
        {t('advisor.questionLabel')}
      </label>
      <textarea
        id="advisor-question"
        ref={field}
        rows={3}
        maxLength={QUESTION_MAX_CHARS}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby="advisor-question-hint"
      />
      <p id="advisor-question-hint" className="hint">
        {t('advisor.questionHint')}
      </p>
      <div className="chat__actions">
        {busy ? (
          <button type="button" className="btn" onClick={onStop}>
            {t('advisor.stop')}
          </button>
        ) : (
          <button type="submit" className="btn btn--primary" disabled={draft.trim() === ''}>
            {t('advisor.send')}
          </button>
        )}
        {/* During an answer too: clearing the conversation cuts the answer in flight. */}
        {canClear && (
          <button type="button" className="btn btn--ghost" onClick={onClear}>
            {t('advisor.clear')}
          </button>
        )}
      </div>
    </form>
  );
}

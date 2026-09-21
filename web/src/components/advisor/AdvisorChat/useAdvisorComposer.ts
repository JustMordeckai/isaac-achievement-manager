import { useEffect, useRef, type FormEvent, type KeyboardEvent, type RefObject } from 'react';

export interface AdvisorComposerOptions {
  draft: string;
  onDraftChange(text: string): void;
  /** An answer is pending: the question waits rather than queueing up behind it. */
  busy: boolean;
  onSend(question: string): void;
}

export interface AdvisorComposerHook {
  field: RefObject<HTMLTextAreaElement | null>;
  submit(event: FormEvent | KeyboardEvent): void;
  keyDown(event: KeyboardEvent<HTMLTextAreaElement>): void;
  /** Puts a suggested question in the field and gives it the focus. */
  suggest(text: string): void;
}

/** The question field: what sends it, and where the cursor is when the screen opens. */
export function useAdvisorComposer({ draft, onDraftChange, busy, onSend }: AdvisorComposerOptions): AdvisorComposerHook {
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Arriving on the tab (or from "Ask the advisor"): cursor at the end of the question.
    const element = field.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  function submit(event: FormEvent | KeyboardEvent) {
    event.preventDefault();
    if (busy || draft.trim() === '') return;
    onSend(draft);
    onDraftChange('');
  }

  return {
    field,
    submit,
    keyDown(event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
    },
    suggest(text) {
      onDraftChange(text);
      field.current?.focus();
    },
  };
}

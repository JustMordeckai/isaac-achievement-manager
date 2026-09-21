import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api.ts';
import { messageOf } from '@/lib/errors.ts';
import type { AdvisorStatusState } from '@/hooks/useAdvisorStatus.ts';
import { useAdvisorSetup, type AdvisorSetupHook } from '@/hooks/useAdvisorSetup.ts';

export interface AdvisorForm {
  url: string;
  setUrl(url: string): void;
  model: string;
  setModel(model: string): void;
  saving: boolean;
  saved: boolean;
  error: string | null;
  /** Install of Ollama and download of a model, offered until the advisor answers. */
  setup: AdvisorSetupHook;
  save(event: FormEvent): void;
}

/** Address and model of the advisor: the fields, what saving them does, and the first-run setup. */
export function useAdvisorForm(advisor: AdvisorStatusState): AdvisorForm {
  const { status } = advisor;
  const [url, setUrl] = useState(status?.url ?? '');
  const [model, setModel] = useState(status?.model ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const filled = useRef(status !== null);
  const typed = useRef({ url: false, model: false });

  // A model that was just downloaded becomes the one the advisor uses, otherwise nothing would
  // change on screen; an install only calls for reading the state of the server again.
  const finished = useCallback(
    (job: 'install' | 'pull', pulled: string) => {
      if (job !== 'pull') {
        advisor.recheck();
        return;
      }
      setModel(pulled);
      void api
        .saveAdvisorSettings({ url: status?.url ?? url, model: pulled })
        .then((next) => advisor.replace(next), () => advisor.recheck());
    },
    [advisor, status?.url, url],
  );
  const setup = useAdvisorSetup(0, finished);

  useEffect(() => {
    // First time the state arrives (up to 3 s on an unreachable server): the fields the reader
    // has not typed in start from the settings read on the server.
    if (!status || filled.current) return;
    filled.current = true;
    if (!typed.current.url) setUrl(status.url);
    if (!typed.current.model) setModel(status.model);
  }, [status]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await api.saveAdvisorSettings({ url, model });
      advisor.replace(next);
      setUrl(next.url);
      setModel(next.model);
      setSaved(true);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setSaving(false);
    }
  }

  return {
    url,
    setUrl: (next) => {
      typed.current.url = true;
      setUrl(next);
    },
    model,
    setModel: (next) => {
      typed.current.model = true;
      setModel(next);
    },
    saving,
    saved,
    error,
    setup,
    save,
  };
}

import type { AdvisorStatus } from '@shared/types.ts';
import { useT } from '@/i18n.tsx';

export interface AdvisorServerStateProps {
  status: AdvisorStatus | null;
  checking: boolean;
  onRecheck(): void;
  onOpenSettings(): void;
}

/** Whether the Ollama server answers, and what to do about it when it does not. */
export function AdvisorServerState({ status, checking, onRecheck, onOpenSettings }: AdvisorServerStateProps) {
  const t = useT();
  if (!status) return <p className="placeholder">{t('advisor.checkingServer')}</p>;
  if (status.state === 'ok') {
    return <p className="muted">{t('advisor.modelOn', { model: status.model, url: status.url })}</p>;
  }
  return (
    <div className="banner banner--error advisor__server">
      <p>{status.message ?? t('advisor.serverUnavailable')}</p>
      <div className="error-panel__actions">
        <button type="button" className="btn" onClick={onRecheck} disabled={checking}>
          {checking ? t('advisor.checking') : t('advisor.recheck')}
        </button>
        <button type="button" className="btn" onClick={onOpenSettings}>
          {t('advisor.openSettings')}
        </button>
      </div>
    </div>
  );
}

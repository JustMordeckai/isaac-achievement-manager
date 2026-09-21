import type { AdvisorStatus } from '@shared/types.ts';
import { useT } from '@/i18n.tsx';

export interface AdvisorStatusTextProps {
  status: AdvisorStatus | null;
}

/** One line saying whether the advisor answers, and with which model. */
export function AdvisorStatusText({ status }: AdvisorStatusTextProps) {
  const t = useT();
  if (!status) return <p className="placeholder">{t('settings.advisorChecking')}</p>;
  if (status.state === 'ok') return <p>{t('settings.advisorOk', { model: status.model })}</p>;
  return <p className="banner banner--error">{status.message ?? t('settings.advisorUnavailable')}</p>;
}

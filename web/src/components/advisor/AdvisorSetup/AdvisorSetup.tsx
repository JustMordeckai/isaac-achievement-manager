import type { AdvisorStatus } from '@shared/types.ts';
import { ProgressBar } from '@/components/common/ProgressBar/ProgressBar.tsx';
import { useT } from '@/i18n.tsx';
import type { AdvisorSetupHook } from '@/hooks/useAdvisorSetup.ts';

export interface AdvisorSetupProps {
  setup: AdvisorSetupHook;
  /** Advisor state, so the card only offers what is actually missing. */
  status: AdvisorStatus | null;
}

const MEGABYTE = 1024 * 1024;

/**
 * What a reader who has never run a model needs: install Ollama, then download one model. The card
 * shows nothing once the advisor answers, and every step says what it is doing while it runs.
 */
export function AdvisorSetup({ setup, status }: AdvisorSetupProps) {
  const t = useT();
  const { state, job } = setup;
  const ready = status?.state === 'ok';
  // Once the advisor answers there is nothing left to set up: only a running job keeps the card.
  if (!state || (ready && job.kind !== 'running')) return null;

  const model = state.recommended;
  const running = job.kind === 'running';
  return (
    <div className="setup">
      <h3>{t('setup.title')}</h3>
      <p>{t('setup.intro')}</p>
      <p>{state.installed ? t('setup.installedState') : t('setup.notInstalled')}</p>
      {!state.installed && (
        <p>
          <button type="button" className="btn btn--primary" onClick={setup.install} disabled={running || !state.canInstall}>
            {t('setup.installButton')}
          </button>
          {!state.canInstall && <span className="hint"> {t('setup.wingetMissing')}</span>}
        </p>
      )}
      {state.installed && !ready && (
        <>
          <p className="hint">
            {state.vramGb === null ? t('setup.vramUnknown') : t('setup.vram', { vram: state.vramGb })}{' '}
            {t('setup.recommended', { model: state.recommended })}
          </p>
          <p>
            <button type="button" className="btn btn--primary" onClick={() => setup.pull(model)} disabled={running}>
              {t('setup.pullButton', { model })}
            </button>
          </p>
        </>
      )}
      {running && (
        <p role="status" className="setup__progress">
          {job.message}
          {job.total !== undefined && job.total > 0 && (
            <>
              {' '}
              {t('setup.bytes', {
                done: Math.round((job.done ?? 0) / MEGABYTE),
                total: Math.round(job.total / MEGABYTE),
              })}
              <ProgressBar value={job.done ?? 0} max={job.total} />
            </>
          )}
        </p>
      )}
      {job.kind === 'done' && <p role="status">{job.message}</p>}
      {job.kind === 'failed' && (
        <p className="banner banner--error" role="alert">
          {job.message}
        </p>
      )}
    </div>
  );
}

import { useT } from '../i18n.tsx';
import type { UpdateHook } from '../useUpdate.ts';
import { ProgressBar } from './ProgressBar.tsx';

export interface UpdateBannerProps {
  update: UpdateHook;
}

const MEGABYTE = 1024 * 1024;

/**
 * One line above the pages when a newer version is out: one button downloads it and puts it in
 * place, a second one restarts the app on it. Nothing shows while the app is the latest version, or
 * while the check has not answered. A copy running from its sources is told to pull instead.
 */
export function UpdateBanner({ update }: UpdateBannerProps) {
  const t = useT();
  const { state, job } = update;
  const busy = job.kind === 'running' || job.kind === 'restarting';
  if (!state || (!state.newer && !busy && job.kind !== 'done')) return null;

  return (
    <div className="update" role="status">
      <span className="update__text">
        {job.kind === 'done' ? job.message : t('update.available', { version: state.latest })}
      </span>
      {job.kind === 'idle' && state.downloadable && (
        <button type="button" className="btn btn--primary" onClick={update.install}>
          {t('update.install')}
        </button>
      )}
      {job.kind === 'idle' && !state.downloadable && (
        <>
          <span className="hint">{state.standalone ? t('update.noAsset') : t('update.fromSources')}</span>
          <a className="update__link" href={state.page} target="_blank" rel="noreferrer">
            {t('update.releasePage')}
          </a>
        </>
      )}
      {job.kind === 'running' && (
        <span className="update__progress">
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
        </span>
      )}
      {job.kind === 'done' && (
        <button type="button" className="btn btn--primary" onClick={update.restart}>
          {t('update.restart')}
        </button>
      )}
      {job.kind === 'restarting' && <span className="update__text">{t('update.restarting')}</span>}
      {job.kind === 'failed' && (
        <span className="banner banner--error" role="alert">
          {job.message}
        </span>
      )}
    </div>
  );
}

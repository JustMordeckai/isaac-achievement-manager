import { APP_VERSION } from '@shared/version.ts';
import { useT } from '@/i18n.tsx';
import type { UpdateHook } from '@/hooks/useUpdate.ts';

export interface UpdateCardProps {
  update: UpdateHook;
}

/** Version of the app, and where it stands against the latest release. */
export function UpdateCard({ update }: UpdateCardProps) {
  const t = useT();
  const { state, job, checking } = update;
  return (
    <section className="card" aria-labelledby="update-title">
      <h2 id="update-title">{t('update.title')}</h2>
      <p>{t('update.current', { version: state?.current ?? APP_VERSION })}</p>
      {state && <p role="status">{state.newer ? t('update.available', { version: state.latest }) : t('update.upToDate')}</p>}
      <button type="button" className="btn" onClick={update.check} disabled={checking || job.kind === 'running'}>
        {checking ? t('update.checking') : t('update.check')}
      </button>
      {state?.newer && <p className="hint">{state.downloadable ? t('settings.updateHint') : t('update.fromSources')}</p>}
    </section>
  );
}

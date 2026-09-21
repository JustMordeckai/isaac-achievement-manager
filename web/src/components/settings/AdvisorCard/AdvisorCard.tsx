import { AdvisorSetup } from '@/components/advisor/AdvisorSetup/AdvisorSetup.tsx';
import { AdvisorStatusText } from '@/components/settings/AdvisorStatusText/AdvisorStatusText.tsx';
import { useLocale, useT } from '@/i18n.tsx';
import { formatTime } from '@/lib/labels.ts';
import type { AdvisorStatusState } from '@/hooks/useAdvisorStatus.ts';
import { useAdvisorForm } from './useAdvisorForm.ts';

export interface AdvisorCardProps {
  advisor: AdvisorStatusState;
}

/** Address of the Ollama server and model, saved to data/settings.json with no restart. */
export function AdvisorCard({ advisor }: AdvisorCardProps) {
  const t = useT();
  const locale = useLocale();
  const { status } = advisor;
  const form = useAdvisorForm(advisor);
  const models = status?.models ?? [];

  return (
    <section className="card" aria-labelledby="advisor-settings-title">
      <h2 id="advisor-settings-title">{t('settings.advisorTitle')}</h2>
      <AdvisorStatusText status={status} />
      <AdvisorSetup setup={form.setup} status={status} />
      <form className="settings-form" onSubmit={form.save}>
        <label className="field">
          <span>{t('settings.ollamaUrl')}</span>
          <input type="url" required value={form.url} onChange={(e) => form.setUrl(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('settings.model')}</span>
          <input required list="ollama-models" value={form.model} onChange={(e) => form.setModel(e.target.value)} />
        </label>
        <datalist id="ollama-models">
          {models.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="settings-form__actions">
          <button type="submit" className="btn btn--primary" disabled={form.saving}>
            {form.saving ? t('settings.saving') : t('settings.saveButton')}
          </button>
          <button type="button" className="btn" onClick={advisor.recheck} disabled={advisor.checking}>
            {advisor.checking ? t('settings.checking') : t('settings.checkConnection')}
          </button>
        </div>
        {/* A check of a server that answers changes nothing on screen: the time says it ran. */}
        {advisor.checkedAt !== null && (
          <p className="hint" role="status">
            {t('settings.lastCheck', { time: formatTime(locale, advisor.checkedAt) })}
          </p>
        )}
        {form.saved && <p role="status">{t('settings.saved')}</p>}
        {form.error && (
          <p className="banner banner--error" role="alert">
            {t('settings.saveFailed', { message: form.error })}
          </p>
        )}
      </form>
      <p className="hint">
        {models.length > 0 ? t('settings.installedModels', { models: models.join(', ') }) : t('settings.installedModelsUnknown')}{' '}
        {t('settings.advisorHint')}
      </p>
    </section>
  );
}

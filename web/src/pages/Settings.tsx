import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { AdvisorStatus, KbStatus, SettingsInfo, WikiSyncReport } from '../../../shared/types.ts';
import { APP_VERSION } from '../../../shared/version.ts';
import { api } from '../api.ts';
import { AdvisorSetup } from '../components/AdvisorSetup.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { LanguagePicker, useLocale, useT } from '../i18n.tsx';
import { formatDate, formatTime } from '../labels.ts';
import type { AdvisorStatusState } from '../useAdvisor.ts';
import { useAdvisorSetup } from '../useAdvisorSetup.ts';
import type { UpdateHook } from '../useUpdate.ts';
import type { SettingsState, WikiSyncState } from '../useWiki.ts';

type Translate = ReturnType<typeof useT>;

export interface SettingsProps {
  settings: SettingsState;
  kb: KbStatus | null;
  sync: WikiSyncState;
  onSync(): void;
  advisor: AdvisorStatusState;
  update: UpdateHook;
}

/** Version of the app, and where it stands against the latest release. */
function UpdateSettings({ update }: { update: UpdateHook }) {
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

function accountText(t: Translate, { account, forcedAccountId }: SettingsInfo): string {
  if (!account) {
    return forcedAccountId !== null
      ? t('settings.accountForcedMissing', { id: forcedAccountId })
      : t('settings.accountNone');
  }
  const name = t('settings.accountNamed', {
    name: account.personaName ?? t('settings.accountNumbered', { id: account.accountId }),
    id: account.steamId64,
  });
  return forcedAccountId !== null ? t('settings.accountForced', { account: name }) : name;
}

function KbSummary({ kb }: { kb: KbStatus | null }) {
  const locale = useLocale();
  const t = useT();
  if (!kb) return <p className="placeholder">{t('settings.kbLoading')}</p>;
  if (kb.state === 'ok') {
    return (
      <>
        <p>{t('settings.kbSyncedOn', { date: kb.syncedAt ? formatDate(locale, kb.syncedAt) : t('settings.kbUnknownDate') })}</p>
        {kb.message && <p className="banner banner--warn">{kb.message}</p>}
      </>
    );
  }
  if (kb.state === 'absent') {
    return (
      <>
        <p>{t('settings.kbAbsent')}</p>
        {kb.message && <p className="banner banner--warn">{kb.message}</p>}
      </>
    );
  }
  return <p className="banner banner--error">{kb.message ?? t('settings.kbUnusable')}</p>;
}

function Report({ report }: { report: WikiSyncReport }) {
  const t = useT();
  const unknown = Object.entries(report.unknownTemplates);
  return (
    <div className="sync-report">
      <p role="status">{t('settings.syncDone')}</p>
      <dl className="info-list">
        <dt>{t('settings.reportAchievements')}</dt>
        <dd>{report.achievements}</dd>
        <dt>{t('settings.reportPages')}</dt>
        <dd>{report.pages}</dd>
        <dt>{t('settings.reportCached')}</dt>
        <dd>
          {report.cachedPages === 0
            ? t('settings.reportCachedNone')
            : t('settings.reportCachedCount', { count: report.cachedPages })}
        </dd>
        <dt>{t('settings.reportUnclassified')}</dt>
        <dd>{t('settings.reportUnclassifiedCount', { conditions: report.miscCount, unlocks: report.otherUnlockCount })}</dd>
      </dl>
      {report.missingPages.length > 0 && (
        <details>
          <summary>{t('settings.reportMissingPages', { count: report.missingPages.length })}</summary>
          <p lang="en">{report.missingPages.join(', ')}</p>
        </details>
      )}
      {unknown.length > 0 && (
        <details>
          <summary>{t('settings.reportUnknownTemplates', { count: unknown.length })}</summary>
          <p lang="en">{unknown.map(([name, count]) => `${name} (${count})`).join(', ')}</p>
        </details>
      )}
    </div>
  );
}

function SyncProgress({ sync }: { sync: WikiSyncState }) {
  const t = useT();
  if (sync.kind === 'running') {
    const event = sync.event;
    return (
      <div className="sync-progress">
        <p aria-live="polite">{event?.message ?? t('settings.connectingToWiki')}</p>
        {event?.step === 'pages' && event.total > 0 && (
          <ProgressBar value={event.done} max={event.total} label={t('settings.pagesDownloaded')} />
        )}
      </div>
    );
  }
  if (sync.kind === 'done') return <Report report={sync.report} />;
  if (sync.kind === 'failed') {
    return (
      <p className="banner banner--error" role="alert">
        {t('settings.syncFailed', { message: sync.message })}
      </p>
    );
  }
  return null;
}

function AdvisorStatusText({ status }: { status: AdvisorStatus | null }) {
  const t = useT();
  if (!status) return <p className="placeholder">{t('settings.advisorChecking')}</p>;
  if (status.state === 'ok') return <p>{t('settings.advisorOk', { model: status.model })}</p>;
  return <p className="banner banner--error">{status.message ?? t('settings.advisorUnavailable')}</p>;
}

/** Address of the Ollama server and model, saved to data/settings.json with no restart. */
function AdvisorSettings({ advisor }: { advisor: AdvisorStatusState }) {
  const t = useT();
  const locale = useLocale();
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
    (job: 'install' | 'pull', model: string) => {
      if (job !== 'pull') {
        advisor.recheck();
        return;
      }
      setModel(model);
      void api
        .saveAdvisorSettings({ url: status?.url ?? url, model })
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
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  }

  const models = status?.models ?? [];
  return (
    <section className="card" aria-labelledby="advisor-settings-title">
      <h2 id="advisor-settings-title">{t('settings.advisorTitle')}</h2>
      <AdvisorStatusText status={status} />
      <AdvisorSetup setup={setup} status={status} />
      <form className="settings-form" onSubmit={save}>
        <label className="field">
          <span>{t('settings.ollamaUrl')}</span>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => {
              typed.current.url = true;
              setUrl(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>{t('settings.model')}</span>
          <input
            required
            list="ollama-models"
            value={model}
            onChange={(e) => {
              typed.current.model = true;
              setModel(e.target.value);
            }}
          />
        </label>
        <datalist id="ollama-models">
          {models.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="settings-form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('settings.saving') : t('settings.saveButton')}
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
        {saved && <p role="status">{t('settings.saved')}</p>}
        {error && (
          <p className="banner banner--error" role="alert">
            {t('settings.saveFailed', { message: error })}
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

export function Settings({ settings, kb, sync, onSync, advisor, update }: SettingsProps) {
  const t = useT();
  const running = sync.kind === 'running' || kb?.running === true;
  return (
    <div className="settings">
      <section className="card" aria-labelledby="kb-title">
        <h2 id="kb-title">{t('settings.wikiTitle')}</h2>
        <KbSummary kb={kb} />
        <p className="hint">
          {t('settings.syncHint')}
        </p>
        <button type="button" className="btn btn--primary" onClick={onSync} disabled={running}>
          {running ? t('settings.syncing') : t('settings.sync')}
        </button>
        <SyncProgress sync={sync} />
      </section>

      <AdvisorSettings advisor={advisor} />

      <section className="card" aria-labelledby="app-title">
        <h2 id="app-title">{t('settings.appTitle')}</h2>
        {settings.status === 'loading' && <p className="placeholder">{t('settings.loading')}</p>}
        {settings.status === 'error' && (
          <p className="banner banner--error" role="alert">
            {t('settings.unavailable', { message: settings.message })}
          </p>
        )}
        {settings.status === 'ready' && (
          <>
            <dl className="info-list">
              <dt>{t('settings.steamFolder')}</dt>
              <dd>{settings.info.steamPath ?? t('settings.steamNotFound')}</dd>
              <dt>{t('settings.account')}</dt>
              <dd>{accountText(t, settings.info)}</dd>
              <dt>{t('settings.address')}</dt>
              <dd>http://127.0.0.1:{settings.info.port}/</dd>
              <dt>{t('settings.dataFolder')}</dt>
              <dd>{settings.info.dataDir}</dd>
            </dl>
            <p className="hint">
              {t('settings.appHint')}
            </p>
          </>
        )}
      </section>

      <UpdateSettings update={update} />

      <section className="card" aria-labelledby="language-title">
        <h2 id="language-title">{t('app.language')}</h2>
        <LanguagePicker hint />
      </section>
    </div>
  );
}

import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { AdvisorStatus, KbStatus, SettingsInfo, WikiSyncReport } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { LanguagePicker, useT } from '../i18n.tsx';
import { formatDate } from '../labels.ts';
import type { AdvisorStatusState } from '../useAdvisor.ts';
import type { SettingsState, WikiSyncState } from '../useWiki.ts';

export interface SettingsProps {
  settings: SettingsState;
  kb: KbStatus | null;
  sync: WikiSyncState;
  onSync(): void;
  advisor: AdvisorStatusState;
}

function accountText({ account, forcedAccountId }: SettingsInfo): string {
  if (!account) {
    return forcedAccountId !== null
      ? `compte ${forcedAccountId} imposé par data/settings.json, introuvable sur ce PC`
      : 'aucun compte local avec des données Isaac';
  }
  const name = `${account.personaName ?? `compte ${account.accountId}`} (${account.steamId64})`;
  return forcedAccountId !== null ? `${name}, imposé par data/settings.json` : name;
}

function KbSummary({ kb }: { kb: KbStatus | null }) {
  if (!kb) return <p className="placeholder">Lecture de l'état de la base…</p>;
  if (kb.state === 'ok') {
    return (
      <>
        <p>Base synchronisée le {kb.syncedAt ? formatDate(kb.syncedAt) : 'date inconnue'}.</p>
        {kb.message && <p className="banner banner--warn">{kb.message}</p>}
      </>
    );
  }
  if (kb.state === 'absent') {
    return (
      <>
        <p>La base n'est pas encore téléchargée : fiches, méthodes d'obtention et filtres par personnage restent vides.</p>
        {kb.message && <p className="banner banner--warn">{kb.message}</p>}
      </>
    );
  }
  return <p className="banner banner--error">{kb.message ?? 'Base wiki inutilisable.'}</p>;
}

function Report({ report }: { report: WikiSyncReport }) {
  const unknown = Object.entries(report.unknownTemplates);
  return (
    <div className="sync-report">
      <p role="status">Synchro terminée.</p>
      <dl className="info-list">
        <dt>Succès</dt>
        <dd>{report.achievements}</dd>
        <dt>Pages analysées</dt>
        <dd>{report.pages}</dd>
        <dt>Pages reprises du cache</dt>
        <dd>{report.cachedPages === 0 ? 'aucune' : `${report.cachedPages} (wiki injoignable pour ces pages)`}</dd>
        <dt>Non classés</dt>
        <dd>
          {report.miscCount} conditions et {report.otherUnlockCount} déblocages
        </dd>
      </dl>
      {report.missingPages.length > 0 && (
        <details>
          <summary>{report.missingPages.length} pages liées absentes du wiki</summary>
          <p lang="en">{report.missingPages.join(', ')}</p>
        </details>
      )}
      {unknown.length > 0 && (
        <details>
          <summary>{unknown.length} modèles du wiki non reconnus</summary>
          <p lang="en">{unknown.map(([name, count]) => `${name} (${count})`).join(', ')}</p>
        </details>
      )}
    </div>
  );
}

function SyncProgress({ sync }: { sync: WikiSyncState }) {
  if (sync.kind === 'running') {
    const event = sync.event;
    return (
      <div className="sync-progress">
        <p aria-live="polite">{event?.message ?? 'Connexion au wiki…'}</p>
        {event?.step === 'pages' && event.total > 0 && (
          <ProgressBar value={event.done} max={event.total} label="Pages téléchargées" />
        )}
      </div>
    );
  }
  if (sync.kind === 'done') return <Report report={sync.report} />;
  if (sync.kind === 'failed') {
    return (
      <p className="banner banner--error" role="alert">
        Synchro échouée : {sync.message}
      </p>
    );
  }
  return null;
}

function AdvisorStatusText({ status }: { status: AdvisorStatus | null }) {
  if (!status) return <p className="placeholder">Vérification du serveur Ollama…</p>;
  if (status.state === 'ok') return <p>Serveur joignable, modèle {status.model} installé.</p>;
  return <p className="banner banner--error">{status.message ?? 'Serveur Ollama indisponible.'}</p>;
}

/** Adresse du serveur Ollama et modèle, enregistrés dans data/settings.json sans redémarrage. */
function AdvisorSettings({ advisor }: { advisor: AdvisorStatusState }) {
  const { status } = advisor;
  const [url, setUrl] = useState(status?.url ?? '');
  const [model, setModel] = useState(status?.model ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const filled = useRef(status !== null);
  const typed = useRef({ url: false, model: false });

  useEffect(() => {
    // Première arrivée de l'état (jusqu'à 3 s sur un serveur injoignable) : les champs que
    // l'utilisateur n'a pas touchés partent des réglages lus sur le serveur.
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
      <h2 id="advisor-settings-title">Conseiller IA</h2>
      <AdvisorStatusText status={status} />
      <form className="settings-form" onSubmit={save}>
        <label className="field">
          <span>Adresse du serveur Ollama</span>
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
          <span>Modèle</span>
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
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button type="button" className="btn" onClick={advisor.recheck} disabled={advisor.checking}>
            {advisor.checking ? 'Vérification…' : 'Vérifier la connexion'}
          </button>
        </div>
        {saved && <p role="status">Réglages enregistrés.</p>}
        {error && (
          <p className="banner banner--error" role="alert">
            Enregistrement impossible : {error}
          </p>
        )}
      </form>
      <p className="hint">
        {models.length > 0 ? `Modèles installés : ${models.join(', ')}.` : 'Modèles installés : inconnus.'} Les
        réglages sont écrits dans data/settings.json et s'appliquent tout de suite.
      </p>
    </section>
  );
}

export function Settings({ settings, kb, sync, onSync, advisor }: SettingsProps) {
  const t = useT();
  const running = sync.kind === 'running' || kb?.running === true;
  return (
    <div className="settings">
      <section className="card" aria-labelledby="kb-title">
        <h2 id="kb-title">Base wiki</h2>
        <KbSummary kb={kb} />
        <p className="hint">
          La synchro télécharge environ 600 pages du wiki anglais (une vingtaine de secondes) et garde une copie pour
          les coupures réseau.
        </p>
        <button type="button" className="btn btn--primary" onClick={onSync} disabled={running}>
          {running ? 'Synchro en cours…' : 'Synchroniser le wiki'}
        </button>
        <SyncProgress sync={sync} />
      </section>

      <AdvisorSettings advisor={advisor} />

      <section className="card" aria-labelledby="app-title">
        <h2 id="app-title">Steam et application</h2>
        {settings.status === 'loading' && <p className="placeholder">Lecture des réglages…</p>}
        {settings.status === 'error' && (
          <p className="banner banner--error" role="alert">
            Réglages indisponibles : {settings.message}
          </p>
        )}
        {settings.status === 'ready' && (
          <>
            <dl className="info-list">
              <dt>Dossier Steam</dt>
              <dd>{settings.info.steamPath ?? 'introuvable'}</dd>
              <dt>Compte utilisé</dt>
              <dd>{accountText(settings.info)}</dd>
              <dt>Adresse</dt>
              <dd>http://127.0.0.1:{settings.info.port}/</dd>
              <dt>Dossier des données</dt>
              <dd>{settings.info.dataDir}</dd>
            </dl>
            <p className="hint">
              Pour changer le port ou imposer un compte Steam, modifie les champs port ou accountId de
              data/settings.json, puis relance l'application.
            </p>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="language-title">
        <h2 id="language-title">{t('app.language')}</h2>
        <LanguagePicker hint />
      </section>
    </div>
  );
}

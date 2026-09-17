import type { KbStatus, SettingsInfo, WikiSyncReport } from '../../../shared/types.ts';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { formatDate } from '../labels.ts';
import type { SettingsState, WikiSyncState } from '../useWiki.ts';

export interface SettingsProps {
  settings: SettingsState;
  kb: KbStatus | null;
  sync: WikiSyncState;
  onSync(): void;
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

export function Settings({ settings, kb, sync, onSync }: SettingsProps) {
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
    </div>
  );
}

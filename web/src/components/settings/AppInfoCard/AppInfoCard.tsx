import type { SettingsInfo } from '@shared/types.ts';
import { useT } from '@/i18n.tsx';
import type { SettingsState } from '@/hooks/useSettings.ts';

export interface AppInfoCardProps {
  settings: SettingsState;
}

type Translate = ReturnType<typeof useT>;

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

/** What the server found on this machine: Steam, the account it reads, and where it writes. */
export function AppInfoCard({ settings }: AppInfoCardProps) {
  const t = useT();
  return (
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
          <p className="hint">{t('settings.appHint')}</p>
        </>
      )}
    </section>
  );
}

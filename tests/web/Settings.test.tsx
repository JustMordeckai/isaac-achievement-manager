import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { KbStatus, WikiSyncReport } from '../../shared/types.ts';
import { Settings, type SettingsProps } from '../../web/src/pages/Settings.tsx';
import { KB_ABSENT, KB_OK, SETTINGS } from './factories.ts';

const REPORT: WikiSyncReport = {
  achievements: 641,
  pages: 518,
  missingPages: ['1001%', 'Basement Boy'],
  unknownTemplates: { 'repentance babies': 6 },
  miscCount: 108,
  otherUnlockCount: 61,
  cachedPages: 0,
};

function renderSettings(overrides: Partial<SettingsProps> = {}) {
  const props: SettingsProps = {
    settings: { status: 'ready', info: SETTINGS },
    kb: KB_OK,
    sync: { kind: 'idle' },
    onSync: vi.fn(),
    ...overrides,
  };
  const view = render(<Settings {...props} />);
  return { ...view, props };
}

const kbSection = () => screen.getByRole('region', { name: 'Base wiki' });

describe('Settings', () => {
  it('affiche l’état de la base et lance la synchro', async () => {
    const user = userEvent.setup();
    const { props } = renderSettings();
    // L'heure dépend du fuseau de la machine : seule la date est figée.
    expect(within(kbSection()).getByText(/^Base synchronisée le 17 sept\. 2026, \d{2}:\d{2}\.$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Synchroniser le wiki' }));
    expect(props.onSync).toHaveBeenCalledTimes(1);
  });

  it('explique une base absente et signale le dernier échec', () => {
    const kb: KbStatus = { ...KB_ABSENT, message: 'Dernière synchro échouée : wiki injoignable' };
    renderSettings({ kb });
    expect(within(kbSection()).getByText(/pas encore téléchargée/)).toBeInTheDocument();
    expect(within(kbSection()).getByText('Dernière synchro échouée : wiki injoignable')).toBeInTheDocument();
  });

  it('affiche une base illisible', () => {
    renderSettings({ kb: { state: 'error', syncedAt: null, running: false, message: 'Base wiki illisible : JSON invalide' } });
    expect(within(kbSection()).getByText('Base wiki illisible : JSON invalide')).toBeInTheDocument();
  });

  it('suit l’avancement et bloque le bouton pendant la synchro', () => {
    const { rerender, props } = renderSettings({ sync: { kind: 'running', event: null } });
    expect(screen.getByRole('button', { name: 'Synchro en cours…' })).toBeDisabled();
    expect(screen.getByText('Connexion au wiki…')).toBeInTheDocument();
    rerender(<Settings {...props} sync={{ kind: 'running', event: { step: 'pages', done: 3, total: 12, message: 'Lot 3 sur 12' } }} />);
    expect(screen.getByText('Lot 3 sur 12')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Pages téléchargées' })).toHaveAttribute('aria-valuenow', '3');
    rerender(<Settings {...props} sync={{ kind: 'idle' }} kb={{ ...KB_OK, running: true }} />);
    expect(screen.getByRole('button', { name: 'Synchro en cours…' })).toBeDisabled();
  });

  it('résume le rapport de synchro', () => {
    renderSettings({ sync: { kind: 'done', report: REPORT } });
    expect(screen.getByRole('status')).toHaveTextContent('Synchro terminée.');
    const report = within(kbSection());
    expect(report.getByText('Pages analysées').nextElementSibling).toHaveTextContent('518');
    expect(report.getByText('Pages reprises du cache').nextElementSibling).toHaveTextContent('aucune');
    expect(report.getByText('Non classés').nextElementSibling).toHaveTextContent('108 conditions et 61 déblocages');
    expect(report.getByText('2 pages liées absentes du wiki')).toBeInTheDocument();
    expect(report.getByText('1001%, Basement Boy')).toBeInTheDocument();
    expect(report.getByText('repentance babies (6)')).toBeInTheDocument();
  });

  it('affiche l’échec de la synchro', () => {
    renderSettings({ sync: { kind: 'failed', message: 'Une synchro du wiki est déjà en cours' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Synchro échouée : Une synchro du wiki est déjà en cours');
    expect(screen.getByRole('button', { name: 'Synchroniser le wiki' })).toBeEnabled();
  });

  it('liste les réglages détectés en lecture seule', () => {
    renderSettings();
    const app = within(screen.getByRole('region', { name: 'Steam et application' }));
    expect(app.getByText('Dossier Steam').nextElementSibling).toHaveTextContent('c:\\program files (x86)\\steam');
    expect(app.getByText('Compte utilisé').nextElementSibling).toHaveTextContent('Player (76561198083722517)');
    expect(app.getByText('Adresse').nextElementSibling).toHaveTextContent('http://127.0.0.1:5250/');
    expect(app.getByText('Dossier des données').nextElementSibling).toHaveTextContent('C:\\isaac\\data');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('précise un compte imposé, introuvable ou absent', () => {
    const { rerender, props } = renderSettings({ settings: { status: 'ready', info: { ...SETTINGS, forcedAccountId: 123456789 } } });
    const account = () => screen.getByText('Compte utilisé').nextElementSibling;
    expect(account()).toHaveTextContent('Player (76561198083722517), imposé par data/settings.json');
    rerender(<Settings {...props} settings={{ status: 'ready', info: { ...SETTINGS, account: null, forcedAccountId: 123 } }} />);
    expect(account()).toHaveTextContent('compte 123 imposé par data/settings.json, introuvable sur ce PC');
    rerender(<Settings {...props} settings={{ status: 'ready', info: { ...SETTINGS, account: null, steamPath: null } }} />);
    expect(account()).toHaveTextContent('aucun compte local avec des données Isaac');
    expect(screen.getByText('Dossier Steam').nextElementSibling).toHaveTextContent('introuvable');
  });

  it('affiche le chargement et l’erreur des réglages', () => {
    const { rerender, props } = renderSettings({ settings: { status: 'loading' }, kb: null });
    expect(screen.getByText('Lecture des réglages…')).toBeInTheDocument();
    expect(screen.getByText("Lecture de l'état de la base…")).toBeInTheDocument();
    rerender(<Settings {...props} settings={{ status: 'error', message: 'Erreur HTTP 500' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Réglages indisponibles : Erreur HTTP 500');
  });
});

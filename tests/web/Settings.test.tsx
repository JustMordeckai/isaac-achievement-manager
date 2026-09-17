import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { KbStatus, WikiSyncReport } from '../../shared/types.ts';
import { Settings, type SettingsProps } from '../../web/src/pages/Settings.tsx';
import { ADVISOR_OFFLINE, ADVISOR_OK, KB_ABSENT, KB_OK, makeAdvisorState, SETTINGS } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

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
    advisor: makeAdvisorState(),
    ...overrides,
  };
  const view = render(<Settings {...props} />);
  return { ...view, props };
}

const kbSection = () => screen.getByRole('region', { name: 'Base wiki' });
const advisorSection = () => within(screen.getByRole('region', { name: 'Conseiller IA' }));

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
    expect(report.getByText('repentance babies (6)')).toHaveAttribute('lang', 'en');
  });

  it('affiche l’échec de la synchro', () => {
    renderSettings({ sync: { kind: 'failed', message: 'Une synchro du wiki est déjà en cours' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Synchro échouée : Une synchro du wiki est déjà en cours');
    expect(screen.getByRole('button', { name: 'Synchroniser le wiki' })).toBeEnabled();
  });

  it('liste les réglages détectés en lecture seule', () => {
    renderSettings();
    const app = within(screen.getByRole('region', { name: 'Steam et application' }));
    expect(app.queryByRole('textbox')).not.toBeInTheDocument();
    expect(app.getByText('Dossier Steam').nextElementSibling).toHaveTextContent('c:\\program files (x86)\\steam');
    expect(app.getByText('Compte utilisé').nextElementSibling).toHaveTextContent('Player (76561198083722517)');
    expect(app.getByText('Adresse').nextElementSibling).toHaveTextContent('http://127.0.0.1:5250/');
    expect(app.getByText('Dossier des données').nextElementSibling).toHaveTextContent('C:\\isaac\\data');
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

describe('Settings : conseiller', () => {
  it('montre l’état du serveur et les réglages en cours', () => {
    renderSettings();
    const section = advisorSection();
    expect(section.getByText('Serveur joignable, modèle qwen3.5:9b installé.')).toBeInTheDocument();
    expect(section.getByLabelText('Adresse du serveur Ollama')).toHaveValue('http://127.0.0.1:11434');
    expect(section.getByLabelText('Modèle')).toHaveValue('qwen3.5:9b');
    expect(section.getByText(/^Modèles installés : qwen3\.5:4b, qwen3\.5:9b\./)).toBeInTheDocument();
    const options = [...document.querySelectorAll('#ollama-models option')].map((o) => o.getAttribute('value'));
    expect(options).toEqual(['qwen3.5:4b', 'qwen3.5:9b']);
  });

  it('signale un serveur injoignable et relance la vérification', async () => {
    const user = userEvent.setup();
    const advisor = makeAdvisorState(ADVISOR_OFFLINE);
    const { rerender, props } = renderSettings({ advisor });
    const section = advisorSection();
    expect(section.getByText('Ollama injoignable sur http://127.0.0.1:11434 (ECONNREFUSED)')).toHaveClass('banner--error');
    expect(section.getByText(/^Modèles installés : inconnus\./)).toBeInTheDocument();
    await user.click(section.getByRole('button', { name: 'Vérifier la connexion' }));
    expect(advisor.recheck).toHaveBeenCalled();
    rerender(<Settings {...props} advisor={makeAdvisorState(ADVISOR_OFFLINE, true)} />);
    expect(advisorSection().getByRole('button', { name: 'Vérification…' })).toBeDisabled();
  });

  it('remplit les champs quand l’état arrive', () => {
    const { rerender, props } = renderSettings({ advisor: makeAdvisorState(null) });
    expect(advisorSection().getByText('Vérification du serveur Ollama…')).toBeInTheDocument();
    expect(advisorSection().getByLabelText('Modèle')).toHaveValue('');
    rerender(<Settings {...props} advisor={makeAdvisorState()} />);
    expect(advisorSection().getByLabelText('Modèle')).toHaveValue('qwen3.5:9b');
  });

  it('enregistre l’adresse et le modèle', async () => {
    const user = userEvent.setup();
    const saved = { ...ADVISOR_OK, url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' };
    const mock = stubFetch({ 'POST /api/advisor/settings': () => saved });
    const advisor = makeAdvisorState();
    renderSettings({ advisor });
    const section = advisorSection();
    await user.clear(section.getByLabelText('Adresse du serveur Ollama'));
    await user.type(section.getByLabelText('Adresse du serveur Ollama'), 'http://10.0.0.5:11434/');
    await user.clear(section.getByLabelText('Modèle'));
    await user.type(section.getByLabelText('Modèle'), 'qwen3.5:4b');
    await user.click(section.getByRole('button', { name: 'Enregistrer' }));
    expect(await section.findByRole('status')).toHaveTextContent('Réglages enregistrés.');
    const [, init] = mock.mock.calls[0];
    expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('advisor-settings');
    expect(JSON.parse(String(init?.body))).toEqual({ url: 'http://10.0.0.5:11434/', model: 'qwen3.5:4b' });
    expect(advisor.replace).toHaveBeenCalledWith(saved);
    expect(section.getByLabelText('Adresse du serveur Ollama')).toHaveValue('http://10.0.0.5:11434');
  });

  it('affiche le refus du serveur', async () => {
    const user = userEvent.setup();
    let reply: (response: Response) => void = () => {};
    stubFetch({ 'POST /api/advisor/settings': () => new Promise<Response>((resolve) => (reply = resolve)) });
    const advisor = makeAdvisorState();
    renderSettings({ advisor });
    const section = advisorSection();
    await user.click(section.getByRole('button', { name: 'Enregistrer' }));
    expect(section.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();
    await act(async () => reply(jsonResponse({ error: 'Adresse Ollama invalide (attendu : http://hôte:port)' }, 400)));
    expect(await section.findByRole('alert')).toHaveTextContent(
      'Enregistrement impossible : Adresse Ollama invalide (attendu : http://hôte:port)',
    );
    expect(advisor.replace).not.toHaveBeenCalled();
    expect(section.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });
});

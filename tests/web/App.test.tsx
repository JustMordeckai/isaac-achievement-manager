import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../web/src/App.tsx';
import { LOCALE_STORAGE_KEY } from '../../web/src/i18n.tsx';
import type { AdvisorEvent, WikiSyncEvent } from '../../shared/types.ts';
import {
  ADVISOR_OFFLINE,
  ADVISOR_OK,
  KB_ABSENT,
  KB_OK,
  makeAchievement,
  makeCard,
  makeSummary,
  ROUTES_OK,
  SETTINGS,
} from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

const ACHIEVEMENTS = [
  makeAchievement(1, { name: 'Magdalene', unlocked: true, unlockedAt: '2023-02-20T20:15:25.000Z', inSave: true }),
  makeAchievement(2, { name: 'Cain' }),
  makeAchievement(638, { name: 'Play Online', dlc: 'repentance', inSave: true }),
];

const BASE_ROUTES = {
  'GET /api/progress': () => makeSummary(),
  'GET /api/achievements': () => ACHIEVEMENTS,
  'GET /api/wiki/status': () => KB_OK,
  'GET /api/settings': () => SETTINGS,
  'GET /api/achievement/2': () => makeCard({ achievement: ACHIEVEMENTS[1] }),
  'GET /api/achievement/45': () => makeCard({ achievement: makeAchievement(45, { name: 'Guardian Angel' }) }),
  'GET /api/routes': () => ROUTES_OK,
  'GET /api/advisor/status': () => ADVISOR_OK,
};

function stubProgress(routes: Parameters<typeof stubFetch>[0] = {}) {
  return stubFetch({ ...BASE_ROUTES, ...routes });
}

const callsTo = (mock: ReturnType<typeof stubFetch>, prefix: string) =>
  mock.mock.calls.filter(([input]) => String(input).startsWith(prefix)).length;

const progressCalls = (mock: ReturnType<typeof stubFetch>) => callsTo(mock, '/api/progress');

describe('App', () => {
  it('affiche le tableau de bord puis les succès manquants', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    expect(screen.getByText('Chargement de la progression…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Progression' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voir les 516 succès manquants' }));
    expect(window.location.hash).toBe('#/succes');
    expect(screen.getByText('Cain')).toBeInTheDocument();
    expect(screen.getByText('Play Online')).toBeInTheDocument();
    expect(screen.queryByText('Magdalene')).not.toBeInTheDocument();
  });

  it('ouvre la liste filtrée sur les écarts depuis le tableau de bord', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Voir dans la liste' }));
    expect(screen.getByLabelText('Écarts sauvegarde/Steam')).toBeChecked();
    expect(screen.getByText('1 succès')).toBeInTheDocument();
  });

  it('garde les filtres en changeant d’onglet', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.click(screen.getByRole('button', { name: 'Succès' }));
    await user.type(screen.getByLabelText('Recherche'), 'cain');
    await user.click(screen.getByRole('button', { name: 'Tableau de bord' }));
    await user.click(screen.getByRole('button', { name: 'Succès' }));
    expect(screen.getByLabelText('Recherche')).toHaveValue('cain');
  });

  it('recharge les données avec Actualiser', async () => {
    const user = userEvent.setup();
    const mock = stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    expect(progressCalls(mock)).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    await vi.waitFor(() => expect(progressCalls(mock)).toBe(2));
    expect(await screen.findByRole('button', { name: 'Actualiser' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Progression' })).toBeInTheDocument();
  });

  it('ouvre les routes depuis le tableau de bord, puis une fiche depuis une run', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Voir toutes les routes' }));
    expect(window.location.hash).toBe('#/routes');
    expect(screen.getByRole('button', { name: 'Routes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Runs conseillées' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Progression' })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Guardian Angel' })[0]);
    expect(window.location.hash).toBe('#/succes/45');
    expect(await screen.findByRole('complementary', { name: 'Guardian Angel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Succès' })).toHaveAttribute('aria-current', 'page');
  });

  it('recharge aussi les routes avec Actualiser', async () => {
    const user = userEvent.setup();
    const mock = stubProgress();
    window.location.hash = '#/routes';
    render(<App />);
    await screen.findByRole('heading', { name: 'Runs conseillées' });
    expect(callsTo(mock, '/api/routes')).toBe(1);
    await user.click(await screen.findByRole('button', { name: 'Actualiser' }));
    await vi.waitFor(() => expect(callsTo(mock, '/api/routes')).toBe(2));
    expect(screen.getByRole('heading', { name: 'Runs conseillées' })).toBeInTheDocument();
  });

  it('garde Actualiser occupé tant que les routes se rechargent', async () => {
    const user = userEvent.setup();
    const pending: { release?: () => void } = {};
    let routeCalls = 0;
    const mock = stubProgress({
      'GET /api/routes': () => {
        routeCalls += 1;
        if (routeCalls === 1) return ROUTES_OK;
        return new Promise((resolve) => {
          pending.release = () => resolve(ROUTES_OK);
        });
      },
    });
    window.location.hash = '#/routes';
    render(<App />);
    await screen.findByRole('heading', { name: 'Runs conseillées' });
    await user.click(await screen.findByRole('button', { name: 'Actualiser' }));
    await vi.waitFor(() => expect(pending.release).toBeDefined());
    // La progression est relue tout de suite ; seules les routes restent en attente.
    await vi.waitFor(() => expect(progressCalls(mock)).toBe(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.getByRole('button', { name: 'Actualisation…' })).toBeDisabled();
    await act(async () => pending.release?.());
    expect(await screen.findByRole('button', { name: 'Actualiser' })).toBeEnabled();
  });

  it('recharge avec le slot choisi', async () => {
    const user = userEvent.setup();
    const mock = stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.selectOptions(screen.getByLabelText('Sauvegarde'), 'Slot 2');
    await vi.waitFor(() =>
      expect(mock.mock.calls.some(([input]) => String(input) === '/api/progress?profile=me&slot=2')).toBe(true),
    );
  });

  it('affiche une erreur et permet de réessayer', async () => {
    const user = userEvent.setup();
    let fail = true;
    stubProgress({
      'GET /api/progress': () => (fail ? jsonResponse({ error: 'Aucun compte Steam local' }, 404) : makeSummary()),
    });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Aucun compte Steam local');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('heading', { name: 'Progression' })).toBeInTheDocument();
  });

  it('change de thème et le mémorise', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Passer au thème clair' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('iam-theme')).toBe('light');
  });

  it('arrête le serveur après confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubProgress({ 'POST /api/shutdown': () => ({ ok: true }) });
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(await screen.findByRole('heading', { name: 'Serveur arrêté' })).toBeInTheDocument();
  });

  it('ne fait rien si l’arrêt est annulé', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const mock = stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(mock.mock.calls.some(([input]) => String(input) === '/api/shutdown')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Progression' })).toBeInTheDocument();
  });

  it('affiche une erreur si l’arrêt échoue et garde le tableau de bord', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubProgress({ 'POST /api/shutdown': () => jsonResponse({ error: 'non' }, 403) });
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Arrêt impossible');
    expect(screen.getByRole('heading', { name: 'Progression' })).toBeInTheDocument();
  });

  it('ouvre la fiche d’un succès puis rend le focus à la liste en la fermant', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.click(screen.getByRole('button', { name: 'Succès' }));
    const cain = screen.getByRole('button', { name: 'Cain' });
    await user.click(cain);
    expect(window.location.hash).toBe('#/succes/2');
    const panel = await screen.findByRole('complementary', { name: 'Cain' });
    expect(within(panel).getByText('Defeat Boss Rush as Azazel')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Fermer la fiche' }));
    expect(window.location.hash).toBe('#/succes');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(cain).toHaveFocus();
  });

  it('ouvre directement la fiche indiquée dans l’adresse', async () => {
    window.location.hash = '#/succes/2';
    stubProgress();
    render(<App />);
    expect(await screen.findByRole('complementary', { name: 'Cain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Succès' })).toHaveAttribute('aria-current', 'page');
  });

  it('signale une base wiki absente et mène aux paramètres', async () => {
    const user = userEvent.setup();
    stubProgress({ 'GET /api/wiki/status': () => KB_ABSENT });
    render(<App />);
    expect(await screen.findByText(/^Base wiki absente/)).toBeInTheDocument();
    expect(screen.getByText('Wiki: missing')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ouvrir les paramètres' }));
    expect(window.location.hash).toBe('#/parametres');
    expect(screen.getByRole('heading', { name: 'Base wiki' })).toBeInTheDocument();
  });

  it('synchronise le wiki depuis les paramètres puis recharge les données', async () => {
    const user = userEvent.setup();
    const events: WikiSyncEvent[] = [
      { step: 'core', done: 0, total: 1, message: 'Téléchargement de la liste des succès' },
      {
        step: 'done',
        done: 1,
        total: 1,
        message: 'Synchro terminée',
        report: {
          achievements: 641,
          pages: 518,
          missingPages: [],
          unknownTemplates: {},
          miscCount: 108,
          otherUnlockCount: 61,
          cachedPages: 0,
        },
      },
    ];
    const body = events.map((e) => `${JSON.stringify(e)}\n`).join('');
    const mock = stubProgress({ 'POST /api/wiki/sync': () => new Response(body) });
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    expect(await screen.findByText('Player (76561198083722517)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Synchroniser le wiki' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Synchro terminée.');
    await vi.waitFor(() => expect(progressCalls(mock)).toBe(2));
    expect(callsTo(mock, '/api/achievements')).toBe(2);
    expect(callsTo(mock, '/api/wiki/status')).toBe(2);
    expect(screen.getByRole('button', { name: 'Synchroniser le wiki' })).toBeEnabled();
  });

  it('affiche les paramètres même si la progression échoue', async () => {
    window.location.hash = '#/parametres';
    stubProgress({ 'GET /api/progress': () => jsonResponse({ error: 'Aucun compte Steam local' }, 404) });
    render(<App />);
    expect(await screen.findByText('Player (76561198083722517)')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Impossible de charger la progression' })).not.toBeInTheDocument();
  });

  it('propose de réessayer quand les routes d’un autre joueur échouent, ou de revenir à son profil', async () => {
    const user = userEvent.setup();
    const mock = stubProgress({
      'GET /api/profile/resolve': () => ({ steamId64: '76561198000000001', name: 'Ami' }),
      'GET /api/routes': (url) =>
        url.searchParams.get('profile') === 'me' ? ROUTES_OK : jsonResponse({ error: 'Profil Steam privé' }, 403),
    });
    window.location.hash = '#/routes';
    render(<App />);
    await screen.findByRole('heading', { name: 'Runs conseillées' });
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    await user.type(screen.getByLabelText('SteamID64, URL de profil ou pseudo'), 'ami');
    await user.click(screen.getByRole('button', { name: 'Charger' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Profil Steam privé');
    await user.click(within(alert).getByRole('button', { name: 'Réessayer' }));
    await vi.waitFor(() => expect(callsTo(mock, '/api/routes?profile=76561198000000001')).toBe(2));
    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Revenir à mon profil' }));
    expect(await screen.findByRole('heading', { name: 'Runs conseillées' })).toBeInTheDocument();
  });

  it('pose au conseiller la question d’une run et garde la conversation entre les onglets', async () => {
    const user = userEvent.setup();
    const events: AdvisorEvent[] = [
      { kind: 'context', sources: [{ id: 45, name: 'Guardian Angel' }] },
      { kind: 'delta', text: 'Fais Boss Rush avant 20 minutes.' },
      { kind: 'done' },
    ];
    const bodies: unknown[] = [];
    stubProgress({
      'POST /api/advisor': (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(events.map((e) => `${JSON.stringify(e)}\n`).join(''));
      },
    });
    window.location.hash = '#/routes';
    render(<App />);
    const [magdalene] = within(await screen.findByRole('region', { name: 'Runs conseillées' })).getAllByRole('article');
    await user.click(within(magdalene).getByRole('button', { name: 'Demander au conseiller' }));
    expect(window.location.hash).toBe('#/conseiller');
    expect(screen.getByRole('button', { name: 'Conseiller' })).toHaveAttribute('aria-current', 'page');
    const field = screen.getByLabelText<HTMLTextAreaElement>('Your question');
    expect(field.value).toMatch(/^How do I clear this run with Magdalene in hard mode/);
    expect(field).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Fais Boss Rush avant 20 minutes.')).toBeInTheDocument();
    expect(bodies).toEqual([{ question: expect.stringMatching(/^How do I clear this run/), history: [], profile: 'me', slot: null }]);
    expect(screen.getByText('Advisor: OK')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tableau de bord' }));
    await user.click(screen.getByRole('button', { name: 'Conseiller' }));
    expect(screen.getByText('Fais Boss Rush avant 20 minutes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardian Angel' }));
    expect(window.location.hash).toBe('#/succes/45');
  });

  it('pose au conseiller la question d’une fiche', async () => {
    const user = userEvent.setup();
    const plan = { requirements: [], runs: [] };
    stubProgress({ 'GET /api/achievement/2': () => makeCard({ achievement: ACHIEVEMENTS[1], plan }) });
    window.location.hash = '#/succes/2';
    render(<App />);
    const panel = await screen.findByRole('complementary', { name: 'Cain' });
    await user.click(within(panel).getByRole('button', { name: 'Demander au conseiller' }));
    expect(window.location.hash).toBe('#/conseiller');
    expect(screen.getByLabelText('Your question')).toHaveValue('How do I get Cain (#2)?');
  });

  it('enregistre les réglages Ollama depuis les paramètres et met à jour la pastille du conseiller', async () => {
    const user = userEvent.setup();
    let status = ADVISOR_OFFLINE;
    stubProgress({
      'GET /api/advisor/status': () => status,
      'POST /api/advisor/settings': () => {
        status = { ...ADVISOR_OK, url: 'http://10.0.0.5:11434' };
        return status;
      },
    });
    window.location.hash = '#/parametres';
    render(<App />);
    expect(await screen.findByText('Advisor: unreachable')).toBeInTheDocument();
    const section = within(screen.getByRole('region', { name: 'Conseiller IA' }));
    const url = await section.findByDisplayValue('http://127.0.0.1:11434');
    await user.clear(url);
    await user.type(url, 'http://10.0.0.5:11434');
    await user.click(section.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Advisor: OK')).toBeInTheDocument();
    expect(section.getByText('Serveur joignable, modèle qwen3.5:9b installé.')).toBeInTheDocument();
  });

  it('ne répète pas le compte principal dans le choix du profil', async () => {
    stubProgress({
      'GET /api/progress': () =>
        makeSummary({
          accounts: [
            { accountId: 123456789, steamId64: '76561198083722517', personaName: 'Player' },
            { accountId: 234567890, steamId64: '76561198194833618', personaName: 'Second Player' },
          ],
        }),
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await vi.waitFor(() =>
      expect(within(screen.getByLabelText('Profil')).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Mon profil (Player)',
        'Second Player (compte local)',
        'Autre joueur…',
      ]),
    );
  });

  it('paints in the remembered locale on the very first render, without waiting for settings', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    stubProgress();
    render(<App />);
    expect(screen.getByLabelText('Langue')).toBeInTheDocument();
  });

  it('lets the server locale override the remembered one once settings answer', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    stubProgress({ 'GET /api/settings': () => ({ ...SETTINGS, locale: 'en' }) });
    render(<App />);
    expect(screen.getByLabelText('Langue')).toBeInTheDocument();
    expect(await screen.findByLabelText('Language')).toBeInTheDocument();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('keeps a language picked while settings are still loading', async () => {
    const user = userEvent.setup();
    let resolveSettings: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveSettings = resolve;
    });
    stubProgress({
      'GET /api/settings': () => pending,
      'POST /api/settings': () => ({ ...SETTINGS, locale: 'fr' }),
    });
    render(<App />);

    await user.selectOptions(screen.getByLabelText('Language'), 'Français');
    expect(screen.getByLabelText('Langue')).toBeInTheDocument();

    await act(async () => {
      resolveSettings({ ...SETTINGS, locale: 'en' });
      await pending;
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByLabelText('Langue')).toBeInTheDocument();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr');
  });
});

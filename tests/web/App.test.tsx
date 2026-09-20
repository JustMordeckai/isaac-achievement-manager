import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../web/src/App.tsx';
import { t } from '../../shared/i18n/index.ts';
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
  it('shows the dashboard then the missing achievements', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    expect(screen.getByText('Loading the progress…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See the 516 missing achievements' }));
    expect(window.location.hash).toBe('#/achievements');
    expect(screen.getByText('Cain')).toBeInTheDocument();
    expect(screen.getByText('Play Online')).toBeInTheDocument();
    expect(screen.queryByText('Magdalene')).not.toBeInTheDocument();
  });

  it('opens the list filtered on the differences from the dashboard', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'See them in the list' }));
    expect(screen.getByLabelText('Save and Steam differences')).toBeChecked();
    expect(screen.getByText('1 achievement')).toBeInTheDocument();
  });

  it('keeps the filters when the tab changes', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progress' });
    await user.click(screen.getByRole('button', { name: 'Achievements' }));
    await user.type(screen.getByLabelText('Search'), 'cain');
    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    await user.click(screen.getByRole('button', { name: 'Achievements' }));
    expect(screen.getByLabelText('Search')).toHaveValue('cain');
  });

  it('loads the data again with Refresh', async () => {
    const user = userEvent.setup();
    const mock = stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progress' });
    expect(progressCalls(mock)).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await vi.waitFor(() => expect(progressCalls(mock)).toBe(2));
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
  });

  it('opens the routes from the dashboard, then a card from a run', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'See every route' }));
    expect(window.location.hash).toBe('#/routes');
    expect(screen.getByRole('button', { name: 'Routes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Suggested runs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Progress' })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Guardian Angel' })[0]);
    expect(window.location.hash).toBe('#/achievements/45');
    expect(await screen.findByRole('complementary', { name: 'Guardian Angel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Achievements' })).toHaveAttribute('aria-current', 'page');
  });

  it('also loads the routes again with Refresh', async () => {
    const user = userEvent.setup();
    const mock = stubProgress();
    window.location.hash = '#/routes';
    render(<App />);
    await screen.findByRole('heading', { name: 'Suggested runs' });
    expect(callsTo(mock, '/api/routes')).toBe(1);
    await user.click(await screen.findByRole('button', { name: 'Refresh' }));
    await vi.waitFor(() => expect(callsTo(mock, '/api/routes')).toBe(2));
    expect(screen.getByRole('heading', { name: 'Suggested runs' })).toBeInTheDocument();
  });

  it('keeps Refresh busy while the routes are loading', async () => {
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
    await screen.findByRole('heading', { name: 'Suggested runs' });
    await user.click(await screen.findByRole('button', { name: 'Refresh' }));
    await vi.waitFor(() => expect(pending.release).toBeDefined());
    // The progress is read again right away; only the routes are still pending.
    await vi.waitFor(() => expect(progressCalls(mock)).toBe(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
    await act(async () => pending.release?.());
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it('loads again with the chosen slot', async () => {
    const user = userEvent.setup();
    const mock = stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progress' });
    await user.selectOptions(screen.getByLabelText('Save file'), 'Slot 2');
    await vi.waitFor(() =>
      expect(mock.mock.calls.some(([input]) => String(input) === '/api/progress?profile=me&slot=2')).toBe(true),
    );
  });

  it('shows an error and offers to try again', async () => {
    const user = userEvent.setup();
    let fail = true;
    stubProgress({
      'GET /api/progress': () => (fail ? jsonResponse({ error: 'No local Steam account' }, 404) : makeSummary()),
    });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No local Steam account');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Progress' })).toBeInTheDocument();
  });

  it('changes the theme and remembers it', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progress' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Switch to the light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('iam-theme')).toBe('light');
  });

  it('stops the server after a confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubProgress({ 'POST /api/shutdown': () => ({ ok: true }) });
    render(<App />);
    await screen.findByRole('heading', { name: 'Progress' });
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByRole('heading', { name: 'Server stopped' })).toBeInTheDocument();
  });

  it('does nothing when the stop is cancelled', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const mock = stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progress' });
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(mock.mock.calls.some(([input]) => String(input) === '/api/shutdown')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
  });

  it('shows an error when the stop fails and keeps the dashboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubProgress({ 'POST /api/shutdown': () => jsonResponse({ error: 'non' }, 403) });
    render(<App />);
    await screen.findByRole('heading', { name: 'Progress' });
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The server could not be stopped');
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
  });

  it('opens the card of an achievement then gives the focus back to the list on close', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progress' });
    await user.click(screen.getByRole('button', { name: 'Achievements' }));
    const cain = screen.getByRole('button', { name: 'Cain' });
    await user.click(cain);
    expect(window.location.hash).toBe('#/achievements/2');
    const panel = await screen.findByRole('complementary', { name: 'Cain' });
    expect(within(panel).getByText('Defeat Boss Rush as Azazel')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Close the card' }));
    expect(window.location.hash).toBe('#/achievements');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(cain).toHaveFocus();
  });

  it('opens the card named in the address right away', async () => {
    window.location.hash = '#/achievements/2';
    stubProgress();
    render(<App />);
    expect(await screen.findByRole('complementary', { name: 'Cain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Achievements' })).toHaveAttribute('aria-current', 'page');
  });

  it('reports a missing wiki base and leads to the settings', async () => {
    const user = userEvent.setup();
    stubProgress({ 'GET /api/wiki/status': () => KB_ABSENT });
    render(<App />);
    expect(await screen.findByText(/^Wiki base missing/)).toBeInTheDocument();
    expect(screen.getByText('Wiki: missing')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open the settings' }));
    expect(window.location.hash).toBe('#/settings');
    expect(screen.getByRole('heading', { name: 'Wiki base' })).toBeInTheDocument();
  });

  it('syncs the wiki from the settings then loads the data again', async () => {
    const user = userEvent.setup();
    const events: WikiSyncEvent[] = [
      { step: 'core', done: 0, total: 1, message: 'Downloading the achievement list' },
      {
        step: 'done',
        done: 1,
        total: 1,
        message: 'Sync complete',
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
    await screen.findByRole('heading', { name: 'Progress' });
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByText('Player (76561198083722517)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sync the wiki' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sync complete.');
    await vi.waitFor(() => expect(progressCalls(mock)).toBe(2));
    expect(callsTo(mock, '/api/achievements')).toBe(2);
    expect(callsTo(mock, '/api/wiki/status')).toBe(2);
    expect(screen.getByRole('button', { name: 'Sync the wiki' })).toBeEnabled();
  });

  it('shows the settings even when the progress fails', async () => {
    window.location.hash = '#/settings';
    stubProgress({ 'GET /api/progress': () => jsonResponse({ error: 'No local Steam account' }, 404) });
    render(<App />);
    expect(await screen.findByText('Player (76561198083722517)')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: t('en', 'app.progressFailed') })).not.toBeInTheDocument();
  });

  it('offers to try again when the routes of another player fail, or to go back to your profile', async () => {
    const user = userEvent.setup();
    const mock = stubProgress({
      'GET /api/profile/resolve': () => ({ steamId64: '76561198000000001', name: 'Friend' }),
      'GET /api/routes': (url) =>
        url.searchParams.get('profile') === 'me' ? ROUTES_OK : jsonResponse({ error: 'Steam profile is private' }, 403),
    });
    window.location.hash = '#/routes';
    render(<App />);
    await screen.findByRole('heading', { name: 'Suggested runs' });
    await user.selectOptions(screen.getByLabelText('Profile'), 'Another player…');
    await user.type(screen.getByLabelText('SteamID64, profile URL or nickname'), 'ami');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Steam profile is private');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(callsTo(mock, '/api/routes?profile=76561198000000001')).toBe(2));
    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Back to my profile' }));
    expect(await screen.findByRole('heading', { name: 'Suggested runs' })).toBeInTheDocument();
  });

  it('asks the advisor the question of a run and keeps the conversation between tabs', async () => {
    const user = userEvent.setup();
    const events: AdvisorEvent[] = [
      { kind: 'context', sources: [{ id: 45, name: 'Guardian Angel' }] },
      { kind: 'delta', text: 'Clear Boss Rush before the 20 minute mark.' },
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
    const [magdalene] = within(await screen.findByRole('region', { name: 'Suggested runs' })).getAllByRole('article');
    await user.click(within(magdalene).getByRole('button', { name: 'Ask the advisor' }));
    expect(window.location.hash).toBe('#/advisor');
    expect(screen.getByRole('button', { name: 'Advisor' })).toHaveAttribute('aria-current', 'page');
    const field = screen.getByLabelText<HTMLTextAreaElement>('Your question');
    expect(field.value).toMatch(/^How do I clear this run with Magdalene in hard mode/);
    expect(field).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Clear Boss Rush before the 20 minute mark.')).toBeInTheDocument();
    expect(bodies).toEqual([{ question: expect.stringMatching(/^How do I clear this run/), history: [], profile: 'me', slot: null }]);
    expect(screen.getByText('Advisor: OK')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    await user.click(screen.getByRole('button', { name: 'Advisor' }));
    expect(screen.getByText('Clear Boss Rush before the 20 minute mark.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardian Angel' }));
    expect(window.location.hash).toBe('#/achievements/45');
  });

  it('asks the advisor the question of a card', async () => {
    const user = userEvent.setup();
    const plan = { requirements: [], runs: [] };
    stubProgress({ 'GET /api/achievement/2': () => makeCard({ achievement: ACHIEVEMENTS[1], plan }) });
    window.location.hash = '#/achievements/2';
    render(<App />);
    const panel = await screen.findByRole('complementary', { name: 'Cain' });
    await user.click(within(panel).getByRole('button', { name: 'Ask the advisor' }));
    expect(window.location.hash).toBe('#/advisor');
    expect(screen.getByLabelText('Your question')).toHaveValue('How do I get Cain (#2)?');
  });

  it('saves the Ollama settings from the settings screen and updates the advisor badge', async () => {
    const user = userEvent.setup();
    let status = ADVISOR_OFFLINE;
    stubProgress({
      'GET /api/advisor/status': () => status,
      'POST /api/advisor/settings': () => {
        status = { ...ADVISOR_OK, url: 'http://10.0.0.5:11434' };
        return status;
      },
    });
    window.location.hash = '#/settings';
    render(<App />);
    expect(await screen.findByText('Advisor: unreachable')).toBeInTheDocument();
    const section = within(screen.getByRole('region', { name: 'AI advisor' }));
    const url = await section.findByDisplayValue('http://127.0.0.1:11434');
    await user.clear(url);
    await user.type(url, 'http://10.0.0.5:11434');
    await user.click(section.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Advisor: OK')).toBeInTheDocument();
    expect(section.getByText('Server reachable, model qwen3.5:9b installed.')).toBeInTheDocument();
  });

  it('does not repeat the main account in the profile picker', async () => {
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
    await screen.findByRole('heading', { name: 'Progress' });
    await vi.waitFor(() =>
      expect(within(screen.getByLabelText('Profile')).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'My profile (Player)',
        'Second Player (local account)',
        'Another player…',
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

  it('reads the server rendered data again once the language is saved', async () => {
    const user = userEvent.setup();
    const mock = stubProgress({ 'POST /api/settings': () => ({ ...SETTINGS, locale: 'fr' }) });
    render(<App />);
    await screen.findByRole('heading', { name: 'Progress' });
    const before = { progress: progressCalls(mock), routes: callsTo(mock, '/api/routes') };

    await user.selectOptions(screen.getByLabelText('Language'), 'Fran\u00e7ais');

    // The plan and the source messages come from the server: they are asked again in the new language.
    await vi.waitFor(() => expect(progressCalls(mock)).toBe(before.progress + 1));
    expect(callsTo(mock, '/api/routes')).toBe(before.routes + 1);
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

    await user.selectOptions(screen.getByLabelText('Language'), 'Fran\u00e7ais');
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

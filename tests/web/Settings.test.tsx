import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../shared/i18n/index.ts';
import type { KbStatus, WikiSyncReport } from '../../shared/types.ts';
import { LocaleProvider } from '../../web/src/i18n.tsx';
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

const kbSection = () => screen.getByRole('region', { name: 'Wiki base' });
const advisorSection = () => within(screen.getByRole('region', { name: 'AI advisor' }));

describe('Settings', () => {
  it('shows the state of the base and starts the sync', async () => {
    const user = userEvent.setup();
    const { props } = renderSettings();
    // The time depends on the time zone of the machine: only the date is fixed.
    expect(within(kbSection()).getByText(/^Base synced on 17 Sept 2026, \d{2}:\d{2}\.$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sync the wiki' }));
    expect(props.onSync).toHaveBeenCalledTimes(1);
  });

  it('speaks French inside a French locale', () => {
    render(
      <LocaleProvider locale="fr">
        <Settings
          settings={{ status: 'ready', info: SETTINGS }}
          kb={KB_OK}
          sync={{ kind: 'idle' }}
          onSync={vi.fn()}
          advisor={makeAdvisorState()}
        />
      </LocaleProvider>,
    );
    expect(screen.getByRole('heading', { name: t('fr', 'settings.wikiTitle') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('fr', 'settings.sync') })).toBeInTheDocument();
  });

  it('explains a missing base and reports the last failure', () => {
    const kb: KbStatus = { ...KB_ABSENT, message: 'Last sync failed: wiki unreachable' };
    renderSettings({ kb });
    expect(within(kbSection()).getByText(/has not been downloaded yet/)).toBeInTheDocument();
    expect(within(kbSection()).getByText('Last sync failed: wiki unreachable')).toBeInTheDocument();
  });

  it('shows an unreadable base', () => {
    renderSettings({ kb: { state: 'error', syncedAt: null, running: false, message: 'Wiki base unreadable: invalid JSON' } });
    expect(within(kbSection()).getByText('Wiki base unreadable: invalid JSON')).toBeInTheDocument();
  });

  it('follows the progress and locks the button during the sync', () => {
    const { rerender, props } = renderSettings({ sync: { kind: 'running', event: null } });
    expect(screen.getByRole('button', { name: 'Sync under way…' })).toBeDisabled();
    expect(screen.getByText('Connecting to the wiki…')).toBeInTheDocument();
    rerender(<Settings {...props} sync={{ kind: 'running', event: { step: 'pages', done: 3, total: 12, message: 'Batch 3 of 12' } }} />);
    expect(screen.getByText('Batch 3 of 12')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Pages downloaded' })).toHaveAttribute('aria-valuenow', '3');
    rerender(<Settings {...props} sync={{ kind: 'idle' }} kb={{ ...KB_OK, running: true }} />);
    expect(screen.getByRole('button', { name: 'Sync under way…' })).toBeDisabled();
  });

  it('sums up the sync report', () => {
    renderSettings({ sync: { kind: 'done', report: REPORT } });
    expect(screen.getByRole('status')).toHaveTextContent('Sync complete.');
    const report = within(kbSection());
    expect(report.getByText('Pages analyzed').nextElementSibling).toHaveTextContent('518');
    expect(report.getByText('Pages taken from the cache').nextElementSibling).toHaveTextContent('none');
    expect(report.getByText('Unclassified').nextElementSibling).toHaveTextContent('108 conditions and 61 unlocks');
    expect(report.getByText('2 linked pages missing from the wiki')).toBeInTheDocument();
    expect(report.getByText('1001%, Basement Boy')).toBeInTheDocument();
    expect(report.getByText('repentance babies (6)')).toHaveAttribute('lang', 'en');
  });

  it('shows the failure of the sync', () => {
    renderSettings({ sync: { kind: 'failed', message: 'A wiki sync is already running' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Sync failed: A wiki sync is already running');
    expect(screen.getByRole('button', { name: 'Sync the wiki' })).toBeEnabled();
  });

  it('lists the detected settings, read only', () => {
    renderSettings();
    const app = within(screen.getByRole('region', { name: 'Steam and application' }));
    expect(app.queryByRole('textbox')).not.toBeInTheDocument();
    expect(app.getByText('Steam folder').nextElementSibling).toHaveTextContent('c:\\program files (x86)\\steam');
    expect(app.getByText('Account used').nextElementSibling).toHaveTextContent('Player (76561198083722517)');
    expect(app.getByText('Address').nextElementSibling).toHaveTextContent('http://127.0.0.1:5250/');
    expect(app.getByText('Data folder').nextElementSibling).toHaveTextContent('C:\\isaac\\data');
  });

  it('spells out a forced, missing or absent account', () => {
    const { rerender, props } = renderSettings({ settings: { status: 'ready', info: { ...SETTINGS, forcedAccountId: 123456789 } } });
    const account = () => screen.getByText('Account used').nextElementSibling;
    expect(account()).toHaveTextContent('Player (76561198083722517), forced by data/settings.json');
    rerender(<Settings {...props} settings={{ status: 'ready', info: { ...SETTINGS, account: null, forcedAccountId: 123 } }} />);
    expect(account()).toHaveTextContent('account 123 forced by data/settings.json, not found on this PC');
    rerender(<Settings {...props} settings={{ status: 'ready', info: { ...SETTINGS, account: null, steamPath: null } }} />);
    expect(account()).toHaveTextContent('no local account with Isaac data');
    expect(screen.getByText('Steam folder').nextElementSibling).toHaveTextContent('not found');
  });

  it('shows the loading and the error of the settings', () => {
    const { rerender, props } = renderSettings({ settings: { status: 'loading' }, kb: null });
    expect(screen.getByText('Reading the settings…')).toBeInTheDocument();
    expect(screen.getByText('Reading the state of the base…')).toBeInTheDocument();
    rerender(<Settings {...props} settings={{ status: 'error', message: 'HTTP 500' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Settings unavailable: HTTP 500');
  });
});

const SETUP_MISSING = { installed: false, canInstall: true, vramGb: null, recommended: 'qwen3.5:4b' };
const SETUP_READY = { installed: true, canInstall: true, vramGb: 16, recommended: 'qwen3.5:9b' };

/** NDJSON answer, the way the two setup routes send their progress. */
const ndjson = (events: unknown[]) => new Response(events.map((event) => `${JSON.stringify(event)}\n`).join(''));

describe('Settings: advisor setup', () => {
  it('offers to install Ollama when the machine has none, and follows the install', async () => {
    const user = userEvent.setup();
    const mock = stubFetch({
      'GET /api/advisor/setup': () => SETUP_MISSING,
      'POST /api/advisor/install': () =>
        ndjson([
          { step: 'progress', message: 'Downloading Ollama' },
          { step: 'done', message: 'Ollama is installed.' },
        ]),
    });
    const advisor = makeAdvisorState(ADVISOR_OFFLINE);
    renderSettings({ advisor });

    const section = advisorSection();
    expect(await section.findByText('Ollama is not installed on this machine.')).toBeInTheDocument();

    await user.click(section.getByRole('button', { name: 'Install Ollama' }));

    expect(await section.findByText('Ollama is installed.')).toBeInTheDocument();
    expect(advisor.recheck).toHaveBeenCalled();
    const [, init] = mock.mock.calls.find(([input]) => String(input) === '/api/advisor/install')!;
    expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('advisor-install');
  });

  it('says what the card can run and downloads the model, byte by byte', async () => {
    const user = userEvent.setup();
    const mock = stubFetch({
      'GET /api/advisor/setup': () => SETUP_READY,
      'POST /api/advisor/pull': () =>
        ndjson([
          { step: 'progress', message: 'pulling manifest' },
          { step: 'progress', message: 'pulling 1a2b', done: 5 * 1024 * 1024, total: 20 * 1024 * 1024 },
          { step: 'done', message: 'qwen3.5:9b is ready.' },
        ]),
    });
    const advisor = makeAdvisorState({ ...ADVISOR_OK, state: 'error', model: 'qwen3.5:9b', models: [] });
    renderSettings({ advisor });

    const section = advisorSection();
    expect(await section.findByText(/16 GB of video memory detected/)).toBeInTheDocument();
    expect(section.getByText(/Recommended model: qwen3.5:9b/)).toBeInTheDocument();

    await user.click(section.getByRole('button', { name: 'Download qwen3.5:9b' }));

    expect(await section.findByText('qwen3.5:9b is ready.')).toBeInTheDocument();
    const [, init] = mock.mock.calls.find(([input]) => String(input) === '/api/advisor/pull')!;
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'qwen3.5:9b' });
  });

  it('reports a refused job and stays out of the way once the advisor answers', async () => {
    const user = userEvent.setup();
    stubFetch({
      'GET /api/advisor/setup': () => SETUP_READY,
      'POST /api/advisor/pull': () => ndjson([{ step: 'error', message: 'The download was refused (HTTP 500).' }]),
    });
    const { rerender, props } = renderSettings({ advisor: makeAdvisorState({ ...ADVISOR_OK, state: 'error', models: [] }) });

    await user.click(await advisorSection().findByRole('button', { name: /^Download / }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The download was refused (HTTP 500).');

    rerender(<Settings {...props} advisor={makeAdvisorState()} />);
    expect(screen.queryByRole('heading', { name: 'Set up the advisor' })).not.toBeInTheDocument();
  });

  it('leaves the card out when the detection fails', async () => {
    stubFetch({ 'GET /api/advisor/setup': () => jsonResponse({ error: 'nope' }, 500) });
    renderSettings({ advisor: makeAdvisorState(ADVISOR_OFFLINE) });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('heading', { name: 'Set up the advisor' })).not.toBeInTheDocument();
  });
});

describe('Settings: language', () => {
  it('offers both languages, with the current one selected, and explains where the choice is stored', () => {
    renderSettings();
    const section = within(screen.getByRole('region', { name: 'Language' }));
    expect(section.getByRole('button', { name: 'Language: English' })).toBeInTheDocument();
    expect(section.getByText(/data\/settings\.json/)).toBeInTheDocument();
  });
});

describe('Settings: advisor', () => {
  it('shows the state of the server and the current settings', () => {
    renderSettings();
    const section = advisorSection();
    expect(section.getByText('Server reachable, model qwen3.5:9b installed.')).toBeInTheDocument();
    expect(section.getByLabelText('Address of the Ollama server')).toHaveValue('http://127.0.0.1:11434');
    expect(section.getByLabelText('Model')).toHaveValue('qwen3.5:9b');
    expect(section.getByText(/^Installed models: qwen3\.5:4b, qwen3\.5:9b\./)).toBeInTheDocument();
    const options = [...document.querySelectorAll('#ollama-models option')].map((o) => o.getAttribute('value'));
    expect(options).toEqual(['qwen3.5:4b', 'qwen3.5:9b']);
  });

  it('reports an unreachable server and checks again', async () => {
    const user = userEvent.setup();
    const advisor = makeAdvisorState(ADVISOR_OFFLINE);
    const { rerender, props } = renderSettings({ advisor });
    const section = advisorSection();
    expect(section.getByText('Ollama unreachable at http://127.0.0.1:11434 (ECONNREFUSED)')).toHaveClass('banner--error');
    expect(section.getByText(/^Installed models: unknown\./)).toBeInTheDocument();
    await user.click(section.getByRole('button', { name: 'Check the connection' }));
    expect(advisor.recheck).toHaveBeenCalled();
    rerender(<Settings {...props} advisor={makeAdvisorState(ADVISOR_OFFLINE, true)} />);
    expect(advisorSection().getByRole('button', { name: 'Checking…' })).toBeDisabled();
  });

  it('fills the fields when the state arrives', () => {
    const { rerender, props } = renderSettings({ advisor: makeAdvisorState(null) });
    expect(advisorSection().getByText('Checking the Ollama server…')).toBeInTheDocument();
    expect(advisorSection().getByLabelText('Model')).toHaveValue('');
    rerender(<Settings {...props} advisor={makeAdvisorState()} />);
    expect(advisorSection().getByLabelText('Model')).toHaveValue('qwen3.5:9b');
  });

  it('keeps what was typed before the state arrived', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderSettings({ advisor: makeAdvisorState(null) });
    await user.type(advisorSection().getByLabelText('Model'), 'qwen3:4b');
    rerender(<Settings {...props} advisor={makeAdvisorState()} />);
    expect(advisorSection().getByLabelText('Model')).toHaveValue('qwen3:4b');
    expect(advisorSection().getByLabelText('Address of the Ollama server')).toHaveValue('http://127.0.0.1:11434');
  });

  it('saves the address and the model', async () => {
    const user = userEvent.setup();
    const saved = { ...ADVISOR_OK, url: 'http://10.0.0.5:11434', model: 'qwen3.5:4b' };
    const mock = stubFetch({ 'POST /api/advisor/settings': () => saved });
    const advisor = makeAdvisorState();
    renderSettings({ advisor });
    const section = advisorSection();
    await user.clear(section.getByLabelText('Address of the Ollama server'));
    await user.type(section.getByLabelText('Address of the Ollama server'), 'http://10.0.0.5:11434/');
    await user.clear(section.getByLabelText('Model'));
    await user.type(section.getByLabelText('Model'), 'qwen3.5:4b');
    await user.click(section.getByRole('button', { name: 'Save' }));
    expect(await section.findByRole('status')).toHaveTextContent('Settings saved.');
    const [, init] = mock.mock.calls.find(([input]) => String(input) === '/api/advisor/settings')!;
    expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('advisor-settings');
    expect(JSON.parse(String(init?.body))).toEqual({ url: 'http://10.0.0.5:11434/', model: 'qwen3.5:4b' });
    expect(advisor.replace).toHaveBeenCalledWith(saved);
    expect(section.getByLabelText('Address of the Ollama server')).toHaveValue('http://10.0.0.5:11434');
  });

  it('shows the refusal from the server', async () => {
    const user = userEvent.setup();
    let reply: (response: Response) => void = () => {};
    stubFetch({ 'POST /api/advisor/settings': () => new Promise<Response>((resolve) => (reply = resolve)) });
    const advisor = makeAdvisorState();
    renderSettings({ advisor });
    const section = advisorSection();
    await user.click(section.getByRole('button', { name: 'Save' }));
    expect(section.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await act(async () => reply(jsonResponse({ error: 'Invalid Ollama address (http://host:port expected)' }, 400)));
    expect(await section.findByRole('alert')).toHaveTextContent(
      'The settings could not be saved: Invalid Ollama address (http://host:port expected)',
    );
    expect(advisor.replace).not.toHaveBeenCalled();
    expect(section.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

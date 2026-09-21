import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@shared/i18n/index.ts';
import { Header, type HeaderProps } from '@/components/layout/Header/Header.tsx';
import { ProfilePicker } from '@/components/layout/ProfilePicker/ProfilePicker.tsx';
import { LocaleProvider } from '@/i18n.tsx';
import { rememberProfile, RECENT_PROFILES_KEY } from '@/lib/recent-profiles.ts';
import { ADVISOR_OFFLINE, ADVISOR_OK, KB_ABSENT, KB_OK, makeSummary } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

function renderHeader(overrides: Partial<HeaderProps> = {}) {
  const props: HeaderProps = {
    summary: makeSummary(),
    kb: null,
    advisor: null,
    meSteamId: null,
    query: { profile: 'me', slot: null },
    onQueryChange: vi.fn(),
    refreshing: false,
    onRefresh: vi.fn(),
    theme: 'dark',
    onToggleTheme: vi.fn(),
    tab: 'dashboard',
    onTabChange: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  render(<Header {...props} />);
  return props;
}

describe('Header', () => {
  it('shows the state of the sources with their message', () => {
    renderHeader({
      summary: makeSummary({
        sources: {
          steamCache: { state: 'stale', message: 'The online profile holds 1 achievement the local cache does not.' },
          saveFile: { state: 'error', message: 'Unknown header' },
          profile: { state: 'ok' },
        },
      }),
    });
    expect(screen.getByText('Steam cache: stale')).toHaveAttribute('title', 'The online profile holds 1 achievement the local cache does not.');
    expect(screen.getByText('Save file: error')).toHaveClass('badge--error');
    expect(screen.getByText('Online profile: OK')).toHaveClass('badge--ok');
    // The messages of the sources in trouble are visible without hovering.
    expect(screen.getByText('Steam cache: The online profile holds 1 achievement the local cache does not.')).toBeInTheDocument();
    expect(screen.getByText('Save file: Unknown header')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Source messages' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('Save file: Slot 1')).not.toBeInTheDocument();
  });

  it('adds the state of the wiki base', () => {
    renderHeader({ kb: KB_OK });
    const wiki = screen.getByText('Wiki: OK');
    expect(wiki).toHaveClass('badge--ok');
    expect(wiki.getAttribute('title')).toMatch(/^Synced on 17 Sept 2026/);
    expect(screen.queryByText(/^Wiki: Synced/)).not.toBeInTheDocument();
  });

  it('shows the last failed sync of a missing base', () => {
    renderHeader({ kb: { ...KB_ABSENT, message: 'Last sync failed: wiki unreachable' } });
    expect(screen.getByText('Wiki: missing')).toHaveClass('badge--absent');
    expect(screen.getByText('Wiki: Last sync failed: wiki unreachable')).toBeInTheDocument();
  });

  it('shows the wiki state even with no progress summary', () => {
    renderHeader({ summary: null, kb: KB_ABSENT });
    expect(within(screen.getByRole('list', { name: 'Source states' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('adds the state of the advisor', () => {
    renderHeader({ advisor: ADVISOR_OK });
    const ollama = screen.getByText('Advisor: OK');
    expect(ollama).toHaveClass('badge--ok');
    expect(ollama).toHaveAttribute('title', 'qwen3.5:9b on http://127.0.0.1:11434');
  });

  it('shows the message of an unreachable Ollama server', () => {
    renderHeader({ advisor: ADVISOR_OFFLINE });
    expect(screen.getByText('Advisor: unreachable')).toHaveClass('badge--absent');
    expect(
      screen.getByText('Advisor: Ollama unreachable at http://127.0.0.1:11434 (ECONNREFUSED)'),
    ).toBeInTheDocument();
  });

  it('offers the Routes and Advisor tabs', async () => {
    const user = userEvent.setup();
    const props = renderHeader();
    const tabs = within(screen.getByRole('navigation')).getAllByRole('button').map((b) => b.textContent);
    expect(tabs).toEqual(['Dashboard', 'Achievements', 'Routes', 'Advisor', 'Settings']);
    await user.click(screen.getByRole('button', { name: 'Routes' }));
    expect(props.onTabChange).toHaveBeenCalledWith('routes');
    await user.click(screen.getByRole('button', { name: 'Advisor' }));
    expect(props.onTabChange).toHaveBeenCalledWith('advisor');
  });

  it('speaks French inside a French locale', () => {
    render(
      <LocaleProvider locale="fr">
        <Header
          summary={makeSummary()}
          kb={null}
          advisor={null}
          meSteamId={null}
          query={{ profile: 'me', slot: null }}
          onQueryChange={vi.fn()}
          refreshing={false}
          onRefresh={vi.fn()}
          theme="dark"
          onToggleTheme={vi.fn()}
          tab="dashboard"
          onTabChange={vi.fn()}
          onStop={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(screen.getByRole('button', { name: t('fr', 'app.refresh') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('fr', 'app.tabAchievements') })).toBeInTheDocument();
  });

  it('offers the Settings tab', async () => {
    const user = userEvent.setup();
    const props = renderHeader({ tab: 'settings' });
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(props.onTabChange).toHaveBeenCalledWith('dashboard');
  });

  it('changes the save slot', async () => {
    const user = userEvent.setup();
    const props = renderHeader();
    await user.selectOptions(screen.getByLabelText('Save file'), 'Slot 2');
    expect(props.onQueryChange).toHaveBeenCalledWith({ profile: 'me', slot: 2 });
  });

  it('hides the slot picker when there is only one', () => {
    renderHeader({ summary: makeSummary({ save: { slot: 1, slots: [1] } }) });
    expect(screen.queryByLabelText('Save file')).not.toBeInTheDocument();
  });

  it('passes on the actions', async () => {
    const user = userEvent.setup();
    const props = renderHeader();
    await user.click(screen.getByRole('button', { name: 'Achievements' }));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await user.click(screen.getByRole('switch', { name: 'Dark theme' }));
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(props.onTabChange).toHaveBeenCalledWith('achievements');
    expect(props.onRefresh).toHaveBeenCalled();
    expect(props.onToggleTheme).toHaveBeenCalled();
    expect(props.onStop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('switch', { name: 'Dark theme' })).toHaveAttribute('aria-checked', 'true');
  });

  it('disables Refresh while loading and with no summary', () => {
    renderHeader({ summary: null, refreshing: true });
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
    expect(screen.queryByRole('list', { name: 'Source states' })).not.toBeInTheDocument();
  });

  it('offers the language picker without its explanatory hint', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Language: English' })).toBeInTheDocument();
    expect(screen.queryByText(/data\/settings\.json/)).not.toBeInTheDocument();
  });
});

describe('ProfilePicker', () => {
  it('shows the name of the current profile', () => {
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName="Player" onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'My profile (Player)' })).toBeInTheDocument();
  });

  it('loads another player and remembers them', async () => {
    const user = userEvent.setup();
    stubFetch({
      'GET /api/profile/resolve': (url) => {
        expect(url.searchParams.get('input')).toBe('JustAFriend');
        return { steamId64: '76561198000000001', name: 'Friend' };
      },
    });
    const onChange = vi.fn();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName="Player" onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Profile'), 'Another player…');
    await user.type(screen.getByLabelText('SteamID64, profile URL or nickname'), 'JustAFriend');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(onChange).toHaveBeenCalledWith('76561198000000001');
    expect(JSON.parse(localStorage.getItem(RECENT_PROFILES_KEY) ?? '[]')).toEqual([{ steamId64: '76561198000000001', name: 'Friend' }]);
    expect(screen.getByRole('option', { name: 'Friend' })).toBeInTheDocument();
    expect(screen.queryByLabelText('SteamID64, profile URL or nickname')).not.toBeInTheDocument();
  });

  it('shows the lookup error', async () => {
    const user = userEvent.setup();
    stubFetch({ 'GET /api/profile/resolve': () => jsonResponse({ error: 'Steam profile not found' }, 404) });
    const onChange = vi.fn();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName={null} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Profile'), 'Another player…');
    await user.type(screen.getByLabelText('SteamID64, profile URL or nickname'), 'unknown');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Steam profile not found');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers the recent profiles and the other local accounts', async () => {
    const user = userEvent.setup();
    rememberProfile({ steamId64: '76561198000000001', name: 'Friend' });
    const onChange = vi.fn();
    render(
      <ProfilePicker
        meSteamId={null}
        profile="me"
        accounts={[
          { accountId: 123456789, steamId64: '76561198083722517', personaName: 'Player' },
          { accountId: 234567890, steamId64: '76561198194833618', personaName: 'Second Player' },
        ]}
        currentName="Player"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('option', { name: 'Second Player (local account)' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Profile'), 'Friend');
    expect(onChange).toHaveBeenCalledWith('76561198000000001');
  });

  it('does not repeat the account served under "My profile"', () => {
    rememberProfile({ steamId64: '76561198083722517', name: 'Player' });
    render(
      <ProfilePicker
        meSteamId="76561198083722517"
        profile="me"
        accounts={[{ accountId: 123456789, steamId64: '76561198083722517', personaName: 'Player' }]}
        currentName="Player"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['My profile (Player)', 'Another player…']);
  });

  it('lists a second local account but not the main one', () => {
    render(
      <ProfilePicker
        meSteamId="76561198083722517"
        profile="me"
        accounts={[
          { accountId: 123456789, steamId64: '76561198083722517', personaName: 'Player' },
          { accountId: 234567890, steamId64: '76561198194833618', personaName: 'Second Player' },
        ]}
        currentName="Player"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'My profile (Player)',
      'Second Player (local account)',
      'Another player…',
    ]);
  });

  it('shows a current profile the list does not know', () => {
    render(<ProfilePicker meSteamId={null} profile="76561198000000009" accounts={[]} currentName="Unknown" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Profile')).toHaveValue('76561198000000009');
    expect(screen.getByRole('option', { name: 'Unknown' })).toBeInTheDocument();
  });

  it('cancels the input', async () => {
    const user = userEvent.setup();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName={null} onChange={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('Profile'), 'Another player…');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Profile')).toHaveValue('me');
  });

  it('ignores a lookup that lands after the cancel', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: unknown) => void = () => {};
    const pending = new Promise<unknown>((resolve) => {
      resolveFetch = resolve;
    });
    stubFetch({ 'GET /api/profile/resolve': () => pending });
    const onChange = vi.fn();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName={null} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Profile'), 'Another player…');
    await user.type(screen.getByLabelText('SteamID64, profile URL or nickname'), 'JustAFriend');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {
      resolveFetch({ steamId64: '76561198000000001', name: 'Friend' });
      await pending;
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('option', { name: 'Friend' })).not.toBeInTheDocument();
    expect(localStorage.getItem(RECENT_PROFILES_KEY)).toBeNull();
  });

  it('empties the input when it opens again after a cancel', async () => {
    const user = userEvent.setup();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName={null} onChange={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('Profile'), 'Another player…');
    await user.type(screen.getByLabelText('SteamID64, profile URL or nickname'), 'lost text');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.selectOptions(screen.getByLabelText('Profile'), 'Another player…');
    expect(screen.getByLabelText('SteamID64, profile URL or nickname')).toHaveValue('');
  });

  it('ignores a stale lookup and frees the form when the profile changes in the list', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: unknown) => void = () => {};
    const pending = new Promise<unknown>((resolve) => {
      resolveFetch = resolve;
    });
    stubFetch({ 'GET /api/profile/resolve': () => pending });
    const onChange = vi.fn();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName="Player" onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Profile'), 'Another player…');
    await user.type(screen.getByLabelText('SteamID64, profile URL or nickname'), 'JustAFriend');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    await user.selectOptions(screen.getByLabelText('Profile'), 'My profile (Player)');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('me');
    await act(async () => {
      resolveFetch({ steamId64: '76561198000000001', name: 'Friend' });
      await pending;
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.selectOptions(screen.getByLabelText('Profile'), 'Another player…');
    expect(screen.getByRole('button', { name: 'Load' })).toBeEnabled();
    expect(screen.getByLabelText('SteamID64, profile URL or nickname')).toHaveValue('');
  });
});

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Header, type HeaderProps } from '../../web/src/components/Header.tsx';
import { ProfilePicker } from '../../web/src/components/ProfilePicker.tsx';
import { rememberProfile, RECENT_PROFILES_KEY } from '../../web/src/recent-profiles.ts';
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
  it('affiche l’état des sources avec leur message', () => {
    renderHeader({
      summary: makeSummary({
        sources: {
          steamCache: { state: 'stale', message: 'Le profil en ligne compte 1 succès de plus que le cache local' },
          saveFile: { state: 'error', message: 'En-tête inconnu' },
          profile: { state: 'ok' },
        },
      }),
    });
    expect(screen.getByText('Steam cache: stale')).toHaveAttribute('title', 'Le profil en ligne compte 1 succès de plus que le cache local');
    expect(screen.getByText('Save file: error')).toHaveClass('badge--error');
    expect(screen.getByText('Online profile: OK')).toHaveClass('badge--ok');
    // Les messages des sources en défaut sont visibles sans survol.
    expect(screen.getByText('Steam cache: Le profil en ligne compte 1 succès de plus que le cache local')).toBeInTheDocument();
    expect(screen.getByText('Save file: En-tête inconnu')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Source messages' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('Save file: Slot 1')).not.toBeInTheDocument();
  });

  it('ajoute l’état de la base wiki', () => {
    renderHeader({ kb: KB_OK });
    const wiki = screen.getByText('Wiki: OK');
    expect(wiki).toHaveClass('badge--ok');
    expect(wiki.getAttribute('title')).toMatch(/^Synced on 17 Sept 2026/);
    expect(screen.queryByText(/^Wiki: Synced/)).not.toBeInTheDocument();
  });

  it('affiche le dernier échec de synchro d’une base absente', () => {
    renderHeader({ kb: { ...KB_ABSENT, message: 'Dernière synchro échouée : wiki injoignable' } });
    expect(screen.getByText('Wiki: missing')).toHaveClass('badge--absent');
    expect(screen.getByText('Wiki: Dernière synchro échouée : wiki injoignable')).toBeInTheDocument();
  });

  it('montre l’état du wiki même sans résumé de progression', () => {
    renderHeader({ summary: null, kb: KB_ABSENT });
    expect(within(screen.getByRole('list', { name: 'Source states' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('ajoute l’état du conseiller', () => {
    renderHeader({ advisor: ADVISOR_OK });
    const ollama = screen.getByText('Advisor: OK');
    expect(ollama).toHaveClass('badge--ok');
    expect(ollama).toHaveAttribute('title', 'qwen3.5:9b on http://127.0.0.1:11434');
  });

  it('affiche le message d’un serveur Ollama injoignable', () => {
    renderHeader({ advisor: ADVISOR_OFFLINE });
    expect(screen.getByText('Advisor: unreachable')).toHaveClass('badge--absent');
    expect(
      screen.getByText('Advisor: Ollama unreachable at http://127.0.0.1:11434 (ECONNREFUSED)'),
    ).toBeInTheDocument();
  });

  it('propose les onglets Routes et Conseiller', async () => {
    const user = userEvent.setup();
    const props = renderHeader();
    const tabs = within(screen.getByRole('navigation')).getAllByRole('button').map((b) => b.textContent);
    expect(tabs).toEqual(['Tableau de bord', 'Succès', 'Routes', 'Conseiller', 'Paramètres']);
    await user.click(screen.getByRole('button', { name: 'Routes' }));
    expect(props.onTabChange).toHaveBeenCalledWith('routes');
    await user.click(screen.getByRole('button', { name: 'Conseiller' }));
    expect(props.onTabChange).toHaveBeenCalledWith('advisor');
  });

  it('propose l’onglet Paramètres', async () => {
    const user = userEvent.setup();
    const props = renderHeader({ tab: 'settings' });
    expect(screen.getByRole('button', { name: 'Paramètres' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: 'Tableau de bord' }));
    expect(props.onTabChange).toHaveBeenCalledWith('dashboard');
  });

  it('change de slot', async () => {
    const user = userEvent.setup();
    const props = renderHeader();
    await user.selectOptions(screen.getByLabelText('Sauvegarde'), 'Slot 2');
    expect(props.onQueryChange).toHaveBeenCalledWith({ profile: 'me', slot: 2 });
  });

  it('masque le choix du slot quand il n’y en a qu’un', () => {
    renderHeader({ summary: makeSummary({ save: { slot: 1, slots: [1] } }) });
    expect(screen.queryByLabelText('Sauvegarde')).not.toBeInTheDocument();
  });

  it('relaie les actions', async () => {
    const user = userEvent.setup();
    const props = renderHeader();
    await user.click(screen.getByRole('button', { name: 'Succès' }));
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    await user.click(screen.getByRole('button', { name: 'Passer au thème clair' }));
    await user.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(props.onTabChange).toHaveBeenCalledWith('achievements');
    expect(props.onRefresh).toHaveBeenCalled();
    expect(props.onToggleTheme).toHaveBeenCalled();
    expect(props.onStop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tableau de bord' })).toHaveAttribute('aria-current', 'page');
  });

  it('désactive Actualiser pendant un chargement et sans résumé', () => {
    renderHeader({ summary: null, refreshing: true });
    expect(screen.getByRole('button', { name: 'Actualisation…' })).toBeDisabled();
    expect(screen.queryByRole('list', { name: 'Source states' })).not.toBeInTheDocument();
  });

  it('offers the language picker without its explanatory hint', () => {
    renderHeader();
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
    expect(screen.queryByText(/data\/settings\.json/)).not.toBeInTheDocument();
  });
});

describe('ProfilePicker', () => {
  it('affiche le nom du profil courant', () => {
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName="Player" onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Mon profil (Player)' })).toBeInTheDocument();
  });

  it('charge un autre joueur et le mémorise', async () => {
    const user = userEvent.setup();
    stubFetch({
      'GET /api/profile/resolve': (url) => {
        expect(url.searchParams.get('input')).toBe('JustAFriend');
        return { steamId64: '76561198000000001', name: 'Ami' };
      },
    });
    const onChange = vi.fn();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName="Player" onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    await user.type(screen.getByLabelText('SteamID64, URL de profil ou pseudo'), 'JustAFriend');
    await user.click(screen.getByRole('button', { name: 'Charger' }));
    expect(onChange).toHaveBeenCalledWith('76561198000000001');
    expect(JSON.parse(localStorage.getItem(RECENT_PROFILES_KEY) ?? '[]')).toEqual([{ steamId64: '76561198000000001', name: 'Ami' }]);
    expect(screen.getByRole('option', { name: 'Ami' })).toBeInTheDocument();
    expect(screen.queryByLabelText('SteamID64, URL de profil ou pseudo')).not.toBeInTheDocument();
  });

  it('affiche l’erreur de résolution', async () => {
    const user = userEvent.setup();
    stubFetch({ 'GET /api/profile/resolve': () => jsonResponse({ error: 'Profil Steam introuvable' }, 404) });
    const onChange = vi.fn();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName={null} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    await user.type(screen.getByLabelText('SteamID64, URL de profil ou pseudo'), 'inconnu');
    await user.click(screen.getByRole('button', { name: 'Charger' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Profil Steam introuvable');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('propose les profils récents et les autres comptes locaux', async () => {
    const user = userEvent.setup();
    rememberProfile({ steamId64: '76561198000000001', name: 'Ami' });
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
    expect(screen.getByRole('option', { name: 'Second Player (compte local)' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Profil'), 'Ami');
    expect(onChange).toHaveBeenCalledWith('76561198000000001');
  });

  it('ne répète pas le compte servi sous « Mon profil »', () => {
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
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Mon profil (Player)', 'Autre joueur…']);
  });

  it('liste un second compte local mais pas le compte principal', () => {
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
      'Mon profil (Player)',
      'Second Player (compte local)',
      'Autre joueur…',
    ]);
  });

  it('affiche un profil courant inconnu de la liste', () => {
    render(<ProfilePicker meSteamId={null} profile="76561198000000009" accounts={[]} currentName="Inconnu" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Profil')).toHaveValue('76561198000000009');
    expect(screen.getByRole('option', { name: 'Inconnu' })).toBeInTheDocument();
  });

  it('annule la saisie', async () => {
    const user = userEvent.setup();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName={null} onChange={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByLabelText('Profil')).toHaveValue('me');
  });

  it('ignore une résolution qui arrive après l’annulation', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: unknown) => void = () => {};
    const pending = new Promise<unknown>((resolve) => {
      resolveFetch = resolve;
    });
    stubFetch({ 'GET /api/profile/resolve': () => pending });
    const onChange = vi.fn();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName={null} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    await user.type(screen.getByLabelText('SteamID64, URL de profil ou pseudo'), 'JustAFriend');
    await user.click(screen.getByRole('button', { name: 'Charger' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await act(async () => {
      resolveFetch({ steamId64: '76561198000000001', name: 'Ami' });
      await pending;
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('option', { name: 'Ami' })).not.toBeInTheDocument();
    expect(localStorage.getItem(RECENT_PROFILES_KEY)).toBeNull();
  });

  it('vide le champ de saisie en rouvrant après une annulation', async () => {
    const user = userEvent.setup();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName={null} onChange={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    await user.type(screen.getByLabelText('SteamID64, URL de profil ou pseudo'), 'texte perdu');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    expect(screen.getByLabelText('SteamID64, URL de profil ou pseudo')).toHaveValue('');
  });

  it('ignore une résolution obsolète et libère le formulaire quand on change de profil dans la liste', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: unknown) => void = () => {};
    const pending = new Promise<unknown>((resolve) => {
      resolveFetch = resolve;
    });
    stubFetch({ 'GET /api/profile/resolve': () => pending });
    const onChange = vi.fn();
    render(<ProfilePicker meSteamId={null} profile="me" accounts={[]} currentName="Player" onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    await user.type(screen.getByLabelText('SteamID64, URL de profil ou pseudo'), 'JustAFriend');
    await user.click(screen.getByRole('button', { name: 'Charger' }));
    await user.selectOptions(screen.getByLabelText('Profil'), 'Mon profil (Player)');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('me');
    await act(async () => {
      resolveFetch({ steamId64: '76561198000000001', name: 'Ami' });
      await pending;
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    expect(screen.getByRole('button', { name: 'Charger' })).toBeEnabled();
    expect(screen.getByLabelText('SteamID64, URL de profil ou pseudo')).toHaveValue('');
  });
});

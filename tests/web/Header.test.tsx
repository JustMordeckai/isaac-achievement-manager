import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Header, type HeaderProps } from '../../web/src/components/Header.tsx';
import { ProfilePicker } from '../../web/src/components/ProfilePicker.tsx';
import { rememberProfile, RECENT_PROFILES_KEY } from '../../web/src/recent-profiles.ts';
import { makeSummary } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

function renderHeader(overrides: Partial<HeaderProps> = {}) {
  const props: HeaderProps = {
    summary: makeSummary(),
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
    expect(screen.getByText('Cache Steam : obsolète')).toHaveAttribute('title', 'Le profil en ligne compte 1 succès de plus que le cache local');
    expect(screen.getByText('Sauvegarde : erreur')).toHaveClass('badge--error');
    expect(screen.getByText('Profil en ligne : OK')).toHaveClass('badge--ok');
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
    expect(screen.queryByRole('list', { name: 'État des sources' })).not.toBeInTheDocument();
  });
});

describe('ProfilePicker', () => {
  it('affiche le nom du profil courant', () => {
    render(<ProfilePicker profile="me" accounts={[]} currentName="Player" onChange={vi.fn()} />);
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
    render(<ProfilePicker profile="me" accounts={[]} currentName="Player" onChange={onChange} />);
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
    render(<ProfilePicker profile="me" accounts={[]} currentName={null} onChange={onChange} />);
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

  it('affiche un profil courant inconnu de la liste', () => {
    render(<ProfilePicker profile="76561198000000009" accounts={[]} currentName="Inconnu" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Profil')).toHaveValue('76561198000000009');
    expect(screen.getByRole('option', { name: 'Inconnu' })).toBeInTheDocument();
  });

  it('annule la saisie', async () => {
    const user = userEvent.setup();
    render(<ProfilePicker profile="me" accounts={[]} currentName={null} onChange={vi.fn()} />);
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
    render(<ProfilePicker profile="me" accounts={[]} currentName={null} onChange={onChange} />);
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
    render(<ProfilePicker profile="me" accounts={[]} currentName={null} onChange={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    await user.type(screen.getByLabelText('SteamID64, URL de profil ou pseudo'), 'texte perdu');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.selectOptions(screen.getByLabelText('Profil'), 'Autre joueur…');
    expect(screen.getByLabelText('SteamID64, URL de profil ou pseudo')).toHaveValue('');
  });
});

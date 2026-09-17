import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RoutePlan } from '../../shared/types.ts';
import { Routes, type RoutesProps } from '../../web/src/pages/Routes.tsx';
import { KB_ABSENT, KB_OK, makePlan, makeRun } from './factories.ts';

function renderRoutes(plan: RoutePlan | null = makePlan(), overrides: Partial<RoutesProps> = {}) {
  const props: RoutesProps = {
    state: { status: 'ready', data: { kb: plan ? KB_OK : KB_ABSENT, plan }, refreshing: false },
    onOpenSettings: vi.fn(),
    onOpenAchievement: vi.fn(),
    onAsk: vi.fn(),
    onRetry: vi.fn(),
    onResetProfile: null,
    ...overrides,
  };
  return { ...render(<Routes {...props} />), props };
}

const runTitles = () =>
  within(screen.getByRole('region', { name: 'Runs conseillées' }))
    .queryAllByRole('article')
    .map((a) => a.getAttribute('aria-labelledby'));

const MISSING = [{ anyOf: [{ id: 407, name: 'A Secret Exit' }], met: false }];

describe('Routes : runs conseillées', () => {
  it('liste les runs jouables et compte les autres', () => {
    renderRoutes();
    expect(screen.getByRole('heading', { level: 2, name: 'Runs conseillées' })).toBeInTheDocument();
    expect(screen.getByText(/^2 runs jouables tout de suite sur 3/)).toBeInTheDocument();
    expect(runTitles()).toEqual(['run-magdalene-1', 'run-isaac-1']);
  });

  it('affiche aussi les runs à débloquer sur demande', async () => {
    const user = userEvent.setup();
    renderRoutes();
    await user.click(screen.getByLabelText('Afficher aussi les runs à débloquer'));
    expect(runTitles()).toEqual(['run-magdalene-1', 'run-isaac-1', 'run-isaac-2']);
    expect(screen.getByText(/^À débloquer d'abord/)).toHaveTextContent("À débloquer d'abord : A Secret Exit");
  });

  it('filtre par personnage présent dans le plan', async () => {
    const user = userEvent.setup();
    renderRoutes();
    const select = screen.getByLabelText('Personnage');
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Tous', 'Isaac', 'Magdalene']);
    expect(options.map((o) => o.getAttribute('lang'))).toEqual([null, 'en', 'en']);
    await user.selectOptions(select, 'Isaac');
    expect(runTitles()).toEqual(['run-isaac-1']);
    await user.selectOptions(select, 'Tous');
    expect(runTitles()).toHaveLength(2);
  });

  it('revient à tous les personnages quand le personnage filtré sort du plan', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderRoutes();
    await user.selectOptions(screen.getByLabelText('Personnage'), 'Isaac');
    expect(runTitles()).toEqual(['run-isaac-1']);
    const plan = makePlan({ runs: [makeRun()] });
    rerender(<Routes {...props} state={{ status: 'ready', data: { kb: KB_OK, plan }, refreshing: false }} />);
    expect(screen.getByLabelText('Personnage')).toHaveValue('all');
    expect(runTitles()).toEqual(['run-magdalene-1']);
  });

  it('explique une liste vide', async () => {
    const user = userEvent.setup();
    const { unmount } = renderRoutes(
      makePlan({ runs: [makeRun(), makeRun({ id: 'isaac-2', character: 'isaac', missing: MISSING })] }),
    );
    await user.selectOptions(screen.getByLabelText('Personnage'), 'Isaac');
    expect(
      screen.getByText("Aucune run jouable pour ce choix : affiche les runs à débloquer pour voir quoi débloquer d'abord."),
    ).toBeInTheDocument();
    expect(screen.getByText(/^1 run jouable tout de suite sur 2/)).toBeInTheDocument();
    unmount();
    renderRoutes(makePlan({ runs: [] }));
    expect(
      screen.getByText('Aucune run à proposer : les succès liés aux marques sont tous obtenus.'),
    ).toBeInTheDocument();
  });

  it('affiche les runs par pages de 20', async () => {
    const user = userEvent.setup();
    const runs = Array.from({ length: 25 }, (_, i) => makeRun({ id: `magdalene-${i + 1}` }));
    renderRoutes(makePlan({ runs }));
    expect(runTitles()).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: 'Afficher 5 runs de plus' }));
    expect(runTitles()).toHaveLength(25);
    expect(screen.queryByRole('button', { name: /runs de plus/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Personnage'), 'Magdalene');
    expect(runTitles()).toHaveLength(20);
  });

  it('accorde le bouton quand il ne reste qu’une run', async () => {
    const user = userEvent.setup();
    const runs = Array.from({ length: 21 }, (_, i) => makeRun({ id: `magdalene-${i + 1}` }));
    renderRoutes(makePlan({ runs }));
    await user.click(screen.getByRole('button', { name: 'Afficher 1 run de plus' }));
    expect(runTitles()).toHaveLength(21);
  });

  it('ouvre la fiche d’un succès depuis une run', async () => {
    const user = userEvent.setup();
    const { props } = renderRoutes();
    await user.click(screen.getByRole('button', { name: 'Censer' }));
    expect(props.onOpenAchievement).toHaveBeenCalledWith(193);
  });

  it('pose au conseiller la question d’une run', async () => {
    const user = userEvent.setup();
    const { props } = renderRoutes();
    const [magdalene] = within(screen.getByRole('region', { name: 'Runs conseillées' })).getAllByRole('article');
    await user.click(within(magdalene).getByRole('button', { name: 'Demander au conseiller' }));
    expect(props.onAsk).toHaveBeenCalledWith(
      expect.stringMatching(/^Comment réussir cette run avec Magdalene en mode difficile/),
    );
  });
});

describe('Routes : hors routes', () => {
  it('résume chaque catégorie', () => {
    renderRoutes();
    const section = screen.getByRole('region', { name: 'Hors routes' });
    expect([...section.querySelectorAll('summary')].map((s) => s.textContent)).toEqual([
      'Défis (1)',
      'Compteurs (2)',
      'Placards de Home (1)',
      'Divers (1)',
    ]);
  });

  it('décrit les défis et leur prérequis manquant', async () => {
    const user = userEvent.setup();
    const { props } = renderRoutes();
    const challenge = screen.getByRole('button', { name: 'Rune of Perthro' }).closest('li');
    expect(challenge).toHaveTextContent(
      "Rune of Perthro : défi n° 6 Solar System, avec Isaac, objectif Mom's Heart, objets de départ : Distant Admiration (à débloquer d'abord : Solar System)",
    );
    await user.click(screen.getByRole('button', { name: 'Rune of Perthro' }));
    expect(props.onOpenAchievement).toHaveBeenCalledWith(94);
  });

  it('donne la malédiction et les objets de départ d’un défi', () => {
    const plan = makePlan();
    const [challenge] = plan.offRoute.challenges;
    plan.offRoute.challenges = [
      { ...challenge, curse: 'Curse of the Blind', startingItems: ['Distant Admiration', 'Forever Alone'], requirement: null },
    ];
    renderRoutes(plan);
    const item = screen.getByRole('button', { name: 'Rune of Perthro' }).closest('li');
    expect(item).toHaveTextContent(
      "Rune of Perthro : défi n° 6 Solar System, avec Isaac, objectif Mom's Heart, malédiction Curse of the Blind, objets de départ : Distant Admiration, Forever Alone",
    );
    expect(within(item as HTMLElement).getByText('Curse of the Blind')).toHaveAttribute('lang', 'en');
    expect(within(item as HTMLElement).getByText('Distant Admiration, Forever Alone')).toHaveAttribute('lang', 'en');
  });

  it('montre la progression connue des compteurs', () => {
    renderRoutes();
    const dank = screen.getByRole('button', { name: 'Dank Depths' }).closest('li');
    expect(dank).toHaveTextContent(/^Dank Depths : Defeat It Lives! 21 times/);
    expect(within(dank as HTMLElement).getByText('16 / 21')).toHaveClass('todo-list__value');
    expect(dank?.querySelector('.progress')).toHaveAttribute('aria-hidden', 'true');
    const hole = screen.getByRole('button', { name: 'Black Hole' }).closest('li');
    expect(hole).toHaveTextContent('Black Hole : Defeat 20 Portals');
    expect(hole?.querySelector('.progress')).toBeNull();
  });

  it('plafonne un compteur dépassé', () => {
    const plan = makePlan();
    plan.offRoute.counters = [{ id: 344, name: 'Dank Depths', condition: 'Defeat It Lives! 21 times', total: 21, value: 30 }];
    renderRoutes(plan);
    expect(screen.getByText('21 / 21')).toBeInTheDocument();
  });

  it('regroupe les placards par personnage et rappelle la Red Key', () => {
    const { unmount } = renderRoutes();
    const hint = screen.getByText(/^Ils s'ouvrent pendant la route de/);
    expect(hint).toHaveTextContent(
      "Ils s'ouvrent pendant la route de The Beast, avec une Red Key, une Cracked Key ou Soul of Cain. Le coffre de Mom donne la Red Key au premier passage à Home.",
    );
    expect([...hint.querySelectorAll('span[lang="en"]')].map((s) => s.textContent)).toEqual([
      'The Beast',
      'Red Key',
      'Cracked Key',
      'Soul of Cain',
      'Mom',
      'Red Key',
      'Home',
    ]);
    expect(screen.getByRole('button', { name: 'The Broken' }).closest('li')).toHaveTextContent('Isaac : The Broken');
    unmount();
    const plan = makePlan();
    plan.offRoute.redKey = true;
    renderRoutes(plan);
    expect(screen.getByText(/^Ils s'ouvrent pendant la route de/)).toHaveTextContent(
      /^Ils s'ouvrent pendant la route de The Beast, avec une Red Key, une Cracked Key ou Soul of Cain\.$/,
    );
  });

  it('classe les succès divers par extension', () => {
    renderRoutes();
    const rebirth = screen.getByRole('heading', { level: 3, name: 'Rebirth' });
    expect(rebirth.nextElementSibling).toHaveTextContent('Little Gish : Defeat Gish');
    expect(screen.queryByRole('heading', { level: 3, name: 'Repentance' })).not.toBeInTheDocument();
  });
});

describe('Routes : états', () => {
  it('indique le calcul en cours', () => {
    renderRoutes(null, { state: { status: 'loading' } });
    expect(screen.getByText('Calcul des routes…')).toBeInTheDocument();
  });

  it('propose de réessayer après une erreur, ou de revenir à son profil', async () => {
    const user = userEvent.setup();
    const onResetProfile = vi.fn();
    const { rerender, props } = renderRoutes(null, { state: { status: 'error', message: 'Profil Steam privé' } });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { level: 2, name: 'Impossible de calculer les routes' })).toBeInTheDocument();
    expect(alert).toHaveTextContent('Profil Steam privé');
    expect(within(alert).queryByRole('button', { name: 'Revenir à mon profil' })).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Réessayer' }));
    expect(props.onRetry).toHaveBeenCalled();
    rerender(<Routes {...props} onResetProfile={onResetProfile} />);
    await user.click(screen.getByRole('button', { name: 'Revenir à mon profil' }));
    expect(onResetProfile).toHaveBeenCalled();
  });

  it('mène aux paramètres sans base wiki utilisable', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderRoutes(null);
    expect(screen.getByRole('status')).toHaveTextContent(/^Base wiki absente : les routes se calculent à partir du wiki/);
    await user.click(screen.getByRole('button', { name: 'Ouvrir les paramètres' }));
    expect(props.onOpenSettings).toHaveBeenCalled();
    const kb = { state: 'error' as const, syncedAt: null, running: false, message: 'Base wiki illisible : x' };
    rerender(<Routes {...props} state={{ status: 'ready', data: { kb, plan: null }, refreshing: false }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Base wiki inutilisable : Base wiki illisible : x');
    expect(screen.queryByRole('region', { name: 'Runs conseillées' })).not.toBeInTheDocument();
  });
});

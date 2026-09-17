import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Desync, ProgressSummary } from '../../shared/types.ts';
import { AchievementIcon } from '../../web/src/components/AchievementIcon.tsx';
import { Dashboard, type DashboardProps } from '../../web/src/pages/Dashboard.tsx';
import type { RoutesState } from '../../web/src/useRoutes.ts';
import { KB_ABSENT, KB_OK, makePlan, makeRun, makeSummary, ROUTES_OK } from './factories.ts';

const ROUTES_READY: RoutesState = { status: 'ready', data: ROUTES_OK, refreshing: false };

function renderDashboard(summary: ProgressSummary = makeSummary(), overrides: Partial<DashboardProps> = {}) {
  const props: DashboardProps = {
    summary,
    kb: KB_OK,
    routes: ROUTES_READY,
    onShowAchievements: vi.fn(),
    onOpenSettings: vi.fn(),
    onShowRoutes: vi.fn(),
    onOpenAchievement: vi.fn(),
    onAsk: vi.fn(),
    ...overrides,
  };
  return { ...render(<Dashboard {...props} />), props };
}

describe('Dashboard', () => {
  it('affiche la progression globale', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Progression' })).toBeInTheDocument();
    expect(screen.getByText('125')).toBeInTheDocument();
    expect(screen.getByText('19,5 %, 516 manquants')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progression globale' })).toHaveAttribute('aria-valuenow', '125');
  });

  it('ouvre la liste des manquants', async () => {
    const user = userEvent.setup();
    const { props } = renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Voir les 516 succès manquants' }));
    expect(props.onShowAchievements).toHaveBeenCalledWith({ status: 'missing', dlc: 'all', onlyDesync: false });
  });

  it('liste les extensions et ouvre la liste filtrée', async () => {
    const user = userEvent.setup();
    const { props } = renderDashboard();
    const plus = screen.getByRole('button', { name: 'Afterbirth+ : 5 sur 127, voir les manquants' });
    expect(within(plus).getByText('5 / 127')).toBeInTheDocument();
    await user.click(plus);
    expect(props.onShowAchievements).toHaveBeenCalledWith({ status: 'missing', dlc: 'afterbirthPlus', onlyDesync: false });
    expect(screen.getAllByRole('button', { name: /^(Rebirth|Afterbirth|Repentance)/ })).toHaveLength(5);
  });

  it('garde les barres des extensions décoratives', () => {
    renderDashboard();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('masque une extension sans succès', () => {
    const summary = makeSummary();
    summary.byDlc.repentancePlus = { total: 0, unlocked: 0 };
    renderDashboard(summary);
    expect(screen.queryByRole('button', { name: /^Repentance\+/ })).not.toBeInTheDocument();
  });

  it('liste les derniers déblocages', () => {
    const { container } = renderDashboard();
    expect(screen.getByText('Flooded Caves')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-09-16T14:30:51.000Z');
  });

  it('indique l’absence de date', () => {
    renderDashboard(makeSummary({ recent: [] }));
    expect(screen.getByText('Aucune date de déblocage connue.')).toBeInTheDocument();
  });

  it('liste les écarts et ouvre le filtre correspondant', async () => {
    const user = userEvent.setup();
    const { props } = renderDashboard();
    expect(screen.getByRole('heading', { name: 'Débloqués dans la sauvegarde, absents de Steam (1)' })).toBeInTheDocument();
    expect(screen.getByText('#638 Play Online')).toBeInTheDocument();
    expect(screen.queryByText(/Alt\+F2/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voir dans la liste' }));
    expect(props.onShowAchievements).toHaveBeenCalledWith({ status: 'all', dlc: 'all', onlyDesync: true });
  });

  it('résume les longues listes et donne l’astuce Alt+F2', () => {
    const desyncs: Desync[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Succès ${i + 1}`, kind: 'steamOnly' }));
    renderDashboard(makeSummary({ desyncs }));
    expect(screen.getByText('#10 Succès 10')).toBeInTheDocument();
    expect(screen.queryByText('#11 Succès 11')).not.toBeInTheDocument();
    expect(screen.getByText('et 2 autres')).toBeInTheDocument();
    expect(screen.getByText(/Alt\+F2/)).toBeInTheDocument();
  });

  it('indique l’absence d’écart', () => {
    renderDashboard(makeSummary({ desyncs: [] }));
    expect(screen.getByText(/Aucun écart/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir dans la liste' })).not.toBeInTheDocument();
  });

  it('affiche le singulier pour un seul manquant', () => {
    renderDashboard(makeSummary({ unlocked: 640, total: 641 }));
    expect(screen.getByText('99,8 %, 1 manquant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir le succès manquant' })).toBeInTheDocument();
  });

  it('affiche le singulier et masque le bouton quand il n’y a aucun manquant', () => {
    renderDashboard(makeSummary({ unlocked: 641, total: 641 }));
    expect(screen.getByText('100,0 %, 0 manquant')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /succès manquant/ })).not.toBeInTheDocument();
  });

  it('masque le bouton « Voir dans la liste » sans écart sauvegarde/Steam', () => {
    const desyncs: Desync[] = [{ id: 343, name: 'Flooded Caves', kind: 'profileAhead' }];
    renderDashboard(makeSummary({ desyncs }));
    expect(
      screen.getByRole('heading', { name: 'Sur le profil en ligne, pas encore dans le cache local (1)' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir dans la liste' })).not.toBeInTheDocument();
  });

  it('affiche le singulier pour un seul écart non affiché', () => {
    const desyncs: Desync[] = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, name: `Succès ${i + 1}`, kind: 'steamOnly' }));
    renderDashboard(makeSummary({ desyncs }));
    expect(screen.getByText('#10 Succès 10')).toBeInTheDocument();
    expect(screen.queryByText('#11 Succès 11')).not.toBeInTheDocument();
    expect(screen.getByText('et 1 autre')).toBeInTheDocument();
  });

  it('propose la synchro tant que la base wiki est absente ou inutilisable', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDashboard(makeSummary(), { kb: KB_ABSENT });
    expect(screen.getByText(/^Base wiki absente/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ouvrir les paramètres' }));
    expect(props.onOpenSettings).toHaveBeenCalled();
    rerender(<Dashboard {...props} kb={{ state: 'error', syncedAt: null, running: false, message: 'Base wiki illisible : x' }} />);
    expect(screen.getByText('Base wiki inutilisable : Base wiki illisible : x')).toBeInTheDocument();
    rerender(<Dashboard {...props} kb={KB_OK} />);
    expect(screen.queryByRole('button', { name: 'Ouvrir les paramètres' })).not.toBeInTheDocument();
    rerender(<Dashboard {...props} kb={null} />);
    expect(screen.queryByRole('button', { name: 'Ouvrir les paramètres' })).not.toBeInTheDocument();
  });
});

describe('Dashboard : plan de routes', () => {
  it('montre les meilleures runs jouables et ouvre les routes ou une fiche', async () => {
    const user = userEvent.setup();
    const { props } = renderDashboard();
    const section = screen.getByRole('region', { name: 'Meilleures runs' });
    const runs = within(section).getAllByRole('article');
    expect(runs.map((r) => within(r).getByRole('heading', { level: 3 }).textContent)).toEqual(['Magdalene', 'Isaac']);
    await user.click(within(section).getByRole('button', { name: 'Guardian Angel' }));
    expect(props.onOpenAchievement).toHaveBeenCalledWith(45);
    await user.click(within(section).getByRole('button', { name: 'Voir toutes les routes' }));
    expect(props.onShowRoutes).toHaveBeenCalled();
    await user.click(within(runs[1]).getByRole('button', { name: 'Demander au conseiller' }));
    expect(props.onAsk).toHaveBeenCalledWith(
      'Comment réussir cette run avec Isaac en mode Greed (battre Ultra Greed) ? Elle doit donner Censer (#193).',
    );
  });

  it('se limite à trois runs jouables', () => {
    const runs = ['a', 'b', 'c', 'd'].map((id) => makeRun({ id }));
    renderDashboard(makeSummary(), { routes: { ...ROUTES_READY, data: { ...ROUTES_OK, plan: makePlan({ runs }) } } });
    expect(within(screen.getByRole('region', { name: 'Meilleures runs' })).getAllByRole('article')).toHaveLength(3);
  });

  it('affiche la grille des marques après les meilleures runs', () => {
    renderDashboard();
    const grid = screen.getByRole('region', { name: 'Marques de complétion' });
    expect(within(grid).getAllByRole('row')).toHaveLength(35);
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles.indexOf('Meilleures runs')).toBeLessThan(titles.indexOf('Marques de complétion'));
    expect(titles.indexOf('Marques de complétion')).toBeLessThan(titles.indexOf('Écarts entre sources'));
  });

  it('signale l’absence de run jouable', () => {
    const plan = makePlan({ runs: [makeRun({ missing: [{ anyOf: [{ id: 1, name: 'Magdalene' }], met: false }] })] });
    renderDashboard(makeSummary(), { routes: { ...ROUTES_READY, data: { ...ROUTES_OK, plan } } });
    expect(screen.getByText("Aucune run jouable : débloque d'abord les prérequis indiqués dans les routes.")).toBeInTheDocument();
    renderDashboard(makeSummary(), { routes: { ...ROUTES_READY, data: { ...ROUTES_OK, plan: makePlan({ runs: [] }) } } });
    expect(screen.getByText('Aucune run à proposer.')).toBeInTheDocument();
  });

  it('indique le calcul en cours et les erreurs', () => {
    const { props, rerender } = renderDashboard(makeSummary(), { routes: { status: 'loading' } });
    expect(within(screen.getByRole('region', { name: 'Meilleures runs' })).getByText('Calcul des routes…')).toBeInTheDocument();
    rerender(<Dashboard {...props} routes={{ status: 'error', message: 'Serveur indisponible' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de calculer les routes : Serveur indisponible');
    expect(screen.queryByRole('region', { name: 'Meilleures runs' })).not.toBeInTheDocument();
  });

  it('masque le plan sans base wiki', () => {
    renderDashboard(makeSummary(), { kb: KB_ABSENT, routes: { ...ROUTES_READY, data: { kb: KB_ABSENT, plan: null } } });
    expect(screen.queryByRole('region', { name: 'Meilleures runs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Marques de complétion' })).not.toBeInTheDocument();
  });
});

describe('AchievementIcon', () => {
  it('affiche l’icône puis un repli en cas d’erreur', () => {
    const { container } = render(<AchievementIcon file="abc.jpg" alt="Magdalene" />);
    const img = screen.getByRole('img', { name: 'Magdalene' });
    expect(img).toHaveAttribute('src', '/api/icons/abc.jpg');
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('.ach-icon--missing')).not.toBeNull();
  });

  it('affiche le repli sans fichier', () => {
    const { container } = render(<AchievementIcon file="" alt="" />);
    expect(container.querySelector('.ach-icon--missing')).not.toBeNull();
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Desync, ProgressSummary } from '../../shared/types.ts';
import { AchievementIcon } from '../../web/src/components/AchievementIcon.tsx';
import { Dashboard, type DashboardProps } from '../../web/src/pages/Dashboard.tsx';
import { KB_ABSENT, KB_OK, makeSummary } from './factories.ts';

function renderDashboard(summary: ProgressSummary = makeSummary(), overrides: Partial<DashboardProps> = {}) {
  const props: DashboardProps = { summary, kb: KB_OK, onShowAchievements: vi.fn(), onOpenSettings: vi.fn(), ...overrides };
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

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Desync } from '../../shared/types.ts';
import { AchievementIcon } from '../../web/src/components/AchievementIcon.tsx';
import { Dashboard } from '../../web/src/pages/Dashboard.tsx';
import { makeSummary } from './factories.ts';

describe('Dashboard', () => {
  it('affiche la progression globale', () => {
    render(<Dashboard summary={makeSummary()} onShowAchievements={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Progression' })).toBeInTheDocument();
    expect(screen.getByText('125')).toBeInTheDocument();
    expect(screen.getByText('19,5 %, 516 manquants')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progression globale' })).toHaveAttribute('aria-valuenow', '125');
  });

  it('ouvre la liste des manquants', async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    render(<Dashboard summary={makeSummary()} onShowAchievements={onShow} />);
    await user.click(screen.getByRole('button', { name: 'Voir les 516 succès manquants' }));
    expect(onShow).toHaveBeenCalledWith({ status: 'missing', dlc: 'all', onlyDesync: false });
  });

  it('liste les extensions et ouvre la liste filtrée', async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    render(<Dashboard summary={makeSummary()} onShowAchievements={onShow} />);
    const plus = screen.getByRole('button', { name: /^Afterbirth\+/ });
    expect(within(plus).getByText('5 / 127')).toBeInTheDocument();
    await user.click(plus);
    expect(onShow).toHaveBeenCalledWith({ status: 'missing', dlc: 'afterbirthPlus', onlyDesync: false });
    expect(screen.getAllByRole('button', { name: /^(Rebirth|Afterbirth|Repentance)/ })).toHaveLength(5);
  });

  it('masque une extension sans succès', () => {
    const summary = makeSummary();
    summary.byDlc.repentancePlus = { total: 0, unlocked: 0 };
    render(<Dashboard summary={summary} onShowAchievements={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Repentance\+/ })).not.toBeInTheDocument();
  });

  it('liste les derniers déblocages', () => {
    const { container } = render(<Dashboard summary={makeSummary()} onShowAchievements={vi.fn()} />);
    expect(screen.getByText('Flooded Caves')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-09-16T14:30:51.000Z');
  });

  it('indique l’absence de date', () => {
    render(<Dashboard summary={makeSummary({ recent: [] })} onShowAchievements={vi.fn()} />);
    expect(screen.getByText('Aucune date de déblocage connue.')).toBeInTheDocument();
  });

  it('liste les écarts et ouvre le filtre correspondant', async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    render(<Dashboard summary={makeSummary()} onShowAchievements={onShow} />);
    expect(screen.getByRole('heading', { name: 'Débloqués dans la sauvegarde, absents de Steam (1)' })).toBeInTheDocument();
    expect(screen.getByText('#638 Play Online')).toBeInTheDocument();
    expect(screen.queryByText(/Alt\+F2/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voir dans la liste' }));
    expect(onShow).toHaveBeenCalledWith({ status: 'all', dlc: 'all', onlyDesync: true });
  });

  it('résume les longues listes et donne l’astuce Alt+F2', () => {
    const desyncs: Desync[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Succès ${i + 1}`, kind: 'steamOnly' }));
    render(<Dashboard summary={makeSummary({ desyncs })} onShowAchievements={vi.fn()} />);
    expect(screen.getByText('#10 Succès 10')).toBeInTheDocument();
    expect(screen.queryByText('#11 Succès 11')).not.toBeInTheDocument();
    expect(screen.getByText('et 2 autres')).toBeInTheDocument();
    expect(screen.getByText(/Alt\+F2/)).toBeInTheDocument();
  });

  it('indique l’absence d’écart', () => {
    render(<Dashboard summary={makeSummary({ desyncs: [] })} onShowAchievements={vi.fn()} />);
    expect(screen.getByText(/Aucun écart/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir dans la liste' })).not.toBeInTheDocument();
  });

  it('affiche le singulier pour un seul manquant', () => {
    render(<Dashboard summary={makeSummary({ unlocked: 640, total: 641 })} onShowAchievements={vi.fn()} />);
    expect(screen.getByText('99,8 %, 1 manquant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir le succès manquant' })).toBeInTheDocument();
  });

  it('affiche le singulier pour un seul désyncs restant', () => {
    const desyncs: Desync[] = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, name: `Succès ${i + 1}`, kind: 'steamOnly' }));
    render(<Dashboard summary={makeSummary({ desyncs })} onShowAchievements={vi.fn()} />);
    expect(screen.getByText('#10 Succès 10')).toBeInTheDocument();
    expect(screen.queryByText('#11 Succès 11')).not.toBeInTheDocument();
    expect(screen.getByText('et 1 autre')).toBeInTheDocument();
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

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { AchievementState } from '../../shared/types.ts';
import { DEFAULT_FILTER, type AchievementFilter } from '../../web/src/lib/filter.ts';
import { Achievements } from '../../web/src/pages/Achievements.tsx';
import { makeAchievement } from './factories.ts';

const LIST = [
  makeAchievement(1, { name: 'Magdalene', unlocked: true, unlockedAt: '2023-02-20T20:15:25.000Z', inSave: true }),
  makeAchievement(9, { name: 'The Nail', description: 'Unlocked a new item.' }),
  makeAchievement(343, { name: 'Flooded Caves', dlc: 'afterbirthPlus', unlocked: true, unlockedAt: '2026-09-16T14:30:51.000Z', inSave: true }),
  makeAchievement(638, { name: 'Play Online', dlc: 'repentance', inSave: true, hidden: true }),
];

function Harness({ list = LIST, initial = DEFAULT_FILTER }: { list?: AchievementState[]; initial?: AchievementFilter }) {
  const [filter, setFilter] = useState(initial);
  return <Achievements achievements={list} filter={filter} onFilterChange={setFilter} />;
}

const rows = () => within(screen.getByRole('list', { name: 'Succès' })).getAllByRole('listitem');

describe('Achievements', () => {
  it('affiche les manquants par défaut', () => {
    render(<Harness />);
    expect(screen.getByText('2 succès')).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(screen.getByText('The Nail')).toBeInTheDocument();
    expect(screen.queryByText('Magdalene')).not.toBeInTheDocument();
  });

  it('applique la recherche et les filtres', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Recherche'), 'nail');
    expect(rows()).toHaveLength(1);
    await user.clear(screen.getByLabelText('Recherche'));
    await user.selectOptions(screen.getByLabelText('État'), 'Tous');
    expect(rows()).toHaveLength(4);
    await user.selectOptions(screen.getByLabelText('Extension'), 'Afterbirth+');
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Flooded Caves')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Extension'), 'Toutes');
    await user.selectOptions(screen.getByLabelText('Secrets'), 'Secrets uniquement');
    expect(rows()).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText('Secrets'), 'Tous');
    await user.click(screen.getByLabelText('Écarts sauvegarde/Steam'));
    expect(screen.getByText('Play Online')).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
  });

  it('trie par déblocage récent', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...DEFAULT_FILTER, status: 'unlocked' }} />);
    await user.selectOptions(screen.getByLabelText('Tri'), 'Déblocage récent');
    expect(rows().map((row) => within(row).getByText(/Flooded Caves|Magdalene/).textContent)).toEqual(['Flooded Caves', 'Magdalene']);
  });

  it('décrit l’état de chaque succès', () => {
    render(<Harness initial={{ ...DEFAULT_FILTER, status: 'all' }} />);
    const [magdalene, , , playOnline] = rows();
    expect(within(magdalene).getByText(/Débloqué le/)).toBeInTheDocument();
    expect(magdalene.querySelector('time')).toHaveAttribute('datetime', '2023-02-20T20:15:25.000Z');
    expect(within(playOnline).getByText('Manquant')).toBeInTheDocument();
    expect(within(playOnline).getByText('secret')).toBeInTheDocument();
    expect(within(playOnline).getByText('Repentance')).toBeInTheDocument();
    expect(within(playOnline).getByText('dans la sauvegarde')).toBeInTheDocument();
    expect(within(playOnline).getByText('#638')).toBeInTheDocument();
  });

  it('signale un succès Steam absent de la sauvegarde', () => {
    render(<Harness list={[makeAchievement(5, { unlocked: true, inSave: false })]} initial={{ ...DEFAULT_FILTER, status: 'all' }} />);
    expect(screen.getByText('absent de la sauvegarde')).toBeInTheDocument();
    expect(screen.getByText('Débloqué')).toBeInTheDocument();
  });

  it('pagine les longues listes', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 150 }, (_, i) => makeAchievement(i + 1));
    render(<Harness list={many} />);
    expect(rows()).toHaveLength(100);
    await user.click(screen.getByRole('button', { name: 'Afficher plus (50 restants)' }));
    expect(rows()).toHaveLength(150);
    expect(screen.queryByRole('button', { name: /Afficher plus/ })).not.toBeInTheDocument();
  });

  it('indique une liste vide', () => {
    render(<Harness initial={{ ...DEFAULT_FILTER, search: 'introuvable' }} />);
    expect(screen.getByText('Aucun succès ne correspond à ces filtres.')).toBeInTheDocument();
    expect(screen.getByText('0 succès')).toBeInTheDocument();
  });
});

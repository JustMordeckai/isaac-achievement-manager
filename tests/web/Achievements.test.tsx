import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AchievementEntry } from '../../shared/types.ts';
import { DEFAULT_FILTER, type AchievementFilter } from '../../web/src/lib/filter.ts';
import { Achievements } from '../../web/src/pages/Achievements.tsx';
import { makeAchievement } from './factories.ts';

const LIST = [
  makeAchievement(1, { name: 'Magdalene', unlocked: true, unlockedAt: '2023-02-20T20:15:25.000Z', inSave: true }),
  makeAchievement(9, { name: 'The Nail', description: 'Unlocked a new item.' }),
  makeAchievement(343, { name: 'Flooded Caves', dlc: 'afterbirthPlus', unlocked: true, unlockedAt: '2026-09-16T14:30:51.000Z', inSave: true }),
  makeAchievement(638, { name: 'Play Online', dlc: 'repentance', inSave: true, hidden: true }),
];

const WIKI_LIST: AchievementEntry[] = [
  makeAchievement(9, { name: 'The Nail', how: 'mark', character: 'azazel' }),
  makeAchievement(60, { name: 'Maggy Now Holds a Pill!', how: 'challenge' }),
  makeAchievement(474, { name: 'Isaac Holds the Red Key', how: 'closet', character: 'isaac' }),
  makeAchievement(641, { name: 'Item Descriptions', how: 'misc' }),
];

interface HarnessProps {
  list?: AchievementEntry[];
  initial?: AchievementFilter;
  desyncIds?: ReadonlySet<number>;
  onOpen?: (id: number) => void;
}

/** Page avec son état de filtre et une fiche simulée, comme dans App. */
function Harness({ list = LIST, initial = DEFAULT_FILTER, desyncIds = new Set([638]), onOpen }: HarnessProps) {
  const [filter, setFilter] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <Achievements
      achievements={list}
      filter={filter}
      onFilterChange={setFilter}
      desyncIds={desyncIds}
      selectedId={selected}
      onOpen={(id) => {
        onOpen?.(id);
        setSelected(id);
      }}
      panel={
        selected !== null && (
          <aside aria-label="Fiche">
            <button type="button" onClick={() => setSelected(null)}>
              Fermer
            </button>
          </aside>
        )
      }
    />
  );
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

  it('masque les filtres du wiki sans base wiki', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Méthode')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Personnage')).not.toBeInTheDocument();
  });

  it('filtre par méthode et par personnage avec la base wiki', async () => {
    const user = userEvent.setup();
    render(<Harness list={WIKI_LIST} />);
    expect(within(screen.getByLabelText('Personnage')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tous',
      'Isaac',
      'Azazel',
    ]);
    await user.selectOptions(screen.getByLabelText('Méthode'), 'Placard de Home');
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Isaac Holds the Red Key')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Méthode'), 'Toutes');
    await user.selectOptions(screen.getByLabelText('Personnage'), 'Azazel');
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText('Marque de complétion')).toBeInTheDocument();
  });

  it('affiche la méthode dans la ligne, sauf « Autre condition »', () => {
    render(<Harness list={WIKI_LIST} />);
    const [nail, maggy, , descriptions] = rows();
    expect(within(nail).getByText('Marque de complétion')).toBeInTheDocument();
    expect(within(maggy).getByText('Défi')).toBeInTheDocument();
    expect(within(descriptions).queryByText('Autre condition')).not.toBeInTheDocument();
  });

  it('ouvre la fiche d’un succès, la marque et rend le focus à la fermeture', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    const nail = screen.getByRole('button', { name: 'The Nail' });
    await user.click(nail);
    expect(onOpen).toHaveBeenCalledWith(9);
    expect(nail).toHaveAttribute('aria-current', 'true');
    expect(nail.closest('li')).toHaveClass('ach--selected');
    expect(screen.getByRole('complementary', { name: 'Fiche' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(nail).toHaveFocus();
    expect(nail).not.toHaveAttribute('aria-current');
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

  it('affiche le singulier quand il ne reste qu’un succès à afficher', () => {
    const many = Array.from({ length: 101 }, (_, i) => makeAchievement(i + 1));
    render(<Harness list={many} />);
    expect(screen.getByRole('button', { name: 'Afficher plus (1 restant)' })).toBeInTheDocument();
  });

  it('indique une liste vide', () => {
    render(<Harness initial={{ ...DEFAULT_FILTER, search: 'introuvable' }} />);
    expect(screen.getByText('Aucun succès ne correspond à ces filtres.')).toBeInTheDocument();
    expect(screen.getByText('0 succès')).toBeInTheDocument();
  });
});

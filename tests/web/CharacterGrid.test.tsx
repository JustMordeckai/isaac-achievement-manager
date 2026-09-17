import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CharacterGrid } from '../../web/src/components/CharacterGrid.tsx';
import { makeCharacters } from './factories.ts';

const row = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}\\b`) });

describe('CharacterGrid', () => {
  it('affiche une ligne par personnage et une colonne par marque', () => {
    render(<CharacterGrid characters={makeCharacters()} source="save" />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(13);
    expect(headers[1].querySelector('abbr')).toHaveAttribute('title', "Mom's Heart");
    expect(headers[8]).toHaveTextContent('Greed');
    expect(screen.getAllByRole('row')).toHaveLength(35);
    expect(screen.getByText(/Marques lues dans la sauvegarde\./)).toBeInTheDocument();
  });

  it('décrit le niveau de chaque marque en texte', () => {
    render(<CharacterGrid characters={makeCharacters()} source="save" />);
    const isaac = within(row('Isaac')).getAllByRole('cell');
    expect(isaac).toHaveLength(12);
    expect(isaac[0]).toHaveTextContent("Mom's Heart : difficile");
    expect(isaac[0]).toHaveClass('mark--hard');
    expect(within(isaac[0]).getByText("Mom's Heart")).toHaveAttribute('lang', 'en');
    expect(isaac[1]).toHaveTextContent('Isaac : absente');
    expect(isaac[1]).toHaveClass('mark--none');
    expect(isaac[2]).toHaveTextContent('Satan : normal');
    expect(isaac[2]).toHaveClass('mark--normal');
    expect(isaac[7]).toHaveTextContent('Greed et Greedier : Greed');
  });

  it('signale les personnages verrouillés, la note complète et les marques inconnues', () => {
    const characters = makeCharacters().map((c) =>
      c.id === 'magdalene' ? { ...c, hardAll: true, marks: { ...c.marks, greed: 2 as const, beast: null } } : c,
    );
    render(<CharacterGrid characters={characters} source="inferred" />);
    const cain = row('Cain');
    expect(cain).toHaveClass('character-grid__locked');
    expect(within(cain).getByText('verrouillé')).toBeInTheDocument();
    const maggy = row('Magdalene');
    expect(within(maggy).getByText('note complète')).toBeInTheDocument();
    expect(within(maggy).queryByText('verrouillé')).not.toBeInTheDocument();
    const cells = within(maggy).getAllByRole('cell');
    expect(cells[7]).toHaveTextContent('Greed et Greedier : Greedier');
    expect(cells[11]).toHaveTextContent('The Beast : inconnue');
    expect(cells[11]).toHaveClass('mark--unknown');
    expect(screen.getByText(/Marques déduites des succès/)).toBeInTheDocument();
  });
});

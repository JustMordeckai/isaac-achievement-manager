import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { t } from '../../shared/i18n/index.ts';
import { CharacterGrid } from '../../web/src/components/CharacterGrid.tsx';
import { LocaleProvider } from '../../web/src/i18n.tsx';
import { makeCharacters } from './factories.ts';

const row = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}\\b`) });

describe('CharacterGrid', () => {
  it('shows one row per character and one column per mark', () => {
    render(<CharacterGrid characters={makeCharacters()} source="save" />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(13);
    expect(headers[1].querySelector('abbr')).toHaveAttribute('title', "Mom's Heart");
    expect(headers[8]).toHaveTextContent('Greed');
    expect(screen.getAllByRole('row')).toHaveLength(35);
    expect(screen.getByText(/Marks read from the save\./)).toBeInTheDocument();
  });

  it('describes the level of every mark in words', () => {
    render(<CharacterGrid characters={makeCharacters()} source="save" />);
    const isaac = within(row('Isaac')).getAllByRole('cell');
    expect(isaac).toHaveLength(12);
    expect(isaac[0]).toHaveTextContent("Mom's Heart: hard");
    expect(isaac[0]).toHaveClass('mark--hard');
    expect(within(isaac[0]).getByText("Mom's Heart")).toHaveAttribute('lang', 'en');
    expect(isaac[1]).toHaveTextContent('Isaac: missing');
    expect(isaac[1]).toHaveClass('mark--none');
    expect(isaac[2]).toHaveTextContent('Satan: normal');
    expect(isaac[2]).toHaveClass('mark--normal');
    expect(isaac[7]).toHaveTextContent('Greed / Greedier: Greed');
  });

  it('describes the level in the language of the interface', () => {
    render(
      <LocaleProvider locale="fr">
        <CharacterGrid characters={makeCharacters()} source="save" />
      </LocaleProvider>,
    );
    const isaac = within(row('Isaac')).getAllByRole('cell');
    expect(isaac[0]).toHaveTextContent(
      t('fr', 'dashboard.marks.cell', { mark: "Mom's Heart", level: t('fr', 'dashboard.marks.hard') }),
    );
  });

  it('reports locked characters, the full note and the unknown marks', () => {
    const characters = makeCharacters().map((c) =>
      c.id === 'magdalene' ? { ...c, hardAll: true, marks: { ...c.marks, greed: 2 as const, beast: null } } : c,
    );
    render(<CharacterGrid characters={characters} source="inferred" />);
    const cain = row('Cain');
    expect(cain).toHaveClass('character-grid__locked');
    expect(within(cain).getByText('locked')).toBeInTheDocument();
    const maggy = row('Magdalene');
    expect(within(maggy).getByText('full note')).toBeInTheDocument();
    expect(within(maggy).queryByText('locked')).not.toBeInTheDocument();
    const cells = within(maggy).getAllByRole('cell');
    expect(cells[7]).toHaveTextContent('Greed / Greedier: Greedier');
    expect(cells[11]).toHaveTextContent('The Beast: unknown');
    expect(cells[11]).toHaveClass('mark--unknown');
    expect(screen.getByText(/Marks inferred from the achievements/)).toBeInTheDocument();
  });
});

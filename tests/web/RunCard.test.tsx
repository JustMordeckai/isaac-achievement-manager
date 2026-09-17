import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RunCard } from '../../web/src/components/RunCard.tsx';
import { makeRun } from './factories.ts';

describe('RunCard', () => {
  it('résume la run et ouvre la fiche d’un succès', async () => {
    const user = userEvent.setup();
    const onOpenAchievement = vi.fn();
    render(<RunCard run={makeRun()} onOpenAchievement={onOpenAchievement} />);
    const card = screen.getByRole('article', { name: 'Magdalene' });
    expect(within(card).getByRole('heading', { level: 3 }).firstElementChild).toHaveAttribute('lang', 'en');
    expect(within(card).getByText('Difficile')).toHaveClass('run__mode--strong');
    expect(within(card).getByText('environ 1 h 14')).toBeInTheDocument();
    expect(within(card).getByText(/^Battre/)).toHaveTextContent("Battre Boss Rush, Mom's Heart, Satan, The Lamb");
    expect(
      within(card).getByText('2 succès, soit 1,6 par heure (pondéré par la difficulté du personnage)'),
    ).toBeInTheDocument();
    const chips = within(within(card).getByRole('list', { name: 'Succès obtenus' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Guardian Angel', "Maggy's Faith"]);
    await user.click(chips[1]);
    expect(onOpenAchievement).toHaveBeenCalledWith(71);
    expect(within(card).queryByText(/À débloquer d'abord/)).not.toBeInTheDocument();
  });

  it('déplie le chemin étape par étape', async () => {
    const user = userEvent.setup();
    const { container } = render(<RunCard run={makeRun()} onOpenAchievement={vi.fn()} />);
    const summary = screen.getByText('Chemin en 2 étapes');
    await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    const steps = [...container.querySelectorAll('.run__path li')].map((li) => li.textContent);
    expect(steps).toEqual(makeRun().steps);
  });

  it('indique les prérequis manquants et la note du personnage', () => {
    const run = makeRun({
      mode: 'normal',
      missing: [
        { anyOf: [{ id: 407, name: 'A Secret Exit' }], met: false },
        { anyOf: [{ id: 57, name: 'The Polaroid' }, { id: 78, name: 'The Negative' }], met: false },
      ],
      note: 'Eden change de départ à chaque partie.',
    });
    render(<RunCard run={run} onOpenAchievement={vi.fn()} />);
    expect(screen.getByText('Normal')).not.toHaveClass('run__mode--strong');
    expect(screen.getByText(/^À débloquer d'abord/)).toHaveTextContent(
      "À débloquer d'abord : A Secret Exit, The Polaroid ou The Negative",
    );
    expect(screen.getByText('Eden change de départ à chaque partie.')).toHaveClass('hint');
  });
});

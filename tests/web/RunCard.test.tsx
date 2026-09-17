import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RunCard } from '../../web/src/components/RunCard.tsx';
import { makeRun } from './factories.ts';

function renderCard(run = makeRun(), onOpenAchievement = vi.fn(), onAsk = vi.fn()) {
  return { ...render(<RunCard run={run} onOpenAchievement={onOpenAchievement} onAsk={onAsk} />), onAsk };
}

describe('RunCard', () => {
  it('résume la run et ouvre la fiche d’un succès', async () => {
    const user = userEvent.setup();
    const onOpenAchievement = vi.fn();
    renderCard(makeRun(), onOpenAchievement);
    const card = screen.getByRole('article', { name: 'Magdalene' });
    expect(within(card).getByRole('heading', { level: 3 }).firstElementChild).toHaveAttribute('lang', 'en');
    expect(within(card).getByText('Difficile')).toHaveClass('run__mode--strong');
    expect(within(card).getByText('environ 1 h 14')).toBeInTheDocument();
    expect(within(card).getByText(/^Battre/)).toHaveTextContent("Battre Boss Rush, Mom's Heart, Satan, The Lamb");
    expect(
      within(card).getByText('2 succès, soit 1,6 par heure (pondéré par la difficulté estimée du personnage)'),
    ).toBeInTheDocument();
    const chips = within(within(card).getByRole('list', { name: 'Succès obtenus' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Guardian Angel', "Maggy's Faith"]);
    await user.click(chips[1]);
    expect(onOpenAchievement).toHaveBeenCalledWith(71);
    expect(within(card).queryByText(/À débloquer d'abord/)).not.toBeInTheDocument();
  });

  it('déplie le chemin étape par étape', async () => {
    const user = userEvent.setup();
    const { container } = renderCard();
    const summary = screen.getByText('Chemin en 2 étapes');
    await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    const steps = [...container.querySelectorAll('.run__path li')].map((li) => li.textContent);
    expect(steps).toEqual(makeRun().steps);
  });

  it('accorde le chemin à une seule étape', () => {
    const run = makeRun({ steps: ['Traverser Basement, Caves et Depths, puis battre Mom en Depths II.'] });
    renderCard(run);
    expect(screen.getByText('Chemin en 1 étape')).toBeInTheDocument();
  });

  it('présente une run de préparation et ouvre les succès qu’elle rapproche', async () => {
    const user = userEvent.setup();
    const onOpenAchievement = vi.fn();
    const run = makeRun({
      id: 'isaac-1',
      character: 'isaac',
      endings: ['mother'],
      achievements: [],
      prepares: [{ id: 253, name: 'Buddy Baby' }],
      score: 0,
    });
    renderCard(run, onOpenAchievement);
    const card = screen.getByRole('article', { name: 'Isaac' });
    expect(
      within(card).getByText('Run de préparation : aucun succès tout de suite, elle rapproche de'),
    ).toBeInTheDocument();
    expect(within(card).queryByText(/par heure/)).not.toBeInTheDocument();
    expect(within(card).queryByRole('list', { name: 'Succès obtenus' })).not.toBeInTheDocument();
    const chip = within(within(card).getByRole('list', { name: 'Succès préparés' })).getByRole('button');
    expect(chip).toHaveClass('chip', 'chip--link');
    expect(chip).toHaveTextContent('Buddy Baby');
    expect(chip.firstElementChild).toHaveAttribute('lang', 'en');
    await user.click(chip);
    expect(onOpenAchievement).toHaveBeenCalledWith(253);
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
    renderCard(run);
    expect(screen.getByText('Normal')).not.toHaveClass('run__mode--strong');
    const missing = screen.getByText(/^À débloquer d'abord/);
    expect(missing).toHaveTextContent("À débloquer d'abord : A Secret Exit, The Polaroid ou The Negative");
    // Chaque nom est en anglais, les liaisons restent en français.
    expect([...missing.querySelectorAll('span[lang="en"]')].map((s) => s.textContent)).toEqual([
      'A Secret Exit',
      'The Polaroid',
      'The Negative',
    ]);
    expect(screen.getByText('Eden change de départ à chaque partie.')).toHaveClass('hint');
  });

  it('demande au conseiller comment réussir la run', async () => {
    const user = userEvent.setup();
    const { onAsk } = renderCard();
    const ask = screen.getByRole('button', { name: 'Demander au conseiller' });
    expect(ask).toHaveAccessibleDescription('Magdalene');
    await user.click(ask);
    expect(onAsk).toHaveBeenCalledWith(
      "Comment réussir cette run avec Magdalene en mode difficile (battre Boss Rush, Mom's Heart, Satan, The Lamb) ? Elle doit donner Guardian Angel (#45) et Maggy's Faith (#71).",
    );
  });

  it('demande au conseiller comment mener une run de préparation', async () => {
    const user = userEvent.setup();
    const run = makeRun({
      character: 'isaac',
      mode: 'greedier',
      endings: ['ultraGreedier'],
      achievements: [],
      prepares: [{ id: 253, name: 'Buddy Baby' }],
    });
    const { onAsk } = renderCard(run);
    await user.click(screen.getByRole('button', { name: 'Demander au conseiller' }));
    expect(onAsk).toHaveBeenCalledWith(
      "Comment réussir cette run avec Isaac en mode Greedier (battre Ultra Greedier) ? C'est une run de préparation pour Buddy Baby (#253).",
    );
  });
});

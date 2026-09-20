import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../shared/i18n/index.ts';
import { RunCard } from '../../web/src/components/RunCard.tsx';
import { LocaleProvider } from '../../web/src/i18n.tsx';
import { makeRun } from './factories.ts';

function renderCard(run = makeRun(), onOpenAchievement = vi.fn(), onAsk = vi.fn()) {
  return { ...render(<RunCard run={run} onOpenAchievement={onOpenAchievement} onAsk={onAsk} />), onAsk };
}

describe('RunCard', () => {
  it('sums up the run and opens the card of an achievement', async () => {
    const user = userEvent.setup();
    const onOpenAchievement = vi.fn();
    renderCard(makeRun(), onOpenAchievement);
    const card = screen.getByRole('article', { name: 'Magdalene' });
    expect(within(card).getByRole('heading', { level: 3 }).firstElementChild).toHaveAttribute('lang', 'en');
    expect(within(card).getByText('Hard')).toHaveClass('run__mode--strong');
    expect(within(card).getByText('about 1 h 14')).toBeInTheDocument();
    expect(within(card).getByText(/^Beat/)).toHaveTextContent("Beat Boss Rush, Mom's Heart, Satan, The Lamb");
    expect(
      within(card).getByText('2 achievements, that is 1.6 per hour (weighted by the estimated difficulty of the character)'),
    ).toBeInTheDocument();
    const chips = within(within(card).getByRole('list', { name: 'Achievements earned' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Guardian Angel', "Maggy's Faith"]);
    await user.click(chips[1]);
    expect(onOpenAchievement).toHaveBeenCalledWith(71);
    expect(within(card).queryByText(/To unlock first/)).not.toBeInTheDocument();
  });

  it('speaks French inside a French locale', () => {
    render(
      <LocaleProvider locale="fr">
        <RunCard run={makeRun()} onOpenAchievement={vi.fn()} onAsk={vi.fn()} />
      </LocaleProvider>,
    );
    expect(screen.getByRole('button', { name: t('fr', 'run.ask') })).toBeInTheDocument();
    expect(screen.getByText(t('fr', 'run.about', { minutes: '1 h 14' }))).toBeInTheDocument();
  });

  it('unfolds the path step by step', async () => {
    const user = userEvent.setup();
    const { container } = renderCard();
    const summary = screen.getByText('Path in 2 steps');
    await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    const steps = [...container.querySelectorAll('.run__path li')].map((li) => li.textContent);
    expect(steps).toEqual(makeRun().steps);
  });

  it('uses the singular for a path of one step', () => {
    const run = makeRun({ steps: ['Traverser Basement, Caves et Depths, puis battre Mom en Depths II.'] });
    renderCard(run);
    expect(screen.getByText('Path in 1 step')).toBeInTheDocument();
  });

  it('shows a prep run and opens the achievements it brings closer', async () => {
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
      within(card).getByText('Prep run: no achievement right away, it brings these closer'),
    ).toBeInTheDocument();
    expect(within(card).queryByText(/per hour/)).not.toBeInTheDocument();
    expect(within(card).queryByRole('list', { name: 'Achievements earned' })).not.toBeInTheDocument();
    const chip = within(within(card).getByRole('list', { name: 'Achievements this run prepares' })).getByRole('button');
    expect(chip).toHaveClass('chip', 'chip--link');
    expect(chip).toHaveTextContent('Buddy Baby');
    expect(chip.firstElementChild).toHaveAttribute('lang', 'en');
    await user.click(chip);
    expect(onOpenAchievement).toHaveBeenCalledWith(253);
  });

  it('lists the missing prerequisites and the note of the character', () => {
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
    const missing = screen.getByText(/^To unlock first/);
    expect(missing).toHaveTextContent('To unlock first: A Secret Exit, The Polaroid or The Negative');
    // Every name stays English, the connectors follow the interface language.
    expect([...missing.querySelectorAll('span[lang="en"]')].map((s) => s.textContent)).toEqual([
      'A Secret Exit',
      'The Polaroid',
      'The Negative',
    ]);
    expect(screen.getByText('Eden change de départ à chaque partie.')).toHaveClass('hint');
  });

  it('asks the advisor how to clear the run', async () => {
    const user = userEvent.setup();
    const { onAsk } = renderCard();
    const ask = screen.getByRole('button', { name: 'Ask the advisor' });
    expect(ask).toHaveAccessibleDescription('Magdalene');
    await user.click(ask);
    expect(onAsk).toHaveBeenCalledWith(
      "How do I clear this run with Magdalene in hard mode (beating Boss Rush, Mom's Heart, Satan, The Lamb)? It should give Guardian Angel (#45) and Maggy's Faith (#71).",
    );
  });

  it('asks the advisor how to run a prep run', async () => {
    const user = userEvent.setup();
    const run = makeRun({
      character: 'isaac',
      mode: 'greedier',
      endings: ['ultraGreedier'],
      achievements: [],
      prepares: [{ id: 253, name: 'Buddy Baby' }],
    });
    const { onAsk } = renderCard(run);
    await user.click(screen.getByRole('button', { name: 'Ask the advisor' }));
    expect(onAsk).toHaveBeenCalledWith(
      "How do I clear this run with Isaac in Greedier mode (beating Ultra Greedier)? It is a prep run for Buddy Baby (#253).",
    );
  });
});

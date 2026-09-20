import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../shared/i18n/index.ts';
import type { AchievementEntry } from '../../shared/types.ts';
import { LocaleProvider } from '../../web/src/i18n.tsx';
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

/** The page with its filter state and a stand in card, the way App wires it. */
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
          <aside aria-label="Card">
            <button type="button" onClick={() => setSelected(null)}>
              Close
            </button>
          </aside>
        )
      }
    />
  );
}

const rows = () => within(screen.getByRole('list', { name: 'Achievements' })).getAllByRole('listitem');

describe('Achievements', () => {
  it('shows the missing achievements by default', () => {
    render(<Harness />);
    expect(screen.getByText('2 achievements')).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(screen.getByText('The Nail')).toBeInTheDocument();
    expect(screen.queryByText('Magdalene')).not.toBeInTheDocument();
  });

  it('speaks French inside a French locale', () => {
    render(
      <LocaleProvider locale="fr">
        <Harness />
      </LocaleProvider>,
    );
    expect(screen.getByLabelText(t('fr', 'achievements.search'))).toBeInTheDocument();
    expect(screen.getByText(t('fr', 'achievements.count.other', { count: 2 }))).toBeInTheDocument();
  });

  it('applies the search and the filters', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Search'), 'nail');
    expect(rows()).toHaveLength(1);
    await user.clear(screen.getByLabelText('Search'));
    await user.selectOptions(screen.getByLabelText('State'), 'All');
    expect(rows()).toHaveLength(4);
    await user.selectOptions(screen.getByLabelText('DLC'), 'Afterbirth+');
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Flooded Caves')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('DLC'), 'All');
    await user.selectOptions(screen.getByLabelText('Secrets'), 'Secrets only');
    expect(rows()).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText('Secrets'), 'All');
    await user.click(screen.getByLabelText('Save and Steam differences'));
    expect(screen.getByText('Play Online')).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
  });

  it('hides the wiki filters with no wiki base', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Way to earn it')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Character')).not.toBeInTheDocument();
  });

  it('filters by way to earn it and by character with the wiki base', async () => {
    const user = userEvent.setup();
    render(<Harness list={WIKI_LIST} />);
    expect(within(screen.getByLabelText('Character')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All',
      'Isaac',
      'Azazel',
    ]);
    await user.selectOptions(screen.getByLabelText('Way to earn it'), 'Home closet');
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Isaac Holds the Red Key')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Way to earn it'), 'All');
    await user.selectOptions(screen.getByLabelText('Character'), 'Azazel');
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText('Completion mark')).toBeInTheDocument();
  });

  it('shows the way to earn it in the row, except "Other condition"', () => {
    render(<Harness list={WIKI_LIST} />);
    const [nail, maggy, , descriptions] = rows();
    expect(within(nail).getByText('Completion mark')).toBeInTheDocument();
    expect(within(maggy).getByText('Challenge')).toBeInTheDocument();
    expect(within(descriptions).queryByText('Other condition')).not.toBeInTheDocument();
  });

  it('opens the card of an achievement, marks it and gives the focus back on close', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    const nail = screen.getByRole('button', { name: 'The Nail' });
    await user.click(nail);
    expect(onOpen).toHaveBeenCalledWith(9);
    expect(nail).toHaveAttribute('aria-current', 'true');
    expect(nail.closest('li')).toHaveClass('ach--selected');
    expect(screen.getByRole('complementary', { name: 'Card' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(nail).toHaveFocus();
    expect(nail).not.toHaveAttribute('aria-current');
  });

  it('sorts by recent unlock', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...DEFAULT_FILTER, status: 'unlocked' }} />);
    await user.selectOptions(screen.getByLabelText('Sort'), 'Recently unlocked');
    expect(rows().map((row) => within(row).getByText(/Flooded Caves|Magdalene/).textContent)).toEqual(['Flooded Caves', 'Magdalene']);
  });

  it('describes the state of every achievement', () => {
    render(<Harness initial={{ ...DEFAULT_FILTER, status: 'all' }} />);
    const [magdalene, , , playOnline] = rows();
    expect(within(magdalene).getByText(/Unlocked on/)).toBeInTheDocument();
    expect(magdalene.querySelector('time')).toHaveAttribute('datetime', '2023-02-20T20:15:25.000Z');
    expect(within(playOnline).getByText('Missing')).toBeInTheDocument();
    expect(within(playOnline).getByText('secret')).toBeInTheDocument();
    expect(within(playOnline).getByText('Repentance')).toBeInTheDocument();
    expect(within(playOnline).getByText('in the save')).toBeInTheDocument();
    expect(within(playOnline).getByText('#638')).toBeInTheDocument();
    // Names and descriptions come from the game, in English.
    expect(within(playOnline).getByRole('button', { name: 'Play Online' })).toHaveAttribute('lang', 'en');
    expect(playOnline.querySelector('.ach__desc')).toHaveAttribute('lang', 'en');
  });

  it('reports a Steam achievement missing from the save', () => {
    render(<Harness list={[makeAchievement(5, { unlocked: true, inSave: false })]} initial={{ ...DEFAULT_FILTER, status: 'all' }} />);
    expect(screen.getByText('missing from the save')).toBeInTheDocument();
    // "Unlocked" is also an option of the state filter: look inside the row.
    expect(within(rows()[0]).getByText('Unlocked')).toBeInTheDocument();
  });

  it('pages through long lists', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 150 }, (_, i) => makeAchievement(i + 1));
    render(<Harness list={many} />);
    expect(rows()).toHaveLength(100);
    await user.click(screen.getByRole('button', { name: 'Show more (50 left)' }));
    expect(rows()).toHaveLength(150);
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument();
  });

  it('uses the singular when a single achievement is left to show', () => {
    const many = Array.from({ length: 101 }, (_, i) => makeAchievement(i + 1));
    render(<Harness list={many} />);
    expect(screen.getByRole('button', { name: 'Show more (1 left)' })).toBeInTheDocument();
  });

  it('says when the list is empty', () => {
    render(<Harness initial={{ ...DEFAULT_FILTER, search: 'nothing here' }} />);
    expect(screen.getByText('No achievement matches these filters.')).toBeInTheDocument();
    expect(screen.getByText('0 achievements')).toBeInTheDocument();
  });
});

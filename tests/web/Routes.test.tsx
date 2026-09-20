import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../shared/i18n/index.ts';
import type { RoutePlan } from '../../shared/types.ts';
import { LocaleProvider } from '../../web/src/i18n.tsx';
import { Routes, type RoutesProps } from '../../web/src/pages/Routes.tsx';
import { KB_ABSENT, KB_OK, makePlan, makeRun } from './factories.ts';

function renderRoutes(plan: RoutePlan | null = makePlan(), overrides: Partial<RoutesProps> = {}) {
  const props: RoutesProps = {
    state: { status: 'ready', data: { kb: plan ? KB_OK : KB_ABSENT, plan }, refreshing: false },
    onOpenSettings: vi.fn(),
    onOpenAchievement: vi.fn(),
    onAsk: vi.fn(),
    onRetry: vi.fn(),
    onResetProfile: null,
    ...overrides,
  };
  return { ...render(<Routes {...props} />), props };
}

const runTitles = () =>
  within(screen.getByRole('region', { name: 'Suggested runs' }))
    .queryAllByRole('article')
    .map((a) => a.getAttribute('aria-labelledby'));

const MISSING = [{ anyOf: [{ id: 407, name: 'A Secret Exit' }], met: false }];

describe('Routes: suggested runs', () => {
  it('lists the playable runs and counts the others', () => {
    renderRoutes();
    expect(screen.getByRole('heading', { level: 2, name: 'Suggested runs' })).toBeInTheDocument();
    expect(screen.getByText(/^2 runs playable right now out of 3/)).toBeInTheDocument();
    expect(runTitles()).toEqual(['run-magdalene-1', 'run-isaac-1']);
  });

  it('speaks French inside a French locale', () => {
    render(
      <LocaleProvider locale="fr">
        <Routes
          state={{ status: 'ready', data: { kb: KB_OK, plan: makePlan() }, refreshing: false }}
          onOpenSettings={vi.fn()}
          onOpenAchievement={vi.fn()}
          onAsk={vi.fn()}
          onRetry={vi.fn()}
          onResetProfile={null}
        />
      </LocaleProvider>,
    );
    expect(screen.getByRole('heading', { level: 2, name: t('fr', 'routes.title') })).toBeInTheDocument();
    expect(screen.getByLabelText(t('fr', 'routes.withLocked'))).toBeInTheDocument();
  });

  it('also shows the runs to unlock on request', async () => {
    const user = userEvent.setup();
    renderRoutes();
    await user.click(screen.getByLabelText('Also show the runs to unlock'));
    expect(runTitles()).toEqual(['run-magdalene-1', 'run-isaac-1', 'run-isaac-2']);
    expect(screen.getByText(/^To unlock first/)).toHaveTextContent('To unlock first: A Secret Exit');
  });

  it('filters by a character present in the plan', async () => {
    const user = userEvent.setup();
    renderRoutes();
    const select = screen.getByLabelText('Character');
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['All', 'Isaac', 'Magdalene']);
    expect(options.map((o) => o.getAttribute('lang'))).toEqual([null, 'en', 'en']);
    await user.selectOptions(select, 'Isaac');
    expect(runTitles()).toEqual(['run-isaac-1']);
    await user.selectOptions(select, 'All');
    expect(runTitles()).toHaveLength(2);
  });

  it('goes back to every character when the filtered one leaves the plan', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderRoutes();
    await user.selectOptions(screen.getByLabelText('Character'), 'Isaac');
    expect(runTitles()).toEqual(['run-isaac-1']);
    const plan = makePlan({ runs: [makeRun()] });
    rerender(<Routes {...props} state={{ status: 'ready', data: { kb: KB_OK, plan }, refreshing: false }} />);
    expect(screen.getByLabelText('Character')).toHaveValue('all');
    expect(runTitles()).toEqual(['run-magdalene-1']);
  });

  it('explains an empty list', async () => {
    const user = userEvent.setup();
    const { unmount } = renderRoutes(
      makePlan({ runs: [makeRun(), makeRun({ id: 'isaac-2', character: 'isaac', missing: MISSING })] }),
    );
    await user.selectOptions(screen.getByLabelText('Character'), 'Isaac');
    expect(
      screen.getByText('No run playable for this choice: show the runs to unlock to see what to unlock first.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^1 run playable right now out of 2/)).toBeInTheDocument();
    unmount();
    renderRoutes(makePlan({ runs: [] }));
    expect(
      screen.getByText('No run to suggest: every achievement tied to a mark is already earned.'),
    ).toBeInTheDocument();
  });

  it('shows the runs in pages of 20', async () => {
    const user = userEvent.setup();
    const runs = Array.from({ length: 25 }, (_, i) => makeRun({ id: `magdalene-${i + 1}` }));
    renderRoutes(makePlan({ runs }));
    expect(runTitles()).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: 'Show 5 more runs' }));
    expect(runTitles()).toHaveLength(25);
    expect(screen.queryByRole('button', { name: /more runs/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Character'), 'Magdalene');
    expect(runTitles()).toHaveLength(20);
  });

  it('uses the singular when a single run is left', async () => {
    const user = userEvent.setup();
    const runs = Array.from({ length: 21 }, (_, i) => makeRun({ id: `magdalene-${i + 1}` }));
    renderRoutes(makePlan({ runs }));
    await user.click(screen.getByRole('button', { name: 'Show 1 more run' }));
    expect(runTitles()).toHaveLength(21);
  });

  it('opens the card of an achievement from a run', async () => {
    const user = userEvent.setup();
    const { props } = renderRoutes();
    await user.click(screen.getByRole('button', { name: 'Censer' }));
    expect(props.onOpenAchievement).toHaveBeenCalledWith(193);
  });

  it('asks the advisor the question of a run', async () => {
    const user = userEvent.setup();
    const { props } = renderRoutes();
    const [magdalene] = within(screen.getByRole('region', { name: 'Suggested runs' })).getAllByRole('article');
    await user.click(within(magdalene).getByRole('button', { name: 'Ask the advisor' }));
    expect(props.onAsk).toHaveBeenCalledWith(
      expect.stringMatching(/^How do I clear this run with Magdalene in hard mode/),
    );
  });
});

describe('Routes: off route', () => {
  it('sums up every category', () => {
    renderRoutes();
    const section = screen.getByRole('region', { name: 'Off route' });
    expect([...section.querySelectorAll('summary')].map((s) => s.textContent)).toEqual([
      'Challenges (1)',
      'Counters (2)',
      'Home closets (1)',
      'Miscellaneous (1)',
    ]);
  });

  it('describes the challenges and their missing prerequisite', async () => {
    const user = userEvent.setup();
    const { props } = renderRoutes();
    const challenge = screen.getByRole('button', { name: 'Rune of Perthro' }).closest('li');
    expect(challenge).toHaveTextContent(
      "Rune of Perthro: challenge no. 6 Solar System, with Isaac, goal Mom's Heart, starting items: Distant Admiration (to unlock first: Solar System)",
    );
    await user.click(screen.getByRole('button', { name: 'Rune of Perthro' }));
    expect(props.onOpenAchievement).toHaveBeenCalledWith(94);
  });

  it('gives the curse and the starting items of a challenge', () => {
    const plan = makePlan();
    const [challenge] = plan.offRoute.challenges;
    plan.offRoute.challenges = [
      { ...challenge, curse: 'Curse of the Blind', startingItems: ['Distant Admiration', 'Forever Alone'], requirement: null },
    ];
    renderRoutes(plan);
    const item = screen.getByRole('button', { name: 'Rune of Perthro' }).closest('li');
    expect(item).toHaveTextContent(
      "Rune of Perthro: challenge no. 6 Solar System, with Isaac, goal Mom's Heart, curse Curse of the Blind, starting items: Distant Admiration, Forever Alone",
    );
    expect(within(item as HTMLElement).getByText('Curse of the Blind')).toHaveAttribute('lang', 'en');
    expect(within(item as HTMLElement).getByText('Distant Admiration, Forever Alone')).toHaveAttribute('lang', 'en');
  });

  it('shows the known progress of the counters', () => {
    renderRoutes();
    const dank = screen.getByRole('button', { name: 'Dank Depths' }).closest('li');
    expect(dank).toHaveTextContent(/^Dank Depths: Defeat It Lives! 21 times/);
    expect(within(dank as HTMLElement).getByText('16 / 21')).toHaveClass('todo-list__value');
    expect(dank?.querySelector('.progress')).toHaveAttribute('aria-hidden', 'true');
    const hole = screen.getByRole('button', { name: 'Black Hole' }).closest('li');
    expect(hole).toHaveTextContent('Black Hole: Defeat 20 Portals');
    expect(hole?.querySelector('.progress')).toBeNull();
  });

  it('caps a counter that went past its total', () => {
    const plan = makePlan();
    plan.offRoute.counters = [{ id: 344, name: 'Dank Depths', condition: 'Defeat It Lives! 21 times', total: 21, value: 30 }];
    renderRoutes(plan);
    expect(screen.getByText('21 / 21')).toBeInTheDocument();
  });

  it('groups the closets by character and recalls the Red Key', () => {
    const { unmount } = renderRoutes();
    const hint = screen.getByText(/^They open during the/);
    expect(hint).toHaveTextContent(
      'They open during the The Beast route, with a Red Key, a Cracked Key or Soul of Cain. The chest of Mom gives the Red Key on the first visit to Home.',
    );
    expect([...hint.querySelectorAll('span[lang="en"]')].map((s) => s.textContent)).toEqual([
      'The Beast',
      'Red Key',
      'Cracked Key',
      'Soul of Cain',
      'Mom',
      'Red Key',
      'Home',
    ]);
    expect(screen.getByRole('button', { name: 'The Broken' }).closest('li')).toHaveTextContent('Isaac: The Broken');
    unmount();
    const plan = makePlan();
    plan.offRoute.redKey = true;
    renderRoutes(plan);
    expect(screen.getByText(/^They open during the/)).toHaveTextContent(
      /^They open during the The Beast route, with a Red Key, a Cracked Key or Soul of Cain\.$/,
    );
  });

  it('sorts the miscellaneous achievements by DLC', () => {
    renderRoutes();
    const rebirth = screen.getByRole('heading', { level: 3, name: 'Rebirth' });
    expect(rebirth.nextElementSibling).toHaveTextContent('Little Gish: Defeat Gish');
    expect(screen.queryByRole('heading', { level: 3, name: 'Repentance' })).not.toBeInTheDocument();
  });
});

describe('Routes: states', () => {
  it('says the computation is under way', () => {
    renderRoutes(null, { state: { status: 'loading' } });
    expect(screen.getByText('Computing the routes…')).toBeInTheDocument();
  });

  it('offers to try again after an error, or to go back to your own profile', async () => {
    const user = userEvent.setup();
    const onResetProfile = vi.fn();
    const { rerender, props } = renderRoutes(null, { state: { status: 'error', message: 'Steam profile is private' } });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { level: 2, name: 'The routes could not be computed' })).toBeInTheDocument();
    expect(alert).toHaveTextContent('Steam profile is private');
    expect(within(alert).queryByRole('button', { name: 'Back to my profile' })).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(props.onRetry).toHaveBeenCalled();
    rerender(<Routes {...props} onResetProfile={onResetProfile} />);
    await user.click(screen.getByRole('button', { name: 'Back to my profile' }));
    expect(onResetProfile).toHaveBeenCalled();
  });

  it('leads to the settings with no usable wiki base', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderRoutes(null);
    expect(screen.getByRole('status')).toHaveTextContent(/^Wiki base missing: the routes are computed from the wiki/);
    await user.click(screen.getByRole('button', { name: 'Open the settings' }));
    expect(props.onOpenSettings).toHaveBeenCalled();
    const kb = { state: 'error' as const, syncedAt: null, running: false, message: 'Base wiki illisible : x' };
    rerender(<Routes {...props} state={{ status: 'ready', data: { kb, plan: null }, refreshing: false }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Wiki base unusable: Base wiki illisible : x');
    expect(screen.queryByRole('region', { name: 'Suggested runs' })).not.toBeInTheDocument();
  });
});

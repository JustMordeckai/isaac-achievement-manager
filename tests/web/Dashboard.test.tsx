import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../shared/i18n/index.ts';
import type { Desync, ProgressSummary } from '../../shared/types.ts';
import { AchievementIcon } from '../../web/src/components/AchievementIcon.tsx';
import { LocaleProvider } from '../../web/src/i18n.tsx';
import { Dashboard, type DashboardProps } from '../../web/src/pages/Dashboard.tsx';
import type { RoutesState } from '../../web/src/useRoutes.ts';
import { KB_ABSENT, KB_OK, makePlan, makeRun, makeSummary, ROUTES_OK } from './factories.ts';

const ROUTES_READY: RoutesState = { status: 'ready', data: ROUTES_OK, refreshing: false };

function renderProps(summary: ProgressSummary = makeSummary(), overrides: Partial<DashboardProps> = {}): DashboardProps {
  return {
    summary,
    kb: KB_OK,
    routes: ROUTES_READY,
    onShowAchievements: vi.fn(),
    onOpenSettings: vi.fn(),
    onShowRoutes: vi.fn(),
    onOpenAchievement: vi.fn(),
    onAsk: vi.fn(),
    ...overrides,
  };
}

function renderDashboard(summary: ProgressSummary = makeSummary(), overrides: Partial<DashboardProps> = {}) {
  const props = renderProps(summary, overrides);
  return { ...render(<Dashboard {...props} />), props };
}

describe('Dashboard', () => {
  it('shows the overall progress', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByText('125')).toBeInTheDocument();
    expect(screen.getByText('19.5 %, 516 missing')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Overall progress' })).toHaveAttribute('aria-valuenow', '125');
  });

  it('speaks French inside a French locale', () => {
    render(
      <LocaleProvider locale="fr">
        <Dashboard {...renderProps()} />
      </LocaleProvider>,
    );
    expect(screen.getByRole('heading', { name: t('fr', 'dashboard.progress') })).toBeInTheDocument();
    expect(screen.getByText(t('fr', 'dashboard.percentMissing.other', { percent: '19,5 %', count: 516 }))).toBeInTheDocument();
  });

  it('opens the list of missing achievements', async () => {
    const user = userEvent.setup();
    const { props } = renderDashboard();
    await user.click(screen.getByRole('button', { name: 'See the 516 missing achievements' }));
    expect(props.onShowAchievements).toHaveBeenCalledWith({ status: 'missing', dlc: 'all', onlyDesync: false });
  });

  it('lists the DLCs and opens the filtered list', async () => {
    const user = userEvent.setup();
    const { props } = renderDashboard();
    const plus = screen.getByRole('button', { name: 'Afterbirth+: 5 of 127, see the missing ones' });
    expect(within(plus).getByText('5 / 127')).toBeInTheDocument();
    await user.click(plus);
    expect(props.onShowAchievements).toHaveBeenCalledWith({ status: 'missing', dlc: 'afterbirthPlus', onlyDesync: false });
    expect(screen.getAllByRole('button', { name: /^(Rebirth|Afterbirth|Repentance)/ })).toHaveLength(5);
  });

  it('keeps the DLC bars decorative', () => {
    renderDashboard();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('hides a DLC with no achievement', () => {
    const summary = makeSummary();
    summary.byDlc.repentancePlus = { total: 0, unlocked: 0 };
    renderDashboard(summary);
    expect(screen.queryByRole('button', { name: /^Repentance\+/ })).not.toBeInTheDocument();
  });

  it('lists the latest unlocks', () => {
    const { container } = renderDashboard();
    expect(screen.getByText('Flooded Caves')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-09-16T14:30:51.000Z');
  });

  it('says when no unlock date is known', () => {
    renderDashboard(makeSummary({ recent: [] }));
    expect(screen.getByText('No known unlock date.')).toBeInTheDocument();
  });

  it('lists the differences and opens the matching filter', async () => {
    const user = userEvent.setup();
    const { props } = renderDashboard();
    expect(screen.getByRole('heading', { name: 'Unlocked in the save, missing from Steam (1)' })).toBeInTheDocument();
    expect(screen.getByText('#638 Play Online')).toBeInTheDocument();
    expect(screen.queryByText(/Alt\+F2/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See them in the list' }));
    expect(props.onShowAchievements).toHaveBeenCalledWith({ status: 'all', dlc: 'all', onlyDesync: true });
  });

  it('sums up long lists and gives the Alt+F2 tip', () => {
    const desyncs: Desync[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Achievement ${i + 1}`, kind: 'steamOnly' }));
    renderDashboard(makeSummary({ desyncs }));
    expect(screen.getByText('#10 Achievement 10')).toBeInTheDocument();
    expect(screen.queryByText('#11 Achievement 11')).not.toBeInTheDocument();
    expect(screen.getByText('and 2 more')).toBeInTheDocument();
    expect(screen.getByText(/Alt\+F2/)).toBeInTheDocument();
  });

  it('says when there is no difference', () => {
    renderDashboard(makeSummary({ desyncs: [] }));
    expect(screen.getByText(/No difference/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See them in the list' })).not.toBeInTheDocument();
  });

  it('uses the singular for a single missing achievement', () => {
    renderDashboard(makeSummary({ unlocked: 640, total: 641 }));
    expect(screen.getByText('99.8 %, 1 missing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See the missing achievement' })).toBeInTheDocument();
  });

  it('uses the singular and hides the button when nothing is missing', () => {
    renderDashboard(makeSummary({ unlocked: 641, total: 641 }));
    expect(screen.getByText('100.0 %, 0 missing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /missing achievement/ })).not.toBeInTheDocument();
  });

  it('hides the "See them in the list" button with no save or Steam difference', () => {
    const desyncs: Desync[] = [{ id: 343, name: 'Flooded Caves', kind: 'profileAhead' }];
    renderDashboard(makeSummary({ desyncs }));
    expect(
      screen.getByRole('heading', { name: 'On the online profile, not in the local cache yet (1)' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See them in the list' })).not.toBeInTheDocument();
  });

  it('uses the singular for a single difference left out', () => {
    const desyncs: Desync[] = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, name: `Achievement ${i + 1}`, kind: 'steamOnly' }));
    renderDashboard(makeSummary({ desyncs }));
    expect(screen.getByText('#10 Achievement 10')).toBeInTheDocument();
    expect(screen.queryByText('#11 Achievement 11')).not.toBeInTheDocument();
    expect(screen.getByText('and 1 more')).toBeInTheDocument();
  });

  it('offers the sync while the wiki base is missing or unusable', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDashboard(makeSummary(), { kb: KB_ABSENT });
    expect(screen.getByText(/^Wiki base missing/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open the settings' }));
    expect(props.onOpenSettings).toHaveBeenCalled();
    rerender(<Dashboard {...props} kb={{ state: 'error', syncedAt: null, running: false, message: 'Base wiki illisible : x' }} />);
    expect(screen.getByText('Wiki base unusable: Base wiki illisible : x')).toBeInTheDocument();
    rerender(<Dashboard {...props} kb={KB_OK} />);
    expect(screen.queryByRole('button', { name: 'Open the settings' })).not.toBeInTheDocument();
    rerender(<Dashboard {...props} kb={null} />);
    expect(screen.queryByRole('button', { name: 'Open the settings' })).not.toBeInTheDocument();
  });
});

describe('Dashboard: route plan', () => {
  it('shows the best playable runs and opens the routes or a card', async () => {
    const user = userEvent.setup();
    const { props } = renderDashboard();
    const section = screen.getByRole('region', { name: 'Best runs' });
    const runs = within(section).getAllByRole('article');
    expect(runs.map((r) => within(r).getByRole('heading', { level: 3 }).textContent)).toEqual(['Magdalene', 'Isaac']);
    await user.click(within(section).getByRole('button', { name: 'Guardian Angel' }));
    expect(props.onOpenAchievement).toHaveBeenCalledWith(45);
    await user.click(within(section).getByRole('button', { name: 'See every route' }));
    expect(props.onShowRoutes).toHaveBeenCalled();
    await user.click(within(runs[1]).getByRole('button', { name: 'Demander au conseiller' }));
    expect(props.onAsk).toHaveBeenCalledWith(
      'How do I clear this run with Isaac in Greed mode (beating Ultra Greed)? It should give Censer (#193).',
    );
  });

  it('keeps to three playable runs', () => {
    const runs = ['a', 'b', 'c', 'd'].map((id) => makeRun({ id }));
    renderDashboard(makeSummary(), { routes: { ...ROUTES_READY, data: { ...ROUTES_OK, plan: makePlan({ runs }) } } });
    expect(within(screen.getByRole('region', { name: 'Best runs' })).getAllByRole('article')).toHaveLength(3);
  });

  it('shows the mark grid after the best runs', () => {
    renderDashboard();
    const grid = screen.getByRole('region', { name: 'Completion marks' });
    expect(within(grid).getAllByRole('row')).toHaveLength(35);
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles.indexOf('Best runs')).toBeLessThan(titles.indexOf('Completion marks'));
    expect(titles.indexOf('Completion marks')).toBeLessThan(titles.indexOf('Differences between sources'));
  });

  it('reports that no run is playable', () => {
    const plan = makePlan({ runs: [makeRun({ missing: [{ anyOf: [{ id: 1, name: 'Magdalene' }], met: false }] })] });
    renderDashboard(makeSummary(), { routes: { ...ROUTES_READY, data: { ...ROUTES_OK, plan } } });
    expect(screen.getByText('No run is playable yet: unlock the prerequisites listed in the routes first.')).toBeInTheDocument();
    renderDashboard(makeSummary(), { routes: { ...ROUTES_READY, data: { ...ROUTES_OK, plan: makePlan({ runs: [] }) } } });
    expect(screen.getByText('No run to suggest.')).toBeInTheDocument();
  });

  it('shows the computation under way and the errors', () => {
    const { props, rerender } = renderDashboard(makeSummary(), { routes: { status: 'loading' } });
    expect(within(screen.getByRole('region', { name: 'Best runs' })).getByText('Computing the routes…')).toBeInTheDocument();
    rerender(<Dashboard {...props} routes={{ status: 'error', message: 'Serveur indisponible' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The routes could not be computed: Serveur indisponible');
    expect(screen.queryByRole('region', { name: 'Best runs' })).not.toBeInTheDocument();
  });

  it('hides the plan with no wiki base', () => {
    renderDashboard(makeSummary(), { kb: KB_ABSENT, routes: { ...ROUTES_READY, data: { kb: KB_ABSENT, plan: null } } });
    expect(screen.queryByRole('region', { name: 'Best runs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Completion marks' })).not.toBeInTheDocument();
  });
});

describe('AchievementIcon', () => {
  it('shows the icon then a fallback on error', () => {
    const { container } = render(<AchievementIcon file="abc.jpg" alt="Magdalene" />);
    const img = screen.getByRole('img', { name: 'Magdalene' });
    expect(img).toHaveAttribute('src', '/api/icons/abc.jpg');
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('.ach-icon--missing')).not.toBeNull();
  });

  it('shows the fallback with no file', () => {
    const { container } = render(<AchievementIcon file="" alt="" />);
    expect(container.querySelector('.ach-icon--missing')).not.toBeNull();
  });
});

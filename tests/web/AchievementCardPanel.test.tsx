import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@shared/i18n/index.ts';
import type { AchievementCard, CardPlan } from '@shared/types.ts';
import type { ProfileQuery } from '@/lib/api.ts';
import { AchievementCardPanel } from '@/components/achievements/AchievementCardPanel/AchievementCardPanel.tsx';
import { LocaleProvider } from '@/i18n.tsx';
import { KB_ABSENT, KB_OK, makeAchievement, makeCard } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

const ME: ProfileQuery = { profile: 'me', slot: null };

function renderPanel(card: AchievementCard | Response, overrides: { query?: ProfileQuery; reloadKey?: number } = {}) {
  const fetchMock = stubFetch({ 'GET /api/achievement/9': () => card });
  const onClose = vi.fn();
  const onOpenSettings = vi.fn();
  const onOpenRoutes = vi.fn();
  const onAsk = vi.fn();
  const props = {
    id: 9,
    query: overrides.query ?? ME,
    reloadKey: overrides.reloadKey ?? 0,
    onClose,
    onOpenSettings,
    onOpenRoutes,
    onAsk,
  };
  const view = render(<AchievementCardPanel {...props} />);
  return { ...view, props, fetchMock, onClose, onOpenSettings, onOpenRoutes, onAsk };
}

describe('AchievementCardPanel', () => {
  it('shows the whole card of a completion mark', async () => {
    renderPanel(makeCard());
    expect(screen.getByText('Loading the card…')).toBeInTheDocument();
    const panel = await screen.findByRole('complementary', { name: 'The Nail' });
    expect(within(panel).getByRole('heading', { level: 2, name: 'The Nail' })).toHaveAttribute('lang', 'en');
    expect(within(panel).getByText('#9')).toBeInTheDocument();
    expect(within(panel).getByText('Missing')).toBeInTheDocument();
    expect(within(panel).getByText('Unlocked a new item.')).toHaveAttribute('lang', 'en');
    expect(within(panel).getByText('Defeat Boss Rush as Azazel')).toBeInTheDocument();
    expect(within(panel).getByText('Beat Boss Rush with Azazel')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Unlocks' }).nextElementSibling).toHaveTextContent('Item: The Nail');
    expect(within(panel).getByText('Grants a soul heart and more damage.')).toBeInTheDocument();
    expect(within(panel).getByText('Quality 2')).toBeInTheDocument();
    expect(within(panel).getByText('The Nail is an active item.')).toBeInTheDocument();
    const wikiLink = within(panel).getByRole('link', { name: 'Page "The Nail" on the wiki' });
    expect(wikiLink).toHaveAttribute('href', 'https://bindingofisaacrebirth.fandom.com/wiki/The_Nail');
    expect(within(wikiLink).getByText('The Nail')).toHaveAttribute('lang', 'en');
    expect(within(panel).getByRole('heading', { level: 4, name: 'Boss Rush' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { level: 5, name: 'Tips' })).toBeInTheDocument();
    expect(within(panel).getByText('Use the Stop Watch.')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'More on the wiki' })).toHaveAttribute(
      'href',
      'https://bindingofisaacrebirth.fandom.com/wiki/Boss_Rush',
    );
    expect(within(panel).getByText(/CC BY-SA licence/)).toHaveTextContent(/synced on 17 Sept 2026/);
  });

  it('speaks French inside a French locale', async () => {
    stubFetch({ 'GET /api/achievement/9': () => makeCard() });
    render(
      <LocaleProvider locale="fr">
        <AchievementCardPanel id={9} query={ME} reloadKey={0} onClose={vi.fn()} onOpenSettings={vi.fn()} onOpenRoutes={vi.fn()} onAsk={vi.fn()} />
      </LocaleProvider>,
    );
    const panel = await screen.findByRole('complementary', { name: 'The Nail' });
    expect(within(panel).getByRole('heading', { name: t('fr', 'card.unlocks') })).toBeInTheDocument();
    expect(within(panel).getByText(t('fr', 'achievements.missing'))).toBeInTheDocument();
  });

  it('puts the focus on the title and closes with Escape or the button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel(makeCard());
    const loadingHeading = screen.getByRole('heading', { level: 2, name: 'Achievement #9' });
    expect(loadingHeading).toHaveFocus();
    expect(loadingHeading).not.toHaveAttribute('lang');
    const heading = await screen.findByRole('heading', { level: 2, name: 'The Nail' });
    expect(heading).toHaveAttribute('lang', 'en');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Close the card' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('lists the prerequisites and the planned runs, and opens the routes', async () => {
    const user = userEvent.setup();
    const plan: CardPlan = {
      requirements: [
        { anyOf: [{ id: 79, name: 'Azazel' }], met: true },
        { anyOf: [{ id: 57, name: 'The Polaroid' }, { id: 78, name: 'The Negative' }], met: false },
      ],
      runs: [
        {
          id: 'azazel-1',
          character: 'azazel',
          mode: 'hard',
          endings: ['bossRush', 'momsHeart'],
          minutes: 38,
          blocked: false,
          preparation: false,
        },
      ],
    };
    const { onOpenRoutes } = renderPanel(makeCard({ plan }));
    const section = await screen.findByRole('region', { name: 'How to get it' });
    const items = within(section).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Azazel: unlocked',
      'The Polaroid or The Negative: still to unlock',
      "Run Azazel (Hard): beat Boss Rush, Mom's Heart, about 38 min",
    ]);
    expect([...items[1].querySelectorAll('span[lang="en"]')].map((s) => s.textContent)).toEqual([
      'The Polaroid',
      'The Negative',
    ]);
    expect(within(section).getByRole('heading', { level: 4, name: 'Run of the plan' })).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'See the routes' }));
    expect(onOpenRoutes).toHaveBeenCalled();
  });

  it('reports the runs to unlock first and the prep runs', async () => {
    const run = { character: 'azazel' as const, mode: 'hard' as const };
    const plan: CardPlan = {
      requirements: [],
      runs: [
        { ...run, id: 'azazel-2', endings: ['mother'], minutes: 55, blocked: true, preparation: false },
        { ...run, id: 'azazel-3', endings: ['beast'], minutes: 60, blocked: false, preparation: true },
        { ...run, id: 'azazel-1', endings: ['bossRush', 'mother'], minutes: 63, blocked: true, preparation: true },
      ],
    };
    renderPanel(makeCard({ plan }));
    const section = await screen.findByRole('region', { name: 'How to get it' });
    expect(within(section).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Run Azazel (Hard): beat Mother, about 55 min, to unlock first',
      'Run Azazel (Hard): beat The Beast, about 1 h, prep run',
      'Run Azazel (Hard): beat Boss Rush, Mother, about 1 h 03, prep run, to unlock first',
    ]);
    expect(within(section).getByRole('heading', { level: 4, name: 'Runs of the plan' })).toBeInTheDocument();
  });

  it('hides the plan of an unlocked achievement', async () => {
    const plan: CardPlan = { requirements: [{ anyOf: [{ id: 79, name: 'Azazel' }], met: true }], runs: [] };
    const achievement = makeAchievement(9, { name: 'The Nail', unlocked: true, unlockedAt: null });
    renderPanel(makeCard({ achievement, plan }));
    await screen.findByText('Unlocked');
    expect(screen.queryByRole('region', { name: 'How to get it' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask the advisor' })).not.toBeInTheDocument();
  });

  it('offers the advisor for a missing achievement, even with nothing to plan', async () => {
    const user = userEvent.setup();
    const { onAsk } = renderPanel(makeCard({ plan: { requirements: [], runs: [] } }));
    const section = await screen.findByRole('region', { name: 'How to get it' });
    expect(within(section).getByText('No known prerequisite and no planned run for this achievement.')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'See the routes' })).not.toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Ask the advisor' }));
    expect(onAsk).toHaveBeenCalledWith('How do I get The Nail (#9)?');
  });

  it('passes the profile and the slot, and reads the card again after a refresh', async () => {
    const { fetchMock, rerender, props } = renderPanel(makeCard(), { query: { profile: '76561198000000001', slot: null } });
    await screen.findByRole('heading', { level: 2, name: 'The Nail' });
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/achievement/9?profile=76561198000000001');
    rerender(<AchievementCardPanel {...props} reloadKey={1} />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { level: 2, name: 'The Nail' })).toBeInTheDocument();
  });

  it('offers the sync when the wiki base is missing', async () => {
    const user = userEvent.setup();
    const { onOpenSettings } = renderPanel(makeCard({ wiki: null, kb: KB_ABSENT }));
    expect(await screen.findByText('The wiki base has not been downloaded yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open the settings' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('reports an achievement missing from the wiki and an unlocked one', async () => {
    const achievement = makeAchievement(9, { name: 'Item Descriptions', unlocked: true, unlockedAt: '2025-11-11T01:43:55.000Z' });
    renderPanel(makeCard({ achievement, wiki: null, kb: KB_OK }));
    expect(await screen.findByText('This achievement is not on the wiki.')).toBeInTheDocument();
    expect(screen.getByText(/Unlocked on/).querySelector('time')).toHaveAttribute('datetime', '2025-11-11T01:43:55.000Z');
  });

  it('says when the wiki gives no tip', async () => {
    const card = makeCard();
    renderPanel({ ...card, wiki: card.wiki && { ...card.wiki, tips: [], unlockPage: null } });
    expect(await screen.findByText('The wiki gives no tip for this achievement.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /on the wiki/ })).not.toBeInTheDocument();
  });

  it('shows the error from the server', async () => {
    renderPanel(jsonResponse({ error: 'Achievement #9 unknown' }, 404));
    expect(await screen.findByRole('alert')).toHaveTextContent('Achievement #9 unknown');
  });
});

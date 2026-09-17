import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AchievementCard } from '../../shared/types.ts';
import type { ProfileQuery } from '../../web/src/api.ts';
import { AchievementCardPanel } from '../../web/src/components/AchievementCardPanel.tsx';
import { KB_ABSENT, KB_OK, makeAchievement, makeCard } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

const ME: ProfileQuery = { profile: 'me', slot: null };

function renderPanel(card: AchievementCard | Response, overrides: { query?: ProfileQuery; reloadKey?: number } = {}) {
  const fetchMock = stubFetch({ 'GET /api/achievement/9': () => card });
  const onClose = vi.fn();
  const onOpenSettings = vi.fn();
  const props = { id: 9, query: overrides.query ?? ME, reloadKey: overrides.reloadKey ?? 0, onClose, onOpenSettings };
  const view = render(<AchievementCardPanel {...props} />);
  return { ...view, props, fetchMock, onClose, onOpenSettings };
}

describe('AchievementCardPanel', () => {
  it('affiche la fiche complète d’une marque de complétion', async () => {
    renderPanel(makeCard());
    expect(screen.getByText('Chargement de la fiche…')).toBeInTheDocument();
    const panel = await screen.findByRole('complementary', { name: 'The Nail' });
    expect(within(panel).getByRole('heading', { level: 2, name: 'The Nail' })).toHaveAttribute('lang', 'en');
    expect(within(panel).getByText('#9')).toBeInTheDocument();
    expect(within(panel).getByText('Manquant')).toBeInTheDocument();
    expect(within(panel).getByText('Unlocked a new item.')).toHaveAttribute('lang', 'en');
    expect(within(panel).getByText('Defeat Boss Rush as Azazel')).toBeInTheDocument();
    expect(within(panel).getByText('Battre Boss Rush avec Azazel')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Débloque' }).nextElementSibling).toHaveTextContent('Objet : The Nail');
    expect(within(panel).getByText('Grants a soul heart and more damage.')).toBeInTheDocument();
    expect(within(panel).getByText('Qualité 2')).toBeInTheDocument();
    expect(within(panel).getByText('The Nail is an active item.')).toBeInTheDocument();
    const wikiLink = within(panel).getByRole('link', { name: 'Page « The Nail » sur le wiki' });
    expect(wikiLink).toHaveAttribute('href', 'https://bindingofisaacrebirth.fandom.com/wiki/The_Nail');
    expect(within(wikiLink).getByText('The Nail')).toHaveAttribute('lang', 'en');
    expect(within(panel).getByRole('heading', { level: 4, name: 'Boss Rush' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { level: 5, name: 'Tips' })).toBeInTheDocument();
    expect(within(panel).getByText('Use the Stop Watch.')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Suite sur le wiki' })).toHaveAttribute(
      'href',
      'https://bindingofisaacrebirth.fandom.com/wiki/Boss_Rush',
    );
    expect(within(panel).getByText(/licence CC BY-SA/)).toHaveTextContent(/synchro du 17 sept\. 2026/);
  });

  it('place le focus sur le titre et se ferme avec Échap ou le bouton', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel(makeCard());
    expect(screen.getByRole('heading', { level: 2, name: 'Succès #9' })).toHaveFocus();
    await screen.findByRole('heading', { level: 2, name: 'The Nail' });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Fermer la fiche' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('transmet le profil et le slot, et relit la fiche après une actualisation', async () => {
    const { fetchMock, rerender, props } = renderPanel(makeCard(), { query: { profile: '76561198000000001', slot: null } });
    await screen.findByRole('heading', { level: 2, name: 'The Nail' });
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/achievement/9?profile=76561198000000001');
    rerender(<AchievementCardPanel {...props} reloadKey={1} />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { level: 2, name: 'The Nail' })).toBeInTheDocument();
  });

  it('propose la synchro quand la base wiki est absente', async () => {
    const user = userEvent.setup();
    const { onOpenSettings } = renderPanel(makeCard({ wiki: null, kb: KB_ABSENT }));
    expect(await screen.findByText("La base wiki n'est pas encore téléchargée.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ouvrir les paramètres' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('signale un succès absent du wiki et un succès débloqué', async () => {
    const achievement = makeAchievement(9, { name: 'Item Descriptions', unlocked: true, unlockedAt: '2025-11-11T01:43:55.000Z' });
    renderPanel(makeCard({ achievement, wiki: null, kb: KB_OK }));
    expect(await screen.findByText('Ce succès ne figure pas sur le wiki.')).toBeInTheDocument();
    expect(screen.getByText(/Débloqué le/).querySelector('time')).toHaveAttribute('datetime', '2025-11-11T01:43:55.000Z');
  });

  it('indique l’absence d’astuce', async () => {
    const card = makeCard();
    renderPanel({ ...card, wiki: card.wiki && { ...card.wiki, tips: [], unlockPage: null } });
    expect(await screen.findByText("Le wiki ne donne pas d'astuce pour ce succès.")).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sur le wiki/ })).not.toBeInTheDocument();
  });

  it('affiche l’erreur du serveur', async () => {
    renderPanel(jsonResponse({ error: 'Succès #9 inconnu' }, 404));
    expect(await screen.findByRole('alert')).toHaveTextContent('Succès #9 inconnu');
  });
});

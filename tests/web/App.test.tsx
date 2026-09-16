import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../web/src/App.tsx';
import { makeAchievement, makeSummary } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

const ACHIEVEMENTS = [
  makeAchievement(1, { name: 'Magdalene', unlocked: true, unlockedAt: '2023-02-20T20:15:25.000Z', inSave: true }),
  makeAchievement(2, { name: 'Cain' }),
  makeAchievement(638, { name: 'Play Online', dlc: 'repentance', inSave: true }),
];

function stubProgress() {
  return stubFetch({
    'GET /api/progress': () => makeSummary(),
    'GET /api/achievements': () => ACHIEVEMENTS,
  });
}

const progressCalls = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.filter(([input]) => String(input).startsWith('/api/progress')).length;

describe('App', () => {
  it('affiche le tableau de bord puis les succès manquants', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    expect(screen.getByText('Chargement de la progression…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Progression' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voir les 516 succès manquants' }));
    expect(window.location.hash).toBe('#/succes');
    expect(screen.getByText('Cain')).toBeInTheDocument();
    expect(screen.getByText('Play Online')).toBeInTheDocument();
    expect(screen.queryByText('Magdalene')).not.toBeInTheDocument();
  });

  it('ouvre la liste filtrée sur les écarts depuis le tableau de bord', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Voir dans la liste' }));
    expect(screen.getByLabelText('Écarts sauvegarde/Steam')).toBeChecked();
    expect(screen.getByText('1 succès')).toBeInTheDocument();
  });

  it('garde les filtres en changeant d’onglet', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.click(screen.getByRole('button', { name: 'Succès' }));
    await user.type(screen.getByLabelText('Recherche'), 'cain');
    await user.click(screen.getByRole('button', { name: 'Tableau de bord' }));
    await user.click(screen.getByRole('button', { name: 'Succès' }));
    expect(screen.getByLabelText('Recherche')).toHaveValue('cain');
  });

  it('recharge les données avec Actualiser', async () => {
    const user = userEvent.setup();
    const mock = stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    expect(progressCalls(mock)).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    await vi.waitFor(() => expect(progressCalls(mock)).toBe(2));
    expect(await screen.findByRole('button', { name: 'Actualiser' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Progression' })).toBeInTheDocument();
  });

  it('recharge avec le slot choisi', async () => {
    const user = userEvent.setup();
    const mock = stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.selectOptions(screen.getByLabelText('Sauvegarde'), 'Slot 2');
    await vi.waitFor(() =>
      expect(mock.mock.calls.some(([input]) => String(input) === '/api/progress?profile=me&slot=2')).toBe(true),
    );
  });

  it('affiche une erreur et permet de réessayer', async () => {
    const user = userEvent.setup();
    let fail = true;
    stubFetch({
      'GET /api/progress': () => (fail ? jsonResponse({ error: 'Aucun compte Steam local' }, 404) : makeSummary()),
      'GET /api/achievements': () => ACHIEVEMENTS,
    });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Aucun compte Steam local');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('heading', { name: 'Progression' })).toBeInTheDocument();
  });

  it('change de thème et le mémorise', async () => {
    const user = userEvent.setup();
    stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Passer au thème clair' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('iam-theme')).toBe('light');
  });

  it('arrête le serveur après confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubFetch({
      'GET /api/progress': () => makeSummary(),
      'GET /api/achievements': () => ACHIEVEMENTS,
      'POST /api/shutdown': () => ({ ok: true }),
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(await screen.findByRole('heading', { name: 'Serveur arrêté' })).toBeInTheDocument();
  });

  it('ne fait rien si l’arrêt est annulé', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const mock = stubProgress();
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(mock.mock.calls.some(([input]) => String(input) === '/api/shutdown')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Progression' })).toBeInTheDocument();
  });

  it('affiche une erreur si l’arrêt échoue et garde le tableau de bord', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubFetch({
      'GET /api/progress': () => makeSummary(),
      'GET /api/achievements': () => ACHIEVEMENTS,
      'POST /api/shutdown': () => jsonResponse({ error: 'non' }, 403),
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Progression' });
    await user.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Arrêt impossible');
    expect(screen.getByRole('heading', { name: 'Progression' })).toBeInTheDocument();
  });
});

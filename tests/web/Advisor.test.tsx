import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Advisor, type AdvisorProps } from '../../web/src/pages/Advisor.tsx';
import type { AdvisorChat, Exchange } from '../../web/src/useAdvisor.ts';
import { ADVISOR_OFFLINE, ADVISOR_OK, KB_ABSENT, KB_OK } from './factories.ts';

function makeChat(exchanges: Exchange[] = [], busy = false): AdvisorChat {
  return { exchanges, busy, ask: vi.fn(), retry: vi.fn(), stop: vi.fn(), clear: vi.fn() };
}

function exchange(overrides: Partial<Exchange> = {}): Exchange {
  return {
    id: 1,
    question: 'Quelle run faire ?',
    answer: 'Commence par Magdalene.\nPuis Cain.',
    sources: [{ id: 45, name: 'Guardian Angel' }],
    state: 'done',
    error: null,
    ...overrides,
  };
}

/** Page avec un brouillon géré comme dans l'application. */
function renderAdvisor(overrides: Partial<AdvisorProps> = {}, initialDraft = '') {
  const props: AdvisorProps = {
    chat: makeChat(),
    query: { profile: 'me', slot: null },
    status: ADVISOR_OK,
    checking: false,
    kb: KB_OK,
    draft: '',
    onDraftChange: vi.fn(),
    onRecheck: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenAchievement: vi.fn(),
    ...overrides,
  };
  function Harness() {
    const [draft, setDraft] = useState(initialDraft);
    return <Advisor {...props} draft={draft} onDraftChange={setDraft} />;
  }
  return { ...render(<Harness />), props };
}

const field = () => screen.getByLabelText('Ta question');

describe('Advisor', () => {
  it('présente le modèle et propose des exemples de questions', async () => {
    const user = userEvent.setup();
    renderAdvisor();
    expect(screen.getByRole('heading', { level: 2, name: 'Conseiller' })).toBeInTheDocument();
    expect(screen.getByText('Modèle qwen3.5:9b sur http://127.0.0.1:11434.')).toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(field()).toHaveAttribute('maxlength', '2000');
    expect(field()).toHaveAccessibleDescription(/^Entrée pour envoyer, Maj\+Entrée pour aller à la ligne\./);
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Quelle run faire en premier ?' }));
    expect(field()).toHaveValue('Quelle run faire en premier ?');
    expect(field()).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled();
  });

  it('envoie la question avec le bouton ou la touche Entrée, et vide le champ', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    const query = { profile: '76561198000000001', slot: 2 };
    renderAdvisor({ chat, query }, 'Comment obtenir The Nail (#9) ?');
    expect(field()).toHaveValue('Comment obtenir The Nail (#9) ?');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(chat.ask).toHaveBeenCalledWith('Comment obtenir The Nail (#9) ?', query);
    expect(field()).toHaveValue('');
    await user.type(field(), 'Ligne 1{Shift>}{Enter}{/Shift}Ligne 2');
    expect(chat.ask).toHaveBeenCalledTimes(1);
    await user.keyboard('{Enter}');
    expect(chat.ask).toHaveBeenLastCalledWith('Ligne 1\nLigne 2', query);
  });

  it('affiche la conversation et ouvre une fiche transmise au modèle', async () => {
    const user = userEvent.setup();
    const { props } = renderAdvisor({ chat: makeChat([exchange()]) });
    const conversation = screen.getByRole('list', { name: 'Échanges' });
    expect(conversation).toHaveAttribute('aria-busy', 'false');
    const item = within(conversation).getAllByRole('listitem')[0];
    expect(within(item).getByText('Quelle run faire ?')).toHaveClass('chat__text');
    // Les sauts de ligne de la réponse sont gardés (texte brut, pas de Markdown).
    expect(within(item).getByText(/^Commence par Magdalene\./).textContent).toBe('Commence par Magdalene.\nPuis Cain.');
    const sources = within(item).getByRole('list', { name: 'Fiches transmises au modèle' });
    const chip = within(sources).getByRole('button', { name: 'Guardian Angel' });
    expect(chip.firstElementChild).toHaveAttribute('lang', 'en');
    await user.click(chip);
    expect(props.onOpenAchievement).toHaveBeenCalledWith(45);
    expect(screen.queryByRole('button', { name: 'Quelle run faire en premier ?' })).not.toBeInTheDocument();
  });

  it('montre l’attente du modèle puis permet d’arrêter la réponse', async () => {
    const user = userEvent.setup();
    const chat = makeChat([exchange({ answer: '', sources: [], state: 'waiting' })], true);
    renderAdvisor({ chat }, 'Suite');
    expect(screen.getByText(/^Préparation de la réponse… Le premier message peut prendre/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Échanges' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Effacer la conversation' })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(chat.ask).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Arrêter la réponse' }));
    expect(chat.stop).toHaveBeenCalled();
  });

  it('signale une réponse interrompue ou en échec, et propose de réessayer', async () => {
    const user = userEvent.setup();
    const failed = exchange({
      id: 2,
      answer: '',
      sources: [],
      state: 'failed',
      error: 'Ollama injoignable sur http://127.0.0.1:11434',
    });
    const chat = makeChat([exchange({ state: 'stopped' }), failed]);
    const { props } = renderAdvisor({ chat });
    expect(screen.getByText('Réponse interrompue.')).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Ollama injoignable sur http://127.0.0.1:11434');
    await user.click(within(alert).getByRole('button', { name: 'Réessayer' }));
    expect(chat.retry).toHaveBeenCalledWith(2, props.query);
    await user.click(screen.getByRole('button', { name: 'Effacer la conversation' }));
    expect(chat.clear).toHaveBeenCalled();
  });

  it('explique un serveur injoignable et mène aux paramètres', async () => {
    const user = userEvent.setup();
    const { props } = renderAdvisor({ status: ADVISOR_OFFLINE });
    const banner = screen.getByText('Ollama injoignable sur http://127.0.0.1:11434 (ECONNREFUSED)').closest('.banner');
    await user.click(within(banner as HTMLElement).getByRole('button', { name: 'Vérifier à nouveau' }));
    expect(props.onRecheck).toHaveBeenCalled();
    await user.click(within(banner as HTMLElement).getByRole('button', { name: 'Ouvrir les paramètres' }));
    expect(props.onOpenSettings).toHaveBeenCalled();
  });

  it('indique la vérification en cours et une base wiki absente', () => {
    const { unmount } = renderAdvisor({ status: null });
    expect(screen.getByText('Vérification du serveur Ollama…')).toBeInTheDocument();
    unmount();
    renderAdvisor({ status: ADVISOR_OFFLINE, checking: true, kb: KB_ABSENT });
    expect(screen.getByRole('button', { name: 'Vérification…' })).toBeDisabled();
    expect(
      screen.getByText('Base wiki absente ou inutilisable : le conseiller ne connaît que ta progression.'),
    ).toBeInTheDocument();
  });
});

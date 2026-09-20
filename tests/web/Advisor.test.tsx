import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../shared/i18n/index.ts';
import { LocaleProvider } from '../../web/src/i18n.tsx';
import { Advisor, type AdvisorProps } from '../../web/src/pages/Advisor.tsx';
import type { AdvisorChat, Exchange } from '../../web/src/useAdvisor.ts';
import { ADVISOR_OFFLINE, ADVISOR_OK, KB_ABSENT, KB_OK } from './factories.ts';

function makeChat(exchanges: Exchange[] = [], busy = false): AdvisorChat {
  return { exchanges, busy, ask: vi.fn(), retry: vi.fn(), stop: vi.fn(), clear: vi.fn() };
}

function exchange(overrides: Partial<Exchange> = {}): Exchange {
  return {
    id: 1,
    question: 'Which run should I do?',
    answer: 'Start with Magdalene.\nThen Cain.',
    sources: [{ id: 45, name: 'Guardian Angel' }],
    state: 'done',
    error: null,
    ...overrides,
  };
}

/** The page with a draft handled the way the application handles it. */
function renderAdvisor(overrides: Partial<AdvisorProps> = {}, initialDraft = '', locale: 'en' | 'fr' = 'en') {
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
    return (
      <LocaleProvider locale={locale}>
        <Advisor {...props} draft={draft} onDraftChange={setDraft} />
      </LocaleProvider>
    );
  }
  return { ...render(<Harness />), props };
}

const field = () => screen.getByLabelText('Your question');

describe('Advisor', () => {
  it('shows the model and offers example questions', async () => {
    const user = userEvent.setup();
    renderAdvisor();
    expect(screen.getByRole('heading', { level: 2, name: 'Advisor' })).toBeInTheDocument();
    expect(screen.getByText('Model qwen3.5:9b on http://127.0.0.1:11434.')).toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(field()).toHaveAttribute('maxlength', '2000');
    expect(field()).toHaveAccessibleDescription(/^Enter to send, Shift\+Enter for a new line\./);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Which run should I do first?' }));
    expect(field()).toHaveValue('Which run should I do first?');
    expect(field()).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('speaks French inside a French locale', () => {
    renderAdvisor({}, '', 'fr');
    expect(screen.getByRole('heading', { level: 2, name: t('fr', 'advisor.title') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('fr', 'advisor.suggestionFirstRun') })).toBeInTheDocument();
  });

  it('sends the question with the button or the Enter key, and empties the field', async () => {
    const user = userEvent.setup();
    const chat = makeChat();
    const query = { profile: '76561198000000001', slot: 2 };
    renderAdvisor({ chat, query }, 'How do I get The Nail (#9)?');
    expect(field()).toHaveValue('How do I get The Nail (#9)?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(chat.ask).toHaveBeenCalledWith('How do I get The Nail (#9)?', query);
    expect(field()).toHaveValue('');
    await user.type(field(), 'Line 1{Shift>}{Enter}{/Shift}Line 2');
    expect(chat.ask).toHaveBeenCalledTimes(1);
    await user.keyboard('{Enter}');
    expect(chat.ask).toHaveBeenLastCalledWith('Line 1\nLine 2', query);
  });

  it('keeps the list of exchanges announced before the first answer', () => {
    renderAdvisor();
    const conversation = screen.getByRole('list', { name: 'Exchanges' });
    expect(conversation).toHaveAttribute('aria-live', 'polite');
    expect(within(conversation).queryAllByRole('listitem')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Which run should I do first?' })).toBeInTheDocument();
  });

  it('shows the conversation and opens a card sent to the model', async () => {
    const user = userEvent.setup();
    const { props } = renderAdvisor({ chat: makeChat([exchange()]) });
    const conversation = screen.getByRole('list', { name: 'Exchanges' });
    expect(conversation).toHaveAttribute('aria-busy', 'false');
    expect(conversation).toHaveAttribute('aria-live', 'polite');
    const item = within(conversation).getAllByRole('listitem')[0];
    expect(within(item).getByText('Which run should I do?')).toHaveClass('chat__text');
    // The line breaks of the answer are kept (plain text, no Markdown).
    expect(within(item).getByText(/^Start with Magdalene\./).textContent).toBe('Start with Magdalene.\nThen Cain.');
    const sources = within(item).getByRole('list', { name: 'Cards sent to the model' });
    const chip = within(sources).getByRole('button', { name: 'Guardian Angel' });
    expect(chip.firstElementChild).toHaveAttribute('lang', 'en');
    await user.click(chip);
    expect(props.onOpenAchievement).toHaveBeenCalledWith(45);
    expect(screen.queryByRole('button', { name: 'Which run should I do first?' })).not.toBeInTheDocument();
  });

  it('shows the wait for the model then allows stopping or clearing the answer', async () => {
    const user = userEvent.setup();
    const chat = makeChat([exchange({ answer: '', sources: [], state: 'waiting' })], true);
    renderAdvisor({ chat }, 'More');
    expect(screen.getByText(/^Preparing the answer… The first message can take/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Exchanges' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(chat.ask).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Stop the answer' }));
    expect(chat.stop).toHaveBeenCalled();
    // Section 9 of the spec: clearing the conversation also cuts the answer in flight.
    await user.click(screen.getByRole('button', { name: 'Clear the conversation' }));
    expect(chat.clear).toHaveBeenCalled();
  });

  it('says when the advisor answered nothing', () => {
    const chat = makeChat([exchange({ answer: '', sources: [], state: 'done' })]);
    renderAdvisor({ chat });
    expect(screen.getByText('The advisor answered nothing.')).toBeInTheDocument();
  });

  it('reports an interrupted or failed answer, and offers to try again', async () => {
    const user = userEvent.setup();
    const failed = exchange({
      id: 2,
      answer: '',
      sources: [],
      state: 'failed',
      error: 'Ollama unreachable at http://127.0.0.1:11434',
    });
    const chat = makeChat([exchange({ state: 'stopped' }), failed]);
    const { props } = renderAdvisor({ chat });
    expect(screen.getByText('Answer interrupted.')).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Ollama unreachable at http://127.0.0.1:11434');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(chat.retry).toHaveBeenCalledWith(2, props.query);
    await user.click(screen.getByRole('button', { name: 'Clear the conversation' }));
    expect(chat.clear).toHaveBeenCalled();
  });

  it('explains an unreachable server and leads to the settings', async () => {
    const user = userEvent.setup();
    const { props } = renderAdvisor({ status: ADVISOR_OFFLINE });
    const banner = screen.getByText(ADVISOR_OFFLINE.message as string).closest('.banner');
    await user.click(within(banner as HTMLElement).getByRole('button', { name: 'Check again' }));
    expect(props.onRecheck).toHaveBeenCalled();
    await user.click(within(banner as HTMLElement).getByRole('button', { name: 'Open the settings' }));
    expect(props.onOpenSettings).toHaveBeenCalled();
  });

  it('says a check is running and that the wiki base is missing', () => {
    const { unmount } = renderAdvisor({ status: null });
    expect(screen.getByText('Checking the Ollama server…')).toBeInTheDocument();
    unmount();
    renderAdvisor({ status: ADVISOR_OFFLINE, checking: true, kb: KB_ABSENT });
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    expect(screen.getByText('Wiki base missing or unusable: the advisor only knows your progress.')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@shared/i18n/index.ts';
import type { UpdateState } from '@shared/types.ts';
import { UpdateBanner } from '@/components/layout/UpdateBanner/UpdateBanner.tsx';
import { LocaleProvider } from '@/i18n.tsx';
import type { UpdateHook, UpdateJob } from '@/hooks/useUpdate.ts';

const STATE: UpdateState = {
  current: '0.1.0',
  latest: '0.2.0',
  newer: true,
  standalone: true,
  downloadable: true,
  page: 'https://github.com/JustMordeckai/isaac-achievement-manager/releases/tag/v0.2.0',
  installed: false,
};

function makeHook(state: UpdateState | null, job: UpdateJob = { kind: 'idle' }): UpdateHook {
  return { state, job, checking: false, check: vi.fn(), install: vi.fn(), restart: vi.fn() };
}

const show = (hook: UpdateHook) => render(<UpdateBanner update={hook} />);

describe('UpdateBanner', () => {
  it('says nothing while the check has not answered, or when the app is the latest version', () => {
    const { container, rerender } = show(makeHook(null));
    expect(container).toBeEmptyDOMElement();
    rerender(<UpdateBanner update={makeHook({ ...STATE, newer: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the new version and installs it in one click', async () => {
    const user = userEvent.setup();
    const hook = makeHook(STATE);
    show(hook);
    expect(screen.getByRole('status')).toHaveTextContent('Version 0.2.0 is available.');
    await user.click(screen.getByRole('button', { name: 'Install and restart' }));
    expect(hook.install).toHaveBeenCalledTimes(1);
  });

  it('shows how far the download is', () => {
    const { container } = show(
      makeHook(STATE, { kind: 'running', message: 'Downloading the new version', done: 50 * 1024 * 1024, total: 100 * 1024 * 1024 }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Downloading the new version 50 of 100 MB');
    // The bar itself is decorative: the megabytes next to it say the same thing out loud.
    expect(container.querySelector('.progress__fill')).toHaveStyle({ width: '50%' });
  });

  it('asks for the restart once the new version is in place', async () => {
    const user = userEvent.setup();
    const hook = makeHook(STATE, { kind: 'done', message: 'Version 0.2.0 is ready.' });
    show(hook);
    expect(screen.getByRole('status')).toHaveTextContent('Version 0.2.0 is ready.');
    await user.click(screen.getByRole('button', { name: 'Restart now' }));
    expect(hook.restart).toHaveBeenCalledTimes(1);
  });

  it('reports a failed install without hiding the banner', () => {
    show(makeHook(STATE, { kind: 'failed', message: 'GitHub did not answer: ECONNREFUSED' }));
    expect(screen.getByRole('alert')).toHaveTextContent('GitHub did not answer: ECONNREFUSED');
  });

  it('sends a copy running from its sources to git pull, with a link to the release', () => {
    show(makeHook({ ...STATE, standalone: false, downloadable: false }));
    expect(screen.getByRole('status')).toHaveTextContent('git pull');
    expect(screen.getByRole('link', { name: 'See the release' })).toHaveAttribute('href', STATE.page);
    expect(screen.queryByRole('button', { name: 'Install and restart' })).not.toBeInTheDocument();
  });

  it('speaks French inside a French locale', () => {
    render(
      <LocaleProvider locale="fr">
        <UpdateBanner update={makeHook(STATE)} />
      </LocaleProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(t('fr', 'update.available', { version: '0.2.0' }));
    expect(screen.getByRole('button', { name: t('fr', 'update.install') })).toBeInTheDocument();
  });
});

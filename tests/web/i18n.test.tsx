import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { type Locale, t } from '../../shared/i18n/index.ts';
import { Header, type HeaderProps } from '../../web/src/components/Header.tsx';
import { guessLocale, LocaleProvider, useT } from '../../web/src/i18n.tsx';
import { makeSummary } from './factories.ts';
import { jsonResponse, stubFetch } from './fetch-stub.ts';

describe('guessLocale', () => {
  it('picks French when the first language starts with fr', () => {
    expect(guessLocale(['fr-FR', 'en'])).toBe('fr');
  });

  it('picks English when the first language is not French', () => {
    expect(guessLocale(['en-US'])).toBe('en');
  });

  it('picks English when no language is known', () => {
    expect(guessLocale([])).toBe('en');
  });
});

function Probe() {
  const t = useT();
  return <p>{t('app.language')}</p>;
}

describe('LocaleProvider', () => {
  it('gives components under it the French value of a key', () => {
    render(
      <LocaleProvider locale="fr">
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText('Langue')).toBeInTheDocument();
  });

  it('sets document.documentElement.lang from the locale', () => {
    render(
      <LocaleProvider locale="fr">
        <Probe />
      </LocaleProvider>,
    );
    expect(document.documentElement.lang).toBe('fr');
  });
});

function baseHeaderProps(): HeaderProps {
  return {
    summary: makeSummary(),
    kb: null,
    advisor: null,
    meSteamId: null,
    query: { profile: 'me', slot: null },
    onQueryChange: vi.fn(),
    refreshing: false,
    onRefresh: vi.fn(),
    theme: 'dark',
    onToggleTheme: vi.fn(),
    tab: 'dashboard',
    onTabChange: vi.fn(),
    onStop: vi.fn(),
  };
}

/** Mirrors how App.tsx wires the header: the picked locale drives the provider straight back. */
function LocaleHarness({ onLocaleSaved }: { onLocaleSaved?(locale: Locale): void }) {
  const [locale, setLocale] = useState<Locale>('en');
  return (
    <LocaleProvider locale={locale} onLocaleChange={setLocale} onLocaleSaved={onLocaleSaved}>
      <Header {...baseHeaderProps()} />
    </LocaleProvider>
  );
}

describe('LanguagePicker', () => {
  it('calls api.saveLocale and switches the interface without reloading', async () => {
    const user = userEvent.setup();
    const mock = stubFetch({ 'POST /api/settings': () => ({ locale: 'fr' }) });
    render(<LocaleHarness />);
    expect(screen.getByRole('button', { name: 'Language: English' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Language: English' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Fran\u00e7ais' }));

    expect(await screen.findByRole('button', { name: 'Langue: Fran\u00e7ais' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
    await vi.waitFor(() => expect(mock.mock.calls.some(([input]) => String(input) === '/api/settings')).toBe(true));
    const [, init] = mock.mock.calls.find(([input]) => String(input) === '/api/settings')!;
    expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('settings');
    expect(JSON.parse(String(init?.body))).toEqual({ locale: 'fr' });
  });

  it('keeps the chosen language and reports a failed save', async () => {
    const user = userEvent.setup();
    stubFetch({ 'POST /api/settings': () => jsonResponse({ error: 'data/settings.json is read-only' }, 500) });
    render(<LocaleHarness />);

    await user.click(screen.getByRole('button', { name: 'Language: English' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Fran\u00e7ais' }));

    expect(await screen.findByRole('button', { name: 'Langue: Fran\u00e7ais' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('fr', 'settings.language.saveFailed'),
    );
  });

  it('reports the saved language, and says nothing when the save fails', async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    stubFetch({ 'POST /api/settings': () => ({ locale: 'fr' }) });
    const view = render(<LocaleHarness onLocaleSaved={saved} />);

    await user.click(screen.getByRole('button', { name: 'Language: English' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Fran\u00e7ais' }));

    await vi.waitFor(() => expect(saved).toHaveBeenCalledWith('fr'));
    view.unmount();

    stubFetch({ 'POST /api/settings': () => jsonResponse({ error: 'data/settings.json is read-only' }, 500) });
    const failing = vi.fn();
    render(<LocaleHarness onLocaleSaved={failing} />);

    await user.click(screen.getByRole('button', { name: 'Language: English' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Fran\u00e7ais' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(failing).not.toHaveBeenCalled();
  });

  it('shows the flag alone in the header, where there is no room for a word', () => {
    render(<LocaleHarness />);
    const button = screen.getByRole('button', { name: 'Language: English' });
    expect(button.textContent).toBe('');
    expect(button.querySelector('svg.flag')).not.toBeNull();
  });

  it('names each entry in its own language, for screen readers', async () => {
    const user = userEvent.setup();
    render(<LocaleHarness />);

    await user.click(screen.getByRole('button', { name: 'Language: English' }));

    const entries = screen.getAllByRole('menuitemradio');
    expect(entries.map((e) => [e.textContent, e.lang, e.getAttribute('aria-checked')])).toEqual([
      ['English', 'en', 'true'],
      ['Fran\u00e7ais', 'fr', 'false'],
    ]);
  });
});

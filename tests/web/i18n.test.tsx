import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Locale } from '../../shared/i18n/index.ts';
import { Header, type HeaderProps } from '../../web/src/components/Header.tsx';
import { guessLocale, LocaleProvider, useT } from '../../web/src/i18n.tsx';
import { makeSummary } from './factories.ts';
import { stubFetch } from './fetch-stub.ts';

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

function baseHeaderProps(onLocaleChange: (locale: Locale) => void): HeaderProps {
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
    onLocaleChange,
  };
}

/** Mirrors how App.tsx wires the header: the picked locale drives the provider straight back. */
function LocaleHarness() {
  const [locale, setLocale] = useState<Locale>('en');
  return (
    <LocaleProvider locale={locale}>
      <Header {...baseHeaderProps(setLocale)} />
    </LocaleProvider>
  );
}

describe('language selector', () => {
  it('calls api.saveLocale and switches the interface without reloading', async () => {
    const user = userEvent.setup();
    const mock = stubFetch({ 'POST /api/settings': () => ({ locale: 'fr' }) });
    render(<LocaleHarness />);
    expect(screen.getByLabelText('Language')).toHaveValue('en');

    await user.selectOptions(screen.getByLabelText('Language'), 'Français');

    expect(await screen.findByLabelText('Langue')).toHaveValue('fr');
    expect(document.documentElement.lang).toBe('fr');
    await vi.waitFor(() => expect(mock.mock.calls.some(([input]) => String(input) === '/api/settings')).toBe(true));
    const [, init] = mock.mock.calls.find(([input]) => String(input) === '/api/settings')!;
    expect(new Headers(init?.headers).get('X-IAM-Action')).toBe('settings');
    expect(JSON.parse(String(init?.body))).toEqual({ locale: 'fr' });
  });
});

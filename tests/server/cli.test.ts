import { describe, expect, it } from 'vitest';
import { shouldOpenBrowser } from '../../server/cli.ts';

const args = (...flags: string[]) => new Set(flags);

describe('shouldOpenBrowser', () => {
  it('opens the browser on its own from the executable', () => {
    expect(shouldOpenBrowser(args(), true)).toBe(true);
  });

  it('waits for --open when the server is started by hand', () => {
    expect(shouldOpenBrowser(args(), false)).toBe(false);
    expect(shouldOpenBrowser(args('--open'), false)).toBe(true);
  });

  it('stays quiet when --no-open says so, executable or not', () => {
    expect(shouldOpenBrowser(args('--no-open'), true)).toBe(false);
    expect(shouldOpenBrowser(args('--open', '--no-open'), false)).toBe(false);
  });
});

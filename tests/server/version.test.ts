import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, REPOSITORY, compareVersions } from '../../shared/version.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('APP_VERSION', () => {
  it('is the version of package.json, since the executable carries no package.json', () => {
    const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(version);
  });

  it('names the repository the releases are read from', () => {
    const { repository } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      repository: { url: string };
    };
    expect(repository.url).toContain(REPOSITORY);
  });
});

describe('compareVersions', () => {
  it('orders the numbers rather than the text', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1);
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1);
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
  });

  it('treats equal versions as equal, whatever the v prefix and the spaces', () => {
    expect(compareVersions('0.1.0', 'v0.1.0')).toBe(0);
    expect(compareVersions(' 0.1.0 ', '0.1.0')).toBe(0);
    expect(compareVersions('0.1', '0.1.0')).toBe(0);
  });

  it('reads anything that is not a number as a zero, so a strange tag never looks newer', () => {
    expect(compareVersions('nightly', '0.1.0')).toBe(-1);
    expect(compareVersions('0.1.0-beta', '0.1.0')).toBe(0);
  });
});

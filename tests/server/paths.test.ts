import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const original = process.env.IAM_ROOT;

afterEach(() => {
  if (original === undefined) delete process.env.IAM_ROOT;
  else process.env.IAM_ROOT = original;
  vi.resetModules();
});

describe('ROOT', () => {
  it('is the repository itself when nothing overrides it', async () => {
    delete process.env.IAM_ROOT;
    vi.resetModules();
    const { ROOT, DATA_DIR, WEB_DIST } = await import('../../server/paths.ts');
    expect(existsSync(path.join(ROOT, 'server', 'paths.ts'))).toBe(true);
    expect(DATA_DIR).toBe(path.join(ROOT, 'data'));
    expect(WEB_DIST).toBe(path.join(ROOT, 'web', 'dist'));
  });

  it('follows IAM_ROOT, which is how the executable is tried on a throwaway folder', async () => {
    process.env.IAM_ROOT = path.join(path.sep, 'tmp', 'isaac-somewhere-else');
    vi.resetModules();
    const { ROOT, DATA_DIR } = await import('../../server/paths.ts');
    expect(ROOT).toBe(path.resolve(process.env.IAM_ROOT));
    expect(DATA_DIR).toBe(path.join(ROOT, 'data'));
  });
});

import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomic } from '../../server/fs-atomic.ts';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'iam-fs-atomic-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('écrit le fichier final sans laisser de fichier temporaire', async () => {
    const file = path.join(dir, 'ok.json');
    await writeFileAtomic(file, '{"a":1}');
    expect(await readFile(file, 'utf8')).toBe('{"a":1}');
    expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('relance l’erreur et supprime le fichier temporaire quand le renommage échoue', async () => {
    const file = path.join(dir, 'blocked');
    await mkdir(file); // le renommage vers un dossier existant échoue
    await expect(writeFileAtomic(file, 'contenu')).rejects.toThrow();
    expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

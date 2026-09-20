import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStandalone } from './sea.ts';

/**
 * Where the app keeps its own files. Started from the repository, that is the repository itself;
 * started as the single executable, it is the folder holding the .exe, so `data/` sits next to it.
 * IAM_ROOT overrides both, which is what the tests use.
 */
function rootDir(): string {
  if (process.env.IAM_ROOT) return path.resolve(process.env.IAM_ROOT);
  if (isStandalone()) return path.dirname(process.execPath);
  // The bundle of the executable has no import.meta: it never reaches this line, but a plain
  // node running that bundle would, so the folder of the running file closes the fallback.
  const here = import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : path.dirname(process.execPath);
  return path.resolve(here, '..');
}

export const ROOT = rootDir();
export const DATA_DIR = path.join(ROOT, 'data');
export const WEB_DIST = path.join(ROOT, 'web', 'dist');

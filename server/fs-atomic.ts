import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

let counter = 0;

/** Writes a file through a temporary file then a rename: never a half written file. */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${++counter}.tmp`;
  try {
    await writeFile(temporary, data);
    await rename(temporary, file);
  } catch (error) {
    // Best effort cleanup: the original error wins, and no temporary file is left behind.
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

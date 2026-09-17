import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

let counter = 0;

/** Écrit un fichier via un fichier temporaire puis un renommage : jamais de fichier à moitié écrit. */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${++counter}.tmp`;
  try {
    await writeFile(temporary, data);
    await rename(temporary, file);
  } catch (error) {
    // Nettoyage au mieux : l'erreur d'origine prime, on ne laisse pas de fichier temporaire derrière.
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

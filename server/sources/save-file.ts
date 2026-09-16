import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const SAVE_MAGIC = 'ISAACNGSAVE09R';
const FIRST_CHUNK_OFFSET = 20;
const CHUNK_HEADER_SIZE = 12;
/**
 * Taille d'un élément par type de bloc lu : 1 secrets (octets), 2 compteurs (int32),
 * 3 compteurs de niveau (int32), 4 objets vus (octets). Le second champ de l'en-tête
 * n'est pas une longueur fiable (bloc 4 : 2932 annoncés pour 733 octets de données).
 */
const ELEMENT_SIZE: Record<number, number> = { 1: 1, 2: 4, 3: 4, 4: 1 };
const KNOWN_CHUNKS = 4;
const SLOT_FILE = /^rep\+persistentgamedata([123])\.dat$/;

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

export interface SaveChunk {
  type: number;
  /** Début des données du bloc (après son en-tête de 12 octets). */
  offset: number;
  /** Nombre d'éléments. */
  count: number;
  /** Longueur réelle des données : count x taille d'élément du type. */
  byteLength: number;
  /** Second champ brut de l'en-tête (non fiable comme longueur). */
  declaredSize: number;
}

export interface SaveFileData {
  chunks: SaveChunk[];
  /** Début de la zone non décodée qui suit les 4 blocs connus. */
  tailOffset: number;
  secrets: Set<number>;
  counters: number[];
}

export function parseSaveFile(buf: Uint8Array): SaveFileData {
  const magic = String.fromCharCode(...buf.subarray(0, SAVE_MAGIC.length));
  if (buf.length < FIRST_CHUNK_OFFSET || magic !== SAVE_MAGIC) {
    throw new SaveFormatError(`En-tête de sauvegarde inconnu (« ${magic.replace(/[^\x20-\x7e]/g, '?')} »)`);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const chunks: SaveChunk[] = [];
  let pos = FIRST_CHUNK_OFFSET;
  for (let expected = 1; expected <= KNOWN_CHUNKS; expected++) {
    if (pos + CHUNK_HEADER_SIZE > buf.length) {
      throw new SaveFormatError(`Bloc ${expected} absent (fin de fichier à l'offset ${pos})`);
    }
    const type = view.getUint32(pos, true);
    if (type !== expected) {
      throw new SaveFormatError(`Bloc ${expected} attendu à l'offset ${pos}, type ${type} trouvé`);
    }
    const declaredSize = view.getUint32(pos + 4, true);
    const count = view.getUint32(pos + 8, true);
    // Contrôles avant d'avancer : un nombre corrompu décalerait la lecture des blocs suivants.
    if (type === 1 && declaredSize !== count) {
      throw new SaveFormatError('Bloc des secrets incohérent (nombre différent de la taille annoncée)');
    }
    if (type === 2 && declaredSize !== count * 4) {
      throw new SaveFormatError('Bloc des compteurs incohérent (taille annoncée différente de nombre x 4)');
    }
    const byteLength = count * ELEMENT_SIZE[type];
    if (pos + CHUNK_HEADER_SIZE + byteLength > buf.length) {
      throw new SaveFormatError(`Bloc ${expected} tronqué à l'offset ${pos}`);
    }
    chunks.push({ type, offset: pos + CHUNK_HEADER_SIZE, count, byteLength, declaredSize });
    pos += CHUNK_HEADER_SIZE + byteLength;
  }

  const [secretsChunk, countersChunk] = chunks;

  const secrets = new Set<number>();
  for (let id = 0; id < secretsChunk.count; id++) {
    if (buf[secretsChunk.offset + id] !== 0) secrets.add(id);
  }
  const counters: number[] = [];
  for (let i = 0; i < countersChunk.count; i++) {
    counters.push(view.getInt32(countersChunk.offset + i * 4, true));
  }
  // La suite du fichier (bloc 5 et suivants, marques de complétion probables) n'est pas encore décodée : on l'ignore.
  return { chunks, tailOffset: pos, secrets, counters };
}

export interface SaveSlot {
  slot: number;
  path: string;
  mtimeMs: number;
  size: number;
}

export async function listSaveSlots(remoteDir: string): Promise<SaveSlot[]> {
  let names: string[];
  try {
    names = await readdir(remoteDir);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
  const slots: SaveSlot[] = [];
  for (const name of names) {
    const match = SLOT_FILE.exec(name);
    if (!match) continue;
    const file = path.join(remoteDir, name);
    const info = await stat(file);
    slots.push({ slot: Number(match[1]), path: file, mtimeMs: info.mtimeMs, size: info.size });
  }
  return slots.sort((a, b) => a.slot - b.slot);
}

export function pickDefaultSlot(slots: SaveSlot[]): SaveSlot | null {
  const sorted = [...slots].sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size);
  return sorted[0] ?? null;
}

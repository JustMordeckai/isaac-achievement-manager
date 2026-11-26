import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_LOCALE, t, type Locale } from '../../shared/i18n/index.ts';

/**
 * Headers of the save versions this parser reads. 10R came with the game update of 2026-11-19: the
 * 4 chunks read here kept the layout and the meaning of 09R (checked on real saves written on each
 * side of the update), only data after them changed. Any other header is refused rather than read
 * on a guess.
 */
export const SAVE_MAGICS: readonly string[] = ['ISAACNGSAVE09R', 'ISAACNGSAVE10R'];
const MAGIC_LENGTH = 14;
const FIRST_CHUNK_OFFSET = 20;
const CHUNK_HEADER_SIZE = 12;
/**
 * Size of one element per chunk type read: 1 secrets (bytes), 2 counters (int32),
 * 3 level counters (int32), 4 seen objects (bytes). The header's second field is
 * not a reliable length (chunk 4: 2932 declared for 733 bytes of data).
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
  /** Start of the chunk's data (after its 12 byte header). */
  offset: number;
  /** Number of elements. */
  count: number;
  /** Actual data length: count x the type's element size. */
  byteLength: number;
  /** Header's raw second field (not reliable as a length). */
  declaredSize: number;
}

export interface SaveFileData {
  chunks: SaveChunk[];
  /** Start of the undecoded area that follows the 4 known chunks. */
  tailOffset: number;
  secrets: Set<number>;
  counters: number[];
}

export function parseSaveFile(buf: Uint8Array, locale: Locale = DEFAULT_LOCALE): SaveFileData {
  const magic = String.fromCharCode(...buf.subarray(0, MAGIC_LENGTH));
  if (buf.length < FIRST_CHUNK_OFFSET || !SAVE_MAGICS.includes(magic)) {
    throw new SaveFormatError(t(locale, 'errors.saveHeaderUnknown', { magic: magic.replace(/[^\x20-\x7e]/g, '?') }));
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const chunks: SaveChunk[] = [];
  let pos = FIRST_CHUNK_OFFSET;
  for (let expected = 1; expected <= KNOWN_CHUNKS; expected++) {
    if (pos + CHUNK_HEADER_SIZE > buf.length) {
      throw new SaveFormatError(t(locale, 'errors.saveChunkMissing', { expected, pos }));
    }
    const type = view.getUint32(pos, true);
    if (type !== expected) {
      throw new SaveFormatError(t(locale, 'errors.saveChunkTypeMismatch', { expected, pos, type }));
    }
    const declaredSize = view.getUint32(pos + 4, true);
    const count = view.getUint32(pos + 8, true);
    // Checks before advancing: a corrupted number would shift the reading of the following chunks.
    if (type === 1 && declaredSize !== count) {
      throw new SaveFormatError(t(locale, 'errors.saveSecretsChunkInconsistent'));
    }
    if (type === 2 && declaredSize !== count * 4) {
      throw new SaveFormatError(t(locale, 'errors.saveCountersChunkInconsistent'));
    }
    const byteLength = count * ELEMENT_SIZE[type];
    if (pos + CHUNK_HEADER_SIZE + byteLength > buf.length) {
      throw new SaveFormatError(t(locale, 'errors.saveChunkTruncated', { expected, pos }));
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
  // The rest of the file (chunk 5 and beyond, likely completion marks) is not decoded yet: we ignore it.
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

import { dlcForId } from '../../shared/dlc.ts';
import type { AchievementDef } from '../../shared/types.ts';
import { APP_ID } from '../steam.ts';
import { parseBinaryVdf, type VdfObject, type VdfValue } from './vdf-binary.ts';

export interface SchemaEntry {
  def: AchievementDef;
  /** Key of the stats chunk (bit field) in the schema and in the stats. */
  block: string;
  bit: number;
}

/** Achievement id to Unix timestamp in seconds (null when Steam has no date). */
export type UnlockMap = Map<number, number | null>;

function asObject(value: VdfValue | undefined): VdfObject | undefined {
  return typeof value === 'object' ? value : undefined;
}

function asString(value: VdfValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

export function parseSchema(buf: Uint8Array): SchemaEntry[] {
  const stats = asObject(asObject(parseBinaryVdf(buf)[APP_ID])?.stats);
  if (!stats) throw new Error(`Steam schema: chunk ${APP_ID}/stats not found`);
  const entries: SchemaEntry[] = [];
  for (const [block, blockValue] of Object.entries(stats)) {
    const bits = asObject(asObject(blockValue)?.bits);
    if (!bits) continue;
    for (const [bit, raw] of Object.entries(bits)) {
      const achievement = asObject(raw);
      const id = Number(asString(achievement?.name));
      if (!achievement || !Number.isInteger(id) || id <= 0) continue;
      const display = asObject(achievement.display);
      entries.push({
        block,
        bit: Number(bit),
        def: {
          id,
          name: asString(asObject(display?.name)?.english),
          description: asString(asObject(display?.desc)?.english),
          hidden: display?.hidden === 1 || display?.hidden === '1',
          icon: asString(display?.icon),
          iconGray: asString(display?.icon_gray),
          dlc: dlcForId(id),
        },
      });
    }
  }
  return entries.sort((a, b) => a.def.id - b.def.id);
}

export function parseUserStats(buf: Uint8Array, schema: SchemaEntry[]): UnlockMap {
  const cache = asObject(parseBinaryVdf(buf).cache);
  if (!cache) throw new Error('Steam stats: cache chunk not found');
  const unlocked: UnlockMap = new Map();
  for (const { def, block, bit } of schema) {
    const stats = asObject(cache[block]);
    const data = typeof stats?.data === 'number' ? stats.data : 0;
    if (((data >>> bit) & 1) === 0) continue;
    const time = asObject(stats?.AchievementTimes)?.[String(bit)];
    unlocked.set(def.id, typeof time === 'number' && time > 0 ? time : null);
  }
  return unlocked;
}

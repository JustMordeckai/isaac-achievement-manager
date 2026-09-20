import type { Dlc } from './types.ts';

export const DLC_ORDER: Dlc[] = ['rebirth', 'afterbirth', 'afterbirthPlus', 'repentance', 'repentancePlus'];

// Ranges taken from the `dlc` field of the wiki (read on 2026-09-16); id 641 comes from Repentance+.
const LAST_ID: Array<[lastId: number, dlc: Dlc]> = [
  [178, 'rebirth'],
  [276, 'afterbirth'],
  [403, 'afterbirthPlus'],
  [640, 'repentance'],
];

export function dlcForId(id: number): Dlc {
  for (const [lastId, dlc] of LAST_ID) {
    if (id <= lastId) return dlc;
  }
  return 'repentancePlus';
}

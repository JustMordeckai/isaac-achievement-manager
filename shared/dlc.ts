import type { Dlc } from './types.ts';

export const DLC_ORDER: Dlc[] = ['rebirth', 'afterbirth', 'afterbirthPlus', 'repentance', 'repentancePlus'];

// Plages tirées du champ `dlc` du wiki (relevé du 2026-09-16) ; l'id 641 vient de Repentance+.
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

import { describe, expect, it } from 'vitest';
import { DLC_ORDER, dlcForId } from '../../shared/dlc.ts';

describe('dlcForId', () => {
  it('découpe les ids 1 à 641 en plages contiguës, dans l’ordre des extensions', () => {
    const ids = Array.from({ length: 641 }, (_, i) => i + 1);
    const counts = Object.fromEntries(DLC_ORDER.map((d) => [d, ids.filter((id) => dlcForId(id) === d).length]));
    expect(counts).toEqual({ rebirth: 178, afterbirth: 98, afterbirthPlus: 127, repentance: 237, repentancePlus: 1 });
    const order = ids.map((id) => DLC_ORDER.indexOf(dlcForId(id)));
    expect(order.every((value, i) => i === 0 || value >= order[i - 1])).toBe(true);
  });

  it('range les bornes au bon endroit', () => {
    expect([178, 179, 276, 277, 403, 404, 640, 641, 700].map(dlcForId)).toEqual([
      'rebirth', 'afterbirth', 'afterbirth', 'afterbirthPlus', 'afterbirthPlus',
      'repentance', 'repentance', 'repentancePlus', 'repentancePlus',
    ]);
  });
});

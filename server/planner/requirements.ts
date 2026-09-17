import type { CharacterId } from '../../shared/characters.ts';
import type { EndingId } from '../../shared/endings.ts';
import type { Requirement } from '../../shared/types.ts';
import { CHARACTER_INFO } from './characters.ts';
import { TARGETS } from './targets.ts';

/** Groupes de succès à débloquer (un seul par groupe suffit) pour jouer un personnage vers ces fins. */
export function requirementGroups(character: CharacterId | null, endings: EndingId[], extra: number[] = []): number[][] {
  const groups: number[][] = [];
  const unlockedBy = character ? CHARACTER_INFO[character].unlockedBy : null;
  if (unlockedBy !== null) groups.push([unlockedBy]);
  for (const ending of endings) {
    for (const id of TARGETS[ending].requires) groups.push([id]);
    groups.push(...TARGETS[ending].requiresAny);
  }
  for (const id of extra) groups.push([id]);
  // Un groupe « l'un ou l'autre » déjà couvert par un succès exigé seul n'apporte rien : on le retire.
  const single = new Set(groups.filter((group) => group.length === 1).map(([id]) => id));
  const seen = new Set<string>();
  return groups.filter((group) => {
    const key = group.join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return group.length === 1 || !group.some((id) => single.has(id));
  });
}

export function toRequirements(
  groups: number[][],
  names: ReadonlyMap<number, string>,
  unlocked: ReadonlySet<number>,
): Requirement[] {
  return groups.map((group) => ({
    anyOf: group.map((id) => ({ id, name: names.get(id) ?? `#${id}` })),
    met: group.some((id) => unlocked.has(id)),
  }));
}

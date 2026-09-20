/**
 * Counters of the save (chunk 2) tied to the cumulative achievements, recognized on the wiki condition.
 * Indexes and names: EventCounter enumeration of REPENTOGON, checked against a real save (2026-09-17).
 * The achievements with no identified counter (floors cleared, portals, Little Horn, angels, victory laps)
 * only show their condition.
 */
export interface CounterRule {
  pattern: RegExp;
  index: number;
  name: string;
}

export const COUNTER_RULES: CounterRule[] = [
  { pattern: /^Defeat (?:Mom's Heart|It Lives!) \d+ times$/, index: 1, name: 'MOM_KILLS' },
  { pattern: /^Destroy \d+ rocks$/i, index: 2, name: 'ROCKS_DESTROYED' },
  { pattern: /^Destroy \d+ Tinted Rocks$/, index: 3, name: 'TINTED_ROCKS_DESTROYED' },
  { pattern: /^Destroy \d+ Poops$/, index: 5, name: 'POOP_DESTROYED' },
  { pattern: /^Use XIII - Death \d+ times$/, index: 7, name: 'XIII_DEATH_CARD_USED' },
  { pattern: /^Visit \d+ Arcades$/, index: 9, name: 'ARCADES_ENTERED' },
  { pattern: /^Die \d+ times$/, index: 10, name: 'DEATHS' },
  { pattern: /^Defeat Isaac \d+ times$/, index: 11, name: 'ISAAC_KILLS' },
  { pattern: /^Blow up \d+ Shopkeepers$/, index: 12, name: 'SHOPKEEPER_KILLED' },
  { pattern: /^Defeat Satan \d+ times$/, index: 13, name: 'SATAN_KILLS' },
  { pattern: /Shell Game or Hell Game \d+ times$/, index: 14, name: 'SHELLGAMES_PLAYED' },
  { pattern: /^Take \d+ Angel Rooms? items$/, index: 15, name: 'ANGEL_DEALS_TAKEN' },
  { pattern: /^Take \d+ (?:items from Devil Rooms|Deals with the Devil)$/, index: 16, name: 'DEVIL_DEALS_TAKEN' },
  { pattern: /^Use the Blood Donation Machine \d+ times$/, index: 17, name: 'BLOOD_DONATION_MACHINE_USED' },
  { pattern: /^Blow up \d+ Slot Machines?$/, index: 18, name: 'SLOT_MACHINES_BROKEN' },
  { pattern: /^Donate \d+ coins to the Donation Machine$/i, index: 20, name: 'DONATION_MACHINE_COUNTER' },
  { pattern: /^Donate \d+ Coins to the Greed Donation Machine$/, index: 115, name: 'GREED_DONATION_MACHINE_COUNTER' },
  { pattern: /^Defeat Hush \d+ times$/, index: 158, name: 'HUSH_KILLS' },
  { pattern: /^Participate in \d+ Daily Challenges/, index: 190, name: 'DAILYS_PLAYED' },
  { pattern: /^Complete \d+ Daily Challenges/, index: 193, name: 'DAILYS_WON' },
  { pattern: /^Destroy \d+ rainbow poops$/, index: 194, name: 'RAINBOW_POOP_DESTROYED' },
  { pattern: /^Recharge using Lil' Batteries \d+ times$/, index: 195, name: 'BATTERIES_COLLECTED' },
  { pattern: /^Use Cards and Runes \d+ times$/, index: 196, name: 'CARDS_USED' },
  { pattern: /^Purchase anything from Shops/, index: 197, name: 'SHOP_ITEMS_BOUGHT' },
  { pattern: /^Open \d+ Locked Chests$/, index: 198, name: 'CHESTS_OPENED_WITH_KEY' },
  { pattern: /^Blow up doors and Secret Room walls \d+ times$/, index: 199, name: 'SECRET_ROOMS_WALLS_OPENED' },
  { pattern: /^Acquire Blood Clot \d+ times$/, index: 200, name: 'BLOOD_CLOT_ITEM_AQUIRED' },
  { pattern: /^Acquire Rubber Cement \d+ times$/, index: 201, name: 'RUBBER_CEMENT_ITEM_AQUIRED' },
  { pattern: /^Sleep in \d+ beds$/, index: 202, name: 'BEDS_USED' },
  { pattern: /^Defeat Baby Plum \d+ times$/, index: 493, name: 'BABY_PLUM_KILLS' },
  { pattern: /^Kill \d+ Battery Bums$/, index: 494, name: 'BATTERY_BUMS_KILLED' },
  { pattern: /^Donate to Battery Bums until they pay out with an item \d+ times$/, index: 495, name: 'BATTERY_BUM_COLLECTIBLE_PAYOUTS' },
];

/** Index of the counter that follows a cumulative condition, null when it is not identified. */
export function counterIndex(condition: string): number | null {
  return COUNTER_RULES.find((rule) => rule.pattern.test(condition))?.index ?? null;
}

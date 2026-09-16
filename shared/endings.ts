export type EndingId =
  | 'momsHeart'
  | 'isaac'
  | 'satan'
  | 'blueBaby'
  | 'lamb'
  | 'megaSatan'
  | 'bossRush'
  | 'hush'
  | 'delirium'
  | 'mother'
  | 'beast'
  | 'ultraGreed'
  | 'ultraGreedier';

export interface Ending {
  id: EndingId;
  /** Nom tel qu'il apparaît dans les conditions du wiki. */
  name: string;
  aliases: string[];
  /** Page du wiki qui décrit le combat (avec l'ancre éventuelle). */
  page: string;
  fragment: string | null;
}

/** Les fins de run qui donnent une marque de complétion. */
export const ENDINGS: Ending[] = [
  { id: 'momsHeart', name: "Mom's Heart", aliases: ['It Lives', 'It Lives!'], page: "Mom's Heart", fragment: null },
  { id: 'isaac', name: 'Isaac', aliases: [], page: 'Isaac (Boss)', fragment: null },
  { id: 'satan', name: 'Satan', aliases: [], page: 'Satan', fragment: null },
  { id: 'blueBaby', name: '???', aliases: ['Blue Baby'], page: '??? (Boss)', fragment: null },
  { id: 'lamb', name: 'The Lamb', aliases: [], page: 'The Lamb', fragment: null },
  { id: 'megaSatan', name: 'Mega Satan', aliases: [], page: 'Mega Satan', fragment: null },
  { id: 'bossRush', name: 'Boss Rush', aliases: ['the Boss Rush'], page: 'Boss Rush', fragment: null },
  { id: 'hush', name: 'Hush', aliases: [], page: 'Hush', fragment: null },
  { id: 'delirium', name: 'Delirium', aliases: [], page: 'Delirium', fragment: null },
  { id: 'mother', name: 'Mother', aliases: [], page: 'Mother', fragment: null },
  { id: 'beast', name: 'The Beast', aliases: [], page: 'The Beast', fragment: null },
  { id: 'ultraGreed', name: 'Ultra Greed', aliases: [], page: 'Ultra Greed', fragment: null },
  { id: 'ultraGreedier', name: 'Ultra Greedier', aliases: [], page: 'Ultra Greed', fragment: 'Ultra Greedier' },
];

const BY_NAME = new Map<string, Ending>();
for (const ending of ENDINGS) {
  for (const name of [ending.name, ...ending.aliases]) BY_NAME.set(name.toLowerCase(), ending);
}

export function endingByName(name: string): Ending | null {
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

export function endingById(id: EndingId): Ending {
  const found = ENDINGS.find((e) => e.id === id);
  if (!found) throw new Error(`Fin inconnue : ${id}`);
  return found;
}

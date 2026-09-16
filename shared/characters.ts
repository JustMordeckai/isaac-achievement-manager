export type CharacterId =
  | 'isaac'
  | 'magdalene'
  | 'cain'
  | 'judas'
  | 'blueBaby'
  | 'eve'
  | 'samson'
  | 'azazel'
  | 'lazarus'
  | 'eden'
  | 'theLost'
  | 'lilith'
  | 'keeper'
  | 'apollyon'
  | 'theForgotten'
  | 'bethany'
  | 'jacobAndEsau'
  | 'taintedIsaac'
  | 'taintedMagdalene'
  | 'taintedCain'
  | 'taintedJudas'
  | 'taintedBlueBaby'
  | 'taintedEve'
  | 'taintedSamson'
  | 'taintedAzazel'
  | 'taintedLazarus'
  | 'taintedEden'
  | 'taintedLost'
  | 'taintedLilith'
  | 'taintedKeeper'
  | 'taintedApollyon'
  | 'taintedForgotten'
  | 'taintedBethany'
  | 'taintedJacob';

export interface Character {
  id: CharacterId;
  /** Nom tel qu'il apparaît dans les conditions du wiki. */
  name: string;
  /** Titre de la page du personnage sur le wiki. */
  page: string;
  tainted: boolean;
  /** Autres graphies rencontrées sur le wiki. */
  aliases: string[];
}

function regular(id: CharacterId, name: string, page = name, aliases: string[] = []): Character {
  return { id, name, page, tainted: false, aliases };
}

function tainted(id: CharacterId, name: string, aliases: string[] = []): Character {
  return { id, name: `Tainted ${name}`, page: `Tainted ${name}`, tainted: true, aliases };
}

/** Les 34 personnages, dans l'ordre de l'écran de sélection. */
export const CHARACTERS: Character[] = [
  regular('isaac', 'Isaac'),
  regular('magdalene', 'Magdalene', 'Magdalene', ['Maggy']),
  regular('cain', 'Cain'),
  regular('judas', 'Judas'),
  regular('blueBaby', '???', '??? (Character)', ['Blue Baby']),
  regular('eve', 'Eve'),
  regular('samson', 'Samson'),
  regular('azazel', 'Azazel'),
  regular('lazarus', 'Lazarus'),
  regular('eden', 'Eden'),
  regular('theLost', 'The Lost'),
  regular('lilith', 'Lilith'),
  regular('keeper', 'Keeper'),
  regular('apollyon', 'Apollyon'),
  regular('theForgotten', 'The Forgotten'),
  regular('bethany', 'Bethany'),
  regular('jacobAndEsau', 'Jacob and Esau', 'Jacob & Esau', ['Jacob & Esau']),
  tainted('taintedIsaac', 'Isaac'),
  tainted('taintedMagdalene', 'Magdalene'),
  tainted('taintedCain', 'Cain'),
  tainted('taintedJudas', 'Judas'),
  tainted('taintedBlueBaby', '???', ['Tainted Blue Baby']),
  tainted('taintedEve', 'Eve'),
  tainted('taintedSamson', 'Samson'),
  tainted('taintedAzazel', 'Azazel'),
  tainted('taintedLazarus', 'Lazarus'),
  tainted('taintedEden', 'Eden'),
  tainted('taintedLost', 'Lost', ['Tainted The Lost']),
  tainted('taintedLilith', 'Lilith'),
  tainted('taintedKeeper', 'Keeper'),
  tainted('taintedApollyon', 'Apollyon'),
  tainted('taintedForgotten', 'Forgotten', ['Tainted The Forgotten']),
  tainted('taintedBethany', 'Bethany'),
  tainted('taintedJacob', 'Jacob', ['Tainted Jacob and Esau', 'Tainted Jacob & Esau']),
];

const BY_NAME = new Map<string, Character>();
for (const character of CHARACTERS) {
  for (const name of [character.name, ...character.aliases]) BY_NAME.set(name.toLowerCase(), character);
}

export function characterByName(name: string): Character | null {
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

export function characterById(id: CharacterId): Character {
  const found = CHARACTERS.find((c) => c.id === id);
  if (!found) throw new Error(`Personnage inconnu : ${id}`);
  return found;
}

/** Toutes les graphies connues, les plus longues d'abord (pour construire des expressions régulières). */
export function characterNames(): string[] {
  return [...BY_NAME.keys()].sort((a, b) => b.length - a.length);
}

import type { CharacterId } from '../../shared/characters.ts';
import type { How, TextBlock, Unlock, WikiSyncReport } from '../../shared/types.ts';
import type { KbChallenge, KbPage, TipAttachment } from './parse-pages.ts';

/** À incrémenter à chaque changement de forme de data/kb.json. */
export const KB_VERSION = 1;

export interface KbAchievement {
  id: number;
  wikiName: string;
  name: string;
  description: string;
  /** Condition nettoyée (vide pour un succès absent du wiki). */
  condition: string;
  how: How;
  unlocks: Unlock;
  character: CharacterId | null;
  /** Page liée utilisable (clé de `pages`), null si elle n'existe pas. */
  page: string | null;
  fragment: string | null;
  /** Section visée par l'ancre de la page liée, si elle a été trouvée. */
  excerpt: TextBlock[] | null;
  inWiki: boolean;
}

export interface KnowledgeBase {
  version: number;
  syncedAt: string;
  achievements: KbAchievement[];
  challenges: KbChallenge[];
  pages: Record<string, KbPage>;
  tips: TipAttachment[];
  report: WikiSyncReport;
}

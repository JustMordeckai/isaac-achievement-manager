import type { CharacterId } from '../../shared/characters.ts';
import type { How, TextBlock, Unlock, WikiSyncReport } from '../../shared/types.ts';
import type { KbChallenge, KbPage, TipAttachment } from './parse-pages.ts';

/** Bumped on every change of the shape of data/kb.json. */
export const KB_VERSION = 1;

export interface KbAchievement {
  id: number;
  wikiName: string;
  name: string;
  description: string;
  /** Cleaned condition (empty for an achievement the wiki does not have). */
  condition: string;
  how: How;
  unlocks: Unlock;
  character: CharacterId | null;
  /** Usable linked page (key of `pages`), null when it does not exist. */
  page: string | null;
  fragment: string | null;
  /** Section the anchor of the linked page points at, when it was found. */
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

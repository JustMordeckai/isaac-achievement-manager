import { cleanInline, findTemplates, templateParams, type TemplateCounter } from './wikitext.ts';

/** One {{infobox achievement}} entry of the Achievements page. */
export interface WikiAchievementRow {
  id: number;
  /** `name` field: the key {{a|...}} and {{achievement|...}} use (for instance "Suicide King 2"). */
  wikiName: string;
  /** Name on screen: `override name` when it exists, `name` otherwise. */
  displayName: string;
  /** Linked page (`link` field, with no anchor), otherwise the name on screen. */
  link: string;
  /** Anchor of the `link` field ("Bosses" for instance), null otherwise. */
  linkFragment: string | null;
  description: string;
  /** Cleaned condition, one line per variant that still applies. */
  condition: string;
  conditionLinks: string[];
}

export function parseAchievementsPage(wikitext: string, unknown?: TemplateCounter): WikiAchievementRow[] {
  const rows: WikiAchievementRow[] = [];
  for (const match of findTemplates(wikitext, 'infobox achievement')) {
    const { params } = templateParams(match.raw);
    const id = Number(/^\s*(\d+)/.exec(params.id ?? '')?.[1]);
    if (!Number.isInteger(id) || id <= 0) continue;
    const wikiName = cleanInline(params.name ?? '', unknown).text;
    const displayName = params['override name'] ? cleanInline(params['override name'], unknown).text : wikiName;
    const [linkTitle, fragment] = (params.link ?? '').split('#');
    const condition = cleanInline(params['unlocked by'] ?? '', unknown);
    rows.push({
      id,
      wikiName,
      displayName,
      link: linkTitle.trim() || displayName,
      linkFragment: fragment?.trim() || null,
      description: cleanInline(params.description ?? '', unknown).text,
      condition: condition.text,
      conditionLinks: condition.links,
    });
  }
  return rows.sort((a, b) => a.id - b.id);
}

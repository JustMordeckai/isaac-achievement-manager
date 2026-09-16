import { cleanInline, findTemplates, templateParams, type TemplateCounter } from './wikitext.ts';

/** Une fiche {{infobox achievement}} de la page Achievements. */
export interface WikiAchievementRow {
  id: number;
  /** Champ `name` : clé utilisée par {{a|...}} et {{achievement|...}} (ex. "Suicide King 2"). */
  wikiName: string;
  /** Nom affiché : `override name` s'il existe, sinon `name`. */
  displayName: string;
  /** Page liée (champ `link`, sans ancre), sinon le nom affiché. */
  link: string;
  /** Ancre du champ `link` (ex. "Bosses"), null sinon. */
  linkFragment: string | null;
  description: string;
  /** Condition nettoyée, une ligne par variante encore valable. */
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

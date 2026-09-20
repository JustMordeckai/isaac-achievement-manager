import type { TextBlock } from '../../shared/types.ts';

/** Count of the unknown templates met while cleaning (normalized name to count). */
export type TemplateCounter = Map<string, number>;

export interface TemplateMatch {
  name: string;
  start: number;
  end: number;
  raw: string;
}

export function normalizeTemplateName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** End (exclusive) of the {{...}} block that starts at `start`, or -1 when it is never closed. */
function closingBraces(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++;
      i++;
    } else if (text[i] === '}' && text[i + 1] === '}') {
      depth--;
      i++;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Every occurrence of a template, with balanced braces, ignoring case and underscores. */
export function findTemplates(text: string, name: string): TemplateMatch[] {
  const wanted = normalizeTemplateName(name);
  const found: TemplateMatch[] = [];
  const opening = /\{\{\s*([^{}|\n]+?)\s*(?=\||\}\}|\n)/g;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(text))) {
    if (normalizeTemplateName(match[1]) !== wanted) continue;
    const end = closingBraces(text, match.index);
    if (end < 0) continue;
    found.push({ name: match[1], start: match.index, end, raw: text.slice(match.index, end) });
    opening.lastIndex = end;
  }
  return found;
}

/** Parameters of a raw template: named ones as they are, positional ones under "1", "2"... */
export function templateParams(raw: string): { name: string; params: Record<string, string> } {
  const inner = raw.slice(2, -2);
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const pair = inner.slice(i, i + 2);
    if (pair === '{{' || pair === '[[') {
      depth++;
      current += pair;
      i++;
    } else if ((pair === '}}' || pair === ']]') && depth > 0) {
      depth--;
      current += pair;
      i++;
    } else if (inner[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += inner[i];
    }
  }
  parts.push(current);
  const params: Record<string, string> = {};
  let position = 0;
  for (const part of parts.slice(1)) {
    const equals = part.indexOf('=');
    if (equals > 0 && !/[{[]/.test(part.slice(0, equals))) {
      params[part.slice(0, equals).trim()] = part.slice(equals + 1).trim();
    } else {
      params[String(++position)] = part.trim();
    }
  }
  return { name: parts[0].trim(), params };
}

function removeTables(text: string): string {
  const kept: string[] = [];
  let depth = 0;
  for (const line of text.split('\n')) {
    const start = line.trimStart();
    if (start.startsWith('{|')) {
      depth++;
      continue;
    }
    if (depth > 0) {
      if (start.startsWith('|}')) depth--;
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

/** Removes what is never shown: comments, notes, galleries, tables, magic words. */
export function stripNoise(text: string): string {
  const cleaned = text
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<ref\b[^>]*\/>/gi, '')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<gallery\b[^>]*>[\s\S]*?<\/gallery>/gi, '')
    .replace(/__[A-Z]+__/g, '');
  return removeTables(cleaned);
}

const LEADING_MARKERS = /^(\s*(?:\{\{\s*(?:dlc\+?|plat)\s*(?:\|[^{}]*)?\}\}\s*)+)/i;

/**
 * A segment is obsolete when it starts with a "removed in" DLC marker (a code holding n,
 * such as nr or a+nr) or with a platform marker that leaves the PC out.
 */
function isObsolete(segment: string): boolean {
  const lead = LEADING_MARKERS.exec(segment);
  if (!lead) return false;
  const markers = [...lead[1].matchAll(/\{\{\s*(dlc\+?|plat)\s*(?:\|([^{}|]*))?/gi)];
  const platforms = markers.filter((m) => m[1].toLowerCase() === 'plat').map((m) => (m[2] ?? '').trim().toLowerCase());
  if (platforms.length > 0 && !platforms.includes('pc')) return true;
  return markers.some((m) => m[1].toLowerCase() !== 'plat' && (m[2] ?? '').includes('n'));
}

/**
 * Keeps only the text that applies to the current version of the game (Repentance+): segments
 * separated by <br> or by line breaks, {{dlc+|code}} ... {{dlc-}} ranges. When a list item is
 * removed, its sub items are removed too.
 */
export function selectCurrentVariants(text: string): string {
  const withoutSpans = text.replace(
    /\{\{\s*dlc\+\s*\|([^{}|]*)\}\}([\s\S]*?)\{\{\s*dlc-\s*(?:\|[^{}]*)?\}\}/gi,
    (_all, code: string, inner: string) => (code.includes('n') ? '' : inner),
  );
  const kept: string[] = [];
  let skipDeeperThan: number | null = null;
  for (const line of withoutSpans.split('\n')) {
    const prefix = /^[*#:;]*/.exec(line)?.[0] ?? '';
    const depth = prefix.length;
    if (skipDeeperThan !== null) {
      if (depth > skipDeeperThan) continue;
      skipDeeperThan = null;
    }
    const body = line.slice(prefix.length);
    const segments = body.split(/<br\s*\/?>/i);
    const current = segments.filter((segment) => !isObsolete(segment));
    if (current.length === 0) {
      if (depth > 0) skipDeeperThan = depth;
      continue;
    }
    kept.push(prefix + current.join('<br>'));
  }
  return kept.join('\n');
}

/** Templates shown as their first parameter (name of an item, a boss, a character...). */
const NAME_TEMPLATES = new Set([
  'e',
  'i',
  'c',
  's',
  'r',
  't',
  'p',
  'a',
  'm',
  'machine',
  'chal',
  'tf',
  'cu',
  'curse',
  'floor',
  'room',
  'mode',
  'achievement',
]);

/** Templates that are known and dropped on purpose (icons, navigation, bugs, videos, markers). */
const DROPPED_TEMPLATES = new Set([
  'dlc',
  'dlc+',
  'dlc-',
  'plat',
  'bov',
  'cit',
  'bug',
  'nav',
  'anchor',
  'clear',
  'reflist',
  'context box',
  'context clear',
  'context push',
  'context pop',
  'toc right',
  'disambig msg',
  'distinguish',
  'distinguish visual',
  'lookfor',
  'main',
  'recipe',
  'ghost',
  'stage entities',
  'entity row minimal',
  'entity table',
  'entity table/header',
  'unlockable',
  'reconfirm',
  'blindfolded',
  'tear delay down',
  'no unlocks',
  'bob',
  'pickupheader',
  'obstaclesheader',
  'specialcardsheader',
  'transformationheader',
  'collectible table',
  'collectible table/header',
  'collectible rows',
  'pickup table',
  'item tags table',
  'challenge table',
  'trophy list',
  'scroll box',
  'hearts',
  'heart',
  'transformation contrib',
]);

/** Families that are dropped: infobox, videos, included subpages ({{/Additions}}), baby galleries. */
const DROPPED_PATTERN = /^(?:infobox|#ev:|\/)|\sbabies$/;

const LITERAL_TEMPLATES: Record<string, string> = { '=': '=', '!': '|' };

function capitalizeWords(text: string): string {
  return text.replace(/\b\p{Ll}/gu, (letter) => letter.toUpperCase());
}

function renderName(key: string, value: string): string {
  const name = value.trim();
  if (key === 'cu' || key === 'curse') return `Curse of the ${capitalizeWords(name)}`;
  if (key === 'mode') return `${capitalizeWords(name)} mode`;
  if (key === 'room') {
    const room = capitalizeWords(name);
    return /(Room|Rush)$/.test(room) ? room : `${room} Room`;
  }
  return name;
}

function renderTemplate(raw: string, unknown?: TemplateCounter): string {
  const { name, params } = templateParams(raw);
  const key = normalizeTemplateName(name);
  const literal = LITERAL_TEMPLATES[key];
  if (literal !== undefined) return literal;
  if (NAME_TEMPLATES.has(key)) return renderName(key, params['1'] ?? '');
  if (DROPPED_TEMPLATES.has(key) || DROPPED_PATTERN.test(key)) return '';
  unknown?.set(key, (unknown.get(key) ?? 0) + 1);
  return '';
}

/** Replaces every template, from the most nested to the outermost. */
export function renderTemplates(text: string, unknown?: TemplateCounter): string {
  let out = text;
  for (let pass = 0; pass < 20; pass++) {
    const next = out.replace(/\{\{[^{}]*\}\}/g, (raw) => renderTemplate(raw, unknown));
    if (next === out) break;
    out = next;
  }
  return out;
}

function renderLink(inner: string, trail: string, links: string[]): string {
  const pipe = inner.indexOf('|');
  const rawTarget = (pipe < 0 ? inner : inner.slice(0, pipe)).trim();
  const label = pipe < 0 ? null : inner.slice(pipe + 1).trim();
  // A leading colon shows the link (category, file) instead of applying it to the page.
  const visible = rawTarget.startsWith(':');
  const target = rawTarget.replace(/^:/, '');
  if (/^(file|image|media|category)\s*:/i.test(target)) {
    return visible ? (label ?? target.replace(/^[^:]+:\s*/, '')) + trail : '';
  }
  if (!visible && /^[a-z]{2}(-[a-z]+)?:/i.test(target)) return '';
  const external = /^(wikipedia|wiktionary|w)\s*:/i.test(target);
  const page = target.split('#')[0].trim();
  if (page && !external) links.push(page);
  if (label) return label + trail;
  const bare = external ? target.replace(/^[^:]+:/, '') : target.replace(/^#/, '');
  return bare.replace(/\s*\([^)]*\)$/, '') + trail;
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&times;': '×',
};

/** Links, tags, bold, italics and entities of a text whose templates are already rendered. */
function cleanMarkup(text: string, links: string[]): string {
  let out = text;
  for (let pass = 0; pass < 10; pass++) {
    const next = out.replace(/\[\[([^[\]]*)\]\]([a-z]*)/g, (_all, inner: string, trail: string) =>
      renderLink(inner, trail, links),
    );
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/\[(?:https?:)?\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
    .replace(/\[(?:https?:)?\/\/[^\s\]]+\]/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-z][a-z0-9-]*\b[^>]*>/gi, '')
    .replace(/'{2,}/g, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39|times);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/** Short cleaned text (condition, infobox field) and the list of linked pages. */
export function cleanInline(text: string, unknown?: TemplateCounter): { text: string; links: string[] } {
  const links: string[] = [];
  const rendered = renderTemplates(selectCurrentVariants(stripNoise(text)), unknown);
  return { text: cleanMarkup(rendered, links), links };
}

/** Splits the text of a page into paragraphs, list items and definition terms. */
export function toBlocks(raw: string, unknown?: TemplateCounter): TextBlock[] {
  const text = renderTemplates(selectCurrentVariants(stripNoise(raw)), unknown);
  const blocks: TextBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    const joined = paragraph.join(' ').trim();
    if (joined) blocks.push({ kind: 'paragraph', level: 0, text: joined });
    paragraph = [];
  };
  for (const line of text.split('\n')) {
    if (/^\s*$/.test(line) || /^-{4,}\s*$/.test(line)) {
      flush();
      continue;
    }
    const list = /^([*#]+)\s*(.*)$/.exec(line);
    const term = /^;\s*(.*)$/.exec(line);
    if (list || term) {
      flush();
      const content = list ? list[2] : (term?.[1] ?? '');
      const cleaned = cleanMarkup(content, []).replace(/\n+/g, ' ').trim();
      if (cleaned) blocks.push({ kind: 'item', level: list ? list[1].length : 1, text: cleaned });
      continue;
    }
    for (const part of cleanMarkup(line.replace(/^:+\s*/, ''), []).split('\n')) {
      if (part.trim()) paragraph.push(part.trim());
    }
  }
  flush();
  return blocks;
}

export interface RawSection {
  title: string;
  level: number;
  body: string;
  /** Heading marked as removed from the current version. */
  obsolete: boolean;
}

/** Separates the intro from the sections (headings == to ======). */
export function splitSections(text: string): { lead: string; sections: RawSection[] } {
  const lead: string[] = [];
  const sections: RawSection[] = [];
  let current: RawSection | null = null;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = /^(={2,6})\s*(.+?)\s*\1\s*$/.exec(line);
    if (heading) {
      current = {
        // No variant picking on a heading: its DLC marker only feeds `obsolete`.
        title: cleanMarkup(renderTemplates(heading[2]), []),
        level: heading[1].length,
        body: '',
        obsolete: /\{\{\s*dlc\+?\s*\|[^{}]*n[^{}]*\}\}/i.test(heading[2]),
      };
      sections.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    } else {
      lead.push(line);
    }
  }
  return { lead: lead.join('\n'), sections };
}

/** End index (exclusive) of the subsections of the section at `index`. */
export function sectionEnd(sections: RawSection[], index: number): number {
  let end = index + 1;
  while (end < sections.length && sections[end].level > sections[index].level) end++;
  return end;
}

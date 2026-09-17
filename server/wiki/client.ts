import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../fs-atomic.ts';

export const WIKI_API = 'https://bindingofisaacrebirth.fandom.com/api.php';
export const WIKI_USER_AGENT = 'IsaacAchievementManager/0.2 (outil personnel local)';

export interface ResolvedTitle {
  title: string;
  fragment: string | null;
}

export interface FetchPagesResult {
  /** Titre demandé vers page réelle (après normalisation et redirection). */
  resolved: Map<string, ResolvedTitle>;
  /** Page réelle vers wikitext, null si la page n'existe pas. */
  pages: Map<string, string | null>;
  /** Titres demandés servis depuis le cache disque après un échec réseau. */
  fromCache: string[];
  /** Titres demandés ni téléchargés ni présents dans le cache. */
  failed: string[];
}

export interface WikiClient {
  fetchPages(titles: string[], onBatch?: (done: number, total: number) => void): Promise<FetchPagesResult>;
}

export interface WikiClientOptions {
  cacheDir: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  pauseMs?: number;
  batchSize?: number;
  timeoutMs?: number;
}

interface ApiPage {
  title: string;
  missing?: boolean;
  revisions?: Array<{ slots?: { main?: { content?: string } } }>;
}

interface ApiQuery {
  normalized?: Array<{ from: string; to: string }>;
  redirects?: Array<{ from: string; to: string; tofragment?: string }>;
  pages?: ApiPage[];
}

interface CachedPage {
  title: string;
  content: string | null;
  fetchedAt: string;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createWikiClient(options: WikiClientOptions): WikiClient {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const pauseMs = options.pauseMs ?? 1000;
  const batchSize = options.batchSize ?? 50;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pagesDir = path.join(options.cacheDir, 'pages');
  const redirectsFile = path.join(options.cacheDir, 'redirects.json');

  // Condensé du titre comme nom de fichier : certains titres ne diffèrent que par la casse (Pong, PONG).
  const pageFile = (title: string) => path.join(pagesDir, `${createHash('sha1').update(title).digest('hex')}.json`);

  async function readCachedPage(title: string): Promise<CachedPage | null> {
    try {
      const cached = JSON.parse(await readFile(pageFile(title), 'utf8')) as CachedPage;
      return cached.title === title ? cached : null;
    } catch {
      return null;
    }
  }

  async function readRedirects(): Promise<Record<string, ResolvedTitle>> {
    try {
      return JSON.parse(await readFile(redirectsFile, 'utf8')) as Record<string, ResolvedTitle>;
    } catch {
      return {};
    }
  }

  async function request(titles: string[]): Promise<ApiQuery> {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      redirects: '1',
      formatversion: '2',
      format: 'json',
      titles: titles.join('|'),
    });
    const response = await doFetch(`${WIKI_API}?${params}`, {
      headers: { 'User-Agent': WIKI_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Le wiki a répondu ${response.status}`);
    const body = (await response.json()) as { error?: { info?: string }; query?: ApiQuery };
    if (body.error) throw new Error(`Erreur du wiki : ${body.error.info ?? 'inconnue'}`);
    if (!body.query) throw new Error('Réponse du wiki sans bloc query');
    return body.query;
  }

  async function requestWithRetry(titles: string[]): Promise<ApiQuery | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(pauseMs);
      try {
        return await request(titles);
      } catch {
        // Nouvelle tentative, puis repli sur le cache.
      }
    }
    return null;
  }

  return {
    async fetchPages(titles, onBatch) {
      const unique = [...new Set(titles)];
      const result: FetchPagesResult = { resolved: new Map(), pages: new Map(), fromCache: [], failed: [] };
      const redirects = await readRedirects();

      const useCache = async (requested: string, target: ResolvedTitle) => {
        const cached = await readCachedPage(target.title);
        if (!cached) {
          result.failed.push(requested);
          return;
        }
        result.resolved.set(requested, target);
        result.pages.set(target.title, cached.content);
        result.fromCache.push(requested);
      };

      const batches: string[][] = [];
      for (let start = 0; start < unique.length; start += batchSize) batches.push(unique.slice(start, start + batchSize));

      for (const [index, batch] of batches.entries()) {
        if (index > 0) await sleep(pauseMs);
        const query = await requestWithRetry(batch);
        if (!query) {
          for (const requested of batch) await useCache(requested, redirects[requested] ?? { title: requested, fragment: null });
          onBatch?.(index + 1, batches.length);
          continue;
        }

        const normalized = new Map((query.normalized ?? []).map((n) => [n.from, n.to]));
        const redirected = new Map((query.redirects ?? []).map((r) => [r.from, r]));
        const incomplete = new Set<string>();
        for (const page of query.pages ?? []) {
          const content = page.revisions?.[0]?.slots?.main?.content;
          if (!page.missing && content === undefined) {
            // Contenu absent sans que la page manque (réponse tronquée) : on se rabat sur le cache.
            incomplete.add(page.title);
            continue;
          }
          const value = page.missing ? null : (content ?? null);
          result.pages.set(page.title, value);
          const entry: CachedPage = { title: page.title, content: value, fetchedAt: new Date().toISOString() };
          await writeFileAtomic(pageFile(page.title), JSON.stringify(entry));
        }
        for (const requested of batch) {
          const name = normalized.get(requested) ?? requested;
          const redirect = redirected.get(name);
          const target: ResolvedTitle = redirect
            ? { title: redirect.to, fragment: redirect.tofragment ?? null }
            : { title: name, fragment: null };
          redirects[requested] = target;
          if (incomplete.has(target.title)) await useCache(requested, target);
          else result.resolved.set(requested, target);
        }
        onBatch?.(index + 1, batches.length);
      }

      await writeFileAtomic(redirectsFile, JSON.stringify(redirects));
      return result;
    },
  };
}

import { vi } from 'vitest';

export type RouteHandler = (url: URL, init: RequestInit | undefined) => unknown | Promise<unknown>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Remplace fetch ; les clés sont "MÉTHODE /chemin". Un handler peut renvoyer un objet (JSON 200) ou une Response. */
export function stubFetch(routes: Record<string, RouteHandler>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const handler = routes[`${init?.method ?? 'GET'} ${url.pathname}`];
    if (!handler) return jsonResponse({ error: `route non simulée : ${url.pathname}` }, 404);
    const result = await handler(url, init);
    return result instanceof Response ? result : jsonResponse(result);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

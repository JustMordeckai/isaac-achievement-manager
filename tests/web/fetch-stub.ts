import { vi } from 'vitest';

export type RouteHandler = (url: URL, init: RequestInit | undefined) => unknown | Promise<unknown>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Replaces fetch; the keys are "METHOD /path". A handler can return an object (JSON 200) or a Response. */
export function stubFetch(routes: Record<string, RouteHandler>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const handler = routes[`${init?.method ?? 'GET'} ${url.pathname}`];
    if (!handler) return jsonResponse({ error: `route not stubbed: ${url.pathname}` }, 404);
    const result = await handler(url, init);
    return result instanceof Response ? result : jsonResponse(result);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

import { createRequire } from 'node:module';
import path from 'node:path';
import type { RequestHandler } from 'express';

/**
 * The app also ships as one Windows executable: Node, the server and the built interface in a single
 * file. There, the interface is not on disk next to the code, it is embedded in the executable, and
 * `data/` sits next to the .exe rather than in a source tree.
 */

/** The part of node:sea this app uses; null when the module is not there (very old Node). */
export interface SeaModule {
  isSea(): boolean;
  getRawAsset(key: string): ArrayBuffer;
}

let cached: SeaModule | null | undefined;

export function seaModule(): SeaModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = createRequire(process.execPath)('node:sea') as SeaModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when this process is the single executable rather than `node server/index.ts`. */
export function isStandalone(sea: SeaModule | null = seaModule()): boolean {
  try {
    return sea?.isSea() === true;
  } catch {
    return false;
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Asset key of a request path: "/" is the page itself, the rest keeps the path of the build. */
export function assetKey(urlPath: string): string {
  const clean = urlPath.replace(/^\/+/, '').split('?')[0];
  return clean === '' ? 'index.html' : clean;
}

/**
 * Serves the interface out of the executable. Anything the build did not embed falls back to the
 * page, because the front routes on the fragment and a reload must not land on a 404.
 */
export function createSeaStatic(sea: SeaModule): RequestHandler {
  const read = (key: string): Buffer | null => {
    try {
      return Buffer.from(sea.getRawAsset(key));
    } catch {
      return null;
    }
  };
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    let name = assetKey(req.path);
    let body = read(name);
    if (!body) {
      name = 'index.html';
      body = read(name);
    }
    if (!body) {
      next();
      return;
    }
    res.type(TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream').send(body);
  };
}

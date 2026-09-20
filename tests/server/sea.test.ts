import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { assetKey, createSeaStatic, isStandalone, type SeaModule } from '../../server/sea.ts';

/** Fake executable holding the files the build embeds. */
function fakeSea(files: Record<string, string>): SeaModule {
  return {
    isSea: () => true,
    getRawAsset(key) {
      const value = files[key];
      if (value === undefined) throw new Error(`asset ${key} not found`);
      return new TextEncoder().encode(value).buffer as ArrayBuffer;
    },
  };
}

const FILES = {
  'index.html': '<!doctype html><title>Isaac</title>',
  'assets/index-abc.js': 'console.log(1)',
  'assets/index-abc.css': 'body{color:red}',
};

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (close) await close();
  close = null;
});

/** Serves the fake executable on an ephemeral port and returns its address. */
async function serve(sea: SeaModule): Promise<string> {
  const app = express();
  app.get('/api/ping', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(createSeaStatic(sea));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  close = async () => {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  };
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('assetKey', () => {
  it('turns a request path into the key the build wrote', () => {
    expect(assetKey('/')).toBe('index.html');
    expect(assetKey('/assets/index-abc.js')).toBe('assets/index-abc.js');
    expect(assetKey('//assets/x.css')).toBe('assets/x.css');
  });
});

describe('isStandalone', () => {
  it('is false outside an executable and true inside one', () => {
    expect(isStandalone(null)).toBe(false);
    expect(isStandalone({ isSea: () => false, getRawAsset: () => new ArrayBuffer(0) })).toBe(false);
    expect(isStandalone(fakeSea({}))).toBe(true);
  });
});

describe('createSeaStatic', () => {
  it('serves the embedded page and files with their type', async () => {
    const base = await serve(fakeSea(FILES));

    const page = await fetch(base);
    expect(page.status).toBe(200);
    expect(page.headers.get('Content-Type')).toMatch(/text\/html/);
    expect(await page.text()).toBe(FILES['index.html']);

    const script = await fetch(`${base}/assets/index-abc.js`);
    expect(script.headers.get('Content-Type')).toMatch(/javascript/);
    expect(await script.text()).toBe(FILES['assets/index-abc.js']);

    const style = await fetch(`${base}/assets/index-abc.css`);
    expect(style.headers.get('Content-Type')).toMatch(/text\/css/);
  });

  it('falls back to the page so a reload never lands on a 404', async () => {
    const base = await serve(fakeSea(FILES));
    const answer = await fetch(`${base}/routes`);
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe(FILES['index.html']);
  });

  it('leaves the routes before it alone, and anything that is not a read', async () => {
    const base = await serve(fakeSea(FILES));
    expect(await (await fetch(`${base}/api/ping`)).json()).toEqual({ ok: true });
    expect((await fetch(`${base}/anything`, { method: 'POST' })).status).toBe(404);
  });

  it('passes on when the executable holds no interface at all', async () => {
    const base = await serve(fakeSea({}));
    expect((await fetch(base)).status).toBe(404);
  });
});

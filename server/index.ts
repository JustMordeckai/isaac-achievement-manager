import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { APP_NAME, createApp } from './app.ts';
import { detectSteamEnv, loadSettings } from './config.ts';
import { createIconCache } from './icons.ts';
import { DATA_DIR, ROOT, WEB_DIST } from './paths.ts';
import { createProgressService } from './progress-service.ts';
import { createProfileClient } from './sources/steam-profile.ts';

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const shouldOpen = args.has('--open');

const settings = loadSettings(DATA_DIR);
const env = detectSteamEnv({ extraAccountIds: settings.accountId !== null ? [settings.accountId] : [] });
const profiles = createProfileClient();
const url = `http://127.0.0.1:${settings.port}/`;

const app = createApp({
  progress: createProgressService({ env, forcedAccountId: settings.accountId, profiles }),
  profiles,
  icons: createIconCache(path.join(DATA_DIR, 'icons')),
  onShutdown: () => {
    console.log('Arrêt demandé depuis l’interface.');
    process.exit(0);
  },
});
const server = http.createServer(app);

if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: path.join(ROOT, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else if (existsSync(path.join(WEB_DIST, 'index.html'))) {
  app.use(express.static(WEB_DIST));
} else {
  app.use((_req, res) => {
    res
      .status(503)
      .type('text/plain; charset=utf-8')
      .send('Interface non construite : lance « npm run build » puis relance le serveur.');
  });
}

function openBrowser(target: string): void {
  spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

async function isOurServer(): Promise<boolean> {
  try {
    const res = await fetch(new URL('api/status', url), { signal: AbortSignal.timeout(3000) });
    const body: unknown = await res.json();
    return typeof body === 'object' && body !== null && (body as { app?: unknown }).app === APP_NAME;
  } catch {
    return false;
  }
}

server.on('error', async (error: Error) => {
  if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
  if (await isOurServer()) {
    console.log(`Isaac Achievement Manager tourne déjà sur ${url}`);
    if (shouldOpen) openBrowser(url);
    process.exit(0);
  }
  console.error(`Le port ${settings.port} est occupé par une autre application : change "port" dans data/settings.json.`);
  process.exit(1);
});

server.listen(settings.port, '127.0.0.1', () => {
  const account = env.accounts.find((a) => a.hasIsaacData);
  console.log(`Isaac Achievement Manager : ${url}`);
  console.log(`Steam : ${env.steamPath ?? 'introuvable'} ; compte détecté : ${account?.personaName ?? 'aucun'}`);
  if (shouldOpen) openBrowser(url);
});

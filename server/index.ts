import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { format } from 'node:util';
import express from 'express';
import { createAdvisorService } from './advisor/service.ts';
import { APP_NAME, createApp } from './app.ts';
import { chooseAccount, detectSteamEnv, loadSettings, saveSettings } from './config.ts';
import { createIconCache } from './icons.ts';
import { DATA_DIR, ROOT, WEB_DIST } from './paths.ts';
import { createProgressService } from './progress-service.ts';
import { createProfileClient } from './sources/steam-profile.ts';
import { createWikiKb } from './wiki/setup.ts';

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const shouldOpen = args.has('--open');

if (args.has('--log')) {
  // Écrit chaque ligne dans data/server.log via un appendFileSync par appel : contrairement à une
  // redirection shell (>>), aucun descripteur de fichier n'est gardé ouvert, donc un second lancement
  // du .vbs pendant que le serveur tourne peut aussi écrire dans ce fichier (pas de conflit de partage
  // Windows).
  mkdirSync(DATA_DIR, { recursive: true });
  const logFile = path.join(DATA_DIR, 'server.log');
  const write = (...parts: unknown[]): void => {
    try {
      appendFileSync(logFile, `${format(...parts)}\n`);
    } catch {
      // Erreur disque transitoire pendant l’écriture du journal : on l’ignore pour ne pas
      // faire planter un serveur par ailleurs sain.
    }
  };
  console.log = write;
  console.error = write;
  // Une erreur fatale au démarrage (port invalide dans data/settings.json, échec de bind non lié
  // à EADDRINUSE, etc.) devient une rejection non gérée puis une exception non interceptée : sans
  // ce gestionnaire, Node l’écrirait sur une console cachée, invisible, au lieu de data/server.log.
  process.on('uncaughtException', (error) => {
    write('Erreur fatale :', error);
    process.exit(1);
  });
}

const settings = loadSettings(DATA_DIR);
const env = detectSteamEnv({ extraAccountIds: settings.accountId !== null ? [settings.accountId] : [] });
const account = chooseAccount(env, settings.accountId);
const profiles = createProfileClient();
const progress = createProgressService({ env, forcedAccountId: settings.accountId, profiles });
const url = `http://127.0.0.1:${settings.port}/`;

const app = createApp({
  progress,
  profiles,
  icons: createIconCache(path.join(DATA_DIR, 'icons')),
  kb: createWikiKb({ dataDir: DATA_DIR, steamDefs: () => progress.definitions() }),
  advisor: createAdvisorService({ settings: settings.ollama, save: (ollama) => saveSettings(DATA_DIR, { ollama }, settings.locale) }),
  settings: {
    port: settings.port,
    dataDir: DATA_DIR,
    steamPath: env.steamPath,
    account: account && { accountId: account.accountId, steamId64: account.steamId64, personaName: account.personaName },
    forcedAccountId: settings.accountId,
    locale: settings.locale,
  },
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
    const res = await fetch(new URL('api/ping', url), { signal: AbortSignal.timeout(3000) });
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
  console.log(`Isaac Achievement Manager : ${url}`);
  const name = account ? (account.personaName ?? `compte ${account.accountId}`) : 'aucun';
  console.log(`Steam : ${env.steamPath ?? 'introuvable'} ; compte utilisé : ${name}`);
  if (shouldOpen) openBrowser(url);
});

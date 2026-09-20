import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { format } from 'node:util';
import express from 'express';
import { createAdvisorService } from './advisor/service.ts';
import { createAdvisorSetup } from './advisor/setup.ts';
import { APP_NAME, createApp } from './app.ts';
import { shouldOpenBrowser } from './cli.ts';
import { chooseAccount, detectSteamEnv, loadSettings, saveSettings } from './config.ts';
import { createIconCache } from './icons.ts';
import { DATA_DIR, ROOT, WEB_DIST } from './paths.ts';
import { createProgressService } from './progress-service.ts';
import { createSeaStatic, isStandalone, seaModule } from './sea.ts';
import { createProfileClient } from './sources/steam-profile.ts';
import { createWikiKb } from './wiki/setup.ts';

const args = new Set(process.argv.slice(2));
const standalone = isStandalone();
const dev = args.has('--dev');
const shouldOpen = shouldOpenBrowser(args, standalone);

if (args.has('--log')) {
  // Writes every line to data/server.log through one appendFileSync per call: unlike a shell
  // redirection (>>), no file descriptor stays open, so a second launch of the launcher while the
  // server is running can write to this file too (no sharing conflict on Windows). The line is
  // printed as well, so the window that started the server shows what the log records.
  mkdirSync(DATA_DIR, { recursive: true });
  const logFile = path.join(DATA_DIR, 'server.log');
  const print = console.log.bind(console);
  const printError = console.error.bind(console);
  const append = (...parts: unknown[]): void => {
    try {
      appendFileSync(logFile, `${format(...parts)}\n`);
    } catch {
      // Transient disk error while writing the log: it is ignored rather than bringing down a
      // server that is otherwise healthy.
    }
  };
  const write = (...parts: unknown[]): void => {
    print(...parts);
    append(...parts);
  };
  console.log = write;
  console.error = (...parts: unknown[]): void => {
    printError(...parts);
    append(...parts);
  };
  // A fatal error at startup (invalid port in data/settings.json, a bind failure unrelated to
  // EADDRINUSE, and so on) becomes an unhandled rejection then an uncaught exception: without
  // this handler, Node would write it its own way and it would never reach data/server.log.
  process.on('uncaughtException', (error) => {
    write('Fatal error:', error);
    process.exit(1);
  });
}

const settings = loadSettings(DATA_DIR);
const env = detectSteamEnv({ extraAccountIds: settings.accountId !== null ? [settings.accountId] : [] });
const account = chooseAccount(env, settings.accountId);
const profiles = createProfileClient();
const progress = createProgressService({ env, forcedAccountId: settings.accountId, profiles });
const advisor = createAdvisorService({
  settings: settings.ollama,
  save: (ollama) => saveSettings(DATA_DIR, { ollama }, settings.locale),
});
const url = `http://127.0.0.1:${settings.port}/`;

const app = createApp({
  progress,
  profiles,
  icons: createIconCache(path.join(DATA_DIR, 'icons')),
  kb: createWikiKb({ dataDir: DATA_DIR, steamDefs: () => progress.definitions() }),
  advisor,
  setup: createAdvisorSetup({ url: () => advisor.settings().url }),
  settings: {
    port: settings.port,
    dataDir: DATA_DIR,
    steamPath: env.steamPath,
    account: account && { accountId: account.accountId, steamId64: account.steamId64, personaName: account.personaName },
    forcedAccountId: settings.accountId,
    locale: settings.locale,
  },
  onShutdown: () => {
    console.log('Stop asked for from the interface.');
    process.exit(0);
  },
});
const server = http.createServer(app);

/** Vite in middleware mode, for `npm run dev` only: the executable never loads it. */
async function attachVite(): Promise<void> {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: path.join(ROOT, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

// Nothing here is awaited at the top level: the executable is bundled as one CommonJS file, and
// that format has no top-level await. In dev, the listen waits for Vite through `ready`.
const ready: Promise<void> = dev ? attachVite() : Promise.resolve();

if (dev) {
  // The middlewares are attached by `ready` above.
} else if (standalone) {
  // The interface travels inside the executable: nothing to read from the disk.
  app.use(createSeaStatic(seaModule()!));
} else if (existsSync(path.join(WEB_DIST, 'index.html'))) {
  app.use(express.static(WEB_DIST));
} else {
  app.use((_req, res) => {
    res
      .status(503)
      .type('text/plain; charset=utf-8')
      .send('Interface not built: run "npm run build" then start the server again.');
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
    console.log(`Isaac Achievement Manager already runs on ${url}`);
    if (shouldOpen) openBrowser(url);
    process.exit(0);
  }
  console.error(`Port ${settings.port} is taken by another application: change "port" in data/settings.json.`);
  process.exit(1);
});

void ready.then(() => {
  server.listen(settings.port, '127.0.0.1', () => {
    console.log(`Isaac Achievement Manager: ${url}`);
    const name = account ? (account.personaName ?? `account ${account.accountId}`) : 'none';
    console.log(`Steam: ${env.steamPath ?? 'not found'}; account used: ${name}`);
    if (shouldOpen) openBrowser(url);
  });
});

// Synchro du wiki en ligne de commande : npm run sync-wiki
import { detectSteamEnv, loadSettings } from '../config.ts';
import { DATA_DIR } from '../paths.ts';
import { createProgressService } from '../progress-service.ts';
import { createProfileClient } from '../sources/steam-profile.ts';
import { createWikiKb } from './setup.ts';

const settings = loadSettings(DATA_DIR);
const env = detectSteamEnv({ extraAccountIds: settings.accountId !== null ? [settings.accountId] : [] });
const progress = createProgressService({ env, forcedAccountId: settings.accountId, profiles: createProfileClient() });
const kb = createWikiKb({ dataDir: DATA_DIR, steamDefs: () => progress.definitions() });

try {
  const report = await kb.sync((event) => {
    if (event.step !== 'error') console.log(event.message);
  });
  console.log(`${report.achievements} succès, ${report.pages} pages, ${report.cachedPages} pages servies par le cache`);
  if (report.missingPages.length > 0) console.log(`Pages absentes du wiki : ${report.missingPages.join(', ')}`);
  const unknown = Object.entries(report.unknownTemplates);
  if (unknown.length > 0) console.log(`Modèles inconnus : ${unknown.map(([name, count]) => `${name} (${count})`).join(', ')}`);
  console.log(`Non classés : ${report.miscCount} conditions et ${report.otherUnlockCount} déblocages`);
} catch (error) {
  console.error(`Synchro échouée : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

import { loadSettings } from './config.ts';
import { DATA_DIR } from './paths.ts';

const { port } = loadSettings(DATA_DIR);
try {
  const res = await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
    method: 'POST',
    headers: { 'X-IAM-Action': 'shutdown' },
    signal: AbortSignal.timeout(3000),
  });
  console.log(res.ok ? 'Serveur arrêté.' : `Le serveur a refusé l'arrêt (HTTP ${res.status}).`);
} catch {
  console.log(`Aucun serveur Isaac Achievement Manager sur le port ${port}.`);
}

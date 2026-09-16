import { execFileSync } from 'node:child_process';

export type RegistryReader = (key: string, name: string) => string | number | null;

/** Extrait une valeur de la sortie de `reg query <clé> /v <nom>`. */
export function parseRegQueryOutput(output: string, name: string): string | number | null {
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s+(.+?)\s{4}(REG_\w+)\s{4}(.*)$/.exec(line);
    if (!match || match[1].toLowerCase() !== name.toLowerCase()) continue;
    if (match[2] === 'REG_DWORD' || match[2] === 'REG_QWORD') return Number.parseInt(match[3], 16);
    return match[3];
  }
  return null;
}

export const readRegistry: RegistryReader = (key, name) => {
  if (process.platform !== 'win32') return null;
  try {
    const output = execFileSync('reg', ['query', key, '/v', name], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseRegQueryOutput(output, name);
  } catch {
    return null;
  }
};

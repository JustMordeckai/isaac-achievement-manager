import { spawn } from 'node:child_process';
import { t, type Locale } from '../../shared/i18n/index.ts';
import type { AdvisorSetupEvent, AdvisorSetupState } from '../../shared/types.ts';
import { ndjsonLines } from '../../shared/ndjson.ts';

/**
 * Installing the advisor for someone who has never run a model: is Ollama there, can the app install
 * it, what can the machine run, and the download of the model with its progress. Everything that
 * touches the outside (a command, the Ollama API) is injected, so the tests never spawn anything.
 */

/** Runs a command and hands over every line it prints; resolves with its exit code. */
export type CommandRunner = (command: string, args: string[], onLine: (line: string) => void) => Promise<number>;

/** Model for a machine with plenty of video memory, and the one for everything else. */
export const BIG_MODEL = 'qwen3.5:9b';
export const SMALL_MODEL = 'qwen3.5:4b';

/** Video memory from which the big model is worth it, in gigabytes. */
const BIG_MODEL_VRAM = 12;

export const WINGET_PACKAGE = 'Ollama.Ollama';

export const runCommand: CommandRunner = (command, args, onLine) =>
  new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve(-1);
      return;
    }
    let rest = '';
    const read = (chunk: Buffer) => {
      // winget draws its progress with carriage returns: each one is treated as a line of its own.
      const parts = (rest + chunk.toString('utf8')).split(/\r\n|\r|\n/);
      rest = parts.pop() ?? '';
      for (const part of parts) if (part.trim()) onLine(part.trim());
    };
    child.stdout?.on('data', read);
    child.stderr?.on('data', read);
    child.on('error', () => resolve(-1));
    child.on('close', (code) => {
      if (rest.trim()) onLine(rest.trim());
      resolve(code ?? -1);
    });
  });

async function found(run: CommandRunner, command: string): Promise<boolean> {
  return (await run('where', [command], () => {})) === 0;
}

/** Video memory of the first GPU, in gigabytes, or null when nothing readable answers. */
async function videoMemoryGb(run: CommandRunner): Promise<number | null> {
  let answer = '';
  const keep = (line: string) => {
    if (!answer) answer = line;
  };
  // nvidia-smi gives megabytes; the Windows CIM class gives bytes and caps large cards at 4 GB,
  // so it only serves as a floor when no NVIDIA driver answers.
  if ((await run('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], keep)) === 0) {
    const megabytes = Number.parseInt(answer, 10);
    if (Number.isFinite(megabytes) && megabytes > 0) return Math.round(megabytes / 1024);
  }
  answer = '';
  const script = '(Get-CimInstance Win32_VideoController | Select-Object -First 1).AdapterRAM';
  if ((await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], keep)) === 0) {
    const bytes = Number.parseInt(answer, 10);
    if (Number.isFinite(bytes) && bytes > 0) return Math.round(bytes / 1024 ** 3);
  }
  return null;
}

/** What the setup screen needs to know before it offers anything. */
export async function detectSetup(run: CommandRunner = runCommand): Promise<AdvisorSetupState> {
  const [installed, canInstall, vramGb] = await Promise.all([
    found(run, 'ollama'),
    found(run, 'winget'),
    videoMemoryGb(run),
  ]);
  return { installed, canInstall, vramGb, recommended: vramGb !== null && vramGb >= BIG_MODEL_VRAM ? BIG_MODEL : SMALL_MODEL };
}

/**
 * Installs Ollama with winget. Its output is passed on line by line: the reader sees the same
 * progress they would see in a terminal, and the exit code decides the last event.
 */
export async function installOllama(
  onEvent: (event: AdvisorSetupEvent) => void,
  locale: Locale,
  run: CommandRunner = runCommand,
): Promise<void> {
  if (!(await found(run, 'winget'))) {
    onEvent({ step: 'error', message: t(locale, 'setup.wingetMissing') });
    return;
  }
  onEvent({ step: 'progress', message: t(locale, 'setup.installing') });
  const code = await run(
    'winget',
    ['install', '--exact', '--id', WINGET_PACKAGE, '--accept-package-agreements', '--accept-source-agreements', '--silent'],
    (line) => onEvent({ step: 'progress', message: line }),
  );
  if (code !== 0) {
    onEvent({ step: 'error', message: t(locale, 'setup.installFailed', { code }) });
    return;
  }
  onEvent({ step: 'done', message: t(locale, 'setup.installed') });
}

interface PullLine {
  status?: unknown;
  error?: unknown;
  total?: unknown;
  completed?: unknown;
}

/**
 * Downloads a model on the Ollama server and passes on the progress it streams. Ollama repeats the
 * same status with growing byte counts, so the event carries both the label and the two numbers.
 */
export async function pullModel(
  url: string,
  model: string,
  onEvent: (event: AdvisorSetupEvent) => void,
  locale: Locale,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${url}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal,
    });
  } catch (error) {
    onEvent({ step: 'error', message: t(locale, 'setup.pullUnreachable', { message: messageOf(error) }) });
    return;
  }
  if (!response.ok || !response.body) {
    onEvent({ step: 'error', message: t(locale, 'setup.pullFailed', { status: response.status }) });
    return;
  }
  try {
    for await (const line of ndjsonLines(response.body)) {
      let parsed: PullLine;
      try {
        parsed = JSON.parse(line) as PullLine;
      } catch {
        onEvent({ step: 'error', message: t(locale, 'setup.pullUnreadable') });
        return;
      }
      if (typeof parsed.error === 'string') {
        onEvent({ step: 'error', message: parsed.error });
        return;
      }
      const status = typeof parsed.status === 'string' ? parsed.status : '';
      if (status === 'success') {
        onEvent({ step: 'done', message: t(locale, 'setup.pulled', { model }) });
        return;
      }
      const total = typeof parsed.total === 'number' ? parsed.total : undefined;
      const completed = typeof parsed.completed === 'number' ? parsed.completed : undefined;
      onEvent({ step: 'progress', message: status || t(locale, 'setup.pulling', { model }), total, done: completed });
    }
  } catch (error) {
    onEvent({ step: 'error', message: t(locale, 'setup.pullCut', { message: messageOf(error) }) });
    return;
  }
  // The stream ended without the success line: Ollama was stopped, or the model does not exist.
  onEvent({ step: 'error', message: t(locale, 'setup.pullIncomplete') });
}

export interface AdvisorSetupService {
  detect(): Promise<AdvisorSetupState>;
  install(onEvent: (event: AdvisorSetupEvent) => void, locale: Locale): Promise<void>;
  pull(model: string, onEvent: (event: AdvisorSetupEvent) => void, locale: Locale, signal?: AbortSignal): Promise<void>;
  /** True while an install or a download runs: the app refuses to start a second one. */
  isRunning(): boolean;
}

export interface AdvisorSetupOptions {
  /** Address of the Ollama server, read at call time: the settings can change without a restart. */
  url(): string;
  run?: CommandRunner;
}

/** One install or one download at a time, whoever asks. */
export function createAdvisorSetup({ url, run = runCommand }: AdvisorSetupOptions): AdvisorSetupService {
  let running = false;

  async function exclusive(locale: Locale, onEvent: (event: AdvisorSetupEvent) => void, job: () => Promise<void>) {
    if (running) {
      onEvent({ step: 'error', message: t(locale, 'setup.busy') });
      return;
    }
    running = true;
    try {
      await job();
    } finally {
      running = false;
    }
  }

  return {
    detect: () => detectSetup(run),
    install: (onEvent, locale) => exclusive(locale, onEvent, () => installOllama(onEvent, locale, run)),
    pull: (model, onEvent, locale, signal) =>
      exclusive(locale, onEvent, () => pullModel(url(), model, onEvent, locale, signal)),
    isRunning: () => running,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

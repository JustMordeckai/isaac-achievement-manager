import { describe, expect, it, vi } from 'vitest';
import {
  BIG_MODEL,
  createAdvisorSetup,
  detectSetup,
  installOllama,
  pullModel,
  SMALL_MODEL,
  type CommandRunner,
} from '../../server/advisor/setup.ts';
import { t } from '../../shared/i18n/index.ts';
import type { AdvisorSetupEvent } from '../../shared/types.ts';
import { closedUrl, startFakeOllama, type FakeOllamaHandler } from './helpers/fake-ollama.ts';

/** Fake runner: `answers` gives, per command, the lines to print and the exit code. */
function runner(answers: Record<string, { lines?: string[]; code?: number }>): CommandRunner & { calls: string[][] } {
  const calls: string[][] = [];
  const run = (async (command, args, onLine) => {
    calls.push([command, ...args]);
    const answer = answers[command];
    if (!answer) return 1;
    for (const line of answer.lines ?? []) onLine(line);
    return answer.code ?? 0;
  }) as CommandRunner & { calls: string[][] };
  run.calls = calls;
  return run;
}

function collect(): { events: AdvisorSetupEvent[]; send: (event: AdvisorSetupEvent) => void } {
  const events: AdvisorSetupEvent[] = [];
  return { events, send: (event) => events.push(event) };
}

describe('detectSetup', () => {
  it('reports what the machine has and picks the model for its video memory', async () => {
    const run = runner({ where: { code: 0 }, 'nvidia-smi': { lines: ['16384'], code: 0 } });
    expect(await detectSetup(run)).toEqual({ installed: true, canInstall: true, vramGb: 16, recommended: BIG_MODEL });
    expect(run.calls).toContainEqual(['where', 'ollama']);
    expect(run.calls).toContainEqual(['where', 'winget']);
  });

  it('keeps the small model on a small card', async () => {
    const run = runner({ where: { code: 0 }, 'nvidia-smi': { lines: ['8192'], code: 0 } });
    expect(await detectSetup(run)).toMatchObject({ vramGb: 8, recommended: SMALL_MODEL });
  });

  it('falls back to the Windows video controller, then to an unknown card', async () => {
    const withCim = runner({ where: { code: 1 }, 'nvidia-smi': { code: 1 }, powershell: { lines: ['8589934592'], code: 0 } });
    expect(await detectSetup(withCim)).toEqual({ installed: false, canInstall: false, vramGb: 8, recommended: SMALL_MODEL });

    const nothing = runner({ where: { code: 1 } });
    expect(await detectSetup(nothing)).toEqual({ installed: false, canInstall: false, vramGb: null, recommended: SMALL_MODEL });
  });
});

describe('installOllama', () => {
  it('passes on the winget output then reports the install', async () => {
    const run = runner({ where: { code: 0 }, winget: { lines: ['Found Ollama', 'Downloading', 'Successfully installed'], code: 0 } });
    const { events, send } = collect();

    await installOllama(send, 'en', run);

    expect(events.map((e) => e.step)).toEqual(['progress', 'progress', 'progress', 'progress', 'done']);
    expect(events.map((e) => e.message)).toContain('Downloading');
    expect(events.at(-1)).toEqual({ step: 'done', message: 'Ollama is installed.' });
    expect(run.calls.at(-1)).toEqual([
      'winget',
      'install',
      '--exact',
      '--id',
      'Ollama.Ollama',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--silent',
    ]);
  });

  it('says what to do when winget is missing', async () => {
    const { events, send } = collect();
    await installOllama(send, 'en', runner({ where: { code: 1 } }));
    expect(events).toEqual([{ step: 'error', message: expect.stringContaining('winget') }]);
  });

  it('reports the exit code of a failed install, in the reader\'s language', async () => {
    const { events, send } = collect();
    await installOllama(send, 'fr', runner({ where: { code: 0 }, winget: { code: 3 } }));
    expect(events.at(-1)).toEqual({ step: 'error', message: expect.stringContaining('3') });
    expect(events.at(-1)?.message).toMatch(/winget/);
  });
});

/** NDJSON lines of a download, the way Ollama sends them. */
const pullRoute =
  (lines: string[], status = 200): FakeOllamaHandler =>
  (_req, res) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.end(lines.map((line) => `${line}\n`).join(''));
  };

describe('pullModel', () => {
  it('follows the bytes then reports the model as ready', async () => {
    const ollama = await startFakeOllama({
      'POST /api/pull': pullRoute([
        JSON.stringify({ status: 'pulling manifest' }),
        JSON.stringify({ status: 'pulling 1a2b', total: 1000, completed: 400 }),
        JSON.stringify({ status: 'pulling 1a2b', total: 1000, completed: 1000 }),
        JSON.stringify({ status: 'success' }),
      ]),
    });
    const { events, send } = collect();
    try {
      await pullModel(ollama.url, SMALL_MODEL, send, 'en');
    } finally {
      await ollama.close();
    }
    expect(events).toEqual([
      { step: 'progress', message: 'pulling manifest', total: undefined, done: undefined },
      { step: 'progress', message: 'pulling 1a2b', total: 1000, done: 400 },
      { step: 'progress', message: 'pulling 1a2b', total: 1000, done: 1000 },
      { step: 'done', message: `${SMALL_MODEL} is ready.` },
    ]);
  });

  it('passes on the error sent in the stream', async () => {
    const ollama = await startFakeOllama({
      'POST /api/pull': pullRoute([JSON.stringify({ error: 'model "nope" not found' })]),
    });
    const { events, send } = collect();
    try {
      await pullModel(ollama.url, 'nope', send, 'en');
    } finally {
      await ollama.close();
    }
    expect(events).toEqual([{ step: 'error', message: 'model "nope" not found' }]);
  });

  it('reports a refusal, an unreadable line and a stream with no end', async () => {
    const refused = await startFakeOllama({ 'POST /api/pull': pullRoute(['{}'], 500) });
    const first = collect();
    try {
      await pullModel(refused.url, SMALL_MODEL, first.send, 'en');
    } finally {
      await refused.close();
    }
    expect(first.events).toEqual([{ step: 'error', message: 'The download was refused (HTTP 500).' }]);

    const broken = await startFakeOllama({ 'POST /api/pull': pullRoute(['not json']) });
    const second = collect();
    try {
      await pullModel(broken.url, SMALL_MODEL, second.send, 'en');
    } finally {
      await broken.close();
    }
    expect(second.events).toEqual([{ step: 'error', message: 'Unreadable line in the download stream.' }]);

    const cut = await startFakeOllama({ 'POST /api/pull': pullRoute([JSON.stringify({ status: 'pulling manifest' })]) });
    const third = collect();
    try {
      await pullModel(cut.url, SMALL_MODEL, third.send, 'en');
    } finally {
      await cut.close();
    }
    expect(third.events.at(-1)).toEqual({ step: 'error', message: 'The download ended before the model was complete.' });
  });

  it('reports an unreachable server', async () => {
    const { events, send } = collect();
    await pullModel(await closedUrl(), SMALL_MODEL, send, 'en');
    expect(events).toEqual([{ step: 'error', message: expect.stringContaining('The Ollama server did not answer') }]);
  });
});

describe('createAdvisorSetup', () => {
  it('refuses a second job while one runs, and frees it afterwards', async () => {
    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run: CommandRunner = async (command) => {
      if (command === 'winget') await blocked;
      return 0;
    };
    const setup = createAdvisorSetup({ url: () => 'http://127.0.0.1:11434', run });
    const first = collect();
    const second = collect();

    const running = setup.install(first.send, 'en');
    await vi.waitFor(() => expect(setup.isRunning()).toBe(true));
    await setup.install(second.send, 'en');
    expect(second.events).toEqual([{ step: 'error', message: 'An install or a download is already running.' }]);

    release();
    await running;
    expect(setup.isRunning()).toBe(false);
    expect(first.events.at(-1)?.step).toBe('done');
  });

  it('downloads on the server the settings point at', async () => {
    const ollama = await startFakeOllama({ 'POST /api/pull': pullRoute([JSON.stringify({ status: 'success' })]) });
    const setup = createAdvisorSetup({ url: () => ollama.url, run: runner({ where: { code: 0 } }) });
    const { events, send } = collect();
    try {
      await setup.pull(SMALL_MODEL, send, 'fr');
    } finally {
      await ollama.close();
    }
    expect(events).toEqual([{ step: 'done', message: t('fr', 'setup.pulled', { model: SMALL_MODEL }) }]);
  });
});

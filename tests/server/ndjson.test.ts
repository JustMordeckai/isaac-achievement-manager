import { describe, expect, it } from 'vitest';
import { ndjsonLines } from '../../shared/ndjson.ts';

function streamOf(chunks: string[], onCancel?: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(encoder.encode(chunks[index++]));
      else controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of ndjsonLines(stream)) lines.push(line);
  return lines;
}

describe('ndjsonLines', () => {
  it('recolle les lignes coupées entre deux morceaux et saute les lignes vides', async () => {
    expect(await collect(streamOf(['{"a":1}\n{"b"', ':2}\n\n', '{"c":3}']))).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it('décode un caractère accentué coupé en deux octets', async () => {
    const bytes = new TextEncoder().encode('{"t":"é"}\n');
    const cut = bytes.indexOf(0xc3) + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    expect(await collect(stream)).toEqual(['{"t":"é"}']);
  });

  it('annule le flux quand la lecture s’arrête avant la fin', async () => {
    let cancelled = false;
    const stream = streamOf(['{"a":1}\n', '{"b":2}\n', '{"c":3}\n'], () => {
      cancelled = true;
    });
    for await (const line of ndjsonLines(stream)) {
      expect(line).toBe('{"a":1}');
      break;
    }
    expect(cancelled).toBe(true);
  });
});

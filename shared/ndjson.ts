/**
 * Lignes non vides d'un flux NDJSON, dans l'ordre. Une ligne peut arriver en plusieurs morceaux :
 * la fin incomplète attend la lecture suivante. Arrêter la boucle annule le flux.
 */
export async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = done ? '' : (lines.pop() ?? '');
      for (const line of lines) {
        if (line.trim() !== '') yield line;
      }
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/**
 * Non empty lines of an NDJSON stream, in order. One line can arrive in several chunks:
 * an unfinished end waits for the next read. Stopping the loop cancels the stream.
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

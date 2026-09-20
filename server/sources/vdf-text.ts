export interface VdfTextObject {
  [key: string]: string | VdfTextObject;
}

type Token = { kind: 'string'; value: string; quoted: boolean } | { kind: 'open' } | { kind: 'close' };

const ESCAPES: Record<string, string> = { n: '\n', t: '\t' };

/** Reads a text Steam KeyValues file (loginusers.vdf, libraryfolders.vdf...). */
export function parseTextVdf(text: string): VdfTextObject {
  let pos = 0;

  function skipBlanks(): void {
    while (pos < text.length) {
      const c = text[pos];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\uFEFF') {
        pos++;
      } else if (c === '/' && text[pos + 1] === '/') {
        const eol = text.indexOf('\n', pos);
        pos = eol === -1 ? text.length : eol + 1;
      } else {
        return;
      }
    }
  }

  function next(): Token | null {
    skipBlanks();
    if (pos >= text.length) return null;
    const c = text[pos];
    if (c === '{') {
      pos++;
      return { kind: 'open' };
    }
    if (c === '}') {
      pos++;
      return { kind: 'close' };
    }
    if (c === '"') {
      pos++;
      let value = '';
      while (pos < text.length && text[pos] !== '"') {
        if (text[pos] === '\\' && pos + 1 < text.length) {
          const escaped = text[pos + 1];
          value += ESCAPES[escaped] ?? escaped;
          pos += 2;
        } else {
          value += text[pos++];
        }
      }
      if (pos >= text.length) throw new Error('Text VDF: unterminated string');
      pos++;
      return { kind: 'string', value, quoted: true };
    }
    const start = pos;
    while (pos < text.length && !/[\s{}"]/.test(text[pos])) pos++;
    return { kind: 'string', value: text.slice(start, pos), quoted: false };
  }

  function isConditional(token: Token): boolean {
    return token.kind === 'string' && !token.quoted && token.value.startsWith('[') && token.value.endsWith(']');
  }

  function parseObject(depth: number): VdfTextObject {
    const obj: VdfTextObject = {};
    for (;;) {
      const keyToken = next();
      if (keyToken === null) {
        if (depth > 0) throw new Error('Text VDF: missing closing brace');
        return obj;
      }
      if (keyToken.kind === 'close') {
        if (depth === 0) throw new Error('Text VDF: extra closing brace');
        return obj;
      }
      if (keyToken.kind === 'open') throw new Error('Text VDF: unexpected opening brace');
      if (isConditional(keyToken)) continue;
      const key = keyToken.value;
      const valueToken = next();
      if (valueToken === null || valueToken.kind === 'close') {
        throw new Error(`Text VDF: missing value for "${key}"`);
      }
      obj[key] = valueToken.kind === 'open' ? parseObject(depth + 1) : valueToken.value;
    }
  }

  return parseObject(0);
}

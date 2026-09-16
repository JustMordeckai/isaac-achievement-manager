export interface VdfTextObject {
  [key: string]: string | VdfTextObject;
}

type Token = { kind: 'string'; value: string; quoted: boolean } | { kind: 'open' } | { kind: 'close' };

const ESCAPES: Record<string, string> = { n: '\n', t: '\t' };

/** Lit un fichier KeyValues texte de Steam (loginusers.vdf, libraryfolders.vdf...). */
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
      if (pos >= text.length) throw new Error('VDF texte : chaîne non terminée');
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
        if (depth > 0) throw new Error('VDF texte : accolade fermante manquante');
        return obj;
      }
      if (keyToken.kind === 'close') {
        if (depth === 0) throw new Error('VDF texte : accolade fermante en trop');
        return obj;
      }
      if (keyToken.kind === 'open') throw new Error('VDF texte : accolade ouvrante inattendue');
      if (isConditional(keyToken)) continue;
      const key = keyToken.value;
      const valueToken = next();
      if (valueToken === null || valueToken.kind === 'close') {
        throw new Error(`VDF texte : valeur manquante pour "${key}"`);
      }
      obj[key] = valueToken.kind === 'open' ? parseObject(depth + 1) : valueToken.value;
    }
  }

  return parseObject(0);
}

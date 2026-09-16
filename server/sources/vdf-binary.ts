export type VdfValue = string | number | bigint | VdfObject;

export interface VdfObject {
  [key: string]: VdfValue;
}

const T_OBJECT = 0x00;
const T_STRING = 0x01;
const T_INT32 = 0x02;
const T_FLOAT32 = 0x03;
const T_POINTER = 0x04;
const T_COLOR = 0x06;
const T_UINT64 = 0x07;
const T_END = 0x08;
const T_INT64 = 0x0a;

const decoder = new TextDecoder('utf-8');

/** Lit un fichier KeyValues binaire de Steam (appcache/stats/*.bin). */
export function parseBinaryVdf(buf: Uint8Array): VdfObject {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 0;

  function readCString(): string {
    const end = buf.indexOf(0, pos);
    if (end === -1) throw new Error(`VDF binaire : chaîne non terminée à l'offset ${pos}`);
    const text = decoder.decode(buf.subarray(pos, end));
    pos = end + 1;
    return text;
  }

  function need(size: number): void {
    if (pos + size > buf.length) throw new Error(`VDF binaire : fin de fichier inattendue à l'offset ${pos}`);
  }

  function readObject(depth: number): VdfObject {
    const obj: VdfObject = {};
    while (pos < buf.length) {
      const typeOffset = pos;
      const type = buf[pos++];
      if (type === T_END) return obj;
      const key = readCString();
      switch (type) {
        case T_OBJECT:
          obj[key] = readObject(depth + 1);
          break;
        case T_STRING:
          obj[key] = readCString();
          break;
        case T_INT32:
        case T_POINTER:
        case T_COLOR:
          need(4);
          obj[key] = view.getInt32(pos, true);
          pos += 4;
          break;
        case T_FLOAT32:
          need(4);
          obj[key] = view.getFloat32(pos, true);
          pos += 4;
          break;
        case T_UINT64:
          need(8);
          obj[key] = view.getBigUint64(pos, true);
          pos += 8;
          break;
        case T_INT64:
          need(8);
          obj[key] = view.getBigInt64(pos, true);
          pos += 8;
          break;
        default:
          throw new Error(`VDF binaire : type 0x${type.toString(16)} inconnu à l'offset ${typeOffset}`);
      }
    }
    if (depth > 0) throw new Error(`VDF binaire : fin de fichier inattendue à l'offset ${pos}`);
    return obj;
  }

  return readObject(0);
}

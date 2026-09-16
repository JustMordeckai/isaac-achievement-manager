export interface VdfInput {
  [key: string]: string | number | bigint | VdfInput;
}

const encoder = new TextEncoder();

/** Encode un objet en KeyValues binaire (les nombres deviennent des int32). */
export function vdfBinary(input: VdfInput): Uint8Array {
  const out: number[] = [];
  const cstring = (text: string) => out.push(...encoder.encode(text), 0);
  const write = (obj: VdfInput) => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        out.push(0x01);
        cstring(key);
        cstring(value);
      } else if (typeof value === 'number') {
        out.push(0x02);
        cstring(key);
        const bytes = new Uint8Array(4);
        new DataView(bytes.buffer).setInt32(0, value, true);
        out.push(...bytes);
      } else if (typeof value === 'bigint') {
        out.push(0x07);
        cstring(key);
        const bytes = new Uint8Array(8);
        new DataView(bytes.buffer).setBigUint64(0, value, true);
        out.push(...bytes);
      } else {
        out.push(0x00);
        cstring(key);
        write(value);
      }
    }
    out.push(0x08);
  };
  write(input);
  return Uint8Array.from(out);
}

/**
 * The executable is a copy of node.exe, which Windows treats as a console program: it gets a console
 * window for as long as it runs. Marked as a GUI program instead, it runs in the background with no
 * window at all. Node handles that case: with no console, what it prints goes nowhere, which is why
 * the executable writes its log to data/server.log.
 */

export const SUBSYSTEM_GUI = 2;
export const SUBSYSTEM_CONSOLE = 3;

const PE_SIGNATURE = 0x00004550; // "PE\0\0"
const PE32 = 0x10b;
const PE32_PLUS = 0x20b;
/** The Subsystem field sits at the same place in PE32 and PE32+ optional headers. */
const SUBSYSTEM_FIELD = 68;

/** Offset of the Subsystem field, once the headers on the way have been checked. */
export function subsystemOffset(buf: Uint8Array): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 0x40 || view.getUint16(0, true) !== 0x5a4d) throw new Error('Not an executable: no MZ header');
  const pe = view.getUint32(0x3c, true);
  const optional = pe + 24;
  if (optional + SUBSYSTEM_FIELD + 2 > buf.length || view.getUint32(pe, true) !== PE_SIGNATURE) {
    throw new Error('Not an executable: no PE header');
  }
  const magic = view.getUint16(optional, true);
  if (magic !== PE32 && magic !== PE32_PLUS) throw new Error(`Unknown optional header magic 0x${magic.toString(16)}`);
  return optional + SUBSYSTEM_FIELD;
}

export function readSubsystem(buf: Uint8Array): number {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint16(subsystemOffset(buf), true);
}

/** Rewrites the Subsystem field in place. Nothing else moves, so the injected blob stays valid. */
export function setSubsystem(buf: Uint8Array, value: number): void {
  new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setUint16(subsystemOffset(buf), value, true);
}

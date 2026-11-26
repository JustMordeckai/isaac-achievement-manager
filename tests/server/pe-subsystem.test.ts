import { closeSync, openSync, readSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  readSubsystem,
  setSubsystem,
  SUBSYSTEM_CONSOLE,
  SUBSYSTEM_GUI,
  subsystemOffset,
} from '../../scripts/pe-subsystem.ts';

/** Smallest set of headers the functions walk through: MZ, PE signature, optional header. */
function fakeImage(magic = 0x20b, subsystem = SUBSYSTEM_CONSOLE): Uint8Array {
  const buf = new Uint8Array(0x200);
  const view = new DataView(buf.buffer);
  view.setUint16(0, 0x5a4d, true);
  view.setUint32(0x3c, 0x80, true);
  view.setUint32(0x80, 0x00004550, true);
  view.setUint16(0x80 + 24, magic, true);
  view.setUint16(0x80 + 24 + 68, subsystem, true);
  return buf;
}

/** The first 4 KB of the running node.exe, which hold all of its headers. */
function nodeHeaders(): Uint8Array {
  const buf = new Uint8Array(4096);
  const fd = openSync(process.execPath, 'r');
  try {
    readSync(fd, buf, 0, buf.length, 0);
  } finally {
    closeSync(fd);
  }
  return buf;
}

describe('pe-subsystem', () => {
  it('finds the field after the PE32+ and PE32 optional headers', () => {
    expect(subsystemOffset(fakeImage())).toBe(0x80 + 24 + 68);
    expect(readSubsystem(fakeImage(0x10b, SUBSYSTEM_GUI))).toBe(SUBSYSTEM_GUI);
  });

  it('switches the subsystem and touches nothing else', () => {
    const image = fakeImage();
    const before = Uint8Array.from(image);
    setSubsystem(image, SUBSYSTEM_GUI);
    expect(readSubsystem(image)).toBe(SUBSYSTEM_GUI);
    const changed = [...image.keys()].filter((i) => image[i] !== before[i]);
    expect(changed).toEqual([subsystemOffset(image)]);
  });

  it('reads node.exe as a console program, the state the build starts from', () => {
    expect(readSubsystem(nodeHeaders())).toBe(SUBSYSTEM_CONSOLE);
  });

  it('refuses a file that is not an executable', () => {
    expect(() => subsystemOffset(new Uint8Array(0x200))).toThrow(/MZ/);
    const noPe = fakeImage();
    noPe[0x80] = 0;
    expect(() => subsystemOffset(noPe)).toThrow(/PE header/);
    expect(() => subsystemOffset(fakeImage(0x999))).toThrow(/magic/);
    const truncated = fakeImage().subarray(0, 0x80 + 24 + 60);
    expect(() => subsystemOffset(truncated)).toThrow(/PE header/);
  });
});

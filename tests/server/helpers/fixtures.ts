import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FIXTURES = fileURLToPath(new URL('../../fixtures/', import.meta.url));
export const ME_ACCOUNT = 123456789;
export const ME_ID64 = '76561198083722517';
export const OTHER_ID64 = '76561198000000001';

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURES + name));
}

export function fixtureText(name: string): string {
  return readFileSync(FIXTURES + name, 'utf8');
}

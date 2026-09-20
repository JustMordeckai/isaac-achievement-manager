/**
 * Version of the app, and the comparison the update check needs. The number is written here rather
 * than read from package.json, because the executable carries no package.json; a test keeps the two
 * in step.
 */

export const APP_VERSION = '0.2.0';

/** The repository the releases come from. */
export const REPOSITORY = 'JustMordeckai/isaac-achievement-manager';

/** Three numbers, with anything else treated as zero: 0.2.0 beats 0.1.9, v prefixes are ignored. */
export function compareVersions(left: string, right: string): number {
  const parts = (value: string) =>
    value
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((piece) => {
        const number = Number.parseInt(piece, 10);
        return Number.isFinite(number) ? number : 0;
      });
  const a = parts(left);
  const b = parts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

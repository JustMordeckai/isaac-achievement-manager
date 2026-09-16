export const APP_ID = '250900';
export const STEAM_ID64_BASE = 76561197960265728n;
const MAX_ACCOUNT_ID = 0xffffffffn;

export function isSteamId64(value: string): boolean {
  if (!/^\d{17}$/.test(value)) return false;
  const offset = BigInt(value) - STEAM_ID64_BASE;
  return offset > 0n && offset <= MAX_ACCOUNT_ID;
}

export function accountIdToSteamId64(accountId: number): string {
  return (STEAM_ID64_BASE + BigInt(accountId)).toString();
}

export function steamId64ToAccountId(steamId64: string): number {
  if (!isSteamId64(steamId64)) throw new Error(`SteamID64 invalide : ${steamId64}`);
  return Number(BigInt(steamId64) - STEAM_ID64_BASE);
}

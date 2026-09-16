import type { MergeInput } from '../../../server/sources/progress.ts';
import { parseSaveFile } from '../../../server/sources/save-file.ts';
import { parseSchema, parseUserStats } from '../../../server/sources/steam-cache.ts';
import { parseProfileStatsXml } from '../../../server/sources/steam-profile.ts';
import { fixture, fixtureText, ME_ACCOUNT, ME_ID64 } from './fixtures.ts';

export function fixtureMergeInput(): MergeInput {
  const schema = parseSchema(fixture('UserGameStatsSchema_250900.bin'));
  return {
    profile: { steamId64: ME_ID64, name: 'Player', isLocal: true },
    defs: schema.map((entry) => entry.def),
    steamCache: { status: { state: 'ok' }, data: parseUserStats(fixture('UserGameStats_123456789_250900.bin'), schema) },
    save: { status: { state: 'ok', message: 'Slot 1' }, data: parseSaveFile(fixture('rep+persistentgamedata1.dat')) },
    saveSlots: { slot: 1, slots: [1, 2] },
    online: { status: { state: 'ok' }, data: parseProfileStatsXml(fixtureText('profile-stats-me.xml')) },
    accounts: [{ accountId: ME_ACCOUNT, steamId64: ME_ID64, personaName: 'Player' }],
  };
}

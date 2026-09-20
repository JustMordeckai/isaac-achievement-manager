# Isaac Achievement Manager

A local web application that reads your progress in *The Binding of Isaac: Rebirth* (Repentance+) and tells you what is left to unlock. It runs on your own machine, in English or in French, and it never writes to Steam or to the game.

What it does:

- reads the local Steam cache, the Repentance+ save file and the public Steam profile;
- spots the differences between those sources (a secret unlocked in game but missing from Steam, for instance);
- dashboard: overall progress and progress per DLC, latest unlocks, three best runs, grid of the completion marks of the 34 characters, differences;
- route planner: runs to play per character (endings to beat, path, achievements earned, prerequisites), sorted by achievements per hour, plus the achievements no run can bring (challenges, counters, the closets of Home, miscellaneous);
- AI advisor: free questions to an Ollama model, answered from your progress, the suggested runs and the wiki cards, in the language of the interface; an "Ask the advisor" button on every run and on the card of a missing achievement;
- filterable achievement list (state, DLC, way to earn it, character, secrets, search, differences);
- detailed card for every achievement, taken from the English wiki: condition, what it unlocks, tips, links to the source pages, and for a missing achievement its prerequisites and the runs of the plan that earn it;
- settings screen: interface language, wiki sync with its progress, Ollama server and advisor model, detected paths and account;
- read the public profile of another player (SteamID64, profile URL or custom nickname).

The full design is in `docs/superpowers/specs/2026-09-16-isaac-achievement-manager-design.md`.

## Requirements

- Windows 10 or 11, with Steam installed and the game launched at least once.
- Node.js 26 or newer (the server is written in TypeScript and run directly by Node).
- For the cross check and for other players: the game details of the Steam profile set to public.
- For the advisor: an [Ollama](https://ollama.com/) server you can reach (`http://127.0.0.1:11434` by default) with the chosen model installed (`qwen3.5:4b` by default). Everything else works without it.

## Install

```bash
npm install
npm run build
```

## First launch

- Double click `Isaac Manager.cmd`: it installs what is missing, builds the interface if needed, starts the server and opens <http://127.0.0.1:5250/> in your browser. `Isaac Manager.vbs` does the same with no console window and writes the server messages to `data/server.log`.
- Or, in a terminal: `npm start`.
- To stop it: the "Stop" button in the interface, or `npm run stop`.

On the first launch the wiki database does not exist yet: a banner says so and leads to the settings screen, whose "Sync the wiki" button downloads it (about 600 pages, around twenty seconds). The same sync exists on the command line: `npm run sync-wiki`. It never runs on its own, so start it again after a game or wiki update.

The application listens on `127.0.0.1` only and never changes the Steam or game files. It only writes inside `data/`: cached icons, wiki database (`kb.json`), copy of the wiki pages (`wiki-cache/`), log, and `settings.json` when the language or the advisor settings are saved from the interface.

## The tabs

**Dashboard** sums up your progress, the latest unlocks, the best runs to play, the completion marks of every character and the differences between the sources.

**Achievements** lists the 641 achievements with their filters and opens the card of each one: condition, what it unlocks, tips from the wiki, prerequisites and the runs that earn it.

**Routes** needs the wiki database. The completion marks come from the save file (the counters of the game); for another player they are inferred from the achievements, and the ones no achievement proves are shown as "?". The suggested mode is hard as long as the "every mark on hard" achievement of the character is missing. Run durations and character difficulty factors are manual estimates, not measurements. By default only the runs you can play right now are listed; the "Also show the runs to unlock" box adds the others with the achievements to earn first. When an achievement needs several runs (every mark on hard, or several endings with the same character), the plan adds preparation runs, with no achievement of their own, before the run that earns it; a run whose achievement depends on a run to unlock is itself to unlock. With no run left to suggest, the screen says that the mark achievements are all earned.

**Advisor** sends your question to the Ollama server along with a summary of your progress (achievements, completion marks, first ten suggested runs) and up to twenty achievement cards chosen from the names in the question (achievements, numbers such as #45, characters, bosses, items). The answer arrives as it is written; "Stop the answer" also cuts it on the server side. The cards sent to the model are listed under the answer and open the card of the achievement. The conversation lives as long as the page stays open: a reload clears it, and only the last five exchanges are sent back to the model.

**Settings** holds the interface language, the wiki sync, the Ollama server and model, and the paths and account that were detected.

## The advisor

The model is told to answer from those data only, but a small model can still get it wrong: check in the cards. The first message can take around ten seconds, the time for the server to load the model; an answer is cut past about 1500 tokens, and the application gives up after 120 seconds with nothing received (the server busy with another request, for instance). With no wiki database, the advisor only knows your progress.

The "Advisor" badge in the header says whether the server answers and whether the model is installed there. The settings screen changes the address and the model (the list offers the installed models): saving writes `data/settings.json` and applies without a restart.

## Language

The header has a language picker, English or French. The choice is saved in `data/settings.json` and in the browser, so it survives a reload and a restart. The advisor answers in the language of the interface. The names of the game (achievements, characters, items, bosses) stay in English in both languages, because that is what the game shows.

## Settings file

Optional file `data/settings.json`:

```json
{
  "port": 5250,
  "accountId": null,
  "locale": "en",
  "ollama": { "url": "http://127.0.0.1:11434", "model": "qwen3.5:4b" }
}
```

- `port`: local listening port.
- `accountId`: Steam account id to use (otherwise: the account logged into Steam when it has Isaac data, then the last logged account that has some).
- `locale`: `en` or `fr`; the language picker writes it.
- `ollama`: address of the Ollama server and model of the advisor; the settings screen changes them directly.

The settings screen shows the values in use; `port` and `accountId` need an edit of this file and a restart. An unreadable file is never overwritten: saving the settings is then refused.

## Troubleshooting

If double clicking `Isaac Manager.cmd` does nothing:

- check `node --version` (Node 26 or newer, and present in the PATH);
- check that `npm install` and `npm run build` went through;
- read `data/server.log`;
- run `npm start` in a terminal to see the error directly.

If the wiki sync fails, the previous database stays in use. With no network, the sync reuses the pages already copied in `data/wiki-cache/`; the report says how many.

If the advisor does not answer: check the server address in the settings ("Check the connection" button), that the model is installed (`ollama pull qwen3.5:4b` on the server) and that the firewall of the server lets the port 11434 through. The rest of the application works without Ollama.

If the answers never arrive although the server responds: it handles one request at a time per model, so another application keeping it busy makes yours wait. Video memory matters too: the application asks for a 32768 token context, which has to fit next to the model; a larger context, or another model loaded at the same time, overflows the cache and the generation becomes endless. `curl http://127.0.0.1:11434/api/ps` on the server shows what is loaded.

## Sources read

| Source | Location |
|---|---|
| Achievement schema | `Steam/appcache/stats/UserGameStatsSchema_250900.bin` |
| Local Steam achievements | `Steam/appcache/stats/UserGameStats_<account>_250900.bin` |
| Save file (secrets, counters, completion marks) | `Steam/userdata/<account>/250900/remote/rep+persistentgamedata{1,2,3}.dat` |
| Public profile | `https://steamcommunity.com/profiles/<SteamID64>/stats/250900/?xml=1` |
| Wiki (manual sync) | `https://bindingofisaacrebirth.fandom.com/api.php` |
| Advisor | an Ollama server (`/api/tags`, `/api/chat`) |

The save slot shown by default is the most recently modified one; a picker changes it.

## Development

```bash
npm run dev        # server plus Vite (hot reload) on http://127.0.0.1:5250/
npm test           # Vitest tests (server and front)
npm run typecheck  # TypeScript check
npm run sync-wiki  # wiki sync with no interface
node scripts/check-language.mjs  # fails when French leaks outside shared/i18n/fr.ts
```

The interface texts live in `shared/i18n/en.ts` and `shared/i18n/fr.ts`, one key per string, and both the server and the front read them. A new string goes into both catalogues.

The files under `tests/fixtures/` are real copies, including a SteamID and a save file: replace them before publishing a fork.

## Licence and credits

MIT, see [LICENSE](LICENSE).

This is an unofficial fan tool. It has no affiliation with Nicalis or Edmund McMillen; *The Binding of Isaac* and the names of the game belong to them. The card contents come from the [The Binding of Isaac: Rebirth wiki](https://bindingofisaacrebirth.fandom.com/) (Fandom), under CC BY-SA, and every card links to its source pages. [Ollama](https://ollama.com/) and the models you run on it keep their own licences.

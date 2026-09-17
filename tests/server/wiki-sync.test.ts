import { describe, expect, it } from 'vitest';
import type { WikiSyncEvent } from '../../shared/types.ts';
import { parseSchema } from '../../server/sources/steam-cache.ts';
import { buildKnowledgeBase, CORE_PAGES, EXTRA_PAGES } from '../../server/wiki/sync.ts';
import { fakeWikiClient } from './helpers/fake-wiki.ts';
import { fixture } from './helpers/fixtures.ts';

const steamDefs = parseSchema(fixture('UserGameStatsSchema_250900.bin')).map((entry) => entry.def);
const now = () => new Date('2026-09-17T08:00:00Z');

describe('buildKnowledgeBase', () => {
  it('construit la base complète à partir des pages du wiki et du schéma Steam', async () => {
    const client = fakeWikiClient();
    const events: WikiSyncEvent[] = [];
    const kb = await buildKnowledgeBase({ client, steamDefs, now, onEvent: (e) => events.push(e) });

    expect(kb.version).toBe(1);
    expect(kb.syncedAt).toBe('2026-09-17T08:00:00.000Z');
    expect(kb.achievements).toHaveLength(641);
    expect(kb.achievements.map((a) => a.id)).toEqual(Array.from({ length: 641 }, (_, i) => i + 1));

    expect(client.calls[0]).toEqual(Object.values(CORE_PAGES));
    expect(client.calls[1]).toEqual(expect.arrayContaining(['Pitch Black', 'Judas', ...EXTRA_PAGES]));

    const judas = kb.achievements[2];
    expect(judas).toMatchObject({
      id: 3,
      name: 'Judas',
      condition: 'Defeat Satan',
      how: { kind: 'boss', bosses: ['Satan'] },
      unlocks: { kind: 'character', name: 'Judas' },
      character: null,
      page: 'Judas',
      inWiki: true,
    });
    expect(kb.achievements[8]).toMatchObject({ page: 'The Nail', character: 'azazel' });
    expect(kb.achievements[40]).toMatchObject({ name: 'Golden God!', page: null, fragment: null });
    expect(kb.achievements[227]).toMatchObject({ page: 'Pills', fragment: 'Re-Lax', excerpt: null });
    expect(kb.achievements[640]).toEqual({
      id: 641,
      wikiName: 'Item Descriptions',
      name: 'Item Descriptions',
      description: steamDefs[640].description,
      condition: '',
      how: { kind: 'misc' },
      unlocks: { kind: 'other', name: 'Item Descriptions' },
      character: null,
      page: null,
      fragment: null,
      excerpt: null,
      inWiki: false,
    });

    expect(kb.pages.Cain.sections.map((s) => s.title)).toEqual(['Strategy']);
    expect(kb.pages.Home.sections.map((s) => s.title)).toEqual(['Hidden closet']);
    expect(kb.pages.Achievements).toBeUndefined();
    expect(kb.challenges.find((c) => c.number === 10)).toMatchObject({ title: 'Cursed!', character: 'Magdalene' });
    expect(kb.tips.map((t) => t.section.title)).toContain('No Damage Achievements');

    expect(kb.report).toMatchObject({ achievements: 641, cachedPages: 0, miscCount: 108, otherUnlockCount: 61 });
    expect(kb.report.missingPages).toContain('Basement Boy');
    expect(kb.report.pages).toBe(Object.keys(kb.pages).length);

    expect(events[0]).toEqual({ step: 'core', done: 0, total: 1, message: 'Téléchargement de la liste des succès' });
    expect(events.map((e) => e.step)).toEqual(['core', 'core', 'pages', 'pages', ...Array(11).fill('pages'), 'build', 'build']);
    expect(events.at(-1)?.message).toBe(`${kb.report.pages} pages analysées`);
  });

  it('échoue sans la page Achievements ou sans fiche dedans', async () => {
    await expect(buildKnowledgeBase({ client: fakeWikiClient({ achievements: null }), steamDefs, now })).rejects.toThrow(
      'Page « Achievements » indisponible',
    );
    await expect(
      buildKnowledgeBase({ client: fakeWikiClient({ achievements: 'Page vide.' }), steamDefs, now }),
    ).rejects.toThrow('sans fiche de succès');
  });

  it('fonctionne sans schéma Steam (le #641 manque alors)', async () => {
    const kb = await buildKnowledgeBase({ client: fakeWikiClient(), steamDefs: null, now });
    expect(kb.achievements).toHaveLength(640);
  });
});

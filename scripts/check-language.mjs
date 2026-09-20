#!/usr/bin/env node
/**
 * Fails when a file that has already been converted to English holds French: an accented
 * letter, or one of a handful of French stop words. Run: node scripts/check-language.mjs
 *
 * This script is itself one of the files it scans, so the stop words below are never spelled
 * out as plain text: they are rebuilt from character codes, and the search pattern is built
 * from that decoded list at run time rather than written as a literal regular expression.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

/** Files converted to English so far; every extraction task appends the files it converts. */
const CLEAN = [
  'shared/i18n/en.ts',
  'shared/i18n/index.ts',
  'web/src/i18n.tsx',
  'scripts/check-language.mjs',
  'server/app.ts',
  'server/config.ts',
  'server/progress-service.ts',
  'server/kb-service.ts',
  'server/icons.ts',
  'server/http-error.ts',
  'server/sources/steam-profile.ts',
  'server/sources/save-file.ts',
  'server/sources/progress.ts',
  'server/wiki/client.ts',
  'server/wiki/sync.ts',
  'server/wiki/setup.ts',
  'server/planner/plan.ts',
  'server/planner/combos.ts',
  'server/planner/targets.ts',
  'server/planner/characters.ts',
  'server/planner/marks.ts',
  'server/planner/requirements.ts',
  'server/planner/card-plan.ts',
];

const ACCENTED_LETTER = /[\u00C0-\u00FF]/;

const STOP_WORD_CODES = [
  [108, 101],
  [108, 97],
  [108, 101, 115],
  [100, 101, 115],
  [117, 110, 101],
  [112, 111, 117, 114],
  [97, 118, 101, 99],
  [115, 97, 110, 115],
  [100, 97, 110, 115],
  [115, 117, 114],
  [112, 97, 114],
  [101, 115, 116],
  [115, 111, 110, 116],
];
const STOP_WORDS = STOP_WORD_CODES.map((codes) => String.fromCharCode(...codes));
const STOP_WORD_PATTERN = new RegExp(`\\b(${STOP_WORDS.join('|')})\\b`, 'i');

function offendingFiles() {
  const offenses = [];
  for (const file of CLEAN) {
    const lines = readFileSync(path.join(root, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (ACCENTED_LETTER.test(line) || STOP_WORD_PATTERN.test(line)) {
        offenses.push({ file, line: index + 1, text: line.trim() });
      }
    });
  }
  return offenses;
}

const offenses = offendingFiles();
if (offenses.length > 0) {
  for (const offense of offenses) {
    console.error(`${offense.file}:${offense.line}: ${offense.text}`);
  }
  console.error(`check-language: French text found in ${offenses.length} line(s).`);
  process.exit(1);
}

console.log(`check-language: ${CLEAN.length} file(s) clean.`);

#!/usr/bin/env node
/**
 * Fails when a source file holds French: an accented letter, or one of a handful of French stop
 * words. The whole repository is scanned, except the French catalogue, the documents and the test
 * fixtures. Run: node scripts/check-language.mjs
 *
 * This script is itself one of the files it scans, so the stop words below are never spelled
 * out as plain text: they are rebuilt from character codes, and the search pattern is built
 * from that decoded list at run time rather than written as a literal regular expression.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

/** Directories never scanned: dependencies, build output, player data, documents and fixtures. */
const SKIPPED_DIRS = new Set([
  '.git',
  '.superpowers',
  'node_modules',
  'data',
  'dist',
  'fixtures',
  '.vite',
]);

/** The French catalogue is the one file that holds French on purpose. */
const SKIPPED_FILES = new Set([path.join('shared', 'i18n', 'fr.ts')]);

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.css', '.html', '.json', '.md', '.cmd', '.vbs']);

/** Latin 1 letters only: the range leaves out the multiplication and division signs. */
const ACCENTED_LETTER = /[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/;

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

/** Every scanned file of the repository, as paths relative to its root. */
function scannedFiles(directory = '') {
  const files = [];
  for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) files.push(...scannedFiles(relative));
    } else if (SCANNED_EXTENSIONS.has(path.extname(entry.name)) && !SKIPPED_FILES.has(relative)) {
      files.push(relative);
    }
  }
  return files;
}

/** Code that only looks French: the generic CSS font family. */
const CODE_TOKENS = /sans-serif/gi;

function offendingLines(files) {
  const offenses = [];
  for (const file of files) {
    const lines = readFileSync(path.join(root, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      const text = line.replace(CODE_TOKENS, '');
      if (ACCENTED_LETTER.test(text) || STOP_WORD_PATTERN.test(text)) {
        offenses.push({ file, line: index + 1, text: line.trim() });
      }
    });
  }
  return offenses;
}

const files = scannedFiles();
const offenses = offendingLines(files);
if (offenses.length > 0) {
  for (const offense of offenses) {
    console.error(`${offense.file.split(path.sep).join('/')}:${offense.line}: ${offense.text}`);
  }
  console.error(`check-language: French text found in ${offenses.length} line(s).`);
  process.exit(1);
}

console.log(`check-language: ${files.length} file(s) clean.`);

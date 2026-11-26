#!/usr/bin/env node
/**
 * Builds the single Windows executable: the interface, the server and Node in one file.
 *
 *   node scripts/build-exe.mjs
 *
 * Steps: build the front into build/web, bundle the server into one CommonJS file, list the front
 * files as assets of the executable, let Node write the SEA blob, copy node.exe, put the icon of
 * the game on the copy, inject the blob with postject and mark the file as a GUI program, so it
 * runs with no console window. The result is dist/Isaac Achievement Manager.exe, which needs
 * nothing installed.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setSubsystem, SUBSYSTEM_GUI } from './pe-subsystem.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const WEB = path.join(BUILD, 'web');
const DIST = path.join(ROOT, 'dist');
const EXE = path.join(DIST, 'Isaac Achievement Manager.exe');
const ICON = path.join(ROOT, 'assets', 'icon.ico');
const RCEDIT = path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

/**
 * npx and the other .cmd wrappers only start through a shell, which then needs its own quoting;
 * node itself is an absolute path and runs without one.
 */
const run = (command, args, options = {}) => {
  const shell = !path.isAbsolute(command);
  const quoted = shell ? args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)) : args;
  return execFileSync(command, quoted, { cwd: ROOT, stdio: 'inherit', shell, ...options });
};

/** Every file of a folder, as paths relative to it, with forward slashes. */
function filesUnder(directory, prefix = '') {
  const found = [];
  for (const entry of readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...filesUnder(directory, relative));
    else found.push(relative);
  }
  return found;
}

console.log('1/5 interface');
rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });
// The Vite root is web/, so its outDir is relative to that folder.
run('npx', ['vite', 'build', '--outDir', path.relative(path.join(ROOT, 'web'), WEB).split(path.sep).join('/'), '--emptyOutDir']);

console.log('2/5 server');
// vite is only imported by the --dev path, which the executable never takes: it stays out.
run('npx', [
  'esbuild',
  'server/index.ts',
  '--bundle',
  '--platform=node',
  '--target=node26',
  '--format=cjs',
  '--external:vite',
  `--outfile=${path.relative(ROOT, path.join(BUILD, 'server.cjs'))}`,
]);

console.log('3/5 assets');
const assets = Object.fromEntries(
  filesUnder(WEB).map((file) => [file, path.relative(ROOT, path.join(WEB, file)).split(path.sep).join('/')]),
);
writeFileSync(
  path.join(BUILD, 'sea-config.json'),
  `${JSON.stringify(
    {
      main: 'build/server.cjs',
      output: 'build/sea-prep.blob',
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
      assets,
    },
    null,
    2,
  )}\n`,
);

console.log('4/5 blob');
run(process.execPath, ['--experimental-sea-config', 'build/sea-config.json']);

console.log('5/5 executable');
mkdirSync(DIST, { recursive: true });
// Windows locks a running executable: rather than failing, the build lands next to it and says so.
let target = EXE;
try {
  rmSync(EXE, { force: true });
} catch (error) {
  if (error.code !== 'EPERM' && error.code !== 'EBUSY') throw error;
  target = path.join(DIST, 'Isaac Achievement Manager.new.exe');
  rmSync(target, { force: true });
}
copyFileSync(process.execPath, target);
// The icon replaces the one of node.exe before the blob is injected: rewriting the resources of a
// file that already holds the blob would move the section postject added. Windows sometimes keeps
// the fresh copy open for a moment, which rcedit reports as a failure: it is worth another try.
for (let attempt = 1; ; attempt++) {
  try {
    run(RCEDIT, [target, '--set-icon', ICON]);
    break;
  } catch (error) {
    if (attempt === 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
run('npx', ['postject', target, 'NODE_SEA_BLOB', 'build/sea-prep.blob', '--sentinel-fuse', FUSE]);
// Last write to the file: a GUI program runs in the background instead of holding a console
// window open (see scripts/pe-subsystem.ts). Only one header field changes, the blob stays put.
const image = readFileSync(target);
setSubsystem(image, SUBSYSTEM_GUI);
writeFileSync(target, image);

// The executable reads and writes data/ next to itself: a fresh folder is enough to run it.
mkdirSync(path.join(DIST, 'data'), { recursive: true });
const kb = path.join(ROOT, 'data', 'kb.json');
if (process.argv.includes('--with-kb')) {
  cpSync(kb, path.join(DIST, 'data', 'kb.json'));
  console.log('wiki base copied next to the executable');
}

const size = statSync(target).size / 1024 / 1024;
console.log(`${path.relative(ROOT, target)} ready, ${size.toFixed(0)} MB`);
if (target !== EXE) {
  console.log(`${path.relative(ROOT, EXE)} is running: close it, then replace it with the file above.`);
}

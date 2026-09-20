/**
 * Reading of the command line, kept apart from the startup so it can be tried on its own.
 */

/**
 * Whether the app opens the browser on its own page. The single executable is started by a double
 * click and has nowhere else to show its address, so it opens it unless `--no-open` says otherwise;
 * `node server/index.ts` stays quiet until `--open` asks for it, which the launcher does.
 */
export function shouldOpenBrowser(args: ReadonlySet<string>, standalone: boolean): boolean {
  if (args.has('--no-open')) return false;
  return standalone || args.has('--open');
}

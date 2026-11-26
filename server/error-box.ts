import { spawnSync } from 'node:child_process';

/**
 * The executable runs with no window (see scripts/pe-subsystem.ts), so an error that stops it would
 * go unseen: it is shown in a Windows message box before the process exits. Node has no access to
 * the Windows API, so PowerShell draws the box; the texts travel through the environment, which
 * keeps them out of the command line and of its quoting. Blocks until the box is closed.
 */

/** Same shape as spawnSync, injected by the tests. */
export type BoxRunner = (
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; stdio: 'ignore'; windowsHide: boolean },
) => unknown;

// A plain box from a process with no window of its own opens behind the window in use, where
// nobody sees it. DefaultDesktopOnly has Windows draw it topmost, above every other window.
const SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  "[void][System.Windows.Forms.MessageBox]::Show($env:IAM_BOX_TEXT, $env:IAM_BOX_TITLE, 'OK', 'Error', 'Button1', 'DefaultDesktopOnly')",
].join('; ');

export function showErrorBox(title: string, text: string, run: BoxRunner = spawnSync): void {
  try {
    // windowsHide only hides the console of PowerShell: the box itself still shows (checked on
    // Windows 11 from a windowless parent).
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
      env: { ...process.env, IAM_BOX_TITLE: title, IAM_BOX_TEXT: text },
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    // No PowerShell: the error is still written to data/server.log.
  }
}

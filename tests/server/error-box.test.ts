import { describe, expect, it } from 'vitest';
import { type BoxRunner, showErrorBox } from '../../server/error-box.ts';

describe('showErrorBox', () => {
  it('hands the texts to PowerShell through the environment, never the command line', () => {
    const calls: Parameters<BoxRunner>[] = [];
    const text = `Port 5250 "taken"; $(Get-Date) 'x'`;
    showErrorBox('Isaac Achievement Manager', text, (...call) => calls.push(call));
    expect(calls).toHaveLength(1);
    const [command, args, options] = calls[0];
    expect(command).toBe('powershell.exe');
    expect(args.join(' ')).not.toContain(text);
    expect(args.join(' ')).toContain('$env:IAM_BOX_TEXT');
    expect(options.env.IAM_BOX_TEXT).toBe(text);
    expect(options.env.IAM_BOX_TITLE).toBe('Isaac Achievement Manager');
    expect(options.windowsHide).toBe(true);
  });

  it('stays quiet when PowerShell cannot start', () => {
    expect(() =>
      showErrorBox('t', 'm', () => {
        throw new Error('spawn powershell.exe ENOENT');
      }),
    ).not.toThrow();
  });
});

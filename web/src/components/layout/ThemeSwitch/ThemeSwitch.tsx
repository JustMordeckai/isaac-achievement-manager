import { MoonIcon, SunIcon } from '@/components/common/Icons/Icons.tsx';
import { useT } from '@/i18n.tsx';
import type { Theme } from '@/lib/theme.ts';

export interface ThemeSwitchProps {
  theme: Theme;
  onToggle(): void;
}

/**
 * Dark and light, as a switch rather than a button: its name is what it controls and its state is
 * carried by aria-checked, so a screen reader says "dark theme, on" instead of an instruction.
 */
export function ThemeSwitch({ theme, onToggle }: ThemeSwitchProps) {
  const t = useT();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={dark}
      aria-label={t('app.themeSwitch')}
      title={dark ? t('app.toLightTheme') : t('app.toDarkTheme')}
      onClick={onToggle}
    >
      <span className="switch__track">
        <span className="switch__knob">{dark ? <MoonIcon /> : <SunIcon />}</span>
      </span>
    </button>
  );
}

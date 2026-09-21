import { useT } from '@/i18n.tsx';

export interface SettingsBannerProps {
  text: string;
  onOpenSettings(): void;
  /** Label of the button; the one of the application catalogue by default. */
  buttonLabel?: string;
  /** Extra class on the banner, for the screens that place it themselves. */
  className?: string;
  role?: 'status';
}

/** Something the settings screen can fix (no wiki base, no advisor), with the way to it. */
export function SettingsBanner({ text, onOpenSettings, buttonLabel, className, role }: SettingsBannerProps) {
  const t = useT();
  return (
    <div className={className ? `banner banner--info ${className}` : 'banner banner--info'} role={role}>
      <p>{text}</p>
      <button type="button" className="btn" onClick={onOpenSettings}>
        {buttonLabel ?? t('app.openSettings')}
      </button>
    </div>
  );
}

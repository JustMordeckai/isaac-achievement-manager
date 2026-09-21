import { useState } from 'react';
import { iconUrl } from '@/lib/api.ts';

export interface AchievementIconProps {
  /** File name of the Steam icon. */
  file: string;
  alt: string;
}

export function AchievementIcon({ file, alt }: AchievementIconProps) {
  const [failed, setFailed] = useState(false);
  if (!file || failed) return <span className="ach-icon ach-icon--missing" aria-hidden="true" />;
  return (
    <img
      className="ach-icon"
      src={iconUrl(file)}
      alt={alt}
      width={48}
      height={48}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

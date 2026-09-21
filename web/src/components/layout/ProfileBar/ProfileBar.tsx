import type { AdvisorStatus, KbStatus, ProgressSummary } from '@shared/types.ts';
import type { ProfileQuery } from '@/lib/api.ts';
import { ProfilePicker } from '@/components/layout/ProfilePicker/ProfilePicker.tsx';
import { SourceBadges } from '@/components/layout/SourceBadges/SourceBadges.tsx';
import { useT } from '@/i18n.tsx';

export interface ProfileBarProps {
  summary: ProgressSummary | null;
  kb: KbStatus | null;
  advisor: AdvisorStatus | null;
  /** SteamID64 of the local account served under "My profile", when it is known. */
  meSteamId: string | null;
  query: ProfileQuery;
  onQueryChange(query: ProfileQuery): void;
}

/** Second row of the header: whose progress is shown, from which save, and where it comes from. */
export function ProfileBar({ summary, kb, advisor, meSteamId, query, onQueryChange }: ProfileBarProps) {
  const t = useT();
  const save = summary?.save ?? null;
  return (
    <div className="header__bottom">
      <ProfilePicker
        profile={query.profile}
        accounts={summary?.accounts ?? []}
        meSteamId={meSteamId}
        currentName={summary?.profile.name ?? null}
        onChange={(profile) => onQueryChange({ profile, slot: null })}
      />
      {save && save.slots.length > 1 && (
        <label className="field">
          <span>{t('app.save')}</span>
          <select
            value={query.slot ?? save.slot}
            onChange={(e) => onQueryChange({ profile: query.profile, slot: Number(e.target.value) })}
          >
            {save.slots.map((slot) => (
              <option key={slot} value={slot}>
                {t('app.slot', { slot })}
              </option>
            ))}
          </select>
        </label>
      )}
      <SourceBadges sources={summary?.sources ?? null} wiki={kb} advisor={advisor} />
    </div>
  );
}

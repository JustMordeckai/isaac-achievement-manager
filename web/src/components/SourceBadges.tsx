import type { KbStatus, ProgressSummary, SourceKey } from '../../../shared/types.ts';
import { formatDate, KB_STATE_LABELS, SOURCE_LABELS, STATE_LABELS } from '../labels.ts';

const ORDER: SourceKey[] = ['steamCache', 'saveFile', 'profile'];

export interface SourceBadgesProps {
  sources: ProgressSummary['sources'] | null;
  wiki: KbStatus | null;
}

interface Badge {
  key: string;
  label: string;
  state: string;
  text: string;
  message: string | undefined;
}

export function SourceBadges({ sources, wiki }: SourceBadgesProps) {
  const badges: Badge[] = [];
  if (sources) {
    for (const key of ORDER) {
      const { state, message } = sources[key];
      badges.push({ key, label: SOURCE_LABELS[key], state, text: STATE_LABELS[state], message });
    }
  }
  if (wiki) {
    const synced = wiki.state === 'ok' && wiki.syncedAt ? `Synchro du ${formatDate(wiki.syncedAt)}` : undefined;
    badges.push({ key: 'wiki', label: 'Wiki', state: wiki.state, text: KB_STATE_LABELS[wiki.state], message: wiki.message ?? synced });
  }
  if (badges.length === 0) return null;
  // Les messages des sources en défaut restent lisibles sans survol.
  const notes = badges.filter((b) => b.state !== 'ok' && b.message);
  return (
    <div className="sources">
      <ul className="badges" aria-label="État des sources">
        {badges.map((b) => (
          <li key={b.key} className={`badge badge--${b.state}`} title={b.message}>
            {`${b.label} : ${b.text}`}
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <ul className="source-notes" aria-label="Messages des sources">
          {notes.map((b) => (
            <li key={b.key}>
              {`${b.label} : ${b.message}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

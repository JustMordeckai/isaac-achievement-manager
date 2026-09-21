import type { AdvisorStatus, KbStatus, ProgressSummary, SourceKey } from '@shared/types.ts';
import { useLocale, useT } from '@/i18n.tsx';
import { advisorStateLabel, formatDate, kbStateLabel, sourceLabel, sourceStateLabel } from '@/lib/labels.ts';

const ORDER: SourceKey[] = ['steamCache', 'saveFile', 'profile'];

export interface SourceBadgesProps {
  sources: ProgressSummary['sources'] | null;
  wiki: KbStatus | null;
  /** Ollama server of the advisor (the "Advisor" badge; the message names Ollama). */
  advisor: AdvisorStatus | null;
}

interface Badge {
  key: string;
  label: string;
  state: string;
  text: string;
  message: string | undefined;
}

export function SourceBadges({ sources, wiki, advisor }: SourceBadgesProps) {
  const locale = useLocale();
  const t = useT();
  const badges: Badge[] = [];
  if (sources) {
    for (const key of ORDER) {
      const { state, message } = sources[key];
      badges.push({ key, label: sourceLabel(locale, key), state, text: sourceStateLabel(locale, state), message });
    }
  }
  if (wiki) {
    const synced =
      wiki.state === 'ok' && wiki.syncedAt ? t('sources.syncedOn', { date: formatDate(locale, wiki.syncedAt) }) : undefined;
    badges.push({ key: 'wiki', label: 'Wiki', state: wiki.state, text: kbStateLabel(locale, wiki.state), message: wiki.message ?? synced });
  }
  if (advisor) {
    badges.push({
      key: 'advisor',
      label: t('advisor.title'),
      state: advisor.state,
      text: advisorStateLabel(locale, advisor.state),
      message: advisor.message ?? t('sources.advisorModel', { model: advisor.model, url: advisor.url }),
    });
  }
  if (badges.length === 0) return null;
  // The messages of the sources in trouble stay readable without hovering.
  const notes = badges.filter((b) => b.state !== 'ok' && b.message);
  return (
    <div className="sources">
      <ul className="badges" aria-label={t('sources.badgesLabel')}>
        {badges.map((b) => (
          <li key={b.key} className={`badge badge--${b.state}`} title={b.message}>
            {t('sources.badge', { label: b.label, state: b.text })}
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <ul className="source-notes" aria-label={t('sources.notesLabel')}>
          {notes.map((b) => (
            <li key={b.key}>{t('sources.note', { label: b.label, message: b.message as string })}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

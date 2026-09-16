import type { ProgressSummary, SourceKey } from '../../../shared/types.ts';
import { SOURCE_LABELS, STATE_LABELS } from '../labels.ts';

const ORDER: SourceKey[] = ['steamCache', 'saveFile', 'profile'];

export function SourceBadges({ sources }: { sources: ProgressSummary['sources'] }) {
  return (
    <ul className="badges" aria-label="État des sources">
      {ORDER.map((key) => {
        const source = sources[key];
        const text = `${SOURCE_LABELS[key]} : ${STATE_LABELS[source.state]}`;
        return (
          <li key={key} className={`badge badge--${source.state}`} title={source.message ?? text}>
            {text}
          </li>
        );
      })}
    </ul>
  );
}

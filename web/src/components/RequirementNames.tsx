import { Fragment } from 'react';
import type { Requirement } from '../../../shared/types.ts';
import { useT } from '../i18n.tsx';

/** Achievements of one or more prerequisites: every name in English, the connectors from the catalogue. */
export function RequirementNames({ requirements }: { requirements: Requirement[] }) {
  const t = useT();
  return requirements.map((requirement, index) => (
    <Fragment key={requirement.anyOf.map((a) => a.id).join('-')}>
      {index > 0 && ', '}
      {requirement.anyOf.map((achievement, position) => (
        <Fragment key={achievement.id}>
          {position > 0 && t('run.or')}
          <span lang="en">{achievement.name}</span>
        </Fragment>
      ))}
    </Fragment>
  ));
}

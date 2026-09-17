import { Fragment } from 'react';
import type { Requirement } from '../../../shared/types.ts';

/** Succès d'un ou de plusieurs prérequis : chaque nom en anglais, les liaisons en français. */
export function RequirementNames({ requirements }: { requirements: Requirement[] }) {
  return requirements.map((requirement, index) => (
    <Fragment key={requirement.anyOf.map((a) => a.id).join('-')}>
      {index > 0 && ', '}
      {requirement.anyOf.map((achievement, position) => (
        <Fragment key={achievement.id}>
          {position > 0 && ' ou '}
          <span lang="en">{achievement.name}</span>
        </Fragment>
      ))}
    </Fragment>
  ));
}

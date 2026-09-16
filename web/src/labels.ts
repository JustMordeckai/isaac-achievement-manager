import type { DesyncKind, Dlc, SourceKey, SourceState } from '../../shared/types.ts';

export const DLC_LABELS: Record<Dlc, string> = {
  rebirth: 'Rebirth',
  afterbirth: 'Afterbirth',
  afterbirthPlus: 'Afterbirth+',
  repentance: 'Repentance',
  repentancePlus: 'Repentance+',
};

export const SOURCE_LABELS: Record<SourceKey, string> = {
  steamCache: 'Cache Steam',
  saveFile: 'Sauvegarde',
  profile: 'Profil en ligne',
};

export const STATE_LABELS: Record<SourceState, string> = {
  ok: 'OK',
  absent: 'absent',
  stale: 'obsolète',
  error: 'erreur',
};

export const DESYNC_LABELS: Record<DesyncKind, string> = {
  saveOnly: 'Débloqués dans la sauvegarde, absents de Steam',
  steamOnly: 'Débloqués sur Steam, absents de la sauvegarde',
  profileAhead: 'Sur le profil en ligne, pas encore dans le cache local',
  cacheAhead: 'Dans le cache local, pas encore sur le profil en ligne',
};

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function percent(value: number, total: number): string {
  const ratio = total === 0 ? 0 : (value / total) * 100;
  return `${ratio.toFixed(1).replace('.', ',')} %`;
}

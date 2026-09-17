import { useRef, useState } from 'react';
import type { LocalAccount } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { loadRecentProfiles, rememberProfile, type SavedProfile } from '../recent-profiles.ts';

const OTHER = '__other__';

export interface ProfilePickerProps {
  /** "me" ou un SteamID64. */
  profile: string;
  accounts: LocalAccount[];
  /** SteamID64 du compte servi sous « Mon profil », null s'il est inconnu. */
  meSteamId: string | null;
  /** Nom du profil actuellement affiché. */
  currentName: string | null;
  onChange(profile: string): void;
}

export function ProfilePicker({ profile, accounts, meSteamId, currentName, onChange }: ProfilePickerProps) {
  const [recent, setRecent] = useState<SavedProfile[]>(loadRecentProfiles);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Incrémenté à chaque annulation ou nouvelle sélection, pour ignorer une résolution obsolète. */
  const requestId = useRef(0);

  // « Mon profil » représente déjà le compte choisi par le serveur : on ne le répète pas dans la liste.
  const otherLocals = meSteamId === null ? (accounts.length > 1 ? accounts : []) : accounts.filter((a) => a.steamId64 !== meSteamId);
  const recentOthers = recent.filter(
    (r) => r.steamId64 !== meSteamId && !otherLocals.some((a) => a.steamId64 === r.steamId64),
  );
  const known = new Set(['me', ...otherLocals.map((a) => a.steamId64), ...recentOthers.map((r) => r.steamId64)]);
  const meLabel = profile === 'me' && currentName ? `Mon profil (${currentName})` : 'Mon profil';

  function select(value: string) {
    requestId.current += 1;
    setBusy(false);
    setInput('');
    if (value === OTHER) {
      setEditing(true);
      setError(null);
      return;
    }
    setEditing(false);
    onChange(value);
  }

  function cancel() {
    requestId.current += 1;
    setEditing(false);
    setError(null);
    setInput('');
    setBusy(false);
  }

  async function submit() {
    const id = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      const resolved = await api.resolveProfile(input);
      if (requestId.current !== id) return;
      setRecent(rememberProfile(resolved));
      setEditing(false);
      setInput('');
      onChange(resolved.steamId64);
    } catch (e) {
      if (requestId.current !== id) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (requestId.current === id) setBusy(false);
    }
  }

  return (
    <div className="profile-picker">
      <label className="field">
        <span>Profil</span>
        <select value={editing ? OTHER : profile} onChange={(e) => select(e.target.value)}>
          <option value="me">{meLabel}</option>
          {otherLocals.map((a) => (
            <option key={a.steamId64} value={a.steamId64}>
              {`${a.personaName ?? a.steamId64} (compte local)`}
            </option>
          ))}
          {recentOthers.map((r) => (
            <option key={r.steamId64} value={r.steamId64}>
              {r.name ?? r.steamId64}
            </option>
          ))}
          {!known.has(profile) && <option value={profile}>{currentName ?? profile}</option>}
          <option value={OTHER}>Autre joueur…</option>
        </select>
      </label>
      {editing && (
        <form
          className="profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="field field--grow">
            <span>SteamID64, URL de profil ou pseudo</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://steamcommunity.com/id/…"
              autoFocus
              required
            />
          </label>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Recherche…' : 'Charger'}
          </button>
          <button className="btn" type="button" onClick={cancel}>
            Annuler
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { LocalAccount } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { loadRecentProfiles, rememberProfile, type SavedProfile } from '../recent-profiles.ts';

const OTHER = '__other__';

export interface ProfilePickerProps {
  /** "me" ou un SteamID64. */
  profile: string;
  accounts: LocalAccount[];
  /** Nom du profil actuellement affiché. */
  currentName: string | null;
  onChange(profile: string): void;
}

export function ProfilePicker({ profile, accounts, currentName, onChange }: ProfilePickerProps) {
  const [recent, setRecent] = useState<SavedProfile[]>(loadRecentProfiles);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherLocals = accounts.length > 1 ? accounts : [];
  const recentOthers = recent.filter((r) => !otherLocals.some((a) => a.steamId64 === r.steamId64));
  const known = new Set(['me', ...otherLocals.map((a) => a.steamId64), ...recentOthers.map((r) => r.steamId64)]);
  const meLabel = profile === 'me' && currentName ? `Mon profil (${currentName})` : 'Mon profil';

  function select(value: string) {
    if (value === OTHER) {
      setEditing(true);
      setError(null);
      return;
    }
    setEditing(false);
    onChange(value);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const resolved = await api.resolveProfile(input);
      setRecent(rememberProfile(resolved));
      setEditing(false);
      setInput('');
      onChange(resolved.steamId64);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
          <button
            className="btn"
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
          >
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

export interface ErrorPanelProps {
  title: string;
  message: string;
  retryLabel: string;
  onRetry(): void;
  /** Back to the local profile after another profile failed; null when that is already the case. */
  onResetProfile: (() => void) | null;
  resetLabel: string;
}

/** A read that failed, with the two ways out: try again, or leave the profile that broke. */
export function ErrorPanel({ title, message, retryLabel, onRetry, onResetProfile, resetLabel }: ErrorPanelProps) {
  return (
    <div className="card error-panel" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="error-panel__actions">
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          {retryLabel}
        </button>
        {onResetProfile && (
          <button type="button" className="btn" onClick={onResetProfile}>
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}

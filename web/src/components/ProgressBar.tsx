export interface ProgressBarProps {
  value: number;
  max: number;
  /** Accessible name; with no name the bar is decorative (an equivalent text sits next to it). */
  label?: string;
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const ratio = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  const fill = <span className="progress__fill" style={{ width: `${ratio}%` }} />;
  if (label === undefined) {
    return (
      <span className="progress" aria-hidden="true">
        {fill}
      </span>
    );
  }
  return (
    <span className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      {fill}
    </span>
  );
}

export interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const ratio = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <span className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span className="progress__fill" style={{ width: `${ratio}%` }} />
    </span>
  );
}

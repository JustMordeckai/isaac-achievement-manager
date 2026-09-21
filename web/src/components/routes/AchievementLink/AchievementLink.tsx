export interface AchievementLinkProps {
  id: number;
  name: string;
  onOpen(id: number): void;
}

/** Name of an achievement, in English, that opens its card. */
export function AchievementLink({ id, name, onOpen }: AchievementLinkProps) {
  return (
    <button type="button" className="link-button" onClick={() => onOpen(id)}>
      <span lang="en">{name}</span>
    </button>
  );
}

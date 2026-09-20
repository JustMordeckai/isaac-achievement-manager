/**
 * The few inline icons of the interface. They are drawn with `currentColor` so they follow the
 * text colour of the button that holds them, and they carry no title: the button around them
 * always has its own accessible name. The flags are square, like every other header button.
 */

export function RefreshIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" focusable="false">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13.6 2.2v3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PowerIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" focusable="false">
      <path d="M8 2v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.6 4.4a4.8 4.8 0 1 0 6.8 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M13 9.8A5.6 5.6 0 0 1 6.2 3a5.6 5.6 0 1 0 6.8 6.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg className="icon icon--chevron" viewBox="0 0 8 8" width="8" height="8" fill="none" aria-hidden="true" focusable="false">
      <path d="M1 3l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Union Jack, simplified to the flat bands a 20 pixel square can show. */
function FlagEn({ size = 20 }: { size?: number }) {
  return (
    <svg className="flag" viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="20" height="20" fill="#012169" />
      <path d="M0 0 20 20M20 0 0 20" stroke="#ffffff" strokeWidth="4" />
      <path d="M0 0 20 20M20 0 0 20" stroke="#c8102e" strokeWidth="2" />
      <path d="M10 0V20M0 10H20" stroke="#ffffff" strokeWidth="6.6" />
      <path d="M10 0V20M0 10H20" stroke="#c8102e" strokeWidth="4" />
    </svg>
  );
}

function FlagFr({ size = 20 }: { size?: number }) {
  return (
    <svg className="flag" viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="6.67" height="20" fill="#002654" />
      <rect x="6.67" width="6.66" height="20" fill="#ffffff" />
      <rect x="13.33" width="6.67" height="20" fill="#ce1126" />
    </svg>
  );
}

export const FLAGS = { en: FlagEn, fr: FlagFr };

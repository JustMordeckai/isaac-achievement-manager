/**
 * The few inline icons of the interface. They are drawn with `currentColor` so they follow the
 * text colour of the button that holds them, and they carry no title: the button around them
 * always has its own accessible name.
 */

export function RefreshIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
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

/** Union Jack, simplified to the flat bands a 20 pixel wide flag can show. */
function FlagEn() {
  return (
    <svg className="flag" viewBox="0 0 60 30" width="20" height="10" aria-hidden="true" focusable="false">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0 60 30M60 0 0 30" stroke="#ffffff" strokeWidth="6" />
      <path d="M0 0 60 30M60 0 0 30" stroke="#c8102e" strokeWidth="3" />
      <path d="M30 0V30M0 15H60" stroke="#ffffff" strokeWidth="10" />
      <path d="M30 0V30M0 15H60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  );
}

function FlagFr() {
  return (
    <svg className="flag" viewBox="0 0 60 30" width="20" height="10" aria-hidden="true" focusable="false">
      <rect width="20" height="30" fill="#002654" />
      <rect x="20" width="20" height="30" fill="#ffffff" />
      <rect x="40" width="20" height="30" fill="#ce1126" />
    </svg>
  );
}

export const FLAGS = { en: FlagEn, fr: FlagFr };

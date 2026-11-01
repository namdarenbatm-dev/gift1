import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  flag: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c.6-3.4 3.2-5.2 6.5-5.2s5.9 1.8 6.5 5.2M16 5.2a3.2 3.2 0 010 5.8M18 14.8c2 .6 3.2 2.3 3.5 5.2" />
    </>
  ),
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  wallet: <path d="M3 7a2 2 0 012-2h13v4M3 7v11a2 2 0 002 2h15v-4M3 7h16a2 2 0 012 2v3h-5a2 2 0 000 4h5" />,
  chart: <path d="M4 20V10m6 10V4m6 16v-8m5 8H3" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  download: <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />,
  upload: <path d="M12 20V9m0 0l-4 4m4-4l4 4M5 4h14" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  bell: <path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15zM10 21h4" />,
  offline: <path d="M3 3l18 18M8.5 8.8A10 10 0 003 12m4.5 3a6 6 0 013.6-1.9M12 19h.01M15.5 12.6A10 10 0 0121 12M12 8a14 14 0 018.5 3" />,
  back: <path d="M9 5l7 7-7 7" />,
  out: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />,
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M8 5l11 7-11 7z" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </>
  ),
  alert: <path d="M12 4l9.5 16h-19zM12 10v4m0 3h.01" />,
  phone: <path d="M6 3h4l2 5-2.5 1.5a11 11 0 005 5L16 12l5 2v4a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

import type { SVGProps } from "react";

const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  restaurants: "M3 21h18 M5 21V7l7-4 7 4v14 M9 21v-5h6v5 M8 9h1 M15 9h1 M8 12h1 M15 12h1",
  provisioning: "M12 3v6 M9 6h6 M5 12h14v9H5z M8 16h8",
  details: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 12h8 M8 16h8",
  settings: "M9 4l1-2h4l1 2 2 1 2-.1 2 3-1 2v4l1 2-2 3-2-.1-2 1-1 2h-4l-1-2-2-1-2 .1-2-3 1-2v-4L2 8l2-3L6 5z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  check: "M5 12l4 4L19 6",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  logout: "M9 4H4v16h5 M13 8l4 4-4 4 M8 12h13",
  alert: "M12 3L2 21h20z M12 9v5 M12 17v.1",
  close: "M6 6l12 12 M6 18L18 6",
  chevron: "M9 5l7 7-7 7",
  chevronDown: "M6 9l6 6 6-6",
  plus: "M12 5v14 M5 12h14",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  mail: "M3 5h18v14H3z M3 5l9 8 9-8",
  refresh: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 2 M18 18A8 8 0 0 1 5 16",
  external: "M14 3h7v7 M10 14L21 3 M21 14v7H3V3h7",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2",
  copy: "M9 9h12v12H9z M15 9V3H3v12h6",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = "", ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`icon ${className}`.trim()} aria-hidden="true" focusable="false" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}

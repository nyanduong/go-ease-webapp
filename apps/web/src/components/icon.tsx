import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'trips'
  | 'account'
  | 'compass'
  | 'search'
  | 'arrow'
  | 'back'
  | 'chevron'
  | 'plus'
  | 'pin'
  | 'clock'
  | 'file'
  | 'calendar'
  | 'check'
  | 'walk'
  | 'info'
  | 'more';
const paths: Record<IconName, string[]> = {
  home: ['m3 10 9-7 9 7', 'M5 9v12h5v-7h4v7h5V9'],
  trips: ['M8 6V4h8v2', 'M3 7h18v14H3z', 'M3 12c6 4 12 4 18 0', 'M10 13h4v3h-4z'],
  account: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M4 21v-2a8 8 0 0 1 16 0v2'],
  compass: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'm16 8-3 5-5 3 3-5z'],
  search: ['M20 20l-5-5', 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0'],
  arrow: ['M4 12h16', 'm13 5 7 7-7 7'],
  back: ['M20 12H4', 'm11 5-7 7 7 7'],
  chevron: ['m9 5 7 7-7 7'],
  plus: ['M12 4v16', 'M4 12h16'],
  pin: ['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  clock: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 6v6l4 2'],
  file: ['M5 2h9l5 5v15H5z', 'M14 2v6h5', 'M8 12h8M8 16h6'],
  calendar: ['M3 5h18v16H3z', 'M3 10h18M7 2v6M17 2v6'],
  check: ['m5 12 4 4L19 6'],
  walk: ['M13 3h.01', 'm10 8 3-2 3 5 4 2', 'm13 6-2 8 5 3 1 5', 'm11 14-5 8', 'm10 8-3 5'],
  info: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 11v6M12 7h.01'],
  more: ['M12 5h.01M12 12h.01M12 19h.01'],
};
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name].map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}

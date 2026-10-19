import type { SVGProps } from 'react';

export type IconName = 'home' | 'trips' | 'account' | 'compass';
const paths: Record<IconName, string[]> = {
  home: ['m3 10 9-7 9 7', 'M5 9v12h5v-7h4v7h5V9'],
  trips: ['M8 6V4h8v2', 'M3 7h18v14H3z', 'M3 12c6 4 12 4 18 0', 'M10 13h4v3h-4z'],
  account: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M4 21v-2a8 8 0 0 1 16 0v2'],
  compass: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'm16 8-3 5-5 3 3-5z'],
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

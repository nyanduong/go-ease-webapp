// Vite replaces DEV with false in every production build, even if the flag is set.
export const offlineDev = import.meta.env.DEV && import.meta.env.VITE_DEV_OFFLINE === 'true';

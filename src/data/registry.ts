import type { LatLng } from '../core/types';
import type { TransitProvider } from './provider';
import { createDemoProvider } from './providers/demo';
import { createLyonProvider } from './providers/lyon';

/**
 * Everything needed to rebuild a provider, including from the background
 * task where no React state exists. Persisted with the active trip.
 */
export type ProviderRef = { id: 'demo'; center: LatLng } | { id: 'lyon' };

/** data.grandlyon.com account, from .env.local (see README). */
const lyonCredentials = () => {
  const username = process.env.EXPO_PUBLIC_GRANDLYON_USER;
  const password = process.env.EXPO_PUBLIC_GRANDLYON_PASSWORD;
  return username && password ? { username, password } : null;
};

export const lyonAvailable = () => lyonCredentials() !== null;

export function getProvider(ref: ProviderRef): TransitProvider {
  switch (ref.id) {
    case 'demo':
      return createDemoProvider(ref.center);
    case 'lyon': {
      const creds = lyonCredentials();
      if (!creds) throw new Error('Missing EXPO_PUBLIC_GRANDLYON_USER / EXPO_PUBLIC_GRANDLYON_PASSWORD');
      return createLyonProvider(creds);
    }
  }
}

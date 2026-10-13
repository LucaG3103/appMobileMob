import type { LatLng } from '../core/types';
import type { TransitProvider } from './provider';
import { createDemoProvider } from './providers/demo';

/**
 * Everything needed to rebuild a provider, including from the background
 * task where no React state exists. Persisted with the active trip.
 */
export type ProviderRef = { id: 'demo'; center: LatLng };
// Add cities here, e.g. { id: 'roma' } backed by createGtfsRealtimeProvider.

export function getProvider(ref: ProviderRef): TransitProvider {
  switch (ref.id) {
    case 'demo':
      return createDemoProvider(ref.center);
  }
}

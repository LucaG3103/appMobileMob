import * as Location from 'expo-location';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LatLng } from '../core/types';
import type { TransitProvider } from '../data/provider';
import { getProvider, type ProviderRef } from '../data/registry';

/** Fallback when location is denied: Roma Termini. */
const DEFAULT_CENTER: LatLng = { latitude: 41.9009, longitude: 12.5018 };

interface TransitCtx {
  ref: ProviderRef;
  provider: TransitProvider;
  userLocation: LatLng | null;
}

const Ctx = createContext<TransitCtx | null>(null);

export function TransitProvider({ children }: { children: ReactNode }) {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [center, setCenter] = useState<LatLng>(DEFAULT_CENTER);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;
      const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const here = { latitude: first.coords.latitude, longitude: first.coords.longitude };
      setCenter(here); // the demo lines are built around the user
      setUserLocation(here);
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 15 },
        (l) => setUserLocation({ latitude: l.coords.latitude, longitude: l.coords.longitude }),
      );
    })().catch(() => {});
    return () => sub?.remove();
  }, []);

  const value = useMemo(() => {
    const ref: ProviderRef = { id: 'demo', center };
    return { ref, provider: getProvider(ref), userLocation };
  }, [center, userLocation]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTransit(): TransitCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTransit outside TransitProvider');
  return v;
}

/** Re-run an async loader every `everyMs`. */
export function usePolling<T>(load: () => Promise<T>, everyMs: number, deps: unknown[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => load().then((v) => alive && setValue(v)).catch(() => {});
    run();
    const id = setInterval(run, everyMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

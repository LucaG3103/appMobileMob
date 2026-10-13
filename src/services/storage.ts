import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, type ActiveTrip, type TripSettings } from '../core/tripMachine';
import type { ProviderRef } from '../data/registry';

const TRIP_KEY = 'activeTrip/v1';
const SETTINGS_KEY = 'settings/v1';
const FAVORITES_KEY = 'favorites/v1';

export interface StoredTrip {
  provider: ProviderRef;
  trip: ActiveTrip;
}

export interface FavoriteStop {
  providerId: string;
  stopId: string;
  name: string;
}

async function read<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export const loadTrip = () => read<StoredTrip>(TRIP_KEY);
export const saveTrip = (t: StoredTrip) => AsyncStorage.setItem(TRIP_KEY, JSON.stringify(t));
export const clearTrip = () => AsyncStorage.removeItem(TRIP_KEY);

export async function loadSettings(): Promise<TripSettings> {
  return { ...DEFAULT_SETTINGS, ...(await read<Partial<TripSettings>>(SETTINGS_KEY)) };
}
export const saveSettings = (s: TripSettings) => AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

export const loadFavorites = async () => (await read<FavoriteStop[]>(FAVORITES_KEY)) ?? [];
export async function toggleFavorite(f: FavoriteStop): Promise<FavoriteStop[]> {
  const all = await loadFavorites();
  const exists = all.some((x) => x.providerId === f.providerId && x.stopId === f.stopId);
  const next = exists ? all.filter((x) => !(x.providerId === f.providerId && x.stopId === f.stopId)) : [...all, f];
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  return next;
}

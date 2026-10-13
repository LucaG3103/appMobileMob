import { distanceMeters } from '../../core/geo';
import type { Arrival, Stop, TripStop, VehicleState } from '../../core/types';
import { alertsFromFeed, fetchFeed, vehicleStatesFromFeeds } from '../gtfsRealtime';
import type { TransitProvider } from '../provider';

/**
 * Timetable data (stops, routes, which stops each trip visits). A full GTFS
 * zip is too large to parse on the phone, so this is expected to be served
 * by a small backend or a pre-built JSON per city. Not implemented yet:
 * it depends on which city Luca picks.
 */
export interface StaticSource {
  stops(): Promise<Stop[]>;
  tripStops(tripId: string): Promise<TripStop[]>;
  trip(tripId: string): Promise<{ routeId: string; routeShortName: string; headsign: string } | null>;
}

export interface GtfsRealtimeConfig {
  id: string;
  name: string;
  vehiclePositionsUrl: string;
  tripUpdatesUrl: string;
  alertsUrl?: string;
  staticSource: StaticSource;
  /** Feeds refresh every ~30 s upstream; no point fetching more often. */
  cacheMs?: number;
}

export function createGtfsRealtimeProvider(cfg: GtfsRealtimeConfig): TransitProvider {
  const cacheMs = cfg.cacheMs ?? 15_000;
  let cache: { at: number; states: Map<string, VehicleState> } | null = null;

  async function states() {
    const now = Date.now();
    if (cache && now - cache.at < cacheMs) return cache.states;
    const [positions, updates] = await Promise.all([
      fetchFeed(cfg.vehiclePositionsUrl),
      fetchFeed(cfg.tripUpdatesUrl).catch(() => null),
    ]);
    cache = { at: now, states: vehicleStatesFromFeeds(positions, updates, now) };
    return cache.states;
  }

  return {
    id: cfg.id,
    name: cfg.name,

    async nearbyStops(center, radius) {
      return (await cfg.staticSource.stops())
        .filter((s) => distanceMeters(center, s) <= radius)
        .sort((a, b) => distanceMeters(center, a) - distanceMeters(center, b));
    },

    async arrivals(stopId) {
      const out: Arrival[] = [];
      for (const v of (await states()).values()) {
        const eta = v.etaByStopId[stopId];
        if (eta === undefined || eta < 0) continue;
        const trip = await cfg.staticSource.trip(v.tripId);
        if (!trip) continue;
        out.push({ ...trip, tripId: v.tripId, vehicleId: v.vehicleId, etaSeconds: eta, realtime: true, occupancy: v.occupancy });
      }
      return out.sort((a, b) => a.etaSeconds - b.etaSeconds);
    },

    tripStops: (tripId) => cfg.staticSource.tripStops(tripId),

    async vehicle(tripId) {
      return (await states()).get(tripId) ?? null;
    },

    async routeVehicles(routeId) {
      const out: VehicleState[] = [];
      for (const v of (await states()).values()) {
        if ((await cfg.staticSource.trip(v.tripId))?.routeId === routeId) out.push(v);
      }
      return out;
    },

    async alerts({ routeId, stopId }) {
      if (!cfg.alertsUrl) return [];
      const all = alertsFromFeed(await fetchFeed(cfg.alertsUrl));
      return all.filter(
        (a) => (!routeId || a.routeIds.includes(routeId)) && (!stopId || a.stopIds.includes(stopId) || a.stopIds.length === 0),
      );
    },
  };
}

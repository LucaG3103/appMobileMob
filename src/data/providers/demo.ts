import { distanceMeters, lerp } from '../../core/geo';
import type { Arrival, LatLng, Stop, TripStop, VehicleState } from '../../core/types';
import type { TransitProvider } from '../provider';

/**
 * Simulated line so the whole flow (alerts, boarding, get-off alert) can be
 * tried without a city feed. Two lines cross at the given centre; a vehicle
 * leaves each terminus every HEADWAY seconds and moves at constant speed.
 */
const HEADWAY_S = 6 * 60;
const SECONDS_PER_STOP = 90;
const STOP_SPACING_DEG = 0.004; // ~450 m

interface Line {
  routeId: string;
  shortName: string;
  headsign: string;
  stops: TripStop[];
}

export function createDemoProvider(center: LatLng, clock: () => number = Date.now): TransitProvider {
  const line = (routeId: string, shortName: string, headsign: string, dLat: number, dLon: number): Line => ({
    routeId,
    shortName,
    headsign,
    stops: Array.from({ length: 10 }, (_, i) => ({
      id: `${routeId}-${i}`,
      name: `${shortName} · Fermata ${i + 1}`,
      sequence: i + 1,
      latitude: center.latitude + (i - 4) * dLat,
      longitude: center.longitude + (i - 4) * dLon,
    })),
  });
  const lines = [
    line('D1', '64', 'Stazione', STOP_SPACING_DEG, 0),
    line('D2', '8', 'Centro', 0, STOP_SPACING_DEG),
  ];

  const nowS = () => clock() / 1000;
  const tripDuration = (l: Line) => (l.stops.length - 1) * SECONDS_PER_STOP;

  // tripId = `${routeId}:${departureEpochSeconds}`
  const parseTrip = (tripId: string) => {
    const [routeId, dep] = tripId.split(':');
    const l = lines.find((x) => x.routeId === routeId);
    if (!l) throw new Error(`Unknown demo trip ${tripId}`);
    return { line: l, departure: Number(dep) };
  };

  const stateOf = (l: Line, departure: number): VehicleState | null => {
    const elapsed = nowS() - departure;
    if (elapsed < 0 || elapsed > tripDuration(l)) return null;
    const leg = Math.min(Math.floor(elapsed / SECONDS_PER_STOP), l.stops.length - 2);
    const t = (elapsed - leg * SECONDS_PER_STOP) / SECONDS_PER_STOP;
    const etaByStopId: Record<string, number> = {};
    l.stops.forEach((s, i) => (etaByStopId[s.id] = Math.round(i * SECONDS_PER_STOP - elapsed)));
    return {
      tripId: `${l.routeId}:${departure}`,
      vehicleId: `${l.shortName}-${departure % 1000}`,
      position: lerp(l.stops[leg], l.stops[leg + 1], t),
      currentStopSequence: leg + 2,
      etaByStopId,
      occupancy: (['many_seats', 'few_seats', 'standing'] as const)[departure % 3],
      timestamp: clock(),
    };
  };

  /** Departures whose vehicle is on the road now or within the next hour. */
  const departures = (l: Line) => {
    const first = Math.floor((nowS() - tripDuration(l)) / HEADWAY_S) * HEADWAY_S;
    return Array.from({ length: Math.ceil((tripDuration(l) + 3600) / HEADWAY_S) }, (_, i) => first + i * HEADWAY_S);
  };

  return {
    id: 'demo',
    name: 'Demo (simulato)',

    async nearbyStops(c, radius) {
      return lines
        .flatMap((l) => l.stops)
        .filter((s) => distanceMeters(c, s) <= radius)
        .sort((a, b) => distanceMeters(c, a) - distanceMeters(c, b))
        .map(({ sequence: _s, ...stop }): Stop => stop);
    },

    async arrivals(stopId) {
      const l = lines.find((x) => x.stops.some((s) => s.id === stopId));
      if (!l) return [];
      const idx = l.stops.findIndex((s) => s.id === stopId);
      return departures(l)
        .map((dep): Arrival => ({
          routeId: l.routeId,
          routeShortName: l.shortName,
          headsign: l.headsign,
          tripId: `${l.routeId}:${dep}`,
          etaSeconds: Math.round(dep + idx * SECONDS_PER_STOP - nowS()),
          realtime: true,
          occupancy: (['many_seats', 'few_seats', 'standing'] as const)[dep % 3],
        }))
        .filter((a) => a.etaSeconds >= 0)
        .sort((a, b) => a.etaSeconds - b.etaSeconds);
    },

    async tripStops(tripId) {
      return parseTrip(tripId).line.stops;
    },

    async vehicle(tripId) {
      const { line: l, departure } = parseTrip(tripId);
      return stateOf(l, departure);
    },

    async routeVehicles(routeId) {
      const l = lines.find((x) => x.routeId === routeId);
      if (!l) return [];
      return departures(l)
        .map((d) => stateOf(l, d))
        .filter((v): v is VehicleState => v !== null);
    },

    async alerts() {
      return [];
    },
  };
}

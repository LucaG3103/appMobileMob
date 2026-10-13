import type { Arrival, LatLng, ServiceAlert, Stop, TripStop, VehicleState } from '../core/types';

/**
 * One source of transit data (a city/operator, or the demo simulator).
 * Add a city by implementing this and registering it in `registry.ts`.
 */
export interface TransitProvider {
  id: string;
  name: string;
  nearbyStops(center: LatLng, radiusMeters: number): Promise<Stop[]>;
  /** Upcoming vehicles at a stop, soonest first. */
  arrivals(stopId: string): Promise<Arrival[]>;
  /** Ordered stops of a trip. */
  tripStops(tripId: string): Promise<TripStop[]>;
  /** Live state of the vehicle serving a trip, or null if it is not reporting. */
  vehicle(tripId: string): Promise<VehicleState | null>;
  /** All live vehicles of a route, for the map. */
  routeVehicles(routeId: string): Promise<VehicleState[]>;
  /** Service alerts (strikes, diversions) for a route or stop. */
  alerts(filter: { routeId?: string; stopId?: string }): Promise<ServiceAlert[]>;
}

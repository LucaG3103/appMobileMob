export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Stop extends LatLng {
  id: string;
  name: string;
}

/** A stop as visited by a specific trip, in order. */
export interface TripStop extends Stop {
  sequence: number;
}

export interface Arrival {
  routeId: string;
  routeShortName: string;
  headsign: string;
  tripId: string;
  vehicleId?: string;
  /** Seconds until the vehicle reaches the stop (negative = already passed). */
  etaSeconds: number;
  /** True when the ETA comes from a realtime feed, false when it is only the timetable. */
  realtime: boolean;
  /** GTFS-RT occupancy status, when the feed provides it. */
  occupancy?: Occupancy;
}

export type Occupancy = 'empty' | 'many_seats' | 'few_seats' | 'standing' | 'full' | 'unknown';

export interface VehicleState {
  tripId: string;
  vehicleId?: string;
  /** Missing when only predictions are published (e.g. metro). */
  position?: LatLng;
  /** stop_sequence of the stop the vehicle is at or heading to. */
  currentStopSequence?: number;
  /** Predicted seconds until the vehicle reaches each stop of its trip, by stop id. */
  etaByStopId: Record<string, number>;
  occupancy?: Occupancy;
  timestamp: number;
}

export interface ServiceAlert {
  id: string;
  header: string;
  description?: string;
  routeIds: string[];
  stopIds: string[];
}

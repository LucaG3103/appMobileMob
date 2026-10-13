import { distanceMeters } from './geo';
import type { LatLng, TripStop, VehicleState } from './types';

/**
 * Pure state machine for one tracked journey:
 *   waiting  -> the user is at (or walking to) the boarding stop
 *   onboard  -> we detected the user travelling with the vehicle
 *   alerted  -> the "get off at the next stop" alert has fired
 *   done     -> the user reached the destination (or cancelled)
 *
 * It has no I/O so it can run in the background task, in the foreground
 * poller and in unit tests with the same behaviour.
 */
export type TripPhase = 'waiting' | 'onboard' | 'alerted' | 'done';

export type TripEvent =
  | { type: 'approaching'; etaSeconds: number }
  | { type: 'missed' }
  | { type: 'boarded' }
  | { type: 'prepare_to_alight'; stopsLeft: number }
  | { type: 'arrived' };

export interface TripSettings {
  /** Fire the "vehicle is coming" alert when ETA drops to this (default 120 s). */
  approachSeconds: number;
  /** Fire the "get off" alert this many stops before the destination (default 1). */
  alightStopsBefore: number;
}

export const DEFAULT_SETTINGS: TripSettings = { approachSeconds: 120, alightStopsBefore: 1 };

export interface ActiveTrip {
  providerId: string;
  routeId: string;
  routeShortName: string;
  headsign: string;
  tripId: string;
  /** Ordered stops of the trip from boarding to destination (inclusive). */
  stops: TripStop[];
  phase: TripPhase;
  settings: TripSettings;
  approachNotified: boolean;
  /** Consecutive samples in which the user looked like they were on the vehicle. */
  boardingHits: number;
  startedAt: number;
}

export interface TripSample {
  now: number;
  user: LatLng | null;
  vehicle: VehicleState | null;
}

/** User within this distance of the vehicle counts as "with the vehicle". */
export const BOARD_RADIUS_M = 60;
/** User must have left the boarding stop by at least this much. */
export const LEFT_STOP_RADIUS_M = 100;
/** Samples needed to confirm boarding (avoids a bus passing by triggering it). */
export const BOARD_HITS_REQUIRED = 2;
/** Being this close to a stop counts as being at it. */
export const AT_STOP_RADIUS_M = 80;
/** Vehicle ETA below this (it already left) while user is still at the stop = missed. */
const MISSED_AFTER_SECONDS = -45;

export function createTrip(
  init: Omit<ActiveTrip, 'phase' | 'approachNotified' | 'boardingHits' | 'startedAt' | 'settings'> & {
    settings?: Partial<TripSettings>;
    now: number;
  },
): ActiveTrip {
  if (init.stops.length < 2) throw new Error('A trip needs a boarding and a destination stop');
  const { now, settings, ...rest } = init;
  return {
    ...rest,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    phase: 'waiting',
    approachNotified: false,
    boardingHits: 0,
    startedAt: now,
  };
}

export const boardStop = (t: ActiveTrip) => t.stops[0];
export const destinationStop = (t: ActiveTrip) => t.stops[t.stops.length - 1];

/** The stop at which the "get off soon" alert fires (never before the boarding stop). */
export function alertStop(t: ActiveTrip): TripStop {
  const idx = Math.max(0, t.stops.length - 1 - t.settings.alightStopsBefore);
  return t.stops[idx];
}

export function advanceTrip(trip: ActiveTrip, s: TripSample): { trip: ActiveTrip; events: TripEvent[] } {
  const events: TripEvent[] = [];
  let next = { ...trip };

  if (next.phase === 'waiting') {
    const eta = s.vehicle?.etaByStopId[boardStop(next).id];

    if (!next.approachNotified && eta !== undefined && eta >= 0 && eta <= next.settings.approachSeconds) {
      next.approachNotified = true;
      events.push({ type: 'approaching', etaSeconds: eta });
    }

    if (s.user && s.vehicle) {
      const withVehicle = distanceMeters(s.user, s.vehicle.position) <= BOARD_RADIUS_M;
      const leftStop = distanceMeters(s.user, boardStop(next)) >= LEFT_STOP_RADIUS_M;
      next.boardingHits = withVehicle && leftStop ? next.boardingHits + 1 : 0;

      if (next.boardingHits >= BOARD_HITS_REQUIRED) {
        next.phase = 'onboard';
        events.push({ type: 'boarded' });
      } else if (
        eta !== undefined &&
        eta < MISSED_AFTER_SECONDS &&
        distanceMeters(s.user, boardStop(next)) <= AT_STOP_RADIUS_M
      ) {
        // Vehicle left without the user: caller should re-target the next vehicle.
        events.push({ type: 'missed' });
      }
    }
  }

  if (next.phase === 'onboard') {
    const target = alertStop(next);
    const stopsLeft = next.stops.length - 1 - next.stops.indexOf(target);
    const userAtTarget = s.user !== null && distanceMeters(s.user, target) <= AT_STOP_RADIUS_M;
    const vehiclePastTarget =
      s.vehicle?.currentStopSequence !== undefined && s.vehicle.currentStopSequence > target.sequence;
    // If the destination is the very next stop after boarding, alert right away.
    const immediate = target.id === boardStop(next).id;

    if (userAtTarget || vehiclePastTarget || immediate) {
      next.phase = 'alerted';
      events.push({ type: 'prepare_to_alight', stopsLeft });
    }
  }

  if (next.phase === 'alerted' && s.user && distanceMeters(s.user, destinationStop(next)) <= AT_STOP_RADIUS_M) {
    next.phase = 'done';
    events.push({ type: 'arrived' });
  }

  return { trip: next, events };
}

/** The part of a trip between boarding and destination, or null if the order is wrong. */
export function sliceTrip(all: TripStop[], boardStopId: string, destStopId: string): TripStop[] | null {
  const from = all.findIndex((s) => s.id === boardStopId);
  const to = all.findIndex((s) => s.id === destStopId);
  return from >= 0 && to > from ? all.slice(from, to + 1) : null;
}

/** Point the trip at another vehicle of the same line (after a missed one). */
export function retarget(trip: ActiveTrip, tripId: string, stops: TripStop[]): ActiveTrip {
  return { ...trip, tripId, stops, phase: 'waiting', approachNotified: false, boardingHits: 0 };
}

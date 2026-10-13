import { distanceMeters } from '../../core/geo';
import type { Arrival, Stop, TripStop, VehicleState } from '../../core/types';
import type { TransitProvider } from '../provider';
import {
  alertsFromSituationExchange,
  journeysFromEstimatedTimetables,
  vehiclesFromMonitoring,
  type SiriJourney,
} from '../siriLite';
import linesJson from '../lyon/lines.json';
import stopsJson from '../lyon/stops.json';

/**
 * TCL (Lyon) from data.grandlyon.com: SIRI Lite realtime + stops/lines
 * pre-extracted from the GTFS by scripts/build_lyon_static.py.
 * The realtime endpoints need a (free) data.grandlyon.com account.
 */
const BASE = 'https://data.grandlyon.com/siri-lite/2.0';
const CACHE_MS = 20_000;

const stops = stopsJson as Stop[];
const lines = linesJson as Record<string, { shortName: string; color: string }>;
const stopById = new Map(stops.map((s) => [s.id, s]));

/** "TCL:Line::C3:" -> "C3", then the GTFS short name if we have one. */
function lineName(lineRef: string): { routeId: string; routeShortName: string } {
  const parts = lineRef.split(':').filter(Boolean);
  const routeId = parts.at(-1) ?? lineRef;
  return { routeId, routeShortName: lines[routeId]?.shortName ?? routeId };
}

export interface LyonCredentials {
  username: string;
  password: string;
}

export function createLyonProvider(creds: LyonCredentials): TransitProvider {
  const auth = 'Basic ' + btoa(`${creds.username}:${creds.password}`);
  let cache: { at: number; journeys: Map<string, SiriJourney>; vehicles: Map<string, VehicleState> } | null = null;

  async function get(path: string) {
    const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`TCL ${path}: HTTP ${res.status}`);
    return res.json();
  }

  async function snapshot() {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_MS) return cache;
    const [et, vm] = await Promise.all([get('estimated-timetables.json'), get('vehicle-monitoring.json').catch(() => null)]);
    const journeys = new Map(journeysFromEstimatedTimetables(et, now).map((j) => [j.journeyId, j]));
    const vehicles = vm ? vehiclesFromMonitoring(vm, journeys, now) : new Map<string, VehicleState>();
    cache = { at: now, journeys, vehicles };
    return cache;
  }

  /** Vehicle from VM if it reports GPS, else predictions only (metro). */
  function stateFor(id: string, snap: Awaited<ReturnType<typeof snapshot>>): VehicleState | null {
    const v = snap.vehicles.get(id);
    if (v) return v;
    const j = snap.journeys.get(id);
    if (!j) return null;
    const etaByStopId: Record<string, number> = {};
    for (const c of j.calls) etaByStopId[c.stopCode] = c.etaSeconds;
    const next = j.calls.find((c) => c.etaSeconds >= 0);
    return { tripId: id, etaByStopId, currentStopSequence: next?.order, timestamp: snap.at };
  }

  return {
    id: 'lyon',
    name: 'TCL Lyon',

    async nearbyStops(center, radius) {
      return stops
        .filter((s) => distanceMeters(center, s) <= radius)
        .sort((a, b) => distanceMeters(center, a) - distanceMeters(center, b));
    },

    async arrivals(stopId) {
      const out: Arrival[] = [];
      for (const j of (await snapshot()).journeys.values()) {
        const call = j.calls.find((c) => c.stopCode === stopId);
        if (!call || call.etaSeconds < 0) continue;
        out.push({
          ...lineName(j.lineRef),
          headsign: j.destinationName ?? '',
          tripId: j.journeyId,
          etaSeconds: call.etaSeconds,
          realtime: true,
        });
      }
      return out.sort((a, b) => a.etaSeconds - b.etaSeconds);
    },

    async tripStops(tripId) {
      const j = (await snapshot()).journeys.get(tripId);
      return (j?.calls ?? []).flatMap((c): TripStop[] => {
        const s = stopById.get(c.stopCode);
        return s ? [{ ...s, sequence: c.order }] : [];
      });
    },

    async vehicle(tripId) {
      return stateFor(tripId, await snapshot());
    },

    async routeVehicles(routeId) {
      const snap = await snapshot();
      return [...snap.journeys.values()]
        .filter((j) => lineName(j.lineRef).routeId === routeId)
        .map((j) => stateFor(j.journeyId, snap))
        .filter((v): v is VehicleState => v?.position !== undefined);
    },

    async alerts({ routeId, stopId }) {
      const all = alertsFromSituationExchange(await get('situation-exchange.json'));
      return all.filter(
        (a) =>
          (!routeId || a.routeIds.some((r) => lineName(r).routeId === routeId)) &&
          (!stopId || a.stopIds.length === 0 || a.stopIds.includes(stopId)),
      );
    },
  };
}

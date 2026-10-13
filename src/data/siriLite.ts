import type { ServiceAlert, VehicleState } from '../core/types';

/**
 * SIRI Lite (JSON) reader, the realtime format used in France (e.g. TCL Lyon
 * on data.grandlyon.com). Written against the SIRI Lite profile; field shapes
 * vary slightly between producers (refs as strings or { value }), so every
 * access is tolerant. Not yet checked against a live TCL response.
 */
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const ref = (v: Json): string | undefined =>
  v == null ? undefined : typeof v === 'string' ? v : typeof v.value === 'string' ? v.value : undefined;

const text = (v: Json): string | undefined => {
  const first = Array.isArray(v) ? v[0] : v;
  return first == null ? undefined : typeof first === 'string' ? first : first.value;
};

const delivery = (doc: Json, key: string): Json[] => {
  const d = doc?.Siri?.ServiceDelivery?.[key];
  return Array.isArray(d) ? d : d ? [d] : [];
};

const secondsUntil = (iso: string | undefined, nowMs: number) =>
  iso ? Math.round((Date.parse(iso) - nowMs) / 1000) : undefined;

/** Journey id shared by vehicle-monitoring and estimated-timetables. */
export function journeyId(j: Json): string | undefined {
  return ref(j?.FramedVehicleJourneyRef?.DatedVehicleJourneyRef) ?? ref(j?.DatedVehicleJourneyRef);
}

/**
 * Stop refs look like "ActIV:StopPoint:BP:1234:LOC" or "TCL:StopPoint:Q:1234:".
 * GTFS stop_ids from the same producer usually carry only the numeric code,
 * so match on that. To verify against real data.
 */
export function stopCode(stopRef: string): string {
  const parts = stopRef.split(':').filter(Boolean);
  const numeric = parts.filter((p) => /^\d+$/.test(p));
  return numeric.at(-1) ?? parts.at(-1) ?? stopRef;
}

export interface SiriJourney {
  journeyId: string;
  lineRef: string;
  destinationName?: string;
  /** Remaining calls in order: stop code, order, seconds until arrival. */
  calls: { stopCode: string; order: number; etaSeconds: number }[];
}

export function journeysFromEstimatedTimetables(doc: Json, nowMs: number): SiriJourney[] {
  const out: SiriJourney[] = [];
  for (const d of delivery(doc, 'EstimatedTimetableDelivery')) {
    for (const frame of d.EstimatedJourneyVersionFrame ?? []) {
      for (const j of frame.EstimatedVehicleJourney ?? []) {
        const id = journeyId(j);
        const lineRef = ref(j.LineRef);
        if (!id || !lineRef) continue;
        const rawCalls = j.EstimatedCalls?.EstimatedCall ?? [];
        const calls = rawCalls.flatMap((c: Json, i: number) => {
          const stop = ref(c.StopPointRef);
          const eta = secondsUntil(
            c.ExpectedArrivalTime ?? c.ExpectedDepartureTime ?? c.AimedArrivalTime ?? c.AimedDepartureTime,
            nowMs,
          );
          return stop && eta !== undefined ? [{ stopCode: stopCode(stop), order: c.Order ?? i + 1, etaSeconds: eta }] : [];
        });
        out.push({ journeyId: id, lineRef, destinationName: text(j.DestinationName), calls });
      }
    }
  }
  return out;
}

export function vehiclesFromMonitoring(
  doc: Json,
  journeys: Map<string, SiriJourney>,
  nowMs: number,
): Map<string, VehicleState> {
  const out = new Map<string, VehicleState>();
  for (const d of delivery(doc, 'VehicleMonitoringDelivery')) {
    for (const a of d.VehicleActivity ?? []) {
      const mvj = a.MonitoredVehicleJourney;
      const id = journeyId(mvj);
      const loc = mvj?.VehicleLocation;
      if (!id || loc?.Latitude == null || loc?.Longitude == null) continue;
      const j = journeys.get(id);
      const etaByStopId: Record<string, number> = {};
      for (const c of j?.calls ?? []) etaByStopId[c.stopCode] = c.etaSeconds;
      const monitored = mvj.MonitoredCall;
      if (monitored) {
        const stop = ref(monitored.StopPointRef);
        const eta = secondsUntil(monitored.ExpectedArrivalTime ?? monitored.ExpectedDepartureTime, nowMs);
        if (stop && eta !== undefined) etaByStopId[stopCode(stop)] ??= eta;
      }
      out.set(id, {
        tripId: id,
        vehicleId: ref(mvj.VehicleRef),
        position: { latitude: Number(loc.Latitude), longitude: Number(loc.Longitude) },
        currentStopSequence: monitored?.Order,
        etaByStopId,
        timestamp: Date.parse(a.RecordedAtTime ?? '') || nowMs,
      });
    }
  }
  return out;
}

export function alertsFromSituationExchange(doc: Json): ServiceAlert[] {
  const out: ServiceAlert[] = [];
  for (const d of delivery(doc, 'SituationExchangeDelivery')) {
    for (const s of d.Situations?.PtSituationElement ?? []) {
      const affects = s.Affects ?? {};
      const lines = affects.Networks?.AffectedNetwork?.flatMap?.((n: Json) => n.AffectedLine ?? []) ?? [];
      const stops = affects.StopPoints?.AffectedStopPoint ?? [];
      out.push({
        id: ref(s.SituationNumber) ?? String(out.length),
        header: text(s.Summary) ?? 'Avviso di servizio',
        description: text(s.Description),
        routeIds: lines.flatMap((l: Json) => (ref(l.LineRef) ? [ref(l.LineRef)!] : [])),
        stopIds: stops.flatMap((p: Json) => (ref(p.StopPointRef) ? [stopCode(ref(p.StopPointRef)!)] : [])),
      });
    }
  }
  return out;
}

import type { ServiceAlert, VehicleState } from '../core/types';

/**
 * SIRI Lite (JSON) reader, the realtime format used in France (e.g. TCL Lyon
 * on data.grandlyon.com). Written against the SIRI Lite profile; field shapes
 * vary slightly between producers (refs as strings or { value }), so every
 * access is tolerant. Checked against live TCL responses (October 2026):
 * refs are { value } objects except DatedVehicleJourneyRef, there is no
 * DestinationName (only DestinationRef), metro calls carry only Aimed times,
 * and situation-exchange puts Affects under Consequences.
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
 * TCL stop refs look like "ActIV:StopArea:SP:30000:SYTRAL"; the GTFS stop_id
 * of the boarding point is the numeric part ("30000").
 */
export function stopCode(stopRef: string): string {
  const parts = stopRef.split(':').filter(Boolean);
  const numeric = parts.filter((p) => /^\d+$/.test(p));
  return numeric.at(-1) ?? parts.at(-1) ?? stopRef;
}

/** "ActIV:Line::TB11:SYTRAL" -> "TB11", the GTFS route_id. */
export function lineCode(lineRef: string): string {
  const parts = lineRef.split(':').filter(Boolean);
  const i = parts.indexOf('Line');
  return (i >= 0 ? parts[i + 1] : parts.at(-1)) ?? lineRef;
}

export interface SiriCall {
  stopCode: string;
  order: number;
  etaSeconds: number;
  /** False when the feed only gives the timetable (Aimed) time, e.g. metro. */
  realtime: boolean;
}

export interface SiriJourney {
  journeyId: string;
  lineRef: string;
  destinationName?: string;
  /** Stop code of the terminus, to name the headsign when DestinationName is missing. */
  destinationStopCode?: string;
  /** Remaining calls in order. */
  calls: SiriCall[];
}

export function journeysFromEstimatedTimetables(doc: Json, nowMs: number): SiriJourney[] {
  const out: SiriJourney[] = [];
  for (const d of delivery(doc, 'EstimatedTimetableDelivery')) {
    for (const frame of d.EstimatedJourneyVersionFrame ?? []) {
      for (const j of frame.EstimatedVehicleJourney ?? []) {
        const id = journeyId(j);
        const lineRef = ref(j.LineRef);
        if (!id || !lineRef || j.Cancellation === true) continue;
        const rawCalls = j.EstimatedCalls?.EstimatedCall ?? [];
        const calls = rawCalls.flatMap((c: Json, i: number): SiriCall[] => {
          const stop = ref(c.StopPointRef);
          const expected = c.ExpectedArrivalTime ?? c.ExpectedDepartureTime;
          const eta = secondsUntil(expected ?? c.AimedArrivalTime ?? c.AimedDepartureTime, nowMs);
          if (!stop || eta === undefined || c.Cancellation === true) return [];
          return [{ stopCode: stopCode(stop), order: c.Order ?? i + 1, etaSeconds: eta, realtime: expected != null }];
        });
        const dest = ref(j.DestinationRef);
        out.push({
          journeyId: id,
          lineRef,
          destinationName: text(j.DestinationName),
          destinationStopCode: dest ? stopCode(dest) : undefined,
          calls,
        });
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

/** Active or upcoming situations; affected lines are returned as GTFS route_ids. */
export function alertsFromSituationExchange(doc: Json, nowMs: number): ServiceAlert[] {
  const out: ServiceAlert[] = [];
  for (const d of delivery(doc, 'SituationExchangeDelivery')) {
    for (const s of d.Situations?.PtSituationElement ?? []) {
      const periods: Json[] = s.ValidityPeriod ?? [];
      const over = periods.length > 0 && periods.every((p) => p.EndTime && Date.parse(p.EndTime) < nowMs);
      if (over) continue;
      // TCL nests Affects under Consequences; the SIRI base profile has it on the situation.
      const affects: Json[] = [s.Affects, ...(s.Consequences?.Consequence ?? []).map((c: Json) => c.Affects)].filter(Boolean);
      const lineRefs = affects.flatMap((a) =>
        (a.Networks?.AffectedNetwork ?? []).flatMap((n: Json) => (n.AffectedLine ?? []).map((l: Json) => ref(l.LineRef))),
      );
      const stopRefs = affects.flatMap((a) => (a.StopPoints?.AffectedStopPoint ?? []).map((p: Json) => ref(p.StopPointRef)));
      const summary = text(s.Summary);
      const description = text(s.Description);
      out.push({
        id: ref(s.SituationNumber) ?? String(out.length),
        header: summary ?? description ?? 'Avviso di servizio',
        description: summary ? description : undefined,
        routeIds: [...new Set(lineRefs.filter(Boolean).map((l: string) => lineCode(l)))],
        stopIds: [...new Set(stopRefs.filter(Boolean).map((p: string) => stopCode(p)))],
      });
    }
  }
  return out;
}

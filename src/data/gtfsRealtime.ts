import { transit_realtime } from 'gtfs-realtime-bindings';
import type { Occupancy, ServiceAlert, VehicleState } from '../core/types';

/**
 * Decodes GTFS-Realtime protobuf feeds (TripUpdates, VehiclePositions,
 * Alerts) into the app's own types. Most Italian operators that publish
 * realtime data (e.g. Roma Mobilità) use this standard format.
 */
export function decodeFeed(bytes: Uint8Array): transit_realtime.FeedMessage {
  return transit_realtime.FeedMessage.decode(bytes);
}

const num = (v: number | { toNumber(): number } | null | undefined) =>
  v === null || v === undefined ? undefined : typeof v === 'number' ? v : v.toNumber();

const OCCUPANCY: Record<number, Occupancy> = {
  0: 'empty',
  1: 'many_seats',
  2: 'few_seats',
  3: 'standing',
  4: 'standing',
  5: 'full',
  6: 'full',
};

/**
 * Merge vehicle positions and trip updates into one state per trip.
 * ETAs are seconds from `nowMs`; trips with an update but no position are skipped.
 */
export function vehicleStatesFromFeeds(
  positions: transit_realtime.IFeedMessage,
  updates: transit_realtime.IFeedMessage | null,
  nowMs: number,
): Map<string, VehicleState> {
  const out = new Map<string, VehicleState>();
  const nowS = nowMs / 1000;

  for (const e of positions.entity ?? []) {
    const v = e.vehicle;
    const tripId = v?.trip?.tripId;
    if (!v?.position || !tripId) continue;
    out.set(tripId, {
      tripId,
      vehicleId: v.vehicle?.id ?? undefined,
      position: { latitude: v.position.latitude, longitude: v.position.longitude },
      currentStopSequence: v.currentStopSequence ?? undefined,
      etaByStopId: {},
      occupancy: v.occupancyStatus != null ? OCCUPANCY[v.occupancyStatus] ?? 'unknown' : undefined,
      timestamp: (num(v.timestamp) ?? nowS) * 1000,
    });
  }

  for (const e of updates?.entity ?? []) {
    const tu = e.tripUpdate;
    const state = tu?.trip?.tripId ? out.get(tu.trip.tripId) : undefined;
    if (!tu || !state) continue;
    for (const stu of tu.stopTimeUpdate ?? []) {
      const t = num(stu.arrival?.time) ?? num(stu.departure?.time);
      if (stu.stopId && t !== undefined) state.etaByStopId[stu.stopId] = Math.round(t - nowS);
    }
  }
  return out;
}

export function alertsFromFeed(feed: transit_realtime.IFeedMessage): ServiceAlert[] {
  const text = (t?: transit_realtime.ITranslatedString | null) =>
    t?.translation?.find((x) => x.language?.startsWith('it'))?.text ?? t?.translation?.[0]?.text ?? undefined;

  return (feed.entity ?? []).flatMap((e) => {
    const a = e.alert;
    if (!a) return [];
    const informed = a.informedEntity ?? [];
    return [
      {
        id: e.id,
        header: text(a.headerText) ?? 'Avviso di servizio',
        description: text(a.descriptionText),
        routeIds: informed.flatMap((i) => (i.routeId ? [i.routeId] : [])),
        stopIds: informed.flatMap((i) => (i.stopId ? [i.stopId] : [])),
      },
    ];
  });
}

export async function fetchFeed(url: string, init?: RequestInit): Promise<transit_realtime.FeedMessage> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`GTFS-RT ${url}: HTTP ${res.status}`);
  return decodeFeed(new Uint8Array(await res.arrayBuffer()));
}

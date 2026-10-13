import { transit_realtime } from 'gtfs-realtime-bindings';
import { describe, expect, it } from 'vitest';
import { alertsFromFeed, decodeFeed, vehicleStatesFromFeeds } from './gtfsRealtime';

const NOW = 1_760_000_000_000;
const header = { gtfsRealtimeVersion: '2.0', timestamp: NOW / 1000 };

function roundTrip(msg: transit_realtime.IFeedMessage) {
  return decodeFeed(transit_realtime.FeedMessage.encode(transit_realtime.FeedMessage.create(msg)).finish());
}

describe('GTFS-Realtime decoding', () => {
  it('merges vehicle positions with trip-update ETAs', () => {
    const positions = roundTrip({
      header,
      entity: [
        {
          id: 'v1',
          vehicle: {
            trip: { tripId: 'T1' },
            vehicle: { id: 'BUS-42' },
            position: { latitude: 41.9, longitude: 12.5 },
            currentStopSequence: 5,
            occupancyStatus: transit_realtime.VehiclePosition.OccupancyStatus.STANDING_ROOM_ONLY,
          },
        },
      ],
    });
    const updates = roundTrip({
      header,
      entity: [
        {
          id: 'u1',
          tripUpdate: {
            trip: { tripId: 'T1' },
            stopTimeUpdate: [
              { stopId: 'S5', arrival: { time: NOW / 1000 + 90 } },
              { stopId: 'S6', departure: { time: NOW / 1000 + 200 } },
            ],
          },
        },
      ],
    });

    const v = vehicleStatesFromFeeds(positions, updates, NOW).get('T1');
    expect(v).toMatchObject({
      vehicleId: 'BUS-42',
      currentStopSequence: 5,
      occupancy: 'standing',
      etaByStopId: { S5: 90, S6: 200 },
    });
    expect(v?.position.latitude).toBeCloseTo(41.9, 4);
  });

  it('prefers the Italian translation of alerts', () => {
    const feed = roundTrip({
      header,
      entity: [
        {
          id: 'a1',
          alert: {
            informedEntity: [{ routeId: '64' }],
            headerText: {
              translation: [
                { text: 'Strike', language: 'en' },
                { text: 'Sciopero', language: 'it' },
              ],
            },
          },
        },
      ],
    });
    expect(alertsFromFeed(feed)).toEqual([
      { id: 'a1', header: 'Sciopero', description: undefined, routeIds: ['64'], stopIds: [] },
    ]);
  });
});

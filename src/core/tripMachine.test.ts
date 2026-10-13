import { describe, expect, it } from 'vitest';
import { advanceTrip, alertStop, createTrip, type ActiveTrip } from './tripMachine';
import type { LatLng, TripStop, VehicleState } from './types';

// Stops ~500 m apart heading north.
const stop = (i: number): TripStop => ({
  id: `S${i}`,
  name: `Stop ${i}`,
  sequence: i,
  latitude: 41.9 + i * 0.0045,
  longitude: 12.5,
});
const stops = [stop(1), stop(2), stop(3), stop(4)];

const at = (s: LatLng, dLat = 0): LatLng => ({ latitude: s.latitude + dLat, longitude: s.longitude });

function trip(over: Partial<ActiveTrip> = {}): ActiveTrip {
  return {
    ...createTrip({
      providerId: 'demo',
      routeId: 'R',
      routeShortName: '64',
      headsign: 'Centro',
      tripId: 'T1',
      stops,
      now: 0,
    }),
    ...over,
  };
}

function vehicle(position: LatLng, etaBoard: number, seq?: number): VehicleState {
  return { tripId: 'T1', position, etaByStopId: { S1: etaBoard }, currentStopSequence: seq, timestamp: 0 };
}

describe('advanceTrip', () => {
  it('fires the approaching alert once when ETA drops under 2 minutes', () => {
    const user = at(stops[0]);
    let r = advanceTrip(trip(), { now: 0, user, vehicle: vehicle(at(stops[0], -0.01), 300) });
    expect(r.events).toEqual([]);

    r = advanceTrip(r.trip, { now: 1, user, vehicle: vehicle(at(stops[0], -0.004), 110) });
    expect(r.events).toEqual([{ type: 'approaching', etaSeconds: 110 }]);

    r = advanceTrip(r.trip, { now: 2, user, vehicle: vehicle(at(stops[0], -0.002), 60) });
    expect(r.events).toEqual([]);
  });

  it('honours a custom approach threshold', () => {
    const t = trip({ settings: { approachSeconds: 300, alightStopsBefore: 1 } });
    const r = advanceTrip(t, { now: 0, user: at(stops[0]), vehicle: vehicle(at(stops[0], -0.01), 280) });
    expect(r.events[0]).toMatchObject({ type: 'approaching' });
  });

  it('needs two consecutive samples with the vehicle, away from the stop, to detect boarding', () => {
    const p = at(stops[0], 0.0015); // ~170 m past the boarding stop
    let r = advanceTrip(trip({ approachNotified: true }), { now: 0, user: p, vehicle: vehicle(p, -30, 2) });
    expect(r.trip.phase).toBe('waiting');
    r = advanceTrip(r.trip, { now: 1, user: p, vehicle: vehicle(p, -40, 2) });
    expect(r.trip.phase).toBe('onboard');
    expect(r.events).toContainEqual({ type: 'boarded' });
  });

  it('does not board while the user is still at the stop as the bus passes', () => {
    const p = at(stops[0]);
    let r = advanceTrip(trip(), { now: 0, user: p, vehicle: vehicle(p, 0, 1) });
    r = advanceTrip(r.trip, { now: 1, user: p, vehicle: vehicle(p, 0, 1) });
    expect(r.trip.phase).toBe('waiting');
  });

  it('reports a missed vehicle when it left and the user is still at the stop', () => {
    const r = advanceTrip(trip(), { now: 0, user: at(stops[0]), vehicle: vehicle(at(stops[0], 0.004), -90, 2) });
    expect(r.events).toContainEqual({ type: 'missed' });
  });

  it('alerts one stop before the destination, then marks arrival', () => {
    let r = advanceTrip(trip({ phase: 'onboard' }), { now: 0, user: at(stops[1]), vehicle: null });
    expect(r.events).toEqual([]);

    r = advanceTrip(r.trip, { now: 1, user: at(stops[2]), vehicle: null });
    expect(r.events).toEqual([{ type: 'prepare_to_alight', stopsLeft: 1 }]);
    expect(r.trip.phase).toBe('alerted');

    r = advanceTrip(r.trip, { now: 2, user: at(stops[3]), vehicle: null });
    expect(r.events).toEqual([{ type: 'arrived' }]);
    expect(r.trip.phase).toBe('done');
  });

  it('alerts from the vehicle stop sequence when GPS missed the alert stop', () => {
    const between = at(stops[2], 0.002);
    const r = advanceTrip(trip({ phase: 'onboard' }), {
      now: 0,
      user: between,
      vehicle: { ...vehicle(between, -500), currentStopSequence: 4 },
    });
    expect(r.events).toContainEqual({ type: 'prepare_to_alight', stopsLeft: 1 });
  });

  it('alerts immediately on boarding when the destination is the next stop', () => {
    const t = trip({ stops: [stops[0], stops[1]] });
    const p = at(stops[0], 0.0015);
    let r = advanceTrip(t, { now: 0, user: p, vehicle: vehicle(p, -30, 2) });
    r = advanceTrip(r.trip, { now: 1, user: p, vehicle: vehicle(p, -40, 2) });
    expect(r.events.map((e) => e.type)).toEqual(['boarded', 'prepare_to_alight']);
  });

  it('supports alerting several stops early', () => {
    const t = trip({ settings: { approachSeconds: 120, alightStopsBefore: 2 } });
    expect(alertStop(t).id).toBe('S2');
    const capped = trip({ settings: { approachSeconds: 120, alightStopsBefore: 10 } });
    expect(alertStop(capped).id).toBe('S1');
  });
});

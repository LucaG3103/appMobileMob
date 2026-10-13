import { describe, expect, it } from 'vitest';
import { createDemoProvider } from './demo';

const center = { latitude: 41.9, longitude: 12.5 };

describe('demo provider', () => {
  it('lists nearby stops and arrivals whose vehicle ETA matches', async () => {
    let now = 1_760_000_000_000;
    const p = createDemoProvider(center, () => now);

    const [nearest] = await p.nearbyStops(center, 300);
    expect(nearest).toBeDefined();

    const arrivals = await p.arrivals(nearest.id);
    expect(arrivals.length).toBeGreaterThan(0);
    expect(arrivals.map((a) => a.etaSeconds)).toEqual([...arrivals.map((a) => a.etaSeconds)].sort((a, b) => a - b));

    // Advance until the first vehicle is on the road, then compare ETAs.
    const first = arrivals[0];
    const stops = await p.tripStops(first.tripId);
    now += Math.max(0, first.etaSeconds - 60) * 1000;
    const v = await p.vehicle(first.tripId);
    if (v) expect(v.etaByStopId[nearest.id]).toBeLessThanOrEqual(60);
    expect(stops[0].sequence).toBe(1);
  });
});

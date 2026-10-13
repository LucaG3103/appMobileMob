import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sample from '../__fixtures__/tcl-siri-lite.json';
import { createLyonProvider, lineName } from './lyon';

const NOW = Date.parse('2026-10-13T09:33:19Z');

describe('Lyon provider on real TCL data', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const files: Record<string, unknown> = {
      'estimated-timetables.json': sample.et,
      'vehicle-monitoring.json': sample.vm,
      'situation-exchange.json': sample.sx,
    };
    vi.stubGlobal('fetch', async (url: string) => {
      const body = files[url.split('/').at(-1)!];
      return { ok: body !== undefined, status: body ? 200 : 404, json: async () => body };
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses the GTFS short name, which can differ from the route_id', () => {
    expect(lineName('ActIV:Line::2001:SYTRAL')).toEqual({ routeId: '2001', routeShortName: '217' });
  });

  it('lists arrivals with the terminus as headsign', async () => {
    const p = createLyonProvider({ username: 'u', password: 'p' });
    expect(await p.arrivals('227')).toEqual([
      {
        routeId: 'C17',
        routeShortName: 'C17',
        headsign: 'Laurent Bonnevay',
        tripId: 'ActIV:VehicleJourney::917_C17B-003AM_00301016:LOC',
        etaSeconds: 286,
        realtime: true,
      },
    ]);
    const [metro] = await p.arrivals('46059');
    expect(metro).toMatchObject({ routeShortName: 'A', headsign: 'Vaulx-en-Velin La Soie', realtime: false });
  });

  it('resolves trip stops, GPS vehicles and metro without GPS', async () => {
    const p = createLyonProvider({ username: 'u', password: 'p' });
    const stops = await p.tripStops('ActIV:VehicleJourney::917_C17B-003AM_00301016:LOC');
    expect(stops.map((s) => s.name)).toEqual(expect.arrayContaining(['Séverine', 'Laurent Bonnevay']));
    expect(stops).toHaveLength(5);
    expect(await p.routeVehicles('C17')).toHaveLength(1);
    const metro = await p.vehicle('ActIV:VehicleJourney::301_301A-080CN_01301035:LOC');
    expect(metro?.position).toBeUndefined();
    expect(metro?.currentStopSequence).toBe(11);
  });

  it('filters alerts by GTFS route_id', async () => {
    const p = createLyonProvider({ username: 'u', password: 'p' });
    expect((await p.alerts({ routeId: '164' })).map((a) => a.id)).toEqual(['ACTIV_2981450159662083503_2']);
    expect(await p.alerts({ routeId: 'C17' })).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import sample from './__fixtures__/tcl-siri-lite.json';
import {
  alertsFromSituationExchange,
  journeysFromEstimatedTimetables,
  lineCode,
  vehiclesFromMonitoring,
} from './siriLite';

// Trimmed from real data.grandlyon.com responses of 2026-10-13 (a C17 bus with
// GPS and a metro A run without), so the parser is checked against TCL's shapes.
const NOW = Date.parse('2026-10-13T09:33:19Z');

describe('SIRI Lite, real TCL responses', () => {
  const journeys = journeysFromEstimatedTimetables(sample.et, NOW);
  const byId = new Map(journeys.map((j) => [j.journeyId, j]));

  it('maps TCL line refs to GTFS route_ids', () => {
    expect(lineCode('ActIV:Line::C17:SYTRAL')).toBe('C17');
    expect(lineCode('ActIV:Line::2001:SYTRAL')).toBe('2001');
    expect(journeys.map((j) => lineCode(j.lineRef))).toEqual(['C17', 'A']);
  });

  it('reads bus calls with expected times and the terminus stop', () => {
    const bus = byId.get('ActIV:VehicleJourney::917_C17B-003AM_00301016:LOC')!;
    expect(bus.destinationName).toBeUndefined();
    expect(bus.destinationStopCode).toBe('1505');
    expect(bus.calls.map((c) => c.stopCode)).toEqual(['2724', '3135', '32303', '227', '1505']);
    expect(bus.calls[3]).toEqual({ stopCode: '227', order: 20, etaSeconds: 286, realtime: true });
    // The terminus has only an Aimed time.
    expect(bus.calls[4].realtime).toBe(false);
  });

  it('marks metro calls as timetable only', () => {
    const metro = byId.get('ActIV:VehicleJourney::301_301A-080CN_01301035:LOC')!;
    expect(metro.destinationStopCode).toBe('36394');
    expect(metro.calls.every((c) => !c.realtime)).toBe(true);
    expect(metro.calls[0]).toMatchObject({ stopCode: '46058', order: 11, etaSeconds: 20 });
  });

  it('joins the bus GPS position with its calls', () => {
    const v = vehiclesFromMonitoring(sample.vm, byId, NOW).get('ActIV:VehicleJourney::917_C17B-003AM_00301016:LOC');
    expect(v).toMatchObject({
      vehicleId: 'ActIV:Vehicle:Bus:3151:LOC',
      position: { latitude: 45.75271, longitude: 4.91403 },
      currentStopSequence: 16,
    });
    expect(v!.etaByStopId['227']).toBe(286);
  });

  it('reads alerts nested under Consequences', () => {
    expect(alertsFromSituationExchange(sample.sx, NOW)).toEqual([
      {
        id: 'ACTIV_2981450159662083503_2',
        header: 'Déviée dir. Tarare Hauts de Tarare -',
        description: undefined,
        routeIds: ['164'],
        stopIds: [],
      },
      {
        id: 'ACTIV_920768744308045062_2',
        header: 'Déviée deux sens -',
        description: undefined,
        routeIds: ['JD450'],
        stopIds: [],
      },
    ]);
    // Both end before 2027.
    expect(alertsFromSituationExchange(sample.sx, Date.parse('2027-01-01T00:00:00Z'))).toEqual([]);
  });
});

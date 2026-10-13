import { describe, expect, it } from 'vitest';
import {
  alertsFromSituationExchange,
  journeysFromEstimatedTimetables,
  stopCode,
  vehiclesFromMonitoring,
} from './siriLite';

const NOW = Date.parse('2026-10-13T10:00:00+02:00');
const at = (s: number) => new Date(NOW + s * 1000).toISOString();

const et = {
  Siri: {
    ServiceDelivery: {
      EstimatedTimetableDelivery: [
        {
          EstimatedJourneyVersionFrame: [
            {
              EstimatedVehicleJourney: [
                {
                  LineRef: { value: 'TCL:Line::C3:' },
                  FramedVehicleJourneyRef: { DatedVehicleJourneyRef: 'TCL:VehicleJourney::123:LOC' },
                  DestinationName: [{ value: 'Laurent Bonnevay' }],
                  EstimatedCalls: {
                    EstimatedCall: [
                      { StopPointRef: { value: 'TCL:StopPoint:BP:30210:LOC' }, Order: 7, ExpectedArrivalTime: at(90) },
                      { StopPointRef: { value: 'TCL:StopPoint:BP:30211:LOC' }, Order: 8, ExpectedDepartureTime: at(200) },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
};

describe('SIRI Lite', () => {
  it('extracts numeric stop codes from refs', () => {
    expect(stopCode('TCL:StopPoint:BP:30210:LOC')).toBe('30210');
    expect(stopCode('30210')).toBe('30210');
  });

  it('reads estimated timetables', () => {
    expect(journeysFromEstimatedTimetables(et, NOW)).toEqual([
      {
        journeyId: 'TCL:VehicleJourney::123:LOC',
        lineRef: 'TCL:Line::C3:',
        destinationName: 'Laurent Bonnevay',
        calls: [
          { stopCode: '30210', order: 7, etaSeconds: 90 },
          { stopCode: '30211', order: 8, etaSeconds: 200 },
        ],
      },
    ]);
  });

  it('joins vehicle positions with estimated calls', () => {
    const journeys = new Map(journeysFromEstimatedTimetables(et, NOW).map((j) => [j.journeyId, j]));
    const vm = {
      Siri: {
        ServiceDelivery: {
          VehicleMonitoringDelivery: [
            {
              VehicleActivity: [
                {
                  RecordedAtTime: at(-10),
                  MonitoredVehicleJourney: {
                    FramedVehicleJourneyRef: { DatedVehicleJourneyRef: 'TCL:VehicleJourney::123:LOC' },
                    VehicleRef: { value: 'BUS-1802' },
                    VehicleLocation: { Latitude: 45.76, Longitude: 4.86 },
                    MonitoredCall: { StopPointRef: { value: 'TCL:StopPoint:BP:30210:LOC' }, Order: 7 },
                  },
                },
              ],
            },
          ],
        },
      },
    };
    const v = vehiclesFromMonitoring(vm, journeys, NOW).get('TCL:VehicleJourney::123:LOC');
    expect(v).toMatchObject({
      vehicleId: 'BUS-1802',
      position: { latitude: 45.76, longitude: 4.86 },
      currentStopSequence: 7,
      etaByStopId: { '30210': 90, '30211': 200 },
    });
  });

  it('reads situation exchange alerts', () => {
    const sx = {
      Siri: {
        ServiceDelivery: {
          SituationExchangeDelivery: [
            {
              Situations: {
                PtSituationElement: [
                  {
                    SituationNumber: 'S1',
                    Summary: [{ value: 'Travaux' }],
                    Affects: {
                      Networks: { AffectedNetwork: [{ AffectedLine: [{ LineRef: 'TCL:Line::C3:' }] }] },
                      StopPoints: { AffectedStopPoint: [{ StopPointRef: 'TCL:StopPoint:BP:30210:LOC' }] },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    };
    expect(alertsFromSituationExchange(sx)).toEqual([
      { id: 'S1', header: 'Travaux', description: undefined, routeIds: ['TCL:Line::C3:'], stopIds: ['30210'] },
    ]);
  });
});

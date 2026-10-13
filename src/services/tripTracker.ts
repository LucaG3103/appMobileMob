import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import {
  advanceTrip,
  boardStop,
  createTrip,
  destinationStop,
  retarget,
  sliceTrip,
  type ActiveTrip,
  type TripSettings,
} from '../core/tripMachine';
import type { Arrival, LatLng } from '../core/types';
import { getProvider, type ProviderRef } from '../data/registry';
import { notifyTripEvent } from './notifications';
import { clearTrip, loadTrip, saveTrip } from './storage';

/**
 * Runs the trip state machine on every location update, in the foreground
 * and in the background (iOS "location" background mode, Android
 * foreground service). Tracking only runs while a trip is active, which
 * keeps battery use to the length of the journey.
 */
export const TRIP_TASK = 'trip-tracker';

// Must be defined at module scope so it exists when the OS wakes the app.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRIP_TASK, async ({ data, error }) => {
  if (error) return;
  const last = data?.locations?.at(-1);
  await tick(last ? { latitude: last.coords.latitude, longitude: last.coords.longitude } : null);
});

const fallbackId = (t: ActiveTrip) => `approach-${t.tripId}`;

/**
 * Safety net for the "vehicle in 2 minutes" alert: iOS sends few location
 * updates while the user stands still at the stop, so we also schedule a
 * timed notification from the latest prediction and move it on each tick.
 */
async function rescheduleFallbackApproach(t: ActiveTrip, etaSeconds: number | undefined) {
  await Notifications.cancelScheduledNotificationAsync(fallbackId(t)).catch(() => {});
  if (t.approachNotified || t.phase !== 'waiting' || etaSeconds === undefined) return;
  const fireIn = etaSeconds - t.settings.approachSeconds;
  if (fireIn < 5) return;
  await Notifications.scheduleNotificationAsync({
    identifier: fallbackId(t),
    content: {
      title: `🚌 ${t.routeShortName} → ${t.headsign} in arrivo`,
      body: `Arriva tra circa ${Math.round(t.settings.approachSeconds / 60)} min a ${boardStop(t).name}.`,
      sound: 'default',
      interruptionLevel: 'timeSensitive',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.round(fireIn),
      channelId: Platform.OS === 'android' ? 'transit-alerts' : undefined,
    },
  });
}

let ticking = false;

/** One step: fetch the vehicle, advance the trip, notify, persist. */
export async function tick(user: LatLng | null): Promise<ActiveTrip | null> {
  if (ticking) return null;
  ticking = true;
  try {
    const stored = await loadTrip();
    if (!stored) return null;
    const provider = getProvider(stored.provider);
    const vehicle = await provider.vehicle(stored.trip.tripId).catch(() => null);
    let { trip, events } = advanceTrip(stored.trip, { now: Date.now(), user, vehicle });

    for (const e of events) {
      if (e.type === 'approaching' || e.type === 'boarded') {
        await Notifications.cancelScheduledNotificationAsync(fallbackId(trip)).catch(() => {});
      }
      await notifyTripEvent(e, trip);
      if (e.type === 'missed') trip = (await nextVehicle(stored.provider, trip)) ?? trip;
    }
    await rescheduleFallbackApproach(trip, vehicle?.etaByStopId[boardStop(trip).id]);

    if (trip.phase === 'done') {
      await stopTracking();
    } else {
      await saveTrip({ provider: stored.provider, trip });
    }
    return trip;
  } finally {
    ticking = false;
  }
}

async function nextVehicle(ref: ProviderRef, t: ActiveTrip): Promise<ActiveTrip | null> {
  const provider = getProvider(ref);
  const next = (await provider.arrivals(boardStop(t).id)).find(
    (a) => a.routeId === t.routeId && a.tripId !== t.tripId,
  );
  if (!next) return null;
  const stops = sliceTrip(await provider.tripStops(next.tripId), boardStop(t).id, destinationStop(t).id);
  return stops ? retarget(t, next.tripId, stops) : null;
}

export type StartResult = 'started' | 'no-foreground-permission' | 'foreground-only' | 'bad-stops';

export async function startTracking(
  ref: ProviderRef,
  arrival: Arrival,
  boardStopId: string,
  destStopId: string,
  settings: TripSettings,
): Promise<StartResult> {
  const provider = getProvider(ref);
  const stops = sliceTrip(await provider.tripStops(arrival.tripId), boardStopId, destStopId);
  if (!stops) return 'bad-stops';

  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'no-foreground-permission';

  const trip = createTrip({
    providerId: provider.id,
    routeId: arrival.routeId,
    routeShortName: arrival.routeShortName,
    headsign: arrival.headsign,
    tripId: arrival.tripId,
    stops,
    settings,
    now: Date.now(),
  });
  await saveTrip({ provider: ref, trip });
  await rescheduleFallbackApproach(trip, arrival.etaSeconds);

  // "Always" permission lets alerts work with the phone in the pocket.
  // Without it the trip still works while the app is open.
  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => ({ granted: false }));
  if (!bg.granted) return 'foreground-only';

  await Location.startLocationUpdatesAsync(TRIP_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 20,
    activityType: Location.ActivityType.OtherNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: `Seguo il ${trip.routeShortName}`,
      notificationBody: `Ti avviso all'arrivo e prima di ${destinationStop(trip).name}.`,
      killServiceOnDestroy: false,
    },
  });
  return 'started';
}

export async function stopTracking(): Promise<void> {
  const stored = await loadTrip();
  if (stored) await Notifications.cancelScheduledNotificationAsync(fallbackId(stored.trip)).catch(() => {});
  if (await Location.hasStartedLocationUpdatesAsync(TRIP_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TRIP_TASK);
  }
  await clearTrip();
}

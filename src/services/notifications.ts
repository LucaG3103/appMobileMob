import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { TripEvent, ActiveTrip } from '../core/tripMachine';
import { destinationStop } from '../core/tripMachine';

/**
 * Local notifications only: no server needed. Apple Watch and Wear OS mirror
 * phone notifications automatically, so these also reach the watch.
 */
const CHANNEL_ID = 'transit-alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Arrivi e discese',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const { granted } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return granted;
}

function messageFor(e: TripEvent, t: ActiveTrip): { title: string; body: string } | null {
  const line = `${t.routeShortName} → ${t.headsign}`;
  switch (e.type) {
    case 'approaching':
      return { title: `🚌 ${line} in arrivo`, body: `Arriva tra ${Math.max(1, Math.round(e.etaSeconds / 60))} min alla tua fermata.` };
    case 'missed':
      return { title: `${line} passato`, body: 'Ti avviso per il prossimo mezzo della stessa linea.' };
    case 'boarded':
      return { title: `A bordo del ${t.routeShortName}`, body: `Ti avviso prima di ${destinationStop(t).name}.` };
    case 'prepare_to_alight':
      return {
        title: '🔔 Preparati a scendere',
        body:
          e.stopsLeft <= 1
            ? `La prossima è ${destinationStop(t).name}.`
            : `Mancano ${e.stopsLeft} fermate a ${destinationStop(t).name}.`,
      };
    case 'arrived':
      return null;
  }
}

export async function notifyTripEvent(e: TripEvent, t: ActiveTrip): Promise<void> {
  const msg = messageFor(e, t);
  if (!msg) return;
  const urgent = e.type === 'approaching' || e.type === 'prepare_to_alight';
  await Notifications.scheduleNotificationAsync({
    content: {
      ...msg,
      sound: 'default',
      // Breaks through Focus modes; needs the time-sensitive entitlement (app.json).
      interruptionLevel: urgent ? 'timeSensitive' : 'active',
      vibrate: urgent ? [0, 400, 200, 400] : undefined,
      data: { tripId: t.tripId, event: e.type },
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

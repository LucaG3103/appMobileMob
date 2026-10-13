import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { alertStop, boardStop, destinationStop, type ActiveTrip } from '../core/tripMachine';
import type { VehicleState } from '../core/types';
import { getProvider } from '../data/registry';
import { loadTrip } from '../services/storage';
import { stopTracking, tick } from '../services/tripTracker';
import { colors, formatEta, occupancyLabel, s } from '../ui';

const PHASE_LABEL: Record<ActiveTrip['phase'], string> = {
  waiting: 'In attesa del mezzo',
  onboard: 'A bordo',
  alerted: 'Scendi alla prossima',
  done: 'Arrivato',
};

export default function TripScreen() {
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [vehicle, setVehicle] = useState<VehicleState | null>(null);

  // While the screen is open, drive the trip from here too. This is what
  // makes the demo work in Expo Go, where background location is unavailable.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const pos = await Location.getLastKnownPositionAsync().catch(() => null);
      const t = await tick(pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null);
      const stored = await loadTrip();
      if (!alive) return;
      setTrip(stored?.trip ?? t);
      if (stored) setVehicle(await getProvider(stored.provider).vehicle(stored.trip.tripId).catch(() => null));
    };
    run();
    const id = setInterval(run, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!trip) {
    return (
      <View style={[s.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={s.sub}>Nessun viaggio attivo.</Text>
      </View>
    );
  }

  const eta = vehicle?.etaByStopId[trip.phase === 'waiting' ? boardStop(trip).id : destinationStop(trip).id];

  return (
    <ScrollView style={s.screen}>
      <MapView
        style={{ height: 280 }}
        showsUserLocation
        initialRegion={{ ...(vehicle?.position ?? boardStop(trip)), latitudeDelta: 0.03, longitudeDelta: 0.03 }}
      >
        <Polyline coordinates={trip.stops} strokeColor={colors.accent} strokeWidth={4} />
        {trip.stops.map((st) => (
          <Marker key={st.id} coordinate={st} title={st.name} pinColor={st.id === destinationStop(trip).id ? colors.danger : colors.accent} />
        ))}
        {vehicle?.position && <Marker coordinate={vehicle.position} title={trip.routeShortName} pinColor={colors.live} />}
      </MapView>

      <View style={s.row}>
        <View style={s.badge}>
          <Text style={s.badgeText}>{trip.routeShortName}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{PHASE_LABEL[trip.phase]}</Text>
          <Text style={s.sub}>
            {trip.phase === 'waiting' ? `a ${boardStop(trip).name}` : `verso ${destinationStop(trip).name}`}
            {vehicle?.occupancy ? ` · ${occupancyLabel[vehicle.occupancy]}` : ''}
          </Text>
        </View>
        {eta !== undefined && eta >= 0 && <Text style={[s.title, { color: colors.live }]}>{formatEta(eta)}</Text>}
      </View>

      <Text style={s.section}>AVVISI</Text>
      <View style={s.row}>
        <Text style={s.title}>{trip.approachNotified ? '✓' : '○'}</Text>
        <Text style={s.sub}>Mezzo a {Math.round(trip.settings.approachSeconds / 60)} min da {boardStop(trip).name}</Text>
      </View>
      <View style={s.row}>
        <Text style={s.title}>{trip.phase === 'alerted' || trip.phase === 'done' ? '✓' : '○'}</Text>
        <Text style={s.sub}>Preparati a scendere a {alertStop(trip).name}</Text>
      </View>

      <Pressable
        style={[s.button, { backgroundColor: colors.danger }]}
        onPress={async () => {
          await stopTracking();
          router.replace('/');
        }}
      >
        <Text style={s.buttonText}>Termina viaggio</Text>
      </Pressable>
    </ScrollView>
  );
}

import { Link, router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { distanceMeters } from '../core/geo';
import type { Stop } from '../core/types';
import { usePolling, useTransit } from '../hooks/useTransit';
import { loadFavorites, loadTrip, type FavoriteStop, type StoredTrip } from '../services/storage';
import { colors, s } from '../ui';

export default function NearbyStops() {
  const { provider, ref, userLocation } = useTransit();
  const [favorites, setFavorites] = useState<FavoriteStop[]>([]);
  const [active, setActive] = useState<StoredTrip | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadFavorites().then(setFavorites);
      loadTrip().then(setActive);
    }, []),
  );

  const stops = usePolling(() => provider.nearbyStops(userLocation ?? ref.center, 800), 30_000, [provider]) ?? [];
  const here = userLocation ?? ref.center;

  const open = (stop: Pick<Stop, 'id' | 'name'>) =>
    router.push({ pathname: '/stop/[id]', params: { id: stop.id, name: stop.name } });

  return (
    <View style={s.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" style={{ color: colors.accent, fontSize: 16 }}>
              Impostazioni
            </Link>
          ),
        }}
      />
      <MapView
        style={{ height: 260 }}
        showsUserLocation
        region={{ ...here, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      >
        {stops.map((st) => (
          <Marker key={st.id} coordinate={st} title={st.name} pinColor={colors.accent} onCalloutPress={() => open(st)} />
        ))}
      </MapView>

      {active && (
        <Pressable style={[s.row, { backgroundColor: colors.live }]} onPress={() => router.push('/trip')}>
          <Text style={[s.title, { color: '#fff' }]}>
            Viaggio attivo: {active.trip.routeShortName} → {active.trip.headsign}
          </Text>
        </Pressable>
      )}

      <FlatList
        data={stops}
        keyExtractor={(st) => st.id}
        ListHeaderComponent={
          <>
            {favorites.length > 0 && <Text style={s.section}>PREFERITE</Text>}
            {favorites.map((f) => (
              <Pressable key={f.stopId} style={s.row} onPress={() => open({ id: f.stopId, name: f.name })}>
                <Text style={s.title}>★ {f.name}</Text>
              </Pressable>
            ))}
            <Text style={s.section}>VICINO A TE · {provider.name}</Text>
          </>
        }
        ListEmptyComponent={<Text style={[s.sub, { padding: 16 }]}>Nessuna fermata entro 800 m.</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => open(item)}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{item.name}</Text>
              <Text style={s.sub}>{Math.round(distanceMeters(here, item))} m</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

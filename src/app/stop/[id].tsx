import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { walkingSeconds } from '../../core/geo';
import type { Arrival, TripStop } from '../../core/types';
import { usePolling, useTransit } from '../../hooks/useTransit';
import { loadFavorites, loadSettings, toggleFavorite } from '../../services/storage';
import { startTracking } from '../../services/tripTracker';
import { colors, formatEta, occupancyLabel, s } from '../../ui';

export default function StopArrivals() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { provider, ref, userLocation } = useTransit();
  const [isFav, setIsFav] = useState(false);
  const [picking, setPicking] = useState<{ arrival: Arrival; stops: TripStop[] } | null>(null);

  useEffect(() => {
    loadFavorites().then((all) => setIsFav(all.some((f) => f.stopId === id)));
  }, [id]);

  const arrivals = usePolling(() => provider.arrivals(id), 15_000, [provider, id]) ?? [];
  const alerts = usePolling(() => provider.alerts({ stopId: id }), 120_000, [provider, id]) ?? [];
  const stop = usePolling(async () => (await provider.nearbyStops(ref.center, 50_000)).find((x) => x.id === id), 600_000, [id]);
  const walk = stop && userLocation ? walkingSeconds(userLocation, stop) : null;

  async function choose(a: Arrival) {
    const all = await provider.tripStops(a.tripId);
    const from = all.findIndex((x) => x.id === id);
    setPicking({ arrival: a, stops: all.slice(from + 1) });
  }

  async function start(dest: TripStop) {
    if (!picking) return;
    const res = await startTracking(ref, picking.arrival, id, dest.id, await loadSettings());
    if (res === 'no-foreground-permission') {
      Alert.alert('Posizione necessaria', 'Serve la posizione per capire quando sali e quando scendere.');
      return;
    }
    if (res === 'foreground-only') {
      Alert.alert(
        'Avvisi solo con app aperta',
        'Per ricevere gli avvisi con il telefono in tasca consenti la posizione "Sempre" nelle impostazioni.',
      );
    }
    router.replace('/trip');
  }

  if (picking) {
    return (
      <View style={s.screen}>
        <Stack.Screen options={{ title: 'Dove scendi?' }} />
        <Text style={s.section}>
          {picking.arrival.routeShortName} → {picking.arrival.headsign} · scegli la fermata di discesa
        </Text>
        <FlatList
          data={picking.stops}
          keyExtractor={(x) => x.id}
          renderItem={({ item, index }) => (
            <Pressable style={s.row} onPress={() => start(item)}>
              <Text style={[s.sub, { width: 28 }]}>{index + 1}</Text>
              <Text style={s.title}>{item.name}</Text>
            </Pressable>
          )}
        />
        <Pressable onPress={() => setPicking(null)} style={[s.button, { backgroundColor: colors.muted }]}>
          <Text style={s.buttonText}>Indietro</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <Stack.Screen
        options={{
          title: name ?? 'Arrivi',
          headerRight: () => (
            <Pressable
              onPress={async () => {
                const next = await toggleFavorite({ providerId: provider.id, stopId: id, name: name ?? id });
                setIsFav(next.some((f) => f.stopId === id));
              }}
            >
              <Text style={{ fontSize: 22, color: colors.accent }}>{isFav ? '★' : '☆'}</Text>
            </Pressable>
          ),
        }}
      />
      {alerts.map((a) => (
        <View key={a.id} style={[s.row, { backgroundColor: '#FEF3F2' }]}>
          <Text style={[s.title, { color: colors.danger }]}>⚠ {a.header}</Text>
        </View>
      ))}
      <Text style={s.section}>
        PROSSIMI ARRIVI{walk !== null ? ` · ${Math.ceil(walk / 60)} min a piedi` : ''} · tocca per farti avvisare
      </Text>
      <FlatList
        data={arrivals}
        keyExtractor={(a) => a.tripId}
        ListEmptyComponent={<Text style={[s.sub, { padding: 16 }]}>Nessun arrivo previsto.</Text>}
        renderItem={({ item }) => {
          const tooLate = walk !== null && walk > item.etaSeconds;
          return (
            <Pressable style={s.row} onPress={() => choose(item)}>
              <View style={s.badge}>
                <Text style={s.badgeText}>{item.routeShortName}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{item.headsign}</Text>
                <Text style={s.sub}>
                  {item.realtime ? '● tempo reale' : 'orario programmato'}
                  {item.occupancy ? ` · ${occupancyLabel[item.occupancy]}` : ''}
                  {tooLate ? ' · non fai in tempo a piedi' : ''}
                </Text>
              </View>
              <Text style={[s.title, { color: item.realtime ? colors.live : colors.text }]}>{formatEta(item.etaSeconds)}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

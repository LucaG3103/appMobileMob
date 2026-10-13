import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { TransitProvider } from '../hooks/useTransit';
import { setupNotifications } from '../services/notifications';

export default function RootLayout() {
  useEffect(() => {
    setupNotifications().catch(() => {});
  }, []);

  return (
    <TransitProvider>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Fermate vicine' }} />
        <Stack.Screen name="stop/[id]" options={{ title: 'Arrivi' }} />
        <Stack.Screen name="trip" options={{ title: 'Viaggio' }} />
        <Stack.Screen name="settings" options={{ title: 'Impostazioni' }} />
      </Stack>
    </TransitProvider>
  );
}

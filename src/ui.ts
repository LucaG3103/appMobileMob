import { StyleSheet } from 'react-native';
import type { Occupancy } from './core/types';

export const colors = {
  bg: '#F6F7F9',
  card: '#FFFFFF',
  text: '#14171F',
  muted: '#667085',
  accent: '#0B6BCB',
  live: '#12A150',
  danger: '#D92D20',
  border: '#E4E7EC',
};

export const formatEta = (s: number) => (s < 60 ? 'ora' : `${Math.round(s / 60)} min`);

export const occupancyLabel: Record<Occupancy, string> = {
  empty: 'Vuoto',
  many_seats: 'Posti liberi',
  few_seats: 'Pochi posti',
  standing: 'Solo in piedi',
  full: 'Pieno',
  unknown: '',
};

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, color: colors.muted, fontWeight: '600', fontSize: 13 },
  row: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  badge: { backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, minWidth: 44, alignItems: 'center' },
  badgeText: { color: '#fff', fontWeight: '700' },
  button: { backgroundColor: colors.accent, borderRadius: 10, padding: 14, alignItems: 'center', margin: 16 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DEFAULT_SETTINGS, type TripSettings } from '../core/tripMachine';
import { loadSettings, saveSettings } from '../services/storage';
import { colors, s } from '../ui';

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = (txt: string, v: number) => (
    <Pressable onPress={() => onChange(Math.min(max, Math.max(min, v)))} style={{ padding: 8 }}>
      <Text style={{ fontSize: 22, color: colors.accent }}>{txt}</Text>
    </Pressable>
  );
  return (
    <View style={s.row}>
      <Text style={[s.title, { flex: 1 }]}>{label}</Text>
      {btn('−', value - 1)}
      <Text style={[s.title, { minWidth: 24, textAlign: 'center' }]}>{value}</Text>
      {btn('+', value + 1)}
    </View>
  );
}

export default function Settings() {
  const [st, setSt] = useState<TripSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    loadSettings().then(setSt);
  }, []);
  const update = (next: TripSettings) => {
    setSt(next);
    saveSettings(next);
  };

  return (
    <View style={s.screen}>
      <Text style={s.section}>AVVISO DI ARRIVO</Text>
      <Stepper
        label="Minuti di anticipo"
        value={Math.round(st.approachSeconds / 60)}
        min={1}
        max={15}
        onChange={(m) => update({ ...st, approachSeconds: m * 60 })}
      />
      <Text style={s.section}>AVVISO DI DISCESA</Text>
      <Stepper
        label="Fermate prima della mia"
        value={st.alightStopsBefore}
        min={1}
        max={3}
        onChange={(n) => update({ ...st, alightStopsBefore: n })}
      />
      <Text style={[s.sub, { padding: 16 }]}>
        Gli avvisi arrivano anche sull'orologio (Apple Watch o Wear OS) se le notifiche del telefono sono abilitate
        lì.
      </Text>
    </View>
  );
}

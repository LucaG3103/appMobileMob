# Fermata Giusta

App mobile (iOS e Android, Expo/React Native) per il trasporto pubblico:

- posizione dei mezzi in tempo reale e minuti all'arrivo, come Moovit;
- **notifica quando il mezzo è a 2 minuti** dalla tua fermata (telefono e orologio);
- **notifica una fermata prima** di quella in cui devi scendere, dopo che sei salito.

Il nome è provvisorio.

## Come funziona

1. Apri una fermata vicina e tocchi la corsa che vuoi prendere.
2. Scegli la fermata in cui scendi.
3. L'app segue la corsa: quando l'arrivo previsto scende sotto la soglia (2 min di default) ti avvisa.
4. Capisce che sei salito quando la tua posizione si muove insieme al mezzo, lontano dalla fermata, per due letture di fila.
5. Alla fermata prima della tua (configurabile, da 1 a 3 fermate prima) ti avvisa di prepararti.
6. Se il mezzo passa e tu sei ancora alla fermata, ti avvisa e si aggancia al mezzo successivo della stessa linea.

Le notifiche sono locali, senza server. Apple Watch e Wear OS le ricevono automaticamente dal telefono.

**Amazfit (Zepp OS, es. Active 2):** nell'app Zepp, in Profilo → orologio → Notifiche app, abilita "Fermata Giusta". Su Android escludi sia Zepp sia questa app dall'ottimizzazione batteria, altrimenti il sistema può ritardare le notifiche.

## Struttura

| Percorso | Cosa contiene |
| --- | --- |
| `src/core/tripMachine.ts` | Logica del viaggio (in attesa → a bordo → avvisato → arrivato), pura e testata |
| `src/data/provider.ts` | Interfaccia unica per le fonti dati: una città si aggiunge implementandola |
| `src/data/gtfsRealtime.ts` | Decodifica dei feed GTFS-Realtime (posizioni, previsioni, avvisi) |
| `src/data/providers/demo.ts` | Linee simulate attorno a te, per provare tutto senza dati reali |
| `src/data/providers/gtfs.ts` | Provider per una città con feed GTFS-Realtime (manca la parte orari statici) |
| `src/services/tripTracker.ts` | Task in background: posizione → logica → notifiche |
| `src/app/` | Schermate (Expo Router) |

## Avvio

```bash
npm install
npm test          # test della logica
npm run typecheck
npx expo start    # prova in Expo Go, solo con app aperta
```

Gli avvisi con l'app chiusa o il telefono in tasca richiedono una development build: `npx expo run:ios` / `npx expo run:android`, oppure `npx eas-cli@latest build --profile development`. Expo Go non supporta la posizione in background.

## Limiti noti

- **Dati per città.** Google Maps e Moovit non hanno API pubbliche per le posizioni dei mezzi; servono i feed open data dell'azienda di trasporto. Roma pubblica GTFS-Realtime aperto. Altre città vanno verificate una per una.
- **Orari statici.** Fermate e percorsi vengono dal GTFS statico, troppo grande da elaborare sul telefono: servirà un piccolo backend o un file pre-elaborato per città.
- **iOS in background.** Serve il permesso di posizione "Sempre". Se l'utente chiude l'app dal multitasking il monitoraggio si ferma. Per l'avviso di arrivo c'è anche una notifica programmata di riserva, aggiornata a ogni lettura.
- **Batteria.** Il GPS è attivo solo durante un viaggio attivo e si spegne all'arrivo o quando termini il viaggio.
- **Android.** Durante il viaggio è visibile una notifica fissa (servizio in primo piano). Il Play Store chiede una revisione per i permessi di posizione in background.

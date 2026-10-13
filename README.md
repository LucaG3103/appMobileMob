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
| `src/data/siriLite.ts` · `src/data/providers/lyon.ts` | Lettore SIRI Lite e provider TCL Lione |
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

## Lione (TCL)

I dati vengono da [data.grandlyon.com](https://data.grandlyon.com) (licenza Mobilités): tempo reale in SIRI Lite (`estimated-timetables`, `vehicle-monitoring`, `situation-exchange`) e orari in GTFS.

1. Crea un account gratuito su data.grandlyon.com e chiedi l'accesso ai dati TCL in tempo reale.
2. Crea `.env.local` nella cartella del progetto (non va su git):
   ```
   EXPO_PUBLIC_GRANDLYON_USER=il-tuo-utente
   EXPO_PUBLIC_GRANDLYON_PASSWORD=la-tua-password
   ```
3. Scarica `GTFS_TCL.ZIP` e genera fermate e linee:
   ```bash
   python3 scripts/build_lyon_static.py ~/Downloads/GTFS_TCL.ZIP
   ```

Senza credenziali l'app usa le linee simulate. Il lettore SIRI Lite è scritto sullo standard ma non è ancora stato provato con una risposta reale di TCL: gli identificativi di fermate e linee potrebbero richiedere un aggiustamento.

In metropolitana non c'è GPS: l'app capisce che sei salito quando il treno lascia la fermata e tu non sei più lì, e ti avvisa di scendere in base all'orario previsto di arrivo alla fermata prima della tua.

## Limiti noti

- **Dati per città.** Google Maps e Moovit non hanno API pubbliche per le posizioni dei mezzi; servono i feed open data dell'azienda di trasporto. Ogni città va aggiunta come provider.
- **Credenziali nell'app.** Le variabili `EXPO_PUBLIC_` finiscono nel pacchetto dell'app: va bene per uso personale, non per pubblicarla sullo store.
- **iOS in background.** Serve il permesso di posizione "Sempre". Se l'utente chiude l'app dal multitasking il monitoraggio si ferma. Per l'avviso di arrivo c'è anche una notifica programmata di riserva, aggiornata a ogni lettura.
- **Batteria.** Il GPS è attivo solo durante un viaggio attivo e si spegne all'arrivo o quando termini il viaggio.
- **Android.** Durante il viaggio è visibile una notifica fissa (servizio in primo piano). Il Play Store chiede una revisione per i permessi di posizione in background.

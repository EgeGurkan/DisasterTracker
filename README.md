# Afet Takip (Disaster Tracker) — Earthquake Tracking And Early Warning Platform (Pilot 0.1)

**Live:** [https://egegurkan.github.io/DisasterTracker/](https://egegurkan.github.io/DisasterTracker/)

A Turkish earthquake platform for people living in Turkey who also want to track loved ones in other cities. Running on a single server and data infrastructure, both the **web/PWA** (Android Chrome, iPhone "Add to Home Screen", desktop) and the **iOS/Android app** (Expo / React Native) use the same matching rules.

```
shared/   Shared rules: data model, matching (nearby/saved/worldwide/early warning), merging, Turkish text
server/   Node 24+ (TypeScript, no-build): source adapters, deduplication, persistent priority queue,
          Web Push / FCM / APNs senders, receipts and timing metrics, HTTP API, ops dashboard
web/      Preact + Vite PWA: Earthquakes · Map · Emergency · Alerts · Menu, Service Worker, offline Emergency
mobile/   Expo (React Native) app: same API, FCM/APNs token, Emergency, My Locations, notification test
docs/     Architecture, support matrix, KVKK (data protection), runbook, proposal, delivery report, and evidence

```

## Quick Start

```
npm install

npm run build

npm start

```

The server starts at `http://localhost:8787`, polls AFAD (20s), Kandilli/KOERI (30s), EMSC (60s), USGS (60s), NOA (60s), GEOFON (60s), INGV (90s), JMA (90s), and GeoNet (120s) sources, serves multi-network seismic stations plus the active faults map layer (`/api/faults`), and populates history for reports on initial startup. Data and keys are stored in the `data/` folder (`data/secrets.json` → VAPID keys, receipt secret, `adminToken`).

Both **Web/PWA** and **Mobile** include **Light, Dark, AMOLED (`#000000` true black), and System** theme switching, plus **Turkish (`TR`) and English (`EN`)** localization that opens automatically in Turkish when the device language is Turkish and in English for all other device languages.

Environment variables (all optional): `AFET_PORT`, `AFET_DATA_DIR`, `AFET_PUBLIC_URL` (your https URL for Apple Web Push), `VAPID_SUBJECT`, `OPS_WEBHOOK_URL` (outage notifications), `FCM_SERVICE_ACCOUNT`, `APNS_KEY_PATH`/`APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID`/`APNS_SANDBOX`/`APNS_CRITICAL`, `AFET_NO_POLL=1`.

### Tests And Evidence

```
npm test

node server/scripts/e2e-webpush.ts

npm run report

```

- `npm test`: server-side specification §10 acceptance scenarios (25 tests).
- `e2e-webpush.ts`: real HTTP API + queue + VAPID signature + aes128gcm encryption; push service uses a local emulator. Output: `docs/kanit/e2e-webpush.json`.
- `npm run report`: generates `docs/TESLIM_RAPORU.md` from actual dispatches in the database.

## Real Phone Demo (I'm In Istanbul, My Family Is In Izmir)

1. Start the server and tunnel (an https address accessible by phones):\
   npm run tunnel\
   \
   Pass the resulting `https://….trycloudflare.com` URL as `AFET_PUBLIC_URL` and restart the server.
2. **iPhone (iOS 16.4+)**: open the URL in Safari → Share → **Add to Home Screen** → open from the home screen icon. **Android**: open in Chrome (optionally select "Install app").
3. Tap the **Location** button at the top of the **Earthquakes** screen → select "Use my current location" or search for a place (e.g., **Izmir**) and select it. Notifications for M 3.5+ earthquakes within 100 km of the selected location are enabled automatically. Keep worldwide M 6.5+ enabled. On iPhone, this works even without granting location permission.
4. Go to **Menu → Settings → Notifications → Enable notifications**, then tap **Test my notifications** → "TEST · Notification test".
5. **Team side** (not visible in the user interface): open `http://localhost:8787/#/ops` directly on a computer, enter the admin token, and mark the phone as a **TEST device** in the **Devices** table.
6. Lock the phone; from the dashboard, send **TEST · Near Izmir M 4.2** and **TEST · Japan M 6.8**.
7. On the lock screen: **"TEST · Earthquake recorded 19 km from Izmir"** and **"TEST · Worldwide earthquake"**. Tapping the notification opens the event, distances, source, and "Why did you receive this notification?" (rule + stage durations).
8. Each row in the dashboard shows: which notification, which device, which rule, and how many seconds it took. Run `npm run report` for a permanent report.

TEST events are sent only to devices marked as TEST devices by the team; regular users do not see this setting and never receive them.

## GitHub Pages Version (Single File, Serverless)

Live at: [https://egegurkan.github.io/DisasterTracker/](https://egegurkan.github.io/DisasterTracker/)

```
npm run build:github -w web

```

Outputs `github/index.html` (+ `github/README.md`). Fetches earthquake data directly from EMSC, USGS, GEOFON, NOA, INGV, JMA, and GeoNet, multi-network seismic stations (GEOFON, KOERI EIDA, NOA, INGV), and active fault lines (GEM/MTA) via the browser. Direct AFAD/Kandilli HTML catalogs and push notifications require the server edition. Deployment steps are in `github/README.md`.

## Native App (iOS/Android)

See `mobile/README.md`. Building requires your own accounts: a Firebase project (`google-services.json` + service account), an Apple Developer Program membership (APNs `.p8` key, signing), and separate entitlement from Apple for critical alerts.

## Important Limitations

- **Early warning**: There is no authorized feed with verified usage and distribution rights for Turkey. The app displays: "Earthquake early warning is not available at this location. You can use nearby earthquake notifications." The first measurement in the catalog (preliminary solution) is not used as an early warning. The pipeline works on drill devices with a signed TEST provider.
- **Active faults**: Displayed as a toggleable layer on the map using the GEM / EMME & MTA harmonized active faults compilation; parcel-level municipal soil data and assembly areas link to official viewers.
- **Live multi-agency catalog**: AFAD, Kandilli (KOERI), EMSC, USGS, NOA, GFZ GEOFON, INGV, JMA, and GeoNet are merged with agency deduplication.
- On the web, the siren only plays while the app is open; when closed, the system notification sound is used (Web Push limitation).

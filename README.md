# Disaster Tracker (Afet Takip)

A compact, mobile-first web app that shows recent earthquakes and other natural disasters in Türkiye and worldwide, on a list and on a map. The UI is available in **English and Turkish** and follows the device or browser language. The app ships as a single `index.html` file in the root of this repository: no server is needed, it runs on GitHub Pages and can be wrapped into an Android APK.

Live: https://egegurkan.github.io/DisasterTracker

## Features

- **Disasters List**: Earthquakes, floods, storms, tornadoes, wildfires, volcanoes and tsunamis in one list, newest first. Earthquake rows show magnitude (color plus a text label), time, depth, distance to your selected location and the reporting agencies. Refresh button, plus pull-to-refresh on phones.
- **World / Türkiye**: World is the first tab and always includes Türkiye. Türkiye is the second tab; **press and hold it** to pick any other country.
- **Filters**: The **Filter** button holds the disaster type (earthquake, flood, storm, tornado, wildfire, volcano, tsunami or all), time range, minimum magnitude and seismic source. The same filters apply to the list and the map.
- **Smart Defaults**: On a Turkish phone or browser the app opens on **Türkiye** with **earthquakes only**. In any other language it opens on **World** with **all disaster types**.
- **Location**: The location button sits in the top bar, next to the theme button (icon only on phones). Use your current position or search for a city, district or address; distances are measured from the place you choose.
- **Map**: Epicenters, an estimated felt area per earthquake, other disasters, active fault lines, your locations and seismic stations.
- **Event Detail**: Each agency's separate measurement, distance to your locations, estimated felt radius and a link to the source.
- **Emergency**: Protective action steps (Drop, Cover, Hold On), a **whistle** (continuous or SOS), "I'm safe" / "I'm in danger" message drafts (SMS, WhatsApp, copy; you send them yourself) and **call 112**.
- **Reports, Seismic Network, Preparedness**: Statistics, station status, a guide, family plan, emergency kit, ground and insurance info.
- **Appearance**: Light, Dark, AMOLED (`#000000`) and System themes; Turkish (`TR`) / English (`EN`) switch in the top bar; larger text, reduced motion and screen-reader labels.
- **About**: The user-facing part of this README is built into the app under **Menu → About**.

## Publish On GitHub And Open On Your Phone

1. Push this repository to GitHub (or upload at least **`index.html`** and **`README.md`** with **Add file → Upload files**).
2. Open **Settings → Pages**. Choose **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**, then **Save**.
3. After a minute or two the site is live at `https://<your-username>.github.io/<repository>/`.
4. Open it on your phone:
    - **iPhone**: Safari → Share → **Add to Home Screen**.
    - **Android**: Chrome → ⋮ → **Add to Home screen**.

Location only works on an `https://` address (GitHub Pages already is). Opened as a local file, location and some data may not work.

## Turning It Into An Android APK

`index.html` is fully self-contained (scripts, styles, fonts, icons and sounds are inlined), so any WebView wrapper can load it directly:

- Load either the GitHub Pages URL or the bundled `index.html` from the app's assets.
- Allow **internet** access and, for "use my current location", **location** permission, and enable JavaScript and DOM storage in the WebView.
- Data sources are fetched over HTTPS straight from the device; no backend is required.

## Data Sources

Data is fetched directly by your browser; no server sits in between.

| Source | Used For | Note |
| --- | --- | --- |
| [EMSC SeismicPortal](https://www.seismicportal.eu/) | Türkiye and surroundings, world | Also republishes Türkiye events reported by AFAD and Kandilli |
| [USGS](https://earthquake.usgs.gov/earthquakes/feed/) | World earthquakes, volcano alerts | Earthquake feed and Volcano Hazards Program |
| [NOA-IG](https://bbnet.gein.noa.gr/) | Aegean Sea, Greece, western Türkiye | FDSN event and station feeds |
| [GFZ GEOFON](https://geofon.gfz.de/) | World events and seismic stations | FDSN event and station feeds |
| [INGV](https://terremoti.ingv.it/) | Mediterranean and Italy, MedNet stations | FDSN event and station feeds |
| [KOERI EIDA](https://eida.koeri.boun.edu.tr/) | Türkiye seismic stations | FDSN station metadata |
| [JMA](https://www.jma.go.jp/jma/indexe.html) | Japan and western Pacific | Seismic bulletin and tsunami feeds |
| [GeoNet](https://www.geonet.org.nz/) | New Zealand and SW Pacific | Quake API v2 |
| [NASA EONET](https://eonet.gsfc.nasa.gov/) | Floods, storms, wildfires, volcanoes | Natural events tracker |
| [GDACS](https://www.gdacs.org/) | Global disaster alerts | Floods, cyclones, volcanoes, wildfires |
| [NOAA / NWS](https://www.weather.gov/) | Tornado, flood, storm and tsunami warnings | United States; includes SPC storm reports |
| [GEM / EMME and MTA](https://github.com/GEMScienceTools/gem-global-active-faults) | Active fault lines on the map | CC BY-SA 4.0 |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Map tiles and place search | © OpenStreetMap contributors |

When several agencies report the same earthquake, they are merged into one event and each agency's measurement is shown side by side in the detail view. Place names in Türkiye are written relative to the nearest province center.

## Not Included In The Single-File Version

- **Notifications** (alerts on the lock screen), notification history, chat and "Did you feel it?". These need the server edition described below.
- **AFAD's Own Service**: AFAD does not allow direct browser access, so its measurements arrive via EMSC; magnitudes may differ by a few tenths between agencies.
- **Earthquake Early Warning**: There is no authorized early-warning feed for Türkiye with verified usage rights.
- **Offline Reopen**: While the page is open, the whistle, contacts, message drafts and guides work without internet; reopening the page offline needs the server (PWA) edition or an APK that bundles `index.html`.

## Privacy

Your locations, emergency contacts, family plan and kit list are stored only on your device (browser storage). Your current location is never sent anywhere; place search sends only the text you type to OpenStreetMap.

## Important

This app is not an official warning channel. Follow [AFAD](https://www.afad.gov.tr/) and local authorities for official announcements. In an emergency, call **112**.

<!-- about:end -->

## For Developers

The repository also contains the full platform: a server with push notifications, a PWA and a native app that share the same matching rules.

```
index.html  Single-file, serverless build for GitHub Pages / APK (generated, do not edit by hand)
shared/     Shared rules: data model, matching (nearby/saved/worldwide/early warning), merging, Turkish text
server/     Node 24+ (TypeScript, no-build): source adapters, deduplication, persistent priority queue,
            Web Push / FCM / APNs senders, receipts and timing metrics, HTTP API, ops dashboard
web/        Preact + Vite app source: Disasters · Map · Emergency · Alerts · Menu, Service Worker, offline Emergency
mobile/     Expo (React Native) app: same API, FCM/APNs token, Emergency, My Locations, notification test
docs/       Architecture, support matrix, KVKK (data protection), runbook, proposal, delivery report, and evidence
```

### Rebuilding The Single File

Edit the source in `web/`, then run in the project root:

```
npm install
npm run build:github -w web
```

Output: `index.html` in the project root. This README (up to the developer section) is embedded into it at build time.

### Server Edition Quick Start

```
npm install
npm run build
npm start
```

The server starts at `http://localhost:8787`, polls AFAD (20s), Kandilli/KOERI (30s), EMSC (60s), USGS (60s), NOA (60s), GEOFON (60s), INGV (90s), JMA (90s), and GeoNet (120s) sources, serves multi-network seismic stations plus the active faults map layer (`/api/faults`), and populates history for reports on initial startup. Data and keys are stored in the `data/` folder (`data/secrets.json` → VAPID keys, receipt secret, `adminToken`).

Environment variables (all optional): `AFET_PORT`, `AFET_DATA_DIR`, `AFET_PUBLIC_URL` (your https URL for Apple Web Push), `VAPID_SUBJECT`, `OPS_WEBHOOK_URL` (outage notifications), `FCM_SERVICE_ACCOUNT`, `APNS_KEY_PATH`/`APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID`/`APNS_SANDBOX`/`APNS_CRITICAL`, `AFET_NO_POLL=1`.

### Tests And Evidence

```
npm test
node server/scripts/e2e-webpush.ts
npm run report
```

- `npm test`: Server-side specification §10 acceptance scenarios (25 tests).
- `e2e-webpush.ts`: Real HTTP API + queue + VAPID signature + aes128gcm encryption; the push service uses a local emulator. Output: `docs/kanit/e2e-webpush.json`.
- `npm run report`: Generates `docs/TESLIM_RAPORU.md` from actual dispatches in the database.

### Real Phone Demo (I'm In Istanbul, My Family Is In Izmir)

1. Start the server and a tunnel (an https address reachable by phones) with `npm run tunnel`. Pass the resulting `https://….trycloudflare.com` URL as `AFET_PUBLIC_URL` and restart the server.
2. **iPhone (iOS 16.4+)**: Open the URL in Safari → Share → **Add to Home Screen** → open from the home screen icon. **Android**: Open in Chrome (optionally select "Install app").
3. Tap the **Location** button in the top bar → select "Use my current location" or search for a place (e.g. **Izmir**). Notifications for M 3.5+ earthquakes within 100 km of the selected location are enabled automatically. Keep worldwide M 6.5+ enabled. On iPhone this works even without granting location permission.
4. Go to **Menu → Settings → Notifications → Enable notifications**, then tap **Test my notifications** → "TEST · Notification test".
5. **Team side** (not visible in the user interface): Open `http://localhost:8787/#/ops` on a computer, enter the admin token, and mark the phone as a **TEST device** in the **Devices** table.
6. Lock the phone; from the dashboard, send **TEST · Near Izmir M 4.2** and **TEST · Japan M 6.8**.
7. On the lock screen: **"TEST · Earthquake recorded 19 km from Izmir"** and **"TEST · Worldwide earthquake"**. Tapping the notification opens the event, distances, source, and "Why did you receive this notification?" (rule + stage durations).
8. Each row in the dashboard shows which notification, which device, which rule, and how many seconds it took. Run `npm run report` for a permanent report.

TEST events are sent only to devices marked as TEST devices by the team; regular users never see this setting or receive them.

### Native App (iOS/Android)

See `mobile/README.md`. Building requires your own accounts: a Firebase project (`google-services.json` + service account), an Apple Developer Program membership (APNs `.p8` key, signing), and separate entitlement from Apple for critical alerts.

### Platform Limitations

- **Early Warning**: There is no authorized feed with verified usage and distribution rights for Türkiye. The app shows: "Earthquake early warning is not available at this location. You can use nearby earthquake notifications." The first catalog measurement (preliminary solution) is not used as an early warning. The pipeline works on drill devices with a signed TEST provider.
- **Active Faults**: Shown as a toggleable map layer using the GEM / EMME & MTA harmonized active faults compilation; parcel-level municipal soil data and assembly areas link to official viewers.
- **Live Multi-Agency Catalog**: AFAD, Kandilli (KOERI), EMSC, USGS, NOA, GFZ GEOFON, INGV, JMA, and GeoNet are merged with agency deduplication.
- **Web Siren**: On the web, the siren only plays while the app is open; when closed, the system notification sound is used (Web Push limitation).

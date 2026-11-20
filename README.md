# Afet Takip

A mobile-friendly web app (Turkish UI) that shows recent earthquakes in Türkiye and worldwide on a list and a map.
It is a single `index.html` file: no server required, it runs directly on GitHub Pages.

## Features

- **Earthquakes**: Last 1 hour / 24 hours / 7 days / 30 days; Türkiye, world or all; magnitude and source filters.
  Each row shows magnitude (color plus a text label such as "Küçük/Hafif/Orta"), time, depth, distance to your
  selected location and the reporting source. Refresh button, plus pull-to-refresh on phones.
- **Location**: Use the **Konum** (Location) button at the top to pick "Mevcut konumumu kullan" (use my current
  location) or search for a city, district or address. Distances are calculated from the place you choose.
- **Map**: Epicenters, an **estimated felt area** for each event (semi-transparent circle sized by magnitude),
  your locations, and seismic stations. Refresh, go-to-my-location and layer buttons float on top of the map.
- **Event detail**: Each agency's separate measurement, distance to your locations, estimated felt radius, link to the source.
- **Emergency (Acil)**: Protective action (Drop, Cover, Hold On), **whistle** (continuous or SOS),
  **"I'm safe" / "I'm in danger"** message drafts (SMS, WhatsApp, copy; you do the actual sending) and **call 112**.
- **Reports**, **Seismic Network**, **Preparedness** (guide, family plan, emergency kit, ground and insurance info).
- Light / dark / system theme, larger text, reduced motion, screen-reader labels.

## Publish on GitHub and open on your phone

1. Create a new repository on GitHub (e.g. `afet-takip`) and upload **`index.html`** and **`README.md`** from this folder
   ("Add file → Upload files").
2. Go to **Settings → Pages** in the repository. Choose **Source: Deploy from a branch**, **Branch: `main`**,
   folder **`/ (root)`**, then click **Save**.
3. After a minute or two the site address appears: `https://<your-username>.github.io/afet-takip/`
4. Open that address on your phone.
   - **iPhone**: Safari → Share → **Add to Home Screen**.
   - **Android**: Chrome → ⋮ → **Add to Home screen**.

Location only works on an `https://` address; GitHub Pages is already https. If you open the file directly on the
phone (as a local file), location and some data may not work.

## Data sources

Data is fetched directly by your browser; no server sits in between.

| Source | Used for | Note |
|---|---|---|
| [EMSC SeismicPortal](https://www.seismicportal.eu/) | Türkiye and surroundings, world | Also publishes Türkiye events reported by AFAD and Kandilli |
| [USGS](https://earthquake.usgs.gov/earthquakes/feed/) | World | |
| [GFZ GEOFON](https://geofon.gfz.de/) | Seismic stations | |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Map tiles and place search | © OpenStreetMap contributors |

When several agencies report the same earthquake, they are merged into one event and each agency's measurement
is shown side by side in the detail view. Place names in Türkiye are written relative to the nearest province
center (e.g. "Malatya yakını", near Malatya).

## Not included in this version

- **Notifications** (earthquake alerts on the lock screen), notification history, chat and "I felt it".
  These need a server and are available in the server version of the project.
- **AFAD's own service**: AFAD does not allow direct browser access, so it is not used here.
  AFAD measurements arrive via EMSC; magnitudes may differ by a few tenths between agencies.
- **Earthquake early warning**: there is no authorized early-warning feed for Türkiye with verified usage rights.
- Offline cache: while the page is open, the whistle, your contacts, message drafts and the guide work without
  internet; reopening the page offline requires the server version.

## Privacy

Your locations, emergency contacts, family plan and kit list are stored only on your phone (browser storage).
Your current location is never sent anywhere; place search sends only the text you type to OpenStreetMap.

## Important

This app is not an official warning channel. Follow [AFAD](https://www.afad.gov.tr/) and governorates for official
announcements. In an emergency, call **112**.

## Rebuilding (for developers)

The source code lives in the main project. To regenerate the single file, run in the project root:

```
npm install
npm run build:github -w web
```

Output: `github/index.html`.

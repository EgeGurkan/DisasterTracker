// Konum seçimi: mevcut konum, yer arama ve kayıtlı yerler tek panelde.
// Seçilen/eklenen yerin çevresindeki depremler için bildirim otomatik açılır.
import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import type { SavedLocation } from '../../shared/src/types.ts';
import { RADIUS_SHORTCUTS } from '../../shared/src/defaults.ts';
import { isActiveLocationUsable, placeName } from '../../shared/src/match.ts';
import { dative } from '../../shared/src/turkish.ts';
import { addPlace, currentLabel, measureActiveLocation, searchPlaces, type PlaceResult } from './geo.ts';
import { Icon } from './icons.tsx';
import { updatePrefs, useAppState } from './state.ts';
import { Sheet, Switch, toast } from './ui.tsx';
import { tileLayer } from './pages/map.tsx';
import { STANDALONE } from './standalone.ts';
import { fmtDec, fmtTime, isEn, lang, tx } from './i18n.ts';

function PlaceSearch({ onPick }: { onPick: (r: PlaceResult) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<PlaceResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setRes([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      const r = await searchPlaces(q);
      setRes(r.results); setOffline(!r.online); setBusy(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <label class="sr-only" for="placeq">{tx('Yer ara', 'Search place')}</label>
      <div class="search">
        <Icon name="search" />
        <input id="placeq" class="input" type="search" autoComplete="off"
          placeholder={tx('Şehir, ilçe, mahalle veya adres ara', 'Search city, district, neighborhood, or address')}
          value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        {busy && <span class="spin" aria-label={tx('Aranıyor', 'Searching')} />}
      </div>
      {offline && <p class="small muted" style="margin:6px 4px">{tx('Çevrimdışısın; yalnız il adları aranabiliyor.', 'You are offline; only province names can be searched.')}</p>}
      {res.length > 0 && (
        <ul class="pick-list" aria-label={tx('Arama sonuçları', 'Search results')}>
          {res.map((r) => (
            <li key={`${r.name}${r.lat}`}>
              <button class="pick" onClick={() => onPick(r)}>
                <span class="ic"><Icon name="pin" /></span>
                <span style="flex:1;min-width:0"><span class="t">{r.name}</span><span class="d">{r.detail}</span></span>
                <Icon name="plus" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 3 && !busy && res.length === 0 && <p class="small muted" style="margin:8px 4px">{tx('Sonuç bulunamadı.', 'No results found.')}</p>}
      <p class="small muted" style="margin:8px 4px 0">{tx('Arama metni OpenStreetMap’e gönderilir; konumun gönderilmez.', 'Search text is sent to OpenStreetMap; your GPS location is never sent.')}</p>
    </div>
  );
}

/** Depremler ekranındaki konum düğmesinin açtığı panel. */
export function LocationSheet({ selectedId, onSelect, onClose }: { selectedId: string; onSelect: (id: string) => void; onClose: () => void }) {
  const s = useAppState();
  const l = lang();
  const a = s.prefs.active;
  const usable = isActiveLocationUsable(a, Date.now());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SavedLocation | null>(null);

  const useCurrent = async () => {
    setBusy(true);
    const r = await measureActiveLocation();
    setBusy(false);
    if (r.ok) {
      onSelect('active');
      toast(STANDALONE
        ? tx('Mevcut konumun seçildi; mesafeler buna göre gösteriliyor.', 'Current location selected; distances are calculated from it.')
        : tx('Mevcut konumunun çevresindeki depremler için bildirim alacaksın.', 'You will receive notifications for earthquakes near your current location.'));
      onClose();
    } else toast(r.message);
  };
  const pick = (r: PlaceResult) => {
    const loc = addPlace({ name: r.name, lat: r.lat, lon: r.lon });
    onSelect(loc.id);
    toast(STANDALONE
      ? tx(`${r.name} seçildi; mesafeler buna göre gösteriliyor.`, `${r.name} selected; distances are calculated from it.`)
      : isEn()
        ? `${r.name} added. You will be notified for M 3.5+ earthquakes within 100 km of ${r.name}.`
        : `${r.name} eklendi. ${dative(r.name)} 100 km içindeki M 3,5+ depremler için bildirim alacaksın.`);
    onClose();
  };

  if (editing) return <PlaceEditor loc={editing} onClose={() => setEditing(null)} />;

  return (
    <Sheet title={tx('Konum seç', 'Select location')} onClose={onClose}>
      <div class="stack">
        <PlaceSearch onPick={pick} />
        <div>
          <div class="section-title" style="margin-top:8px">{tx('Konumlarım', 'My Locations')}</div>
          <ul class="pick-list" role="radiogroup" aria-label={tx('Mesafelerin ölçüldüğü konum', 'Location used for distances')}>
            <li>
              {usable ? (
                <div class="pick" role="radio" aria-checked={selectedId === 'active'} tabIndex={0}
                  onClick={() => { onSelect('active'); onClose(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { onSelect('active'); onClose(); } }}>
                  <span class="ic cur"><Icon name="locate" /></span>
                  <span style="flex:1;min-width:0"><span class="t">{currentLabel()}</span>
                    <span class="d">{tx('Ölçüm', 'Measured')} {fmtTime(a.measuredAt!)}{a.accuracyM ? ` · ±${Math.round(a.accuracyM)} m` : ''}</span></span>
                  <button class="btn sm ghost" onClick={(e) => { e.stopPropagation(); void useCurrent(); }} aria-label={tx('Mevcut konumu güncelle', 'Update current location')} disabled={busy}><Icon name="refresh" /></button>
                  {selectedId === 'active' && <Icon name="check" />}
                </div>
              ) : (
                <button class="pick" onClick={() => void useCurrent()} disabled={busy}>
                  <span class="ic cur"><Icon name="locate" /></span>
                  <span style="flex:1"><span class="t">{busy ? tx('Konum alınıyor…', 'Getting location…') : tx('Mevcut konumumu kullan', 'Use my current location')}</span>
                    <span class="d">{a.permission === 'denied'
                      ? tx('Konum izni kapalı; tarayıcı ayarlarından açabilirsin', 'Location permission disabled; enable in browser settings')
                      : tx('Telefonunun konumunu al', 'Use your device GPS location')}</span></span>
                </button>
              )}
            </li>
            {s.prefs.saved.map((loc) => (
              <li key={loc.id}>
                <div class="pick" role="radio" aria-checked={selectedId === loc.id} tabIndex={0}
                  onClick={() => { onSelect(loc.id); onClose(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { onSelect(loc.id); onClose(); } }}>
                  <span class="ic"><Icon name="pin" /></span>
                  <span style="flex:1;min-width:0"><span class="t">{placeName(loc.label, loc.place, l)}</span>
                    <span class="d">{loc.enabled
                      ? `${tx('Bildirim açık', 'Alerts on')} · ${loc.radiusKm} km · M ${fmtDec(loc.minMag)}+`
                      : tx('Bildirim kapalı', 'Alerts off')}</span></span>
                  <button class="btn sm ghost" onClick={(e) => { e.stopPropagation(); setEditing(loc); }} aria-label={`${placeName(loc.label, loc.place, l)} ${tx('ayarları', 'settings')}`}><Icon name="edit" /></button>
                  {selectedId === loc.id && <Icon name="check" />}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p class="small muted" style="margin:0 4px">{STANDALONE
          ? tx('Seçtiğin yere göre listede ve haritada mesafeler gösterilir. Bildirimler bu (sunucusuz) sürümde yok.', 'Distances in the list and map are calculated from your selected place. Push notifications are not included in this serverless edition.')
          : tx('Eklediğin her yerin çevresindeki depremler için bildirim alırsın; konum izni gerekmez. Yarıçapı ve büyüklük eşiğini kalem simgesinden değiştirebilirsin.', 'You receive alerts for earthquakes around every saved place without needing GPS permission. Tap the pencil icon to adjust radius and minimum magnitude.')}</p>
      </div>
    </Sheet>
  );
}

/** Ayarlar ekranında "Yer ekle": yalnız arama + mevcut konum. */
export function AddPlaceSheet({ onClose }: { onClose: () => void }) {
  const pick = (r: PlaceResult) => {
    addPlace({ name: r.name, lat: r.lat, lon: r.lon });
    toast(STANDALONE ? tx(`${r.name} eklendi.`, `${r.name} added.`) : tx(`${r.name} eklendi; bildirimleri açık.`, `${r.name} added; notifications enabled.`));
    onClose();
  };
  return (
    <Sheet title={tx('Yer ekle', 'Add place')} onClose={onClose}>
      <PlaceSearch onPick={pick} />
    </Sheet>
  );
}

/** Kayıtlı yerin ayrıntılı ayarları: isim, haritada düzeltme, yarıçap, eşik, sil. */
export function PlaceEditor({ loc, onClose }: { loc: SavedLocation; onClose: () => void }) {
  const [l, setL] = useState<SavedLocation>(loc);
  const el = useRef<HTMLDivElement>(null);
  const mk = useRef<L.Marker | null>(null);
  const circ = useRef<L.Circle | null>(null);
  const lg = lang();

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current).setView([l.lat, l.lon], 9);
    tileLayer().addTo(map);
    const icon = L.divIcon({ className: '', html: '<div style="width:22px;height:22px;border-radius:50%;background:#0A6F78;border:4px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
    const marker = L.marker([l.lat, l.lon], { draggable: true, icon, keyboard: true, title: tx('Konum işareti — sürükleyerek düzelt', 'Location pin — drag to adjust') }).addTo(map);
    marker.on('dragend', () => { const p = marker.getLatLng(); setL((x) => ({ ...x, lat: +p.lat.toFixed(5), lon: +p.lng.toFixed(5) })); });
    map.on('click', (e: L.LeafletMouseEvent) => { marker.setLatLng(e.latlng); setL((x) => ({ ...x, lat: +e.latlng.lat.toFixed(5), lon: +e.latlng.lng.toFixed(5) })); });
    circ.current = L.circle([l.lat, l.lon], { radius: l.radiusKm * 1000, color: '#0A6F78', weight: 1.5, fillOpacity: 0.06, interactive: false }).addTo(map);
    mk.current = marker;
    setTimeout(() => map.invalidateSize(), 250);
    return () => { map.remove(); };
  }, []);
  useEffect(() => { mk.current?.setLatLng([l.lat, l.lon]); circ.current?.setLatLng([l.lat, l.lon]).setRadius(l.radiusKm * 1000); }, [l.lat, l.lon, l.radiusKm]);

  const save = () => {
    updatePrefs((p) => ({ ...p, saved: p.saved.map((x) => (x.id === l.id ? l : x)) }));
    toast(tx('Kaydedildi.', 'Saved.'));
    onClose();
  };
  const remove = () => {
    if (!confirm(tx(`${placeName(l.label, l.place, lg)} kaldırılsın mı? Bu yer için bildirim gelmez.`, `Remove ${placeName(l.label, l.place, lg)}? You will no longer receive alerts for this place.`))) return;
    updatePrefs((p) => ({ ...p, saved: p.saved.filter((x) => x.id !== l.id) }));
    onClose();
  };

  return (
    <Sheet title={placeName(l.label, l.place, lg)} onClose={onClose}>
      <div class="toggle-row" style="padding-top:0">
        <div class="txt">
          <strong>{tx('Bu yerin bildirimleri', 'Notifications for this place')}</strong>
          <div class="small muted">
            {isEn()
              ? `M ${fmtDec(l.minMag)}+ earthquakes within ${l.radiusKm} km of ${l.place || l.label || 'this place'}`
              : `${dative(l.place || l.label || 'Bu yer')} ${l.radiusKm} km içindeki M ${fmtDec(l.minMag)} ve üzeri depremler`}
          </div>
        </div>
        <Switch checked={l.enabled} onChange={(v) => setL({ ...l, enabled: v })} label={tx('Bu yerin bildirimleri', 'Notifications for this place')} />
      </div>
      <div class="field" style="margin-top:12px">
        <label for="pl-name">{tx('İsim (isteğe bağlı)', 'Label (optional)')}</label>
        <input id="pl-name" class="input" maxLength={40} value={l.label} placeholder={tx('ör. Ev, İş, Annemlerin evi', 'e.g. Home, Work, Parents')} onInput={(e) => setL({ ...l, label: (e.target as HTMLInputElement).value })} />
        <span class="small muted">
          {isEn()
            ? `Shown in alert title as “Earthquake recorded 42 km from ${placeName(l.label, l.place || 'this place', 'en')}”.`
            : `Bildirim başlığında “${l.label.trim() ? `${l.label.trim()} · ${dative(l.place)}` : dative(l.place || 'Bu yer')} 42 km uzaklıkta deprem kaydedildi” olarak görünür.`}
        </span>
      </div>
      <div class="field">
        <span class="label">{tx('Konumu düzelt', 'Adjust pin location')}</span>
        <div ref={el} class="map small" role="application" aria-label={tx('Konumu düzeltmek için haritaya dokun veya işareti sürükle', 'Tap map or drag pin to adjust location')} />
        <span class="small muted">{tx('Haritaya dokun veya işareti sürükle.', 'Tap the map or drag the pin.')}</span>
      </div>
      <div class="field">
        <span class="label">{tx('Yarıçap', 'Radius')}</span>
        <div class="chips" role="group" aria-label={tx('Yarıçap', 'Radius')}>
          {RADIUS_SHORTCUTS.map((k) => <button type="button" key={k} class="chip" aria-pressed={l.radiusKm === k} onClick={() => setL({ ...l, radiusKm: k })}>{k} km</button>)}
          <label class="sr-only" for="pl-r">{tx('Elle yarıçap (km)', 'Custom radius (km)')}</label>
          <input id="pl-r" class="input" style="width:96px;min-height:44px" type="number" inputMode="numeric" min={1} max={2000} value={l.radiusKm}
            onInput={(e) => { const n = Number((e.target as HTMLInputElement).value); if (n > 0) setL({ ...l, radiusKm: n }); }} />
        </div>
      </div>
      <div class="field">
        <span class="label">{tx('En küçük büyüklük', 'Minimum magnitude')}</span>
        <div class="chips" role="group" aria-label={tx('Büyüklük eşiği', 'Magnitude threshold')}>
          {[2.5, 3, 3.5, 4, 4.5, 5].map((m) => <button type="button" key={m} class="chip" aria-pressed={l.minMag === m} onClick={() => setL({ ...l, minMag: m })}>M {fmtDec(m)}+</button>)}
        </div>
      </div>
      <div class="row" style="margin-top:6px">
        <button class="btn ghost" onClick={remove} style="color:var(--red)"><Icon name="trash" /> {tx('Kaldır', 'Remove')}</button>
        <span class="spacer" />
        <button class="btn primary" onClick={save}>{tx('Kaydet', 'Save')}</button>
      </div>
    </Sheet>
  );
}

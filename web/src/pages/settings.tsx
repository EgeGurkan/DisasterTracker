import { useEffect, useState } from 'preact/hooks';
import type { SavedLocation, ThemeMode } from '../../../shared/src/types.ts';
import { getChannels, RADIUS_SHORTCUTS } from '../../../shared/src/defaults.ts';
import { eewNotAvailableText, isActiveLocationUsable, placeName } from '../../../shared/src/match.ts';
import { api, ApiError, onSync, type SyncStatus } from '../api.ts';
import { currentLabel, measureActiveLocation } from '../geo.ts';
import { Icon } from '../icons.tsx';
import { AddPlaceSheet, PlaceEditor } from '../locationPicker.tsx';
import { currentSubscription, disablePush, enablePush, isIOS, notificationPermission, platformId, platformLabel, pushSupport } from '../platform.ts';
import { go, type Route } from '../router.ts';
import { resetLocal, setLang, setState, setTheme, updatePrefs, useAppState } from '../state.ts';
import { Ext, fmtMs, Notice, Switch, toast, ToggleRow } from '../ui.tsx';
import type { DeliveryInfo } from './events.tsx';
import { serverOnlyText, STANDALONE } from '../standalone.ts';
import { detectDeviceLang, fmtDateTime, fmtDec, fmtRel, fmtTime, lang, tx } from '../i18n.ts';

export function SettingsPage({ r }: { r: Route }) {
  useAppState();
  const sec = r.path[1];
  const [sync, setSync] = useState<SyncStatus>('idle');
  useEffect(() => onSync(setSync), []);

  const sections = [
    ['konumlar', tx('Konumlarım', 'My Locations'), 'pin'],
    ['bildirimler', tx('Bildirimler', 'Notifications'), 'bell'],
    ['kisiler', tx('Acil kişiler', 'Emergency Contacts'), 'users'],
    ['gorunum', tx('Görünüm, tema ve dil', 'Appearance, Theme & Language'), 'eye'],
    ['gizlilik', tx('Gizlilik ve verilerim', 'Privacy & My Data'), 'lock'],
  ] as const;

  return (
    <div style="margin-top:12px">
      {!sec && (
        <nav class="card flush" aria-label={tx('Ayar bölümleri', 'Settings sections')}>
          {sections.map(([k, l, i]) => <a key={k} class="list-link" href={`#/ayarlar/${k}`}><span class="ic"><Icon name={i} /></span><span class="t" style="flex:1">{l}</span><Icon name="chev" /></a>)}
        </nav>
      )}
      {sec && <a class="btn sm ghost" href="#/ayarlar" style="margin-bottom:8px"><Icon name="back" /> {tx('Ayarlar', 'Settings')}</a>}
      {sec && sync !== 'idle' && (
        <p class="small muted" role="status" aria-live="polite">
          {sync === 'pending' ? tx('Kaydediliyor…', 'Saving…')
            : sync === 'saved' ? tx('✓ Kaydedildi.', '✓ Saved.')
            : sync === 'offline' ? tx('Çevrimdışı: bu cihazda saklandı, bağlantı gelince kaydedilecek.', 'Offline: saved on this device, will sync when online.')
            : tx('Kaydedilemedi; tekrar denenecek.', 'Could not save; will retry.')}
        </p>
      )}
      {sec === 'konumlar' && <Locations />}
      {sec === 'bildirimler' && <Notifications r={r} />}
      {sec === 'kisiler' && <Contacts />}
      {sec === 'gorunum' && <Appearance />}
      {sec === 'gizlilik' && <Privacy />}
    </div>
  );
}

// ---------------- Konumlarım ----------------
function Locations() {
  const s = useAppState();
  const l = lang();
  const a = s.prefs.active;
  const [editing, setEditing] = useState<SavedLocation | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const usable = isActiveLocationUsable(a, Date.now());
  const setA = (p: Partial<typeof a>) => updatePrefs((x) => ({ ...x, active: { ...x.active, ...p } }));

  return (
    <div class="stack">
      <p class="small muted" style="margin:0 4px">{STANDALONE
        ? tx('Depremler listesindeki mesafeler bu konumlara göre hesaplanır. Mevcut konumun telefonundan alınır; diğer yerleri arayarak eklersin.', 'Distances in the Earthquakes list are calculated from these locations. Your current location comes from your device; search to add other places.')
        : tx('Buradaki her konumun çevresindeki depremler için bildirim alırsın. Mevcut konumun telefonundan alınır; diğer yerleri arayarak eklersin (konum izni gerekmez).', 'You receive notifications for earthquakes around every location listed here. Current location uses device GPS; add other places via search (no location permission needed).')}</p>

      <div class="card">
        <div class="row" style="align-items:flex-start">
          <span class="ic-round cur"><Icon name="locate" /></span>
          <div style="flex:1;min-width:0">
            <strong>{currentLabel()}</strong>
            <div class="small muted">
              {usable ? `${tx('Ölçüm', 'Measured')} ${fmtTime(a.measuredAt!)} (${fmtRel(a.measuredAt!)})${a.accuracyM ? ` · ±${Math.round(a.accuracyM)} m` : ''}`
                : a.permission === 'denied' ? tx('Konum izni kapalı', 'Location permission denied') : tx('Henüz alınmadı', 'Not measured yet')}
            </div>
          </div>
          <Switch checked={a.enabled} onChange={(v) => setA({ enabled: v })} label={tx('Mevcut konumum için bildirim', 'Notifications for my current location')} />
        </div>
        <button class="btn block" style="margin-top:12px" disabled={busy} onClick={async () => { setBusy(true); const r = await measureActiveLocation(); setBusy(false); toast(r.message); }}>
          <Icon name="locate" /> {busy ? tx('Konum alınıyor…', 'Getting location…') : usable ? tx('Konumumu güncelle', 'Update my location') : tx('Mevcut konumumu kullan', 'Use my current location')}
        </button>
        {a.enabled && (
          <div style="margin-top:14px">
            <span class="label small" style="font-weight:700">{tx('Yarıçap', 'Radius')}</span>
            <div class="chips" style="margin:6px 0 10px">{RADIUS_SHORTCUTS.map((k) => <button key={k} class="chip" aria-pressed={a.radiusKm === k} onClick={() => setA({ radiusKm: k })}>{k} km</button>)}</div>
            <span class="label small" style="font-weight:700">{tx('En küçük büyüklük', 'Minimum magnitude')}</span>
            <div class="chips" style="margin-top:6px">{[2.5, 3, 3.5, 4, 4.5, 5].map((m) => <button key={m} class="chip" aria-pressed={a.minMag === m} onClick={() => setA({ minMag: m })}>M {fmtDec(m)}+</button>)}</div>
          </div>
        )}
        <p class="small muted" style="margin:10px 0 0">{tx('Yalnız son ölçüm saklanır, hareket geçmişi tutulmaz. 6 saatten eski ölçüm bildirimde kullanılmaz.', 'Only the latest measurement is stored; no location history is kept. Measurements older than 6 hours are not used for alerts.')}</p>
      </div>

      {s.prefs.saved.length > 0 && (
        <ul class="pick-list" aria-label={tx('Eklediğin yerler', 'Saved places')}>
          {s.prefs.saved.map((loc) => (
            <li key={loc.id}>
              <div class="pick" style="cursor:default">
                <span class="ic"><Icon name="pin" /></span>
                <button class="linklike" style="flex:1;min-width:0" onClick={() => setEditing(loc)} aria-label={`${placeName(loc.label, loc.place, l)} ${tx('ayarları', 'settings')}`}>
                  <span class="t">{placeName(loc.label, loc.place, l)}</span>
                  <span class="d">{loc.enabled ? `${loc.radiusKm} km · M ${fmtDec(loc.minMag)}+` : tx('Bildirim kapalı', 'Alerts off')}</span>
                </button>
                <Switch checked={loc.enabled} onChange={(v) => updatePrefs((p) => ({ ...p, saved: p.saved.map((x) => (x.id === loc.id ? { ...x, enabled: v } : x)) }))} label={`${placeName(loc.label, loc.place, l)} ${tx('bildirimleri', 'notifications')}`} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {s.prefs.saved.length < 10 && <button class="btn primary block" onClick={() => setAdding(true)}><Icon name="search" /> {tx('Yer ara ve ekle', 'Search and add place')}</button>}

      <div class="section-title">{tx('Dünya geneli', 'Worldwide')}</div>
      <div class="card">
        <ToggleRow title={tx('Dünyadaki büyük depremler', 'Major earthquakes worldwide')} checked={s.prefs.world.enabled} onChange={(v) => updatePrefs((p) => ({ ...p, world: { ...p.world, enabled: v } }))}
          desc={tx('Nerede olursa olsun; konum izni gerekmez.', 'Anywhere in the world; no location permission needed.')}
          example={tx('Dünya genelinde deprem — Japonya · M 6,8 (Mw) · 03:12 · Kaynak: USGS', 'Worldwide earthquake — Japan · M 6.8 (Mw) · 03:12 · Source: USGS')} />
        {s.prefs.world.enabled && (
          <div class="chips" style="margin-top:8px">{[5.5, 6, 6.5, 7, 7.5].map((m) => <button key={m} class="chip" aria-pressed={s.prefs.world.minMag === m} onClick={() => updatePrefs((p) => ({ ...p, world: { ...p.world, minMag: m } }))}>M {fmtDec(m)}+</button>)}</div>
        )}
      </div>

      <div class="section-title">{tx('Sarsıntı erken uyarısı', 'Earthquake Early Warning')}</div>
      <div class="card">
        <Notice kind="amber">{eewNotAvailableText(l)}</Notice>
        <ToggleRow title={tx('Yetkili erken uyarıları al', 'Receive authorized early warnings')} checked={s.prefs.eew.enabled} onChange={(v) => updatePrefs((p) => ({ ...p, eew: { ...p.eew, enabled: v } }))}
          desc={tx('Yetkili bir sağlayıcı olduğunda, konumlarından biri hedef alandaysa.', 'When an authorized provider is available and one of your locations falls inside the target zone.')} />
        <ToggleRow title={tx('Uzaktaki yerler için sesli uyarı', 'Play sound for remote saved places')} checked={s.prefs.eew.remoteSound} onChange={(v) => updatePrefs((p) => ({ ...p, eew: { ...p.eew, remoteSound: v } }))}
          desc={tx('Kapalıyken başka şehirdeki yerin için gelen uyarı sessiz görünür; mevcut konumun için olan her zaman sesli.', 'When off, alerts for saved places in other cities arrive silently; alerts for your current location always play sound.')} />
      </div>
      {editing && <PlaceEditor loc={editing} onClose={() => setEditing(null)} />}
      {adding && <AddPlaceSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

// ---------------- Bildirimler ----------------
function Notifications({ r }: { r: Route }) {
  if (STANDALONE) {
    return (
      <div class="card">
        <h3>{tx('Bildirimler', 'Notifications')}</h3>
        <Notice kind="amber" icon="bell">{serverOnlyText()}</Notice>
        <p class="small muted" style="margin-top:10px">{tx('Bu sürüm deprem listesini, haritayı, raporları ve Acil araçlarını sunucu olmadan gösterir. Telefonuna bildirim gelmesi için uygulamanın sunucuyla birlikte çalışan sürümünü kullan.', 'This edition displays the earthquake list, map, reports, and Emergency tools without a backend server. Use the server-backed edition for lock-screen push alerts.')}</p>
      </div>
    );
  }
  return <NotificationsServer r={r} />;
}

function NotificationsServer({ r }: { r: Route }) {
  const s = useAppState();
  const l = lang();
  const sup = pushSupport();
  const [perm, setPerm] = useState(notificationPermission());
  const [hasSub, setHasSub] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [dev, setDev] = useState<{ pushValid: boolean; pushInvalidReason: string | null; lastTestOkAt: string | null } | null>(null);
  const [test, setTest] = useState<DeliveryInfo | null>(null);

  const refresh = async () => {
    setPerm(notificationPermission());
    setHasSub(!!(await currentSubscription().catch(() => null)));
    if (s.device) setDev(await api<{ pushValid: boolean; pushInvalidReason: string | null; lastTestOkAt: string | null }>('/api/devices/me').catch(() => null));
  };
  useEffect(() => { void refresh(); }, [s.device?.id]);
  useEffect(() => {
    if (!s.lastTestDeliveryId || !s.device) return;
    let n = 0;
    const t = setInterval(async () => {
      const d = await api<DeliveryInfo>(`/api/deliveries/${s.lastTestDeliveryId}`).catch(() => null);
      if (d) setTest(d);
      if (++n > 30 || d?.stages.displayedAt) { clearInterval(t); void refresh(); }
    }, 1500);
    return () => clearInterval(t);
  }, [s.lastTestDeliveryId]);

  const enable = async () => {
    setBusy(true);
    try { const res = await enablePush(); toast(res.message); } catch (e) { toast(`${tx('Açılamadı:', 'Could not enable:')} ${(e as Error).message}`); }
    setBusy(false);
    void refresh();
  };
  const sendTest = async () => {
    try {
      const res = await api<{ deliveryId: string }>('/api/devices/me/test', { method: 'POST' });
      setTest(null);
      setState(() => ({ lastTestDeliveryId: res.deliveryId }));
      toast(tx('Deneme gönderildi. Birkaç saniye içinde “TEST · Bildirim denemesi” görünmeli.', 'Test sent. “TEST · Notification check” should appear within a few seconds.'));
    } catch (e) { toast(e instanceof ApiError ? e.message : tx('Gönderilemedi', 'Could not send')); }
  };

  const active = perm === 'granted' && hasSub && dev?.pushValid;
  return (
    <div class="stack">
      <div class="card">
        <h3>{tx('Bu cihaz', 'This device')}</h3>
        <dl class="kv">
          <dt>{tx('Kurulum', 'Platform')}</dt><dd>{platformLabel(platformId())}</dd>
          <dt>{tx('İzin', 'Permission')}</dt><dd>{perm === 'granted' ? tx('Verildi', 'Granted') : perm === 'denied' ? tx('Reddedildi', 'Denied') : perm === 'default' ? tx('Henüz sorulmadı', 'Not asked yet') : tx('Desteklenmiyor', 'Unsupported')}</dd>
          <dt>{tx('Son başarılı test', 'Last successful test')}</dt><dd>{dev?.lastTestOkAt ? fmtDateTime(dev.lastTestOkAt, true) : tx('Yok', 'None')}</dd>
        </dl>
        <div style="margin-top:12px">
          {active ? <Notice kind="green" icon="check">{tx('Bildirimler açık. Uygulama kapalıyken de konumların ve dünya eşiğin için bildirim alırsın.', 'Notifications enabled. You will receive alerts for your locations and worldwide threshold even when the app is closed.')}</Notice>
            : !sup.ok ? <Notice kind="amber">{sup.text}</Notice>
            : perm === 'denied' ? <Notice kind="red" icon="alert"><strong>{tx('Bildirim izni kapalı.', 'Notification permission is blocked.')}</strong> {isIOS ? tx('Ayarlar → Bildirimler → Afet Takip → Bildirimlere İzin Ver.', 'Settings → Notifications → Afet Takip → Allow Notifications.') : tx('Adres çubuğundaki kilit simgesi → Site ayarları → Bildirimler → İzin ver.', 'Lock icon in address bar → Site settings → Notifications → Allow.')} {tx('Sonra “Bildirimleri aç”a bas.', 'Then tap “Enable notifications”.')}</Notice>
            : <Notice kind="amber" icon="bell">{tx('Bildirimler kapalı.', 'Notifications are off.')}</Notice>}
        </div>
        <div class="row wrap" style="margin-top:12px">
          {sup.ok && !active && <button class="btn primary" disabled={busy} onClick={() => void enable()}><Icon name="bell" /> {busy ? tx('Açılıyor…', 'Enabling…') : tx('Bildirimleri aç', 'Enable notifications')}</button>}
          {active && <button class="btn primary" onClick={() => void sendTest()}><Icon name="bell" /> {tx('Bildirimlerimi test et', 'Test my notifications')}</button>}
          {active && <button class="btn ghost" onClick={async () => { await disablePush(); void refresh(); }}>{tx('Bu cihazda kapat', 'Disable on this device')}</button>}
        </div>
        {test && (
          <div style="margin-top:12px" aria-live="polite">
            <strong>{tx('Test sonucu', 'Test result')}</strong>
            <ul class="timeline">
              <li class={test.stages.providerAcceptedAt ? '' : 'unknown'}><span>{tx('Bildirim servisi aldı', 'Accepted by push provider')}</span><span class="v">{fmtMs(test.timings.platformToProviderAcceptMs)}</span></li>
              <li class={test.stages.displayedAt ? '' : 'unknown'}><span>{tx('Telefonunda göründü', 'Displayed on your device')}</span><span class="v">{fmtMs(test.timings.platformToDisplayedMs)}</span></li>
            </ul>
            {!test.stages.displayedAt && <p class="small muted">{tx('Görünmediyse: odak/sessiz mod, pil tasarrufu ve tarayıcının bildirim iznini kontrol et.', 'If not visible: check Focus/Do Not Disturb, battery saver, and browser notification permissions.')}</p>}
          </div>
        )}
        {r.query.get('test') && <Notice kind="teal" icon="check">{tx('Test bildirimine dokunarak geldin; bildirimler çalışıyor.', 'You arrived by tapping the test notification; notifications are working.')}</Notice>}
        <div class="field" style="margin:14px 0 0"><label for="dl">{tx('Cihaz adı', 'Device name')}</label><input id="dl" class="input" maxLength={40} value={s.label} onInput={(e) => setState(() => ({ label: (e.target as HTMLInputElement).value }))} placeholder={tx('ör. Telefonum', 'e.g. My Phone')} /></div>
      </div>

      <div class="card">
        <h3>{tx('Bildirim türleri', 'Notification channels')}</h3>
        {getChannels(l).map((c) => (
          <ToggleRow key={c.key} title={c.title} example={c.example} checked={s.prefs.channels[c.key]} badge={c.critical ? <span class="pill red">{tx('Kritik', 'Critical')}</span> : undefined}
            onChange={(v) => updatePrefs((p) => ({ ...p, channels: { ...p.channels, [c.key]: v } }))} />
        ))}
      </div>

      <div class="card">
        <h3>{tx('Ses ve sessiz saatler', 'Sound & quiet hours')}</h3>
        <ToggleRow title={tx('Ses', 'Sound')} checked={s.prefs.sound} onChange={(v) => updatePrefs((p) => ({ ...p, sound: v }))} desc={tx('Kapalıyken deprem bildirimleri sessiz gelir.', 'When off, earthquake notifications arrive silently.')} />
        <ToggleRow title={tx('Titreşim', 'Vibration')} checked={s.prefs.vibration} onChange={(v) => updatePrefs((p) => ({ ...p, vibration: v }))} desc={tx('Android’de desteklenir; iPhone’da sistem karar verir.', 'Supported on Android; controlled by the system on iPhone.')} />
        <ToggleRow title={tx('Sessiz saatler', 'Quiet hours')} checked={s.prefs.quietHours.enabled} onChange={(v) => updatePrefs((p) => ({ ...p, quietHours: { ...p.quietHours, enabled: v } }))}
          desc={l === 'en'
            ? <>Earthquake notifications arrive silently during these hours. <strong>Authorized early warnings for your current location always bypass quiet hours.</strong></>
            : <>Bu saatlerde deprem bildirimleri sessiz gelir. <strong>Mevcut konumun için yetkili erken uyarı sessiz saatten etkilenmez.</strong></>} />
        {s.prefs.quietHours.enabled && (
          <div class="grid2">
            <div class="field"><label for="qs">{tx('Başlangıç', 'Start')}</label><input id="qs" class="input" type="time" value={s.prefs.quietHours.start} onInput={(e) => updatePrefs((p) => ({ ...p, quietHours: { ...p.quietHours, start: (e.target as HTMLInputElement).value } }))} /></div>
            <div class="field"><label for="qe">{tx('Bitiş', 'End')}</label><input id="qe" class="input" type="time" value={s.prefs.quietHours.end} onInput={(e) => updatePrefs((p) => ({ ...p, quietHours: { ...p.quietHours, end: (e.target as HTMLInputElement).value } }))} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Acil kişiler ----------------
function Contacts() {
  const s = useAppState();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const hasPicker = 'contacts' in navigator && 'select' in ((navigator as unknown as { contacts: object }).contacts ?? {});
  const add = (n: string, p: string) => setState((x) => ({ contacts: [...x.contacts, { id: `c${Date.now()}${Math.random().toString(36).slice(2, 5)}`, name: n.trim(), phone: p.trim() }] }));
  const pickSys = async () => {
    try {
      const res = await (navigator as unknown as { contacts: { select: (p: string[], o: object) => Promise<{ name?: string[]; tel?: string[] }[]> } }).contacts.select(['name', 'tel'], { multiple: true });
      for (const c of res) if (c.tel?.[0]) add(c.name?.[0] ?? tx('Kişi', 'Contact'), c.tel[0]);
    } catch { /* iptal */ }
  };
  return (
    <div class="stack">
      <p class="small muted">{tx('Acil kişiler yalnız bu cihazda saklanır; sunucuya gönderilmez.', 'Emergency contacts are stored only on this device and never sent to the server.')}</p>
      {s.contacts.map((c) => (
        <div class="card row" key={c.id}>
          <span style="flex:1"><strong>{c.name}</strong><br /><span class="small muted">{c.phone}</span></span>
          <button class="btn sm ghost" onClick={() => setState((x) => ({ contacts: x.contacts.filter((y) => y.id !== c.id) }))} aria-label={`${tx('Sil', 'Delete')} ${c.name}`}><Icon name="trash" /></button>
        </div>
      ))}
      <form class="card" onSubmit={(e) => { e.preventDefault(); if (name.trim() && phone.trim()) { add(name, phone); setName(''); setPhone(''); } }}>
        <div class="field"><label for="cn">{tx('Ad', 'Name')}</label><input id="cn" class="input" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} autoComplete="name" /></div>
        <div class="field"><label for="cp">{tx('Telefon', 'Phone')}</label><input id="cp" class="input" type="tel" value={phone} onInput={(e) => setPhone((e.target as HTMLInputElement).value)} placeholder={tx('05xx xxx xx xx', '+90 5xx xxx xx xx')} autoComplete="tel" /></div>
        <div class="row wrap"><button class="btn primary" type="submit"><Icon name="plus" /> {tx('Ekle', 'Add')}</button>{hasPicker && <button type="button" class="btn" onClick={() => void pickSys()}><Icon name="users" /> {tx('Rehberden seç', 'Pick from contacts')}</button>}</div>
      </form>
    </div>
  );
}

// ---------------- Görünüm, tema ve dil ----------------
function Appearance() {
  const s = useAppState();
  const devLang = detectDeviceLang();
  const themes: [ThemeMode, string, string][] = [
    ['system', tx('Sistem', 'System'), 'eye'],
    ['light', tx('Açık', 'Light'), 'sun'],
    ['dark', tx('Koyu', 'Dark'), 'moon'],
    ['amoled', 'AMOLED', 'oled'],
  ];
  return (
    <div class="card">
      <div class="field">
        <span class="label">{tx('Tema', 'Theme')}</span>
        <div class="chips" role="radiogroup" aria-label={tx('Tema', 'Theme')} style="flex-wrap:wrap">
          {themes.map(([k, lbl, ic]) => (
            <button key={k} class="chip" role="radio" aria-checked={s.theme === k} onClick={() => setTheme(k)}>
              <Icon name={ic} />{lbl}
            </button>
          ))}
        </div>
        <span class="small muted">{tx('AMOLED teması OLED ekranlarda pikselleri kapatmak için tam siyah (#000000) zemin kullanır ve pil tasarrufu sağlar.', 'AMOLED theme uses a true black (#000000) background to turn off pixels and save battery on OLED displays.')}</span>
      </div>

      <div class="field">
        <span class="label">{tx('Dil / Language', 'Language / Dil')}</span>
        <div class="chips" role="radiogroup" aria-label={tx('Dil', 'Language')} style="flex-wrap:wrap">
          <button class="chip" role="radio" aria-checked={!s.langExplicit} onClick={() => setLang('auto')}>
            <Icon name="globe" />{tx(`Cihaz dili (${devLang.toUpperCase()})`, `Device default (${devLang.toUpperCase()})`)}
          </button>
          <button class="chip" role="radio" aria-checked={s.langExplicit && s.lang === 'tr'} onClick={() => setLang('tr')}>Türkçe (TR)</button>
          <button class="chip" role="radio" aria-checked={s.langExplicit && s.lang === 'en'} onClick={() => setLang('en')}>English (EN)</button>
        </div>
        <span class="small muted">{tx('Cihaz dili Türkçe ise otomatik olarak Türkçe, diğer tüm dillerde İngilizce açılır.', 'Opens automatically in Turkish when the device language is Turkish, and in English for all other device languages.')}</span>
      </div>

      <div class="field"><span class="label">{tx('Yazı boyutu', 'Text size')}</span>
        <div class="chips" role="radiogroup" aria-label={tx('Yazı boyutu', 'Text size')} style="flex-wrap:wrap">
          {([[1, tx('Normal', 'Default')], [1.15, tx('Büyük', 'Large')], [1.3, tx('Çok büyük', 'Extra large')], [1.5, tx('En büyük', 'Largest')]] as const).map(([k, lbl]) => (
            <button key={k} class="chip" role="radio" aria-checked={s.textScale === k} onClick={() => setState(() => ({ textScale: k }))}>{lbl}</button>
          ))}
        </div>
      </div>
      <ToggleRow title={tx('Hareketi azalt', 'Reduce motion')} checked={s.reduceMotion} onChange={(v) => setState(() => ({ reduceMotion: v }))}
        desc={tx('Animasyonları kapatır. Uyarıların okunması hiçbir zaman animasyona, sese veya titreşime bağlı değildir.', 'Disables animations. Reading alerts never relies solely on animation, sound, or vibration.')} />
    </div>
  );
}

// ---------------- Gizlilik ----------------
function Privacy() {
  const s = useAppState();
  const del = async () => {
    if (!confirm(tx(
      'Sunucudaki cihaz kaydın, konumların, bildirim geçmişin, “Hissettim” gözlemlerin ve sohbet iletilerin kalıcı olarak silinecek. Bu cihazdaki veriler de temizlenecek. Devam edilsin mi?',
      'Your server device registration, saved locations, notification history, “Did You Feel It?” reports, and chat messages will be permanently deleted, along with local data on this device. Continue?',
    ))) return;
    try { if (s.device) await api('/api/devices/me', { method: 'DELETE' }); } catch (e) { if (!(e instanceof ApiError && e.status === 401)) { toast(tx('Sunucuya ulaşılamadı; silme yapılmadı.', 'Could not reach server; deletion aborted.')); return; } }
    await disablePush().catch(() => {});
    resetLocal();
    toast(tx('Verilerin silindi.', 'Your data has been deleted.'));
    go('/depremler');
  };
  return (
    <div class="stack">
      <div class="card small">
        <h3>{tx('KVKK ve gizlilik özeti', 'Data protection & privacy summary')}</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>{tx('Veri', 'Data')}</th><th>{tx('Amaç', 'Purpose')}</th><th>{tx('Nerede / ne kadar', 'Where / retention')}</th></tr></thead>
          <tbody>
            <tr><td>{tx('Mevcut konum (yalnız son ölçüm)', 'Current location (latest fix only)')}</td><td>{tx('Yakın deprem bildirimi', 'Nearby earthquake alerts')}</td><td>{tx('Sunucu; her ölçümde üzerine yazılır, geçmiş tutulmaz.', 'Server; overwritten on each measurement, no history kept.')}</td></tr>
            <tr><td>{tx('Eklediğin yerler, eşikler', 'Saved places & thresholds')}</td><td>{tx('O yerlerin bildirimleri', 'Alerts for those places')}</td><td>{tx('Sunucu; sen silene kadar.', 'Server; until you delete them.')}</td></tr>
            <tr><td>{tx('Bildirim aboneliği', 'Push subscription')}</td><td>{tx('Bildirim iletimi', 'Push delivery')}</td><td>{tx('Sunucu; geçersiz olunca kapatılır.', 'Server; disabled when invalidated.')}</td></tr>
            <tr><td>{tx('Bildirim zaman kayıtları', 'Delivery timestamps')}</td><td>{tx('Teslim ölçümü', 'Delivery latency metrics')}</td><td>{tx('Sunucu; sınırlı süre.', 'Server; limited retention.')}</td></tr>
            <tr><td>{tx('Acil kişiler, mesaj taslakları, aile planı, çanta', 'Emergency contacts, drafts, family plan, kit')}</td><td>{tx('Acil iletişim ve hazırlık', 'Emergency comms & preparedness')}</td><td>{tx('Yalnız bu cihaz.', 'Only on this device.')}</td></tr>
            <tr><td>{tx('Hissettim, sohbet', 'Felt reports & chat')}</td><td>{tx('Topluluk gözlemi', 'Community observation')}</td><td>{tx('Sunucu; konumsuz.', 'Server; without location.')}</td></tr>
          </tbody>
        </table></div>
        <p style="margin-top:8px">{tx('Bilgi:', 'Reference:')} <Ext href="https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-">{tx('KVKK aydınlatma yükümlülüğü', 'KVKK disclosure notice')}</Ext></p>
      </div>
      <div class="card">
        <h3>{tx('Verilerimi sil', 'Delete my data')}</h3>
        <p class="small">{tx('Konumlarını, cihaz kaydını ve geçmişini sunucudan ve bu cihazdan siler.', 'Deletes your locations, device registration, and history from both the server and this device.')}</p>
        <button class="btn danger" onClick={() => void del()}><Icon name="trash" /> {tx('Hesabımı ve konumlarımı sil', 'Delete my account and locations')}</button>
      </div>
      <p class="small muted">{tx('Son tercih kaydı:', 'Last preference update:')} {s.updatedAt.prefs ? fmtTime(s.updatedAt.prefs, true) : '—'}</p>
    </div>
  );
}

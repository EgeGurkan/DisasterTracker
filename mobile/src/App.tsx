import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, useColorScheme, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { DisasterEvent, EventSummary, HazardFilter, MatchReason, SavedLocation, ThemeMode } from '../../shared/src/types.ts';
import { haversineKm, inTurkeyRegion } from '../../shared/src/geo.ts';
import { formatDateTimeTR, formatDepth, formatKm, formatMag, formatTimeTR, magClass, relativeTR, trNumber, dative } from '../../shared/src/turkish.ts';
import { reasonExplain, reasonLabel, placeName, eewNotAvailableText } from '../../shared/src/match.ts';
import { RADIUS_SHORTCUTS } from '../../shared/src/defaults.ts';
import {
  API_BASE, api, cycleTheme, detectDeviceLang, enableNotifications, getState, loadState, mtx,
  payloadOf, permissionInfo, receipt, setLang, setState, setTheme, subscribe, type PermissionInfo,
} from './core';

// ---------------- Tema (Açık · Koyu · AMOLED) ----------------
const LIGHT = { bg: '#F4F2ED', surface: '#FFFFFF', surface2: '#ECE9E2', text: '#0E1A30', muted: '#4A5570', border: 'rgba(14,26,48,0.08)', teal: '#0A6F78', tealBg: '#DCF0EE', amber: '#F5A524', amberInk: '#1B1300', red: '#C62828', redBg: '#FBE4E2', primaryFg: '#FFFFFF' };
const DARK = { bg: '#08111F', surface: '#101C31', surface2: '#17263F', text: '#EAF0F8', muted: '#A6B3CA', border: 'rgba(255,255,255,0.08)', teal: '#55D3D5', tealBg: '#0E3440', amber: '#F5A524', amberInk: '#1B1300', red: '#D63A32', redBg: '#3A1618', primaryFg: '#03222A' };
const AMOLED = { bg: '#000000', surface: '#06080D', surface2: '#10141D', text: '#F5F8FC', muted: '#9BA8BF', border: 'rgba(255,255,255,0.14)', teal: '#5CE1E6', tealBg: '#07262E', amber: '#F5A524', amberInk: '#1B1300', red: '#D63A32', redBg: '#2A0D10', primaryFg: '#03222A' };
const SHADOW = { shadowColor: '#0E1A30', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 };
type Theme = typeof LIGHT;
const MAG_BG: Record<string, [string, string]> = { minor: ['#E6F0EA', '#1E5A35'], light: ['#EAF2C9', '#4A5A00'], moderate: ['#FDE9C2', '#6E4100'], strong: ['#FDD3C5', '#7D2408'], major: ['#C62828', '#FFFFFF'], unknown: ['#E3E3E3', '#475370'] };

const PROVINCES: [string, number, number][] = [
  ['İstanbul', 41.01, 28.98], ['İzmir', 38.42, 27.13], ['Ankara', 39.93, 32.86], ['Bursa', 40.19, 29.06], ['Antalya', 36.88, 30.7], ['Adana', 37.0, 35.32],
  ['Kocaeli', 40.77, 29.92], ['Sakarya', 40.78, 30.4], ['Düzce', 40.84, 31.16], ['Manisa', 38.61, 27.43], ['Aydın', 37.84, 27.84], ['Muğla', 37.22, 28.36],
  ['Denizli', 37.78, 29.09], ['Balıkesir', 39.65, 27.88], ['Çanakkale', 40.15, 26.41], ['Tekirdağ', 40.98, 27.51], ['Hatay', 36.2, 36.16],
  ['Kahramanmaraş', 37.58, 36.94], ['Gaziantep', 37.07, 37.38], ['Malatya', 38.35, 38.31], ['Adıyaman', 37.76, 38.28], ['Elazığ', 38.68, 39.22],
  ['Erzincan', 39.75, 39.49], ['Van', 38.5, 43.38], ['Diyarbakır', 37.91, 40.24], ['Kayseri', 38.73, 35.49], ['Konya', 37.87, 32.48], ['Eskişehir', 39.78, 30.52],
];

type Tab = 'depremler' | 'harita' | 'acil' | 'uyarilar' | 'menu';
interface ListEvent extends EventSummary { sources: string[] }

function useStore() {
  const [, f] = useState(0);
  useEffect(() => subscribe(() => f((n) => n + 1)), []);
  return getState();
}

function resolveTheme(mode: ThemeMode, sysScheme: string | null | undefined): { t: Theme; isDark: boolean } {
  if (mode === 'amoled') return { t: AMOLED, isDark: true };
  if (mode === 'dark') return { t: DARK, isDark: true };
  if (mode === 'light') return { t: LIGHT, isDark: false };
  return sysScheme === 'dark' ? { t: DARK, isDark: true } : { t: LIGHT, isDark: false };
}

export default function App() {
  const scheme = useColorScheme();
  const st = useStore();
  const { t, isDark } = resolveTheme(st.theme, scheme);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('depremler');
  const [openEvent, setOpenEvent] = useState<{ id: string; deliveryId: string | null } | null>(null);

  useEffect(() => { void loadState().then(() => setReady(true)); }, []);
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const p = payloadOf(r.notification);
      void receipt(p, 'opened');
      if (p?.kind === 'eew') setTab('acil');
      else if (p?.eventId) setOpenEvent({ id: p.eventId, deliveryId: p.deliveryId });
    });
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      const p = r ? payloadOf(r.notification) : null;
      if (p?.eventId) setOpenEvent({ id: p.eventId, deliveryId: p.deliveryId });
    });
    return () => sub.remove();
  }, []);

  if (!ready) return null;
  const s = styles(t);
  const tabLabels: Record<Tab, string> = {
    depremler: mtx('Afetler', 'Disasters'),
    harita: mtx('Harita', 'Map'),
    acil: mtx('Acil', 'SOS'),
    uyarilar: mtx('Uyarılar', 'Alerts'),
    menu: mtx('Menü', 'Menu'),
  };
  const headerTitles: Record<Tab, string> = {
    depremler: mtx('Afetler', 'Disasters'),
    harita: mtx('Harita', 'Map'),
    acil: mtx('Acil', 'Emergency'),
    uyarilar: mtx('Uyarılar', 'Alerts'),
    menu: mtx('Menü ve Ayarlar', 'Menu & Settings'),
  };
  const themeBadge = { light: mtx('☀ Açık', '☀ Light'), dark: mtx('☾ Koyu', '☾ Dark'), amoled: '● AMOLED', system: mtx('◐ Sistem', '◐ Auto') }[st.theme];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[s.root]} edges={['top', 'left', 'right']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={s.header}>
          <Text style={[s.h1, { flex: 1 }]} numberOfLines={1} accessibilityRole="header">{headerTitles[tab]}</Text>
          <Pressable onPress={() => cycleTheme()} accessibilityRole="button" accessibilityLabel={mtx('Temayı değiştir', 'Switch theme')} style={s.pillBtn}>
            <Text style={s.pillBtnText}>{themeBadge}</Text>
          </Pressable>
          <Pressable onPress={() => setLang(st.lang === 'tr' ? 'en' : 'tr')} accessibilityRole="button" accessibilityLabel={mtx('Dili değiştir', 'Switch language')} style={s.pillBtn}>
            <Text style={s.pillBtnText}>🌐 {st.lang.toUpperCase()}</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          {tab === 'depremler' && <EventsScreen t={t} onOpen={(id) => setOpenEvent({ id, deliveryId: null })} />}
          {tab === 'harita' && <MapScreen t={t} />}
          {tab === 'acil' && <EmergencyScreen t={t} />}
          {tab === 'uyarilar' && <AlertsScreen t={t} onOpen={(id, d) => setOpenEvent({ id, deliveryId: d })} />}
          {tab === 'menu' && <SettingsScreen t={t} />}
        </View>
        <SafeAreaView edges={['bottom']} style={s.nav}>
          {(['depremler', 'harita', 'acil', 'uyarilar', 'menu'] as Tab[]).map((k) => {
            const label = tabLabels[k];
            const on = tab === k;
            return k === 'acil' ? (
              <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={mtx('Acil araçlar', 'Emergency tools')} style={s.sos}>
                <Text style={s.sosIcon}>⚠</Text><Text style={s.sosText}>{label}</Text>
              </Pressable>
            ) : (
              <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.navBtn, on && { backgroundColor: t.tealBg }]}>
                <Text style={[s.navText, on && { color: t.teal }]}>{label}</Text>
              </Pressable>
            );
          })}
        </SafeAreaView>
        <Modal visible={!!openEvent} animationType="slide" onRequestClose={() => setOpenEvent(null)} presentationStyle="pageSheet">
          {openEvent && <EventDetail t={t} id={openEvent.id} deliveryId={openEvent.deliveryId} onClose={() => setOpenEvent(null)} />}
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ---------------- Ortak ----------------
function MagBadge({ m, type, big }: { t?: Theme; m: number | null; type?: string | null; big?: boolean }) {
  const l = getState().lang;
  const c = magClass(m, l);
  const [bg, fg] = MAG_BG[c.key]!;
  const size = big ? 84 : 58;
  return (
    <View accessible accessibilityLabel={m == null ? mtx('Büyüklük bilinmiyor', 'Magnitude unknown') : `${mtx('Büyüklük', 'Magnitude')} ${trNumber(m, 1, l)} ${type ?? ''}, ${c.label}`}
      style={{ width: size, height: size, borderRadius: big ? 20 : 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: fg + '55', borderStyle: c.key === 'moderate' ? 'dashed' : 'solid' }}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: big ? 30 : 20 }}>{m == null ? '?' : trNumber(m, 1, l)}</Text>
      <Text style={{ color: fg, fontWeight: '700', fontSize: big ? 12 : 10 }}>{c.label}</Text>
    </View>
  );
}

function Btn({ t, label, onPress, kind = 'default', big }: { t: Theme; label: string; onPress: () => void; kind?: 'default' | 'primary' | 'amber' | 'danger'; big?: boolean }) {
  const bg = { default: t.surface2, primary: t.teal, amber: t.amber, danger: t.red }[kind];
  const fg = { default: t.text, primary: t.primaryFg, amber: t.amberInk, danger: '#fff' }[kind];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ minHeight: big ? 96 : 48, paddingHorizontal: 18, borderRadius: big ? 22 : 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }], flex: big ? 1 : undefined })}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: big ? 19 : 16, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function Card({ t, children }: { t: Theme; children: React.ReactNode }) {
  return <View style={{ backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: t.border, padding: 18, marginBottom: 12, ...SHADOW }}>{children}</View>;
}

function refs(): { id: string; label: string; lat: number; lon: number }[] {
  const st = getState();
  const p = st.prefs;
  const out = p.saved.map((l) => ({ id: l.id, label: placeName(l.label, l.place, st.lang), lat: l.lat, lon: l.lon }));
  if (p.active.lat != null && p.active.lon != null && p.active.permission === 'granted') {
    out.unshift({ id: 'active', label: mtx('Mevcut konumum', 'My current location'), lat: p.active.lat, lon: p.active.lon! });
  }
  return out;
}

// ---------------- Afetler ----------------
function EventsScreen({ t, onOpen }: { t: Theme; onOpen: (id: string) => void }) {
  const st = useStore();
  const l = st.lang;
  const [data, setData] = useState<{ events: ListEvent[]; generatedAt: string } | null>(null);
  const [disData, setDisData] = useState<{ disasters: DisasterEvent[]; generatedAt: string } | null>(null);
  const [openDis, setOpenDis] = useState<DisasterEvent | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hazard, setHazard] = useState<HazardFilter>('all');
  const [region, setRegion] = useState<'tr' | 'world' | 'all'>('tr');
  const [source, setSource] = useState<string>('');
  const r0 = refs()[0] ?? null;
  const needEq = hazard === 'all' || hazard === 'earthquake';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const jobs: Promise<void>[] = [];
      if (needEq) {
        const q = `region=${region}&hours=24&limit=300${source ? `&source=${source}` : ''}${st.env === 'drill' ? '&test=1' : ''}`;
        jobs.push(api<{ events: ListEvent[]; generatedAt: string }>(`/api/events?${q}`).then(setData));
      }
      if (hazard !== 'earthquake') {
        jobs.push(api<{ disasters: DisasterEvent[]; generatedAt: string }>(`/api/disasters?hazard=${hazard === 'all' ? 'all' : hazard}`).then(setDisData));
      }
      await Promise.all(jobs);
      setErr(null);
    } catch (e) { setErr(mtx('Kaynağa erişilemiyor. ', 'Source unreachable. ') + (e as Error).message); }
    finally { setLoading(false); }
  }, [hazard, needEq, region, source, st.env]);

  useEffect(() => { void load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);
  const s = styles(t);
  const hazardTabs: [HazardFilter, string][] = [
    ['all', mtx('🌐 Tümü', '🌐 All')],
    ['earthquake', mtx('〰 Deprem', '〰 Earthquake')],
    ['flood', mtx('💧 Sel', '💧 Flood')],
    ['storm', mtx('⛈ Fırtına', '⛈ Storm')],
    ['tornado', mtx('🌪 Hortum', '🌪 Tornado')],
    ['wildfire', mtx('🔥 Yangın', '🔥 Wildfire')],
    ['volcano', mtx('🌋 Volkan', '🌋 Volcano')],
    ['tsunami', mtx('🌊 Tsunami', '🌊 Tsunami')],
  ];
  const sources = ['', 'AFAD', 'KOERI', 'EMSC', 'USGS', 'NOA', 'GEOFON', 'INGV', 'JMA', 'GEONET'];

  type MRow = { key: string; time: string; eq?: ListEvent; dis?: DisasterEvent };
  const combined = useMemo(() => {
    const rows: MRow[] = [];
    if (needEq) for (const e of data?.events ?? []) rows.push({ key: `eq-${e.id}`, time: e.originTime, eq: e });
    if (hazard !== 'earthquake') {
      const allD = disData?.disasters ?? [];
      const regD = region === 'all' ? allD : allD.filter((d) => (region === 'tr' ? inTurkeyRegion(d.lat, d.lon) : !inTurkeyRegion(d.lat, d.lon)));
      const useD = regD.length > 0 || hazard === 'all' ? regD : allD;
      for (const d of useD) rows.push({ key: `dis-${d.id}`, time: d.originTime, dis: d });
    }
    return rows.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 350);
  }, [needEq, hazard, data, disData, region]);

  const hazEmoji: Record<DisasterEvent['hazard'], string> = { flood: '💧', storm: '⛈', tornado: '🌪', wildfire: '🔥', volcano: '🌋', tsunami: '🌊' };

  return (
    <>
      <FlatList
        contentContainerStyle={{ padding: 16 }}
        data={combined}
        keyExtractor={(x) => x.key}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
              {hazardTabs.map(([k, lbl]) => (
                <Pressable key={k} onPress={() => setHazard(k)} accessibilityRole="tab" accessibilityState={{ selected: hazard === k }} style={[s.chip, { minHeight: 40, paddingHorizontal: 14 }, hazard === k && { backgroundColor: t.teal }]}>
                  <Text style={[s.chipText, hazard === k && { color: t.primaryFg, fontWeight: '800' }]}>{lbl}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Card t={t}>
              <Text style={s.muted}>{mtx('Mesafe ölçülen konum', 'Distance reference location')}</Text>
              <Text style={s.strong}>{r0 ? r0.label : mtx('Konum yok — Menü › Konumlarım', 'No location — Menu › My Locations')}</Text>
              <Text style={s.muted}>{data || disData ? `${mtx('Son güncelleme', 'Last updated')} ${formatTimeTR((data?.generatedAt ?? disData?.generatedAt)!, true, l)}` : mtx('Yükleniyor…', 'Loading…')}</Text>
            </Card>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {(['tr', 'world', 'all'] as const).map((k) => (
                <Pressable key={k} onPress={() => setRegion(k)} accessibilityRole="button" accessibilityState={{ selected: region === k }} style={[s.chip, region === k && { backgroundColor: t.tealBg, borderColor: t.teal }]}>
                  <Text style={[s.chipText, region === k && { color: t.teal }]}>{{ tr: mtx('Türkiye', 'Türkiye'), world: mtx('Dünya', 'World'), all: mtx('Tümü', 'All') }[k]}</Text>
                </Pressable>
              ))}
            </View>
            {needEq && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                {sources.map((src) => (
                  <Pressable key={src || 'ALL'} onPress={() => setSource(src)} accessibilityRole="button" accessibilityState={{ selected: source === src }} style={[s.chip, { minHeight: 36, paddingHorizontal: 12 }, source === src && { backgroundColor: t.tealBg }]}>
                    <Text style={[s.chipText, { fontSize: 13 }, source === src && { color: t.teal }]}>{src || mtx('Tüm Kaynaklar', 'All Sources')}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {err && <Text style={[s.text, { color: t.red, marginBottom: 8 }]}>{err}</Text>}
          </View>
        }
        renderItem={({ item }) => {
          if (item.eq) {
            const e = item.eq;
            const d = r0 ? haversineKm(r0.lat, r0.lon, e.lat, e.lon) : null;
            return (
              <Pressable onPress={() => onOpen(e.id)} accessibilityRole="button" style={s.row}>
                <MagBadge m={e.magnitude} type={e.magType} />
                <View style={{ flex: 1 }}>
                  <Text style={s.strong}>{e.isTest ? 'TEST · ' : ''}{e.place}</Text>
                  <Text style={s.muted}>{formatTimeTR(e.originTime, false, l)} · {relativeTR(e.originTime, Date.now(), l)} · {e.magType ?? mtx('tür ?', 'type ?')} · {formatDepth(e.depthKm, l)}</Text>
                  <Text style={s.muted}>{d != null ? `${formatKm(d, l)} · ` : ''}{e.sources.join(' + ')}</Text>
                </View>
              </Pressable>
            );
          }
          const dis = item.dis!;
          const dist = r0 ? haversineKm(r0.lat, r0.lon, dis.lat, dis.lon) : null;
          return (
            <Pressable onPress={() => setOpenDis(dis)} accessibilityRole="button" style={s.row}>
              <View style={{ width: 58, height: 58, borderRadius: 14, backgroundColor: t.tealBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24 }}>{hazEmoji[dis.hazard]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.strong}>{dis.title}</Text>
                <Text style={s.muted}>{formatDateTimeTR(dis.originTime, false, l)}{dis.metricLabel ? ` · ${dis.metricLabel}` : ''}</Text>
                <Text style={s.muted}>{dist != null ? `${formatKm(dist, l)} · ` : ''}{dis.source}</Text>
              </View>
            </Pressable>
          );
        }}
      />
      <Modal visible={!!openDis} animationType="slide" onRequestClose={() => setOpenDis(null)} presentationStyle="pageSheet">
        {openDis && (
          <SafeAreaView style={s.root}>
            <View style={s.header}><Text style={[s.h1, { flex: 1 }]}>{mtx('Afet ayrıntısı', 'Disaster details')}</Text><Btn t={t} label={mtx('Kapat', 'Close')} onPress={() => setOpenDis(null)} /></View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Card t={t}>
                <Text style={[s.h1, { fontSize: 20 }]}>{openDis.title}</Text>
                <Text style={[s.muted, { marginTop: 4 }]}>{formatDateTimeTR(openDis.originTime, true, l)} · {openDis.source}</Text>
                {openDis.metricLabel && <Text style={[s.strong, { marginTop: 8 }]}>{openDis.metricLabel}</Text>}
                {openDis.description && <Text style={[s.text, { marginTop: 8 }]}>{openDis.description}</Text>}
                <Text style={[s.muted, { marginTop: 8 }]}>{openDis.lat.toFixed(4)}, {openDis.lon.toFixed(4)}</Text>
                {refs().map((r) => <Text key={r.id} style={s.text}>📍 {r.label}: {formatKm(haversineKm(r.lat, r.lon, openDis.lat, openDis.lon), l)}</Text>)}
                {openDis.url && <View style={{ marginTop: 12 }}><Btn t={t} kind="primary" label={mtx('Resmî kaynakta aç', 'Open official source')} onPress={() => void Linking.openURL(openDis.url!)} /></View>}
              </Card>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </>
  );
}

function EventDetail({ t, id, deliveryId, onClose }: { t: Theme; id: string; deliveryId: string | null; onClose: () => void }) {
  const st = useStore();
  const l = st.lang;
  const [d, setD] = useState<{ event: EventSummary; records: { source: string; magnitude: number | null; magType: string | null; depthKm: number | null; originTime: string; url: string | null }[] } | null>(null);
  const [dl, setDl] = useState<{ title: string; reasons: MatchReason[] | null; state: string; timings: Record<string, number | null> } | null>(null);
  useEffect(() => { void api<typeof d>(`/api/events/${encodeURIComponent(id)}`).then(setD).catch(() => {}); }, [id]);
  useEffect(() => { if (deliveryId) void api<typeof dl>(`/api/deliveries/${deliveryId}`).then(setDl).catch(() => {}); }, [deliveryId]);
  const s = styles(t);
  const ms = (v: number | null | undefined) => (v == null ? mtx('bilinmiyor', 'unknown') : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(2)} ${l === 'en' ? 's' : 'sn'}`);
  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}><Text style={[s.h1, { flex: 1 }]}>{mtx('Olay ayrıntısı', 'Event details')}</Text><Btn t={t} label={mtx('Kapat', 'Close')} onPress={onClose} /></View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {dl && (
          <Card t={t}>
            <Text style={s.strong}>{mtx('Bu bildirimi neden aldın?', 'Why did you receive this notification?')}</Text>
            <Text style={s.text}>{dl.title}</Text>
            {dl.reasons?.map((r, i) => <Text key={i} style={s.muted}>• {reasonLabel(r, l)} — {reasonExplain(r, l)}</Text>)}
            <Text style={s.muted}>{mtx('Durum:', 'Status:')} {dl.state} · {mtx('ilk gönderim', 'first send')} {ms(dl.timings.platformToFirstSendMs)} · {mtx('gösterim', 'displayed')} {ms(dl.timings.platformToDisplayedMs)}</Text>
          </Card>
        )}
        {!d ? <Text style={s.text}>{mtx('Yükleniyor…', 'Loading…')}</Text> : (
          <>
            <Card t={t}>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                <MagBadge m={d.event.magnitude} type={d.event.magType} big />
                <View style={{ flex: 1 }}>
                  <Text style={[s.h1, { fontSize: 20 }]}>{d.event.place}</Text>
                  <Text style={s.muted}>{formatDateTimeTR(d.event.originTime, true, l)}</Text>
                </View>
              </View>
              <Text style={[s.text, { marginTop: 10 }]}>{formatMag(d.event.magnitude, d.event.magType, l)} · {formatDepth(d.event.depthKm, l)}</Text>
              <Text style={s.muted}>{mtx('Özet kaynağı:', 'Summary source:')} {d.event.summarySource}</Text>
              {refs().map((r) => <Text key={r.id} style={s.text}>📍 {r.label}: {formatKm(haversineKm(r.lat, r.lon, d.event.lat, d.event.lon), l)}</Text>)}
            </Card>
            <Card t={t}>
              <Text style={s.strong}>{mtx('Kaynakların ölçümleri', 'Measurements by agency')}</Text>
              {d.records.map((r) => (
                <Pressable key={r.source} onPress={() => r.url && Linking.openURL(r.url)} accessibilityRole="link">
                  <Text style={s.text}>{r.source}: {r.magnitude == null ? '—' : `${trNumber(r.magnitude, 1, l)} ${r.magType ?? ''}`} · {r.depthKm == null ? mtx('derinlik ?', 'depth ?') : `${trNumber(r.depthKm, 1, l)} km`} · {formatTimeTR(r.originTime, true, l)}{r.url ? ' ↗' : ''}</Text>
                </Pressable>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------- Harita ----------------
function MapScreen({ t }: { t: Theme }) {
  useStore();
  const s = styles(t);
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card t={t}>
        <Text style={s.text}>{mtx('Etkileşimli harita (merkez üsleri, diri faylar, konumların ve yarıçapları, istasyonlar) web sürümünde açılır. Aynı bilgiler Depremler listesinde metin olarak da vardır.', 'Interactive map (epicenters, active faults, your locations & radii, and seismic stations) opens in the web view. All event data is also available as text in the Earthquakes tab.')}</Text>
        <View style={{ height: 12 }} />
        <Btn t={t} label={mtx('Haritayı aç', 'Open interactive map')} kind="primary" onPress={() => void Linking.openURL(`${API_BASE}/#/harita`)} />
      </Card>
    </ScrollView>
  );
}

// ---------------- Acil ----------------
function EmergencyScreen({ t }: { t: Theme }) {
  const st = useStore();
  const player = useAudioPlayer(require('../assets/whistle.wav'));
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<'safe' | 'danger' | null>(null);
  const s = styles(t);
  useEffect(() => { void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }); }, []);
  const toggle = () => {
    if (on) { player.pause(); setOn(false); return; }
    player.loop = true; player.volume = 1; player.seekTo(0); player.play(); setOn(true);
  };
  const call = () => {
    if (st.env === 'drill') { Alert.alert(mtx('Tatbikat', 'Drill mode'), mtx('Gerçek 112 aranmadı (tatbikat cihazı).', '112 was not dialed (drill device).')); return; }
    void Linking.openURL('tel:112');
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={{ backgroundColor: t.surface, borderRadius: 14, borderLeftWidth: 6, borderLeftColor: t.amber, borderWidth: 1, borderColor: t.border, padding: 16 }}>
        <Text style={[s.h1, { fontSize: 26 }]}>{mtx('Çök, Kapan, Tutun.', 'Drop, Cover, Hold On.')}</Text>
        <Text style={s.muted}>{mtx('Sağlam bir eşyanın yanına çök, başını ve enseni koru, sarsıntı bitene kadar tutun. Pencerelerden uzak dur. (AFAD)', 'Crouch beside or under sturdy furniture, shield your head and neck, and hold on until shaking stops. Stay away from windows. (AFAD)')}</Text>
      </View>
      <Btn t={t} big kind="amber" label={on ? mtx('■  Düdüğü durdur', '■  Stop whistle') : mtx('📣  Düdüğü çal', '📣  Play whistle')} onPress={toggle} />
      <Text style={s.muted}>{mtx('Ses, telefonun ses ayarının izin verdiği en yüksek düzeyde çalar. Ses kısıksa yan taraftaki ses açma tuşuna bas. Kulaklık bağlıysa çıkar.', 'Plays at maximum speaker volume allowed by your device volume setting. Press physical volume-up if low, and disconnect headphones.')}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn t={t} big kind="primary" label={mtx('Güvendeyim', 'I am safe')} onPress={() => setMsg('safe')} />
        <Btn t={t} big kind="danger" label={mtx('Tehlikedeyim', 'I need help')} onPress={() => setMsg('danger')} />
      </View>
      <Btn t={t} big label={`📞  ${mtx('112’yi ara', 'Call 112')}${st.env === 'drill' ? mtx(' (tatbikat)', ' (drill)') : ''}`} onPress={call} />
      <Text style={s.muted}>{mtx('Arama ve SMS için hücresel hizmet, WhatsApp ve yeni uyarılar için internet gerekir. Düdük ve bu ekran çevrimdışı çalışır.', 'Voice calls and SMS require cellular service; WhatsApp and new alerts require internet. Whistle and this screen work offline.')}</Text>
      {msg && <MessageModal t={t} kind={msg} onClose={() => setMsg(null)} />}
    </ScrollView>
  );
}

function MessageModal({ t, kind, onClose }: { t: Theme; kind: 'safe' | 'danger'; onClose: () => void }) {
  const st = useStore();
  const l = st.lang;
  const [loc, setLoc] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const time = formatTimeTR(Date.now(), false, l);
  const text = l === 'en'
    ? kind === 'safe'
      ? `I am safe. Wanted to let you know. Time: ${time}.${loc ? ' ' + loc : ''}`
      : `I am in danger and need help. ${[address, loc].filter(Boolean).join(' · ') || '(no location attached)'}. Time: ${time}.`
    : kind === 'safe'
      ? `Güvendeyim. Bunu sana haber vermek istedim. Saat ${time}.${loc ? ' ' + loc : ''}`
      : `Tehlikedeyim, yardıma ihtiyacım var. ${[address, loc].filter(Boolean).join(' · ') || '(konum eklenmedi)'}. Saat ${time}.`;
  const s = styles(t);
  const addLoc = async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    if (!p.granted) { setStatus(mtx('Konum alınamadı; adresini yazabilir veya konumsuz devam edebilirsin.', 'Could not get GPS location; type your address or continue without location.')); return; }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLoc(`${mtx('Konum', 'Location')}: https://www.openstreetmap.org/?mlat=${pos.coords.latitude.toFixed(5)}&mlon=${pos.coords.longitude.toFixed(5)} (${mtx('ölçüm', 'measured')} ${formatTimeTR(pos.timestamp, true, l)}, ±${Math.round(pos.coords.accuracy ?? 0)} m)`);
  };
  const sms = async (phone: string) => {
    if (!(await SMS.isAvailableAsync())) { setStatus(mtx('Bu cihazda SMS gönderilemiyor.', 'SMS is not available on this device.')); return; }
    const r = await SMS.sendSMSAsync([phone], text);
    setStatus(
      r.result === 'sent' ? mtx('SMS uygulaması gönderdiğini bildirdi.', 'SMS app reported message sent.')
      : r.result === 'cancelled' ? mtx('İptal edildi; gönderilmedi.', 'Cancelled; not sent.')
      : mtx('Mesaj hazır — gönderme adımını SMS uygulamasında tamamla.', 'Draft ready — complete sending in your SMS app.'),
    );
  };
  const wa = async (phone: string) => {
    const digits = phone.replace(/\D/g, '').replace(/^0/, '90');
    const url = `whatsapp://send?phone=${digits}&text=${encodeURIComponent(text)}`;
    if (await Linking.canOpenURL(url)) { await Linking.openURL(url); setStatus(mtx('Mesaj hazır — WhatsApp’ta gönder’e sen bas.', 'Draft ready — tap send in WhatsApp.')); }
    else setStatus(mtx('WhatsApp yüklü değil. SMS’i kullan.', 'WhatsApp is not installed. Use SMS instead.'));
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={s.root}>
        <View style={s.header}><Text style={[s.h1, { flex: 1 }]}>{kind === 'safe' ? mtx('Güvendeyim', 'I am safe') : mtx('Tehlikedeyim', 'I need help')}</Text><Btn t={t} label={mtx('Kapat', 'Close')} onPress={onClose} /></View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {kind === 'danger' && <Btn t={t} kind="danger" label={mtx('112’yi ara', 'Call 112')} onPress={() => (st.env === 'drill' ? Alert.alert(mtx('Tatbikat', 'Drill mode'), mtx('Gerçek 112 aranmadı.', '112 was not dialed.')) : void Linking.openURL('tel:112'))} />}
          <Btn t={t} label={loc ? mtx('Konum eklendi ✓', 'Location attached ✓') : mtx('Konumumu ekle', 'Include my GPS location')} onPress={() => void addLoc()} />
          {kind === 'danger' && <TextInput style={s.input} placeholder={mtx('Adres veya tarif (isteğe bağlı)', 'Address or floor/apartment details (optional)')} placeholderTextColor={t.muted} value={address} onChangeText={setAddress} accessibilityLabel={mtx('Adres', 'Address')} />}
          <Card t={t}><Text style={s.text}>{text}</Text></Card>
          {st.contacts.length === 0 && <Text style={s.muted}>{mtx('Acil kişi yok. Menü › Acil kişiler bölümünden ekle.', 'No emergency contacts saved. Add them in Menu › Emergency Contacts.')}</Text>}
          {st.contacts.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.strong, { flex: 1 }]}>{c.name}</Text>
              <Btn t={t} label="SMS" onPress={() => void sms(c.phone)} />
              <Btn t={t} label="WhatsApp" onPress={() => void wa(c.phone)} />
            </View>
          ))}
          {status && <Text style={[s.text, { color: t.teal }]}>{status}</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------- Uyarılar ----------------
function AlertsScreen({ t, onOpen }: { t: Theme; onOpen: (id: string, d: string) => void }) {
  const st = useStore();
  const l = st.lang;
  const [list, setList] = useState<{ id: string; kind: string; title: string; body: string; state: string; eventId: string | null; stages: { queuedAt: string } }[]>([]);
  useEffect(() => { if (st.device) void api<typeof list>('/api/devices/me/deliveries').then(setList).catch(() => {}); }, [st.device?.id, l]);
  const s = styles(t);
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card t={t}><Text style={s.text}>{eewNotAvailableText(l)}</Text></Card>
      {list.map((d) => (
        <Pressable key={d.id} onPress={() => d.eventId && onOpen(d.eventId, d.id)} accessibilityRole="button">
          <Card t={t}>
            <Text style={s.muted}>{formatDateTimeTR(d.stages.queuedAt, true, l)} · {d.kind}</Text>
            <Text style={s.strong}>{d.title}</Text>
            <Text style={s.text}>{d.body}</Text>
            <Text style={s.muted}>{mtx('Durum:', 'Status:')} {d.state}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ---------------- Ayarlar ----------------
function SettingsScreen({ t }: { t: Theme }) {
  const st = useStore();
  const l = st.lang;
  const devLang = detectDeviceLang();
  const [perm, setPerm] = useState<PermissionInfo | null>(null);
  const [edit, setEdit] = useState<SavedLocation | null>(null);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const s = styles(t);
  const refresh = () => void permissionInfo().then(setPerm);
  useEffect(refresh, [l]);
  const prefs = st.prefs;
  const setPrefs = (p: typeof prefs) => setState({ prefs: p });
  const fmtDec = (n: number) => (l === 'en' ? String(n) : String(n).replace('.', ','));

  const measure = async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    if (!p.granted) {
      setPrefs({ ...prefs, active: { ...prefs.active, permission: 'denied' } });
      Alert.alert(mtx('Konum izni kapalı', 'Location permission denied'), mtx('Kayıtlı konumların ve dünya geneli bildirimlerin yine çalışır.', 'Saved locations and worldwide earthquake alerts still work without GPS.'));
      return;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setPrefs({ ...prefs, active: { ...prefs.active, permission: 'granted', lat: pos.coords.latitude, lon: pos.coords.longitude, measuredAt: new Date(pos.timestamp).toISOString(), accuracyM: pos.coords.accuracy ?? null } });
  };
  const test = async () => {
    try {
      const r = await api<{ deliveryId: string }>('/api/devices/me/test', { method: 'POST' });
      setState({ lastTestId: r.deliveryId });
      Alert.alert(mtx('Gönderildi', 'Sent'), mtx('“TEST · Bildirim denemesi” birkaç saniye içinde görünmeli.', '“TEST · Notification check” should appear within a few seconds.'));
    } catch (e) { Alert.alert(mtx('Gönderilemedi', 'Could not send'), (e as Error).message); }
  };

  const themes: [ThemeMode, string][] = [
    ['system', mtx('Sistem', 'System')],
    ['light', mtx('Açık', 'Light')],
    ['dark', mtx('Koyu', 'Dark')],
    ['amoled', 'AMOLED'],
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={s.section}>{mtx('Tema ve Dil', 'Theme & Language')}</Text>
      <Card t={t}>
        <Text style={[s.strong, { marginBottom: 8 }]}>{mtx('Tema', 'Theme')}</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {themes.map(([k, lbl]) => <Chip key={k} t={t} label={lbl} on={st.theme === k} onPress={() => setTheme(k)} />)}
        </View>
        <Text style={[s.strong, { marginBottom: 8 }]}>{mtx('Dil / Language', 'Language / Dil')}</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip t={t} label={mtx(`Cihaz (${devLang.toUpperCase()})`, `Device (${devLang.toUpperCase()})`)} on={!st.langExplicit} onPress={() => setLang('auto')} />
          <Chip t={t} label="Türkçe" on={st.langExplicit && st.lang === 'tr'} onPress={() => setLang('tr')} />
          <Chip t={t} label="English" on={st.langExplicit && st.lang === 'en'} onPress={() => setLang('en')} />
        </View>
      </Card>

      <Text style={s.section}>{mtx('Bildirimler', 'Notifications')}</Text>
      <Card t={t}>
        <Text style={s.text}>{perm?.text ?? '…'}{perm?.critical === false && Platform.OS === 'ios' ? mtx(' · Kritik uyarı izni yok (Apple yetkisi gerekir)', ' · No Critical Alert entitlement') : ''}</Text>
        <Text style={s.muted}>{st.device ? `${mtx('Cihaz kayıtlı:', 'Device registered:')} ${st.label}` : mtx('Cihaz henüz kayıtlı değil.', 'Device not registered yet.')}</Text>
        <View style={{ gap: 8, marginTop: 10 }}>
          {!perm?.granted || !st.device
            ? <Btn t={t} kind="primary" label={mtx('Bildirimleri aç', 'Enable notifications')} onPress={async () => { Alert.alert(mtx('Bildirimler', 'Notifications'), await enableNotifications()); refresh(); }} />
            : <Btn t={t} kind="primary" label={mtx('Bildirimlerimi test et', 'Test my notifications')} onPress={() => void test()} />}
          {perm && !perm.granted && !perm.canAskAgain && <Btn t={t} label={mtx('Sistem ayarlarını aç', 'Open system settings')} onPress={() => void Linking.openSettings()} />}
        </View>
      </Card>

      <Text style={s.section}>{mtx('Mevcut konumum', 'My current location')}</Text>
      <Card t={t}>
        <Row t={t} label={mtx('Mevcut konumum için bildirim', 'Alerts for my current location')} value={prefs.active.enabled} onChange={(v) => setPrefs({ ...prefs, active: { ...prefs.active, enabled: v } })} />
        <Text style={s.muted}>{prefs.active.measuredAt ? `${mtx('Son ölçüm', 'Last measured')} ${formatDateTimeTR(prefs.active.measuredAt, false, l)}${prefs.active.accuracyM ? `, ±${Math.round(prefs.active.accuracyM)} m` : ''}` : mtx('Ölçüm yok', 'Not measured yet')}</Text>
        <View style={{ height: 8 }} />
        <Btn t={t} label={mtx('Konumumu güncelle', 'Update my location')} onPress={() => void measure()} />
      </Card>

      <Text style={s.section}>{mtx('Kayıtlı konumlar', 'Saved locations')}</Text>
      {prefs.saved.map((loc) => (
        <Card t={t} key={loc.id}>
          <Row t={t} label={placeName(loc.label, loc.place, l)} value={loc.enabled} onChange={(v) => setPrefs({ ...prefs, saved: prefs.saved.map((x) => (x.id === loc.id ? { ...x, enabled: v } : x)) })} />
          <Text style={s.muted}>{loc.radiusKm} km · M {fmtDec(loc.minMag)}+</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Btn t={t} label={mtx('Düzenle', 'Edit')} onPress={() => setEdit(loc)} />
            <Btn t={t} label={mtx('Sil', 'Delete')} onPress={() => setPrefs({ ...prefs, saved: prefs.saved.filter((x) => x.id !== loc.id) })} />
          </View>
        </Card>
      ))}
      <Btn t={t} kind="primary" label={mtx('+ Yer ekle', '+ Add place')} onPress={() => setEdit({ id: `loc${Date.now()}`, label: '', place: 'İstanbul', lat: 41.01, lon: 28.98, enabled: true, radiusKm: 100, minMag: 3.5 })} />

      <Text style={s.section}>{mtx('Dünya geneli', 'Worldwide')}</Text>
      <Card t={t}>
        <Row t={t} label={mtx('Dünya genelinde büyük depremler', 'Major earthquakes worldwide')} value={prefs.world.enabled} onChange={(v) => setPrefs({ ...prefs, world: { ...prefs.world, enabled: v } })} />
        <Text style={s.muted}>{mtx('Konum izni gerekmez. Eşik:', 'No location permission needed. Threshold:')} M {fmtDec(prefs.world.minMag)}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {[5.5, 6, 6.5, 7].map((m) => <Chip key={m} t={t} label={`M ${fmtDec(m)}+`} on={prefs.world.minMag === m} onPress={() => setPrefs({ ...prefs, world: { ...prefs.world, minMag: m } })} />)}
        </View>
      </Card>

      <Text style={s.section}>{mtx('Acil kişiler', 'Emergency contacts')}</Text>
      <Card t={t}>
        {st.contacts.map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={[s.text, { flex: 1 }]}>{c.name} · {c.phone}</Text>
            <Btn t={t} label={mtx('Sil', 'Delete')} onPress={() => setState({ contacts: st.contacts.filter((x) => x.id !== c.id) })} />
          </View>
        ))}
        <TextInput style={s.input} placeholder={mtx('Ad', 'Name')} placeholderTextColor={t.muted} value={cName} onChangeText={setCName} accessibilityLabel={mtx('Kişi adı', 'Contact name')} />
        <TextInput style={s.input} placeholder={mtx('Telefon', 'Phone')} placeholderTextColor={t.muted} keyboardType="phone-pad" value={cPhone} onChangeText={setCPhone} accessibilityLabel={mtx('Telefon', 'Phone')} />
        <Btn t={t} label={mtx('Kişi ekle', 'Add contact')} onPress={() => { if (cName && cPhone) { setState({ contacts: [...st.contacts, { id: `c${Date.now()}`, name: cName, phone: cPhone }] }); setCName(''); setCPhone(''); } }} />
      </Card>

      <Text style={s.section}>{mtx('Cihaz', 'Device')}</Text>
      <Card t={t}>
        <TextInput style={s.input} value={st.label} onChangeText={(v) => setState({ label: v })} accessibilityLabel={mtx('Cihaz adı', 'Device label')} />
      </Card>
      {edit && <LocationModal t={t} loc={edit} onClose={() => setEdit(null)} onSave={(loc) => { setPrefs({ ...prefs, saved: prefs.saved.some((x) => x.id === loc.id) ? prefs.saved.map((x) => (x.id === loc.id ? loc : x)) : [...prefs.saved, loc] }); setEdit(null); }} />}
    </ScrollView>
  );
}

function Row({ t, label, value, onChange }: { t: Theme; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
      <Text style={{ color: t.text, flex: 1, fontSize: 16, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: t.muted, marginRight: 8 }}>{value ? mtx('Açık', 'On') : mtx('Kapalı', 'Off')}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: t.teal, false: t.surface2 }} />
    </View>
  );
}

function Chip({ t, label, on, onPress }: { t: Theme; label: string; on: boolean; onPress: () => void }) {
  const s = styles(t);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, on && { backgroundColor: t.tealBg, borderColor: t.teal }]}><Text style={[s.chipText, on && { color: t.teal }]}>{label}</Text></Pressable>;
}

function LocationModal({ t, loc, onClose, onSave }: { t: Theme; loc: SavedLocation; onClose: () => void; onSave: (l: SavedLocation) => void }) {
  const st = useStore();
  const lng = st.lang;
  const [l, setL] = useState(loc);
  const s = styles(t);
  const preview = useMemo(() => (
    lng === 'en'
      ? `Earthquake recorded 42 km from ${placeName(l.label, l.place || 'this place', 'en')}`
      : `${l.place && l.label.trim() ? `${l.label.trim()} · ${dative(l.place)}` : dative(l.place || l.label || 'Bu yer')} 42 km uzaklıkta deprem kaydedildi`
  ), [l, lng]);
  const quickLabels = lng === 'en' ? ['Home', 'Work'] : ['Ev', 'İş'];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={s.root}>
        <View style={s.header}><Text style={[s.h1, { flex: 1 }]}>{mtx('Konum', 'Location')}</Text><Btn t={t} label={mtx('Kapat', 'Close')} onPress={onClose} /></View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{quickLabels.map((n) => <Chip key={n} t={t} label={n} on={l.label === n} onPress={() => setL({ ...l, label: l.label === n ? '' : n })} />)}</View>
          <TextInput style={s.input} value={l.label} placeholder={mtx('İsim (isteğe bağlı), ör. Annemlerin evi', 'Label (optional), e.g. Parents')} placeholderTextColor={t.muted} onChangeText={(v) => setL({ ...l, label: v })} accessibilityLabel={mtx('İsim (isteğe bağlı)', 'Optional label')} />
          <Text style={s.strong}>{mtx('İl', 'Province')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {PROVINCES.map(([n, la, lo]) => <Chip key={n} t={t} label={n} on={l.place === n} onPress={() => setL({ ...l, place: n, lat: la, lon: lo })} />)}
          </View>
          <Text style={s.muted}>{mtx('Koordinat:', 'Coordinates:')} {l.lat.toFixed(4)}, {l.lon.toFixed(4)}</Text>
          <Text style={s.strong}>{mtx('Yarıçap (km)', 'Radius (km)')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>{RADIUS_SHORTCUTS.map((r) => <Chip key={r} t={t} label={`${r} km`} on={l.radiusKm === r} onPress={() => setL({ ...l, radiusKm: r })} />)}</View>
          <TextInput style={s.input} keyboardType="number-pad" value={String(l.radiusKm)} onChangeText={(v) => setL({ ...l, radiusKm: Math.max(1, Number(v) || 1) })} accessibilityLabel={mtx('Yarıçap kilometre', 'Radius in km')} />
          <Text style={s.strong}>{mtx('Büyüklük eşiği', 'Minimum magnitude')}</Text>
          <TextInput style={s.input} keyboardType="decimal-pad" value={lng === 'en' ? String(l.minMag) : String(l.minMag).replace('.', ',')} onChangeText={(v) => { const n = Number(v.replace(',', '.')); if (Number.isFinite(n)) setL({ ...l, minMag: n }); }} accessibilityLabel={mtx('Büyüklük eşiği', 'Magnitude threshold')} />
          <Card t={t}><Text style={s.muted}>{mtx('Önizleme', 'Alert preview')}</Text><Text style={s.strong}>{preview}</Text><Text style={s.muted}>{lng === 'en' ? 'M 4.1 (ML) · 14:32 · Source: AFAD' : 'M 4,1 (ML) · 14:32 · Kaynak: AFAD'}</Text></Card>
          <Btn t={t} kind="primary" label={mtx('Kaydet', 'Save')} onPress={() => onSave(l)} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function styles(t: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 6 },
    h1: { color: t.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
    pillBtn: { minHeight: 36, paddingHorizontal: 10, borderRadius: 18, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, justifyContent: 'center', alignItems: 'center' },
    pillBtnText: { color: t.text, fontSize: 12, fontWeight: '700' },
    text: { color: t.text, fontSize: 16, lineHeight: 22 },
    strong: { color: t.text, fontSize: 16, fontWeight: '700' },
    muted: { color: t.muted, fontSize: 14, lineHeight: 20 },
    section: { color: t.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
    row: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: t.border, padding: 14, marginBottom: 8, minHeight: 80, ...SHADOW },
    chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: t.surface2, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center' },
    chipText: { color: t.text, fontWeight: '600' },
    input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, color: t.text, backgroundColor: t.surface2, marginBottom: 8, fontSize: 16 },
    nav: { flexDirection: 'row', backgroundColor: t.surface, marginHorizontal: 12, marginBottom: 8, borderRadius: 26, padding: 6, alignItems: 'center', borderWidth: 1, borderColor: t.border, ...SHADOW, shadowOpacity: 0.18, elevation: 8 },
    navBtn: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
    navText: { color: t.muted, fontWeight: '700', fontSize: 12 },
    sos: { flex: 1.2, minHeight: 64, marginTop: -18, marginHorizontal: 4, borderRadius: 22, backgroundColor: t.amber, alignItems: 'center', justifyContent: 'center', shadowColor: '#F5A524', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
    sosIcon: { fontSize: 22, color: t.amberInk },
    sosText: { color: t.amberInk, fontWeight: '900', fontSize: 13 },
  });
}

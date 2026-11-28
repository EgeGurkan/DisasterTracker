import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ThemeMode } from '../../shared/src/types.ts';
import { BrandMark, Icon } from './icons.tsx';
import { useRoute, type Route } from './router.ts';
import { ToastHost } from './ui.tsx';
import { EventsPage } from './pages/events.tsx';
import { MapPage } from './pages/map.tsx';
import { EmergencyPage, useAlarm } from './pages/emergency.tsx';
import { AlertsPage } from './pages/alerts.tsx';
import { MenuPage } from './pages/menu.tsx';
import { ReportsPage } from './pages/reports.tsx';
import { NetworkPage } from './pages/network.tsx';
import { ChatPage } from './pages/chat.tsx';
import { PreparePage } from './pages/prepare.tsx';
import { SettingsPage } from './pages/settings.tsx';
import { OpsPage } from './pages/ops.tsx';
import { AboutPage } from './pages/about.tsx';
import { STANDALONE } from './standalone.ts';
import { cycleTheme, setLang, useAppState } from './state.ts';
import { tx } from './i18n.ts';
import { getRefId, refPoints, setRefId } from './geo.ts';
import { LocationSheet } from './locationPicker.tsx';

function section(r: Route): string {
  const s = r.path[0] ?? 'afetler';
  return s === 'olay' || s === 'afet' || s === 'depremler' ? 'afetler' : s;
}

function Page({ r }: { r: Route }) {
  switch (r.path[0] ?? 'afetler') {
    case 'afetler': case 'depremler': case 'olay': case 'afet': return <EventsPage r={r} />;
    case 'harita': return <MapPage r={r} />;
    case 'acil': return <EmergencyPage r={r} />;
    case 'uyarilar': return <AlertsPage r={r} />;
    case 'menu': return <MenuPage />;
    case 'raporlar': return <ReportsPage />;
    case 'sismik-ag': return <NetworkPage />;
    case 'sohbet': return <ChatPage r={r} />;
    case 'hazirlik': return <PreparePage r={r} />;
    case 'ayarlar': return <SettingsPage r={r} />;
    case 'ops': return <OpsPage />;
    case 'hakkinda': return <AboutPage />;
    default: return <div class="empty">{tx('Sayfa bulunamadı.', 'Page not found.')} <a href="#/afetler">{tx('Afetlere dön', 'Back to Disasters')}</a></div>;
  }
}

function Online({ children }: { children?: ComponentChildren }) {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on ? <>{children}</> : (
    <div class="offline-bar" role="status"><Icon name="wifiOff" />
      <span>{tx(
        'Çevrimdışısın. Düdük, acil kişiler, mesaj taslakları ve rehber çalışır; yeni uyarılar bağlantı gelince alınır.',
        'You are offline. Whistle, emergency contacts, message drafts, and preparedness guides still work; new alerts arrive once reconnected.',
      )}</span>
    </div>
  );
}

function themeMeta(theme: ThemeMode): { icon: string; short: string; nextHint: string } {
  switch (theme) {
    case 'light': return { icon: 'sun', short: tx('Açık', 'Light'), nextHint: tx('Temayı değiştir (şu an Açık)', 'Switch theme (currently Light)') };
    case 'dark': return { icon: 'moon', short: tx('Koyu', 'Dark'), nextHint: tx('Temayı değiştir (şu an Koyu)', 'Switch theme (currently Dark)') };
    case 'amoled': return { icon: 'oled', short: 'AMOLED', nextHint: tx('Temayı değiştir (şu an AMOLED)', 'Switch theme (currently AMOLED)') };
    case 'system': return { icon: 'eye', short: tx('Sistem', 'Auto'), nextHint: tx('Temayı değiştir (şu an Sistem)', 'Switch theme (currently System)') };
  }
}

function LocationTopButton() {
  const s = useAppState();
  const [open, setOpen] = useState(false);
  const [refId, setRef] = useState(getRefId());
  useEffect(() => {
    const sync = () => setRef(getRefId());
    window.addEventListener('afet-ref-changed', sync);
    return () => window.removeEventListener('afet-ref-changed', sync);
  }, []);
  const refs = refPoints(s.prefs);
  const cur = refs.find((x) => x.id === refId) ?? refs[0] ?? null;
  const label = cur ? cur.label : tx('Konum seç', 'Select location');
  return (
    <>
      <button
        type="button"
        class={`quick-pill loc-pill ${cur?.kind === 'active' ? 'is-cur' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={cur ? `${tx('Konum', 'Location')}: ${cur.label}` : tx('Konum seç', 'Select location')}
        title={label}
      >
        <Icon name={cur?.kind === 'active' ? 'locate' : 'pin'} />
        <span class="q-lbl loc-lbl">{label}</span>
      </button>
      {open && <LocationSheet selectedId={cur?.id ?? ''} onSelect={(id) => { setRef(id); setRefId(id); }} onClose={() => setOpen(false)} />}
    </>
  );
}

export function App() {
  const s = useAppState();
  const r = useRoute();
  const sec = section(r);
  useAlarm();

  const nav = [
    { id: 'afetler', label: tx('Afetler', 'Disasters'), icon: 'quake' },
    { id: 'harita', label: tx('Harita', 'Map'), icon: 'map' },
    { id: 'acil', label: tx('Acil', 'SOS'), icon: 'sos' },
    { id: 'uyarilar', label: tx('Uyarılar', 'Alerts'), icon: 'bell' },
    { id: 'menu', label: tx('Menü', 'Menu'), icon: 'menu' },
  ];
  const more = [
    { id: 'raporlar', label: tx('Raporlar', 'Reports'), icon: 'chart' },
    { id: 'sismik-ag', label: tx('Sismik Ağ', 'Seismic Network'), icon: 'antenna' },
    ...(STANDALONE ? [] : [{ id: 'sohbet', label: tx('Sohbet', 'Chat'), icon: 'chat' }]),
    { id: 'hazirlik', label: tx('Hazırlık', 'Preparedness'), icon: 'backpack' },
    { id: 'ayarlar', label: tx('Ayarlar', 'Settings'), icon: 'gear' },
    { id: 'hakkinda', label: tx('Hakkında', 'About'), icon: 'info' },
  ];
  const appName = tx('Afet Takip', 'Disaster Tracker');
  const titles: Record<string, string> = {
    afetler: tx('Afetler', 'Disasters'),
    depremler: tx('Afetler', 'Disasters'),
    olay: tx('Afetler', 'Disasters'),
    afet: tx('Afetler', 'Disasters'),
    harita: tx('Harita', 'Map'),
    acil: tx('Acil', 'Emergency'),
    uyarilar: tx('Uyarılar', 'Alerts'),
    menu: tx('Menü', 'Menu'),
    raporlar: tx('Raporlar', 'Reports'),
    'sismik-ag': tx('Sismik Ağ', 'Seismic Network'),
    sohbet: tx('Sohbet', 'Chat'),
    hazirlik: tx('Hazırlık', 'Preparedness'),
    ayarlar: tx('Ayarlar', 'Settings'),
    ops: tx('İşletim ve teslim panosu', 'Operations & Delivery Dashboard'),
    hakkinda: tx('Hakkında', 'About'),
  };

  useEffect(() => {
    document.title = `${titles[sec] ?? appName} · ${appName}`;
    (document.getElementById('main') as HTMLElement | null)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [sec, s.lang]);

  const tm = themeMeta(s.theme);

  return (
    <div class="shell">
      <a class="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>{tx('İçeriğe geç', 'Skip to content')}</a>
      <nav class="sidenav" aria-label={tx('Ana menü', 'Main menu')}>
        <div class="brand"><BrandMark /> {appName}</div>
        {nav.filter((n) => n.id !== 'menu').map((n) => (
          <a key={n.id} href={`#/${n.id}`} class={n.id === 'acil' ? 'sos' : ''} aria-current={sec === n.id ? 'page' : undefined}>
            <Icon name={n.icon} />{n.label}
          </a>
        ))}
        <div class="group">{tx('Diğer', 'More')}</div>
        {more.map((n) => (
          <a key={n.id} href={`#/${n.id}`} aria-current={sec === n.id ? 'page' : undefined}><Icon name={n.icon} />{n.label}</a>
        ))}
      </nav>
      <div class="content">
        <Online />
        <header class="topbar">
          <div class="topbar-inner">
            <div class="topbar-title">
              <span class="brand-inline" aria-hidden="true"><BrandMark /></span>
              <h1>{titles[sec] ?? appName}</h1>
            </div>
            <span class="spacer" />
            <div class="top-actions">
              <LocationTopButton />
              <button type="button" class="quick-pill" onClick={() => cycleTheme()} aria-label={tm.nextHint} title={tm.nextHint}>
                <Icon name={tm.icon} /><span class="q-lbl">{tm.short}</span>
              </button>
              <button type="button" class="quick-pill"
                onClick={() => setLang(s.lang === 'tr' ? 'en' : 'tr')}
                aria-label={tx('Dili İngilizce yap (Switch to English)', 'Switch language to Turkish (Türkçeye geç)')}
                title={tx('Switch to English', 'Türkçeye geç')}>
                <Icon name="globe" /><span class="q-lbl">{s.lang === 'tr' ? 'TR' : 'EN'}</span>
              </button>
            </div>
          </div>
        </header>
        <main id="main" class="main" tabIndex={-1}>
          <Page r={r} />
        </main>
      </div>
      <nav class="bottomnav" aria-label={tx('Alt menü', 'Bottom navigation')}>
        {nav.map((n) => (
          <a key={n.id} href={`#/${n.id}`} class={`navbtn ${n.id === 'acil' ? 'sos' : ''}`}
            aria-current={sec === n.id || (n.id === 'menu' && more.some((m) => m.id === sec)) ? 'page' : undefined}>
            <Icon name={n.icon} /><span>{n.label}</span>
          </a>
        ))}
      </nav>
      <ToastHost />
    </div>
  );
}

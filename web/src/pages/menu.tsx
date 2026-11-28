import type { ThemeMode } from '../../../shared/src/types.ts';
import { Icon } from '../icons.tsx';
import { STANDALONE } from '../standalone.ts';
import { setLang, setTheme, useAppState } from '../state.ts';
import { detectDeviceLang, tx } from '../i18n.ts';

export function MenuPage() {
  const s = useAppState();
  const devLang = detectDeviceLang();
  const items = [
    { id: 'raporlar', t: tx('Raporlar', 'Reports'), d: tx('24 saat, 7 gün, 30 gün; büyüklük ve derinlik dağılımı', '24 hours, 7 days, 30 days; magnitude and depth breakdown'), i: 'chart' },
    { id: 'sismik-ag', t: tx('Sismik Ağ', 'Seismic Network'), d: tx('İstasyonlar ve kaynak bağlantı durumu', 'Seismic stations and live feed health'), i: 'antenna' },
    ...(STANDALONE ? [] : [{ id: 'sohbet', t: tx('Sohbet', 'Chat'), d: tx('Bölgesel topluluk odaları (isteğe bağlı)', 'Regional community rooms (optional)'), i: 'chat' }]),
    { id: 'hazirlik', t: tx('Hazırlık', 'Preparedness'), d: tx('Rehber, aile planı, afet çantam, zemin ve sigorta', 'Guide, family plan, emergency kit, ground & insurance'), i: 'backpack' },
    { id: 'ayarlar', t: tx('Ayarlar', 'Settings'), d: tx('Konumlarım, bildirimler, acil kişiler, görünüm, gizlilik', 'Locations, notifications, emergency contacts, theme & privacy'), i: 'gear' },
    { id: 'hakkinda', t: tx('Hakkında', 'About'), d: tx('Özellikler, veri kaynakları, gizlilik (README)', 'Features, data sources, privacy (README)'), i: 'info' },
  ];
  const themes: [ThemeMode, string, string][] = [
    ['system', tx('Sistem', 'System'), 'eye'],
    ['light', tx('Açık', 'Light'), 'sun'],
    ['dark', tx('Koyu', 'Dark'), 'moon'],
    ['amoled', 'AMOLED', 'oled'],
  ];

  return (
    <div class="stack" style="margin-top:12px">
      <nav class="card flush" aria-label={tx('Diğer bölümler', 'More sections')}>
        {items.map((x) => (
          <a key={x.id} class="list-link" href={`#/${x.id}`}>
            <span class="ic"><Icon name={x.i} /></span>
            <span style="flex:1"><span class="t">{x.t}</span><br /><span class="d">{x.d}</span></span>
            <Icon name="chev" />
          </a>
        ))}
      </nav>

      <div class="card">
        <h3>{tx('Hızlı görünüm ve dil', 'Quick Theme & Language')}</h3>
        <div class="field" style="margin-bottom:10px">
          <span class="label small muted">{tx('Tema', 'Theme')}</span>
          <div class="chips" role="radiogroup" aria-label={tx('Tema', 'Theme')} style="flex-wrap:wrap">
            {themes.map(([k, lbl, ic]) => (
              <button key={k} class="chip" role="radio" aria-checked={s.theme === k} onClick={() => setTheme(k)}>
                <Icon name={ic} />{lbl}
              </button>
            ))}
          </div>
        </div>
        <div class="field" style="margin-bottom:0">
          <span class="label small muted">{tx('Dil', 'Language')}</span>
          <div class="chips" role="radiogroup" aria-label={tx('Dil', 'Language')} style="flex-wrap:wrap">
            <button class="chip" role="radio" aria-checked={!s.langExplicit} onClick={() => setLang('auto')}>
              <Icon name="globe" />{tx(`Otomatik (${devLang.toUpperCase()})`, `Auto (${devLang.toUpperCase()})`)}
            </button>
            <button class="chip" role="radio" aria-checked={s.langExplicit && s.lang === 'tr'} onClick={() => setLang('tr')}>Türkçe</button>
            <button class="chip" role="radio" aria-checked={s.langExplicit && s.lang === 'en'} onClick={() => setLang('en')}>English</button>
          </div>
        </div>
      </div>

      <p class="small muted" style="margin:4px 4px">
        {tx(
          'Afet Takip 0.2 · Veriler: AFAD, Kandilli (KOERI), EMSC, USGS, NOA, GFZ GEOFON, INGV, JMA, GeoNet ve GEM/MTA diri fayları. Bu uygulama resmî bir uyarı kanalı değildir; resmî duyurular için AFAD ve valilikleri izle.',
          'Disaster Tracker 0.2 · Data sources: AFAD, KOERI (Kandilli), EMSC, USGS, NOA, GFZ GEOFON, INGV, JMA, GeoNet, and GEM/MTA active faults. Not an official warning channel; follow AFAD and local authorities for official announcements.',
        )}
      </p>
    </div>
  );
}

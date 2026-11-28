import { useState } from 'preact/hooks';
import { Ext, Notice, useFetch } from '../ui.tsx';
import { useAppState } from '../state.ts';
import { fmtDateTime, fmtRel, isEn, tx } from '../i18n.ts';
import type { InventoryItem } from '../../../server/src/sources/inventory.ts';

interface Health { source: string; last_poll_at: string | null; last_success_at: string | null; last_error: string | null; last_event_time: string | null; status: string; consecutive_failures: number }

const NETWORK_OWNER_TR: Record<string, string> = {
  KO: 'KRDAE (Boğaziçi Üniv.)', '6G': 'KRDAE / Yerel Ağ', TU: 'AFAD', GE: 'GFZ GEOFON', MN: 'INGV MedNet',
  HL: 'Atina Ulusal Gözlemevi (NOA)', HT: 'Selanik Aristo Üniv.', HC: 'Girit Sismoloji Ağı', HP: 'Patras Üniv.', HA: 'Atina Üniv.',
  CQ: 'Kıbrıs Jeoloji Dairesi', AB: 'Azerbaycan Ulusal Sismoloji Merkezi', GO: 'Gürcistan Ilia Devlet Üniv.', IR: 'İran Ulusal Sismoloji', BS: 'Bulgaristan Ulusal Sismoloji Ağı',
};

const NETWORK_OWNER_EN: Record<string, string> = {
  KO: 'KOERI (Boğaziçi Univ.)', '6G': 'KOERI Regional', TU: 'AFAD', GE: 'GFZ GEOFON', MN: 'INGV MedNet',
  HL: 'National Observatory of Athens (NOA)', HT: 'Aristotle Univ. of Thessaloniki', HC: 'Seismological Network of Crete', HP: 'Univ. of Patras', HA: 'Univ. of Athens',
  CQ: 'Cyprus Geological Survey', AB: 'Azerbaijan Seismological Service', GO: 'Ilia State Univ. Georgia', IR: 'Iranian Seismological Center', BS: 'Bulgaria National Network',
};

export function NetworkPage() {
  const s = useAppState();
  const en = isEn();
  const { data } = useFetch<{ health: Health[]; inventory: InventoryItem[]; gaps: { source: string; start_at: string; end_at: string | null }[] }>('/api/sources', [s.lang], 20_000);
  const { data: st, loading } = useFetch<{ source: string; fetchedAt: string | null; stations: { network: string; station: string; lat: number; lon: number; siteName: string; start: string }[]; error?: string; stale?: boolean }>('/api/stations');
  const [q, setQ] = useState('');
  const stations = (st?.stations ?? []).filter((x) => !q || `${x.network}.${x.station} ${x.siteName}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));

  const statusMap: Record<string, [string, string]> = {
    ok: [tx('Erişilebilir', 'Online'), 'green'],
    degraded: [tx('Gecikmeli', 'Degraded'), 'amber'],
    down: [tx('Kaynağa erişilemiyor', 'Unreachable'), 'red'],
    unknown: [tx('Bilinmiyor', 'Unknown'), 'neutral'],
  };

  const invStatusLabel: Record<string, string> = {
    'canlı-adaptör': tx('canlı-adaptör', 'live-adapter'),
    'izin-bekleniyor': tx('izin-bekleniyor', 'awaiting-auth'),
    inceleniyor: tx('inceleniyor', 'evaluating'),
    'yalnız-bağlantı': tx('yalnız-bağlantı', 'external-link'),
  };

  const owners = en ? NETWORK_OWNER_EN : NETWORK_OWNER_TR;

  return (
    <div class="stack" style="margin-top:12px">
      <div class="card">
        <h3>{tx('Kaynak bağlantıları', 'Live Source Connections')}</h3>
        <p class="small muted">{tx('“Son bağlantı” kaynakla son başarılı iletişimdir; “son olay” kaynağın yayımladığı en yeni depremin zamanıdır. İkisi ayrı izlenir: sessiz bir saat kesinti anlamına gelmez.', '“Last poll” shows the latest successful connection; “latest event” shows the newest earthquake published by that agency. Quiet seismic periods do not indicate an outage.')}</p>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>{tx('Kaynak', 'Source')}</th><th>{tx('Durum', 'Status')}</th><th>{tx('Son bağlantı', 'Last poll')}</th><th>{tx('Son olay', 'Latest event')}</th></tr></thead>
          <tbody>{data?.health.map((h) => {
            const [l, c] = statusMap[h.status] ?? statusMap.unknown!;
            return <tr key={h.source}><td><strong>{h.source}</strong></td><td><span class={`pill ${c}`}>{l}</span>{h.last_error && h.status !== 'ok' && <div class="small muted">{h.last_error}</div>}</td>
              <td>{h.last_success_at ? `${fmtDateTime(h.last_success_at, true)} (${fmtRel(h.last_success_at)})` : tx('bilinmiyor', 'unknown')}</td>
              <td>{h.last_event_time ? fmtDateTime(h.last_event_time, true) : tx('bilinmiyor', 'unknown')}</td></tr>;
          })}</tbody>
        </table></div>
      </div>

      <div class="card">
        <h3>{tx('Sismik istasyonlar', 'Seismic Stations')}</h3>
        <p class="small muted">{tx('Kaynak:', 'Source:')} {st?.source ?? 'GFZ GEOFON · KOERI EIDA · NOA · INGV'}{st?.fetchedAt ? ` · ${tx('alındı', 'fetched')} ${fmtDateTime(st.fetchedAt)}` : ''}.</p>
        {st?.error && <Notice kind="amber" icon="wifiOff">{st.stale ? tx('Son kopya gösteriliyor; ', 'Showing cached copy; ') : ''}{tx('Kaynağa erişilemiyor.', 'Cannot reach station feed.')}</Notice>}
        <div class="field"><label for="stq">{tx('İstasyon ara', 'Search stations')}</label><input id="stq" class="input" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder={tx('ör. KO.ISK, HL.ATH veya Istanbul', 'e.g. KO.ISK, HL.ATH, or Istanbul')} /></div>
        {loading && !st ? <p><span class="spin" /> {tx('Yükleniyor…', 'Loading…')}</p> : (
          <div class="table-wrap" style="max-height:420px;overflow:auto"><table class="data">
            <thead><tr><th>{tx('Kod', 'Code')}</th><th>{tx('İşleten kurum', 'Operator')}</th><th>{tx('Yer', 'Site')}</th><th>{tx('Koordinat', 'Coords')}</th><th>{tx('Erişim', 'Access')}</th></tr></thead>
            <tbody>{stations.slice(0, 400).map((x) => (
              <tr key={x.network + x.station}>
                <td><strong>{x.network}.{x.station}</strong></td>
                <td>{owners[x.network] ?? `${x.network} ${tx('ağı', 'network')}`}</td>
                <td>{x.siteName || '—'}</td>
                <td class="small muted">{x.lat.toFixed(2)}, {x.lon.toFixed(2)}</td>
                <td><span class="pill teal">{tx('FDSN istasyon', 'FDSN station')}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p class="small muted">{stations.length} {tx('istasyon', 'stations')}</p>
      </div>

      <div class="card">
        <h3>{tx('Entegrasyon envanteri', 'Source Integration Inventory')}</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>{tx('Kurum', 'Agency')}</th><th>{tx('Kapsam / ürün', 'Coverage / product')}</th><th>{tx('Durum', 'Status')}</th><th>{tx('Atıf ve şart', 'Attribution & terms')}</th></tr></thead>
          <tbody>{data?.inventory.map((i) => (
            <tr key={i.id}>
              <td><strong>{en ? (i.nameEn || i.name) : i.name}</strong><div class="small">{i.officialAccess.startsWith('http') ? <Ext href={i.officialAccess.split(' ')[0]!}>{tx('Resmî erişim', 'Official endpoint')}</Ext> : i.officialAccess}</div></td>
              <td class="small">{en ? (i.coverageEn || i.coverage) : i.coverage}<br />{en ? (i.productEn || i.product) : i.product}<br /><span class="muted">{en ? (i.updateFrequencyEn || i.updateFrequency) : i.updateFrequency}</span></td>
              <td>
                <span class={`pill ${i.status === 'canlı-adaptör' ? 'green' : i.status === 'izin-bekleniyor' ? 'amber' : 'neutral'}`}>{invStatusLabel[i.status] ?? i.status}</span>
                <div class="small muted">{en ? (i.statusNoteEn || i.statusNote) : i.statusNote}</div>
              </td>
              <td class="small">{en ? (i.attributionEn || i.attribution) : i.attribution}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  );
}

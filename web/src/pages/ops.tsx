import { useEffect, useState } from 'preact/hooks';
import { reasonLabel } from '../../../shared/src/match.ts';
import type { MatchReason } from '../../../shared/src/types.ts';
import { api, ApiError } from '../api.ts';
import { Icon } from '../icons.tsx';
import { platformLabel } from '../platform.ts';
import { fmtMs, Notice, toast } from '../ui.tsx';
import { useAppState } from '../state.ts';
import { fmtDateTime, fmtDec, fmtRel, fmtTime, lang, tx } from '../i18n.ts';

interface OpsDelivery {
  id: string; kind: string; title: string; device_label: string; platform: string; transport: string; is_test: number; reasons_json: string | null;
  source: string | null; source_published_at: string | null; platform_received_at: string; queued_at: string; first_send_at: string | null;
  provider_accepted_at: string | null; provider_status: number | null; provider_detail: string | null; device_received_at: string | null;
  displayed_at: string | null; displayed_server_at: string | null; opened_at: string | null; status: string; attempts: number; error: string | null;
  state: string; timings: Record<string, number | null>;
}
interface Ops {
  generatedAt: string;
  latency: { platform: string; total: number; accepted: number; displayed: number; failed: number; expired: number; unmeasured: number; displayed15s: number;
    firstSend: { p50: number | null; p95: number | null; p99: number | null; n: number }; displayedLatency: { p50: number | null; p95: number | null; p99: number | null; n: number } }[];
  queue: { priority: number; n: number; oldestAgeMs: number }[];
  sources: { source: string; status: string; last_success_at: string | null; last_event_time: string | null; last_error: string | null; consecutive_failures: number }[];
  gaps: { source: string; start_at: string; end_at: string | null }[];
  errors: { id: string; platform: string; provider_status: number | null; provider_detail: string | null; error: string | null; queued_at: string }[];
  devices: { id: string; label: string; platform: string; env: string; transport: string; push_valid: number; push_invalid_reason: string | null; last_seen_at: string | null; last_test_ok_at: string | null }[];
  deliveries: OpsDelivery[];
}

const TOKEN_KEY = 'afet:admin';

export function OpsPage() {
  useAppState();
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } });
  const [data, setData] = useState<Ops | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const presets = [
    { id: 'izmir', label: tx('TEST · İzmir yakını M 4,2 (Menderes)', 'TEST · Near Izmir M 4.2 (Menderes)'), body: { lat: 38.25, lon: 27.13, magnitude: 4.2, magType: 'ML', depthKm: 9.8, place: 'Menderes (İzmir)', region: 'Türkiye' } },
    { id: 'japan', label: tx('TEST · Japonya M 6,8 (dünya eşiği)', 'TEST · Japan M 6.8 (world threshold)'), body: { lat: 38.3, lon: 142.4, magnitude: 6.8, magType: 'Mw', depthKm: 30, place: 'Off East Coast of Honshu, Japan', region: 'Japonya' } },
    { id: 'ist', label: tx('TEST · Marmara M 3,9 (İstanbul’a yakın)', 'TEST · Marmara M 3.9 (Near Istanbul)'), body: { lat: 40.86, lon: 28.6, magnitude: 3.9, magType: 'ML', depthKm: 11, place: 'Marmara Denizi (Silivri açıkları)', region: 'Türkiye' } },
    { id: 'nomag', label: tx('TEST · İzmir yakını, büyüklük yok', 'TEST · Near Izmir, missing magnitude'), body: { lat: 38.3, lon: 27.2, magnitude: null, magType: null, depthKm: null, place: 'İzmir (büyüklük bilinmiyor)', region: 'Türkiye' } },
  ];

  const load = async () => {
    if (!token) return;
    try { setData(await api<Ops>('/api/admin/ops', { admin: token })); setErr(null); }
    catch (e) { setErr(e instanceof ApiError ? e.message : String(e)); }
  };
  useEffect(() => { void load(); const t = setInterval(() => void load(), 3000); return () => clearInterval(t); }, [token]);

  const fire = async (body: object) => {
    try {
      const r = await api<{ outcome: { eventId: string }; deliveries: { id: string; title: string }[] }>('/api/admin/test-event', { method: 'POST', admin: token, json: body });
      toast(tx(`Olay ${r.outcome.eventId}: ${r.deliveries.length} bildirim kuyruğa alındı.`, `Event ${r.outcome.eventId}: ${r.deliveries.length} notifications queued.`));
      void load();
    } catch (e) { toast((e as Error).message); }
  };
  const eew = async (o: object) => {
    try {
      const r = await api<{ decision: string; deliveries: string[] }>('/api/admin/eew', { method: 'POST', admin: token, json: o });
      toast(tx(`Erken uyarı: ${r.decision}, ${r.deliveries.length} gönderim.`, `Early warning: ${r.decision}, ${r.deliveries.length} deliveries.`));
      void load();
    } catch (e) { toast((e as Error).message); }
  };

  if (!data) {
    return (
      <form class="card" style="margin-top:12px" onSubmit={(e) => { e.preventDefault(); try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* yoksay */ } void load(); }}>
        <h2>{tx('İşletim ve teslim panosu', 'Operations & Delivery Dashboard')}</h2>
        <p class="small">{tx('Yönetici belirteci sunucudaki data/secrets.json dosyasındaki adminToken değeridir.', 'Admin token is the adminToken value inside data/secrets.json on the server.')}</p>
        <div class="field"><label for="tok">{tx('Yönetici belirteci', 'Admin token')}</label><input id="tok" class="input" type="password" autoComplete="off" value={token} onInput={(e) => setToken((e.target as HTMLInputElement).value)} /></div>
        {err && <Notice kind="red">{err}</Notice>}
        <button class="btn primary" type="submit">{tx('Aç', 'Sign in')}</button>
      </form>
    );
  }

  const csv = () => {
    const head = ['notification', 'kind', 'device', 'platform', 'rule', 'source', 'source_published', 'platform_received', 'queued', 'first_send', 'provider_accepted', 'device_received', 'displayed', 'opened', 'to_first_send_ms', 'to_accept_ms', 'to_displayed_ms', 'state'];
    const rows = data.deliveries.map((d) => [d.title, d.kind, d.device_label, d.platform, reasonsText(d.reasons_json), d.source, d.source_published_at, d.platform_received_at, d.queued_at, d.first_send_at, d.provider_accepted_at, d.device_received_at, d.displayed_at, d.opened_at, d.timings.platformToFirstSendMs, d.timings.platformToProviderAcceptMs, d.timings.platformToDisplayedMs, d.state]);
    const text = [head, ...rows].map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = `deliveries-${new Date().toISOString().slice(0, 16)}.csv`;
    a.click();
  };

  return (
    <div class="stack" style="margin-top:12px">
      <div class="card">
        <h3>{tx('Tatbikat senaryoları (yalnız tatbikat cihazlarına gider)', 'Drill scenarios (sent only to TEST devices)')}</h3>
        <div class="row wrap">
          {presets.map((p) => <button key={p.id} class="btn sm" onClick={() => void fire(p.body)}>{p.label}</button>)}
        </div>
        <div class="row wrap" style="margin-top:8px">
          <button class="btn sm danger" onClick={() => void eew({ alertId: `izmir-${Date.now()}`, ttlSec: 60, epicenter: { lat: 38.25, lon: 27.0 }, magnitude: 5.8, area: { circles: [{ lat: 38.3, lon: 27.1, radiusKm: 70 }] } })}>{tx('TEST erken uyarı · İzmir 70 km', 'TEST EEW · Izmir 70 km')}</button>
          <button class="btn sm danger" onClick={() => void eew({ alertId: `ist-${Date.now()}`, ttlSec: 60, epicenter: { lat: 40.86, lon: 28.6 }, magnitude: 5.6, area: { circles: [{ lat: 40.95, lon: 28.9, radiusKm: 60 }] } })}>{tx('TEST erken uyarı · İstanbul 60 km', 'TEST EEW · Istanbul 60 km')}</button>
          <button class="btn sm" onClick={() => void eew({ alertId: `old-${Date.now()}`, issuedAt: new Date(Date.now() - 120000).toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString(), area: { circles: [{ lat: 38.3, lon: 27.1, radiusKm: 70 }] } })}>{tx('Süresi dolmuş uyarı (reddedilmeli)', 'Expired EEW (should reject)')}</button>
        </div>
        <p class="small muted" style="margin-top:6px">{tx('Tümü “TEST” işaretlidir ve gerçek üretim kullanıcılarına gitmez.', 'All drill events are marked “TEST” and isolated from production users.')}</p>
      </div>

      <div class="card">
        <div class="row wrap"><h3 style="margin:0;flex:1">{tx('Teslim kayıtları', 'Delivery logs')}</h3>
          <button class="btn sm" onClick={csv}><Icon name="copy" /> {tx('CSV indir', 'Export CSV')}</button></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>{tx('Zaman', 'Time')}</th><th>{tx('Bildirim', 'Notification')}</th><th>{tx('Cihaz', 'Device')}</th><th>{tx('Kural', 'Rule')}</th><th class="num">{tx('→ İlk gönderim', '→ First send')}</th><th class="num">{tx('→ Kabul', '→ Accepted')}</th><th class="num">{tx('→ Alım', '→ Received')}</th><th class="num">{tx('→ Gösterim', '→ Displayed')}</th><th class="num">{tx('→ Açılış', '→ Opened')}</th><th>{tx('Durum', 'State')}</th></tr></thead>
          <tbody>{data.deliveries.map((d) => (
            <tr key={d.id}>
              <td class="small">{fmtTime(d.queued_at, true)}<br /><span class="muted">{fmtRel(d.queued_at)}</span></td>
              <td><strong>{d.title}</strong><div class="small muted">{d.kind}{d.is_test ? ' · TEST' : ''}{d.source ? ` · ${d.source}` : ''}</div></td>
              <td>{d.device_label}<div class="small muted">{platformLabel(d.platform)}</div></td>
              <td class="small">{reasonsText(d.reasons_json) || (d.kind === 'test' ? tx('Bildirim testi', 'Notification test') : d.kind.startsWith('eew') ? tx('Erken uyarı hedef alanı', 'EEW target area') : '—')}</td>
              <td class="num">{fmtMs(d.timings.platformToFirstSendMs)}</td>
              <td class="num">{fmtMs(d.timings.platformToProviderAcceptMs)}<div class="small muted">{d.provider_status ?? ''}</div></td>
              <td class="num">{fmtMs(d.timings.platformToDeviceReceivedMs)}</td>
              <td class="num"><strong>{fmtMs(d.timings.platformToDisplayedMs)}</strong></td>
              <td class="num">{fmtMs(d.timings.platformToOpenedMs)}</td>
              <td class="small">{d.state}{d.error ? <div class="muted">{d.error}</div> : null}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div class="card">
        <h3>{tx('Platforma göre gecikme (son 7 gün)', 'Latency by platform (last 7 days)')}</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>{tx('Platform', 'Platform')}</th><th class="num">{tx('Toplam', 'Total')}</th><th class="num">{tx('Kabul', 'Accepted')}</th><th class="num">{tx('Gösterim', 'Displayed')}</th><th class="num">{tx('≤15 sn', '≤15s')}</th><th class="num">{tx('Ölçülemeyen', 'Unmeasured')}</th><th class="num">{tx('Hata', 'Failed')}</th><th class="num">{tx('İlk gönderim p50/p95/p99', 'First send p50/p95/p99')}</th><th class="num">{tx('Gösterim p50/p95/p99', 'Displayed p50/p95/p99')}</th></tr></thead>
          <tbody>{data.latency.map((l) => (
            <tr key={l.platform}><td>{platformLabel(l.platform)}</td><td class="num">{l.total}</td><td class="num">{l.accepted}</td><td class="num">{l.displayed}</td><td class="num">{l.displayed15s}</td><td class="num">{l.unmeasured}</td><td class="num">{l.failed + l.expired}</td>
              <td class="num">{fmtMs(l.firstSend.p50)} / {fmtMs(l.firstSend.p95)} / {fmtMs(l.firstSend.p99)}</td>
              <td class="num">{fmtMs(l.displayedLatency.p50)} / {fmtMs(l.displayedLatency.p95)} / {fmtMs(l.displayedLatency.p99)}</td></tr>
          ))}</tbody>
        </table></div>
      </div>

      <div class="grid2">
        <div class="card"><h3>{tx('Kuyruk', 'Queue')}</h3>{data.queue.length === 0 ? <p class="small">{tx('Bekleyen iş yok.', 'Queue is empty.')}</p> : data.queue.map((q) => <p key={q.priority} class="small">{tx('Öncelik', 'Priority')} {q.priority}{q.priority === 0 ? tx(' (kritik)', ' (critical)') : ''}: {q.n}, {tx('en eski', 'oldest')} {fmtMs(q.oldestAgeMs)}</p>)}</div>
        <div class="card"><h3>{tx('Kaynaklar', 'Sources')}</h3>{data.sources.map((s) => <p key={s.source} class="small"><strong>{s.source}</strong> {s.status} · {tx('son bağlantı', 'poll')} {s.last_success_at ? fmtRel(s.last_success_at) : '—'} · {tx('son olay', 'event')} {s.last_event_time ? fmtTime(s.last_event_time) : '—'}{s.consecutive_failures ? ` · ${s.consecutive_failures} err` : ''}</p>)}</div>
      </div>

      <div class="card">
        <h3>{tx('Cihazlar', 'Devices')}</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>{tx('Ad', 'Label')}</th><th>{tx('Platform', 'Platform')}</th><th>{tx('Ortam', 'Environment')}</th><th>Push</th><th>{tx('Son test', 'Last test')}</th><th>{tx('Son görülme', 'Last seen')}</th></tr></thead>
          <tbody>{data.devices.map((d) => <tr key={d.id}><td>{d.label}</td><td>{platformLabel(d.platform)}</td><td>{d.env === 'drill' ? tx('TEST cihazı', 'TEST device') : tx('üretim', 'production')} <button class="btn sm ghost" onClick={async () => { try { await api('/api/admin/device-env', { method: 'POST', admin: token, json: { id: d.id, env: d.env === 'drill' ? 'production' : 'drill' } }); void load(); } catch (e) { toast((e as Error).message); } }}>{d.env === 'drill' ? tx('Üretime al', 'Set production') : tx('TEST cihazı yap', 'Set TEST device')}</button></td><td>{d.push_valid ? tx('geçerli', 'valid') : `${tx('geçersiz', 'invalid')} ${d.push_invalid_reason ?? ''}`}</td><td>{d.last_test_ok_at ? fmtDateTime(d.last_test_ok_at, true) : '—'}</td><td>{d.last_seen_at ? fmtRel(d.last_seen_at) : '—'}</td></tr>)}</tbody>
        </table></div>
      </div>

      {data.errors.length > 0 && (
        <div class="card"><h3>{tx('Gönderim hataları', 'Delivery errors')}</h3>{data.errors.map((e) => <p key={e.id} class="small">{fmtTime(e.queued_at, true)} · {platformLabel(e.platform)} · {e.provider_status ?? '—'} · {e.error ?? e.provider_detail}</p>)}</div>
      )}
      <p class="small muted">{fmtTime(data.generatedAt, true)}</p>
    </div>
  );
}

function reasonsText(j: string | null): string {
  const l = lang();
  if (!j) return '';
  try {
    return (JSON.parse(j) as MatchReason[])
      .map((r) => r.kind === 'world'
        ? `${tx('Dünya', 'World')} ≥ M ${fmtDec(r.minMag)}`
        : `${reasonLabel(r, l)} ≤ ${r.radiusKm} km (${Math.round(r.distanceKm)} km), ≥ M ${fmtDec(r.minMag)}`)
      .join(' + ');
  } catch { return ''; }
}

import { useState } from 'preact/hooks';
import { Notice, useFetch } from '../ui.tsx';
import { useAppState } from '../state.ts';
import { fmtDateTime, fmtNum, isEn, tx } from '../i18n.ts';

interface Report {
  generatedAt: string; range: string; region: string; minMag: number; timezone: string;
  coverage: { primarySource: string; note: string; platformDataSince: string | null };
  total: number; largest: { id: string; magnitude: number; magType: string | null; place: string; time: string } | null;
  magBuckets: { label: string; count: number }[]; depthBuckets: { label: string; count: number }[];
  regions: { name: string; count: number; max: number | null }[];
  series: { bucketMs: number; points: { start: string; count: number }[] };
  gaps: { source: string; start_at: string; end_at: string | null; reason?: string }[];
}

function trBucketLabel(label: string): string {
  if (!isEn()) return label;
  return label
    .replace(',', '.')
    .replace(',', '.')
    .replace('Büyüklük bilinmiyor', 'Magnitude unknown')
    .replace('Derinlik bilinmiyor', 'Depth unknown');
}

function Bars({ items, label }: { items: { label: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((a, b) => a + b.count, 0) || 1;
  const en = isEn();
  return (
    <div class="bars" role="table" aria-label={label}>
      {items.map((i) => {
        const pct = Math.round((i.count / total) * 100);
        return (
          <div class="barrow" role="row" key={i.label}>
            <span role="rowheader">{trBucketLabel(i.label)}</span>
            <span role="cell" aria-hidden="true"><span class="bar" style={{ display: 'block', width: `${(i.count / max) * 100}%` }} /></span>
            <span role="cell" class="num">{i.count} <span class="muted small">({en ? `${pct}%` : `%${pct}`})</span></span>
          </div>
        );
      })}
    </div>
  );
}

function Series({ r }: { r: Report }) {
  const pts = r.series.points;
  const W = 640, H = 160, pad = 24;
  const max = Math.max(1, ...pts.map((p) => p.count));
  const bw = (W - pad) / pts.length;
  const t0 = Date.parse(pts[0]?.start ?? r.generatedAt);
  const t1 = t0 + pts.length * r.series.bucketMs;
  const x = (t: number) => pad + ((t - t0) / (t1 - t0)) * (W - pad);
  return (
    <figure style="margin:0">
      <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label={tx(`Zamana göre olay sayısı, en yüksek ${max}`, `Events over time, peak ${max}`)} style="width:100%;height:auto">
        {r.gaps.map((g, i) => {
          const a = Math.max(t0, Date.parse(g.start_at)), b = Math.min(t1, g.end_at ? Date.parse(g.end_at) : t1);
          return b > a ? <g key={i}><rect x={x(a)} y={0} width={Math.max(2, x(b) - x(a))} height={H} fill="var(--amber-bg)" stroke="var(--amber)" stroke-dasharray="4 3" /><text x={x(a) + 3} y={12} font-size="10" fill="var(--amber)">{tx('veri kesintisi', 'data gap')}</text></g> : null;
        })}
        <line x1={pad} y1={H} x2={W} y2={H} stroke="var(--line)" />
        <text x={0} y={10} font-size="10" fill="var(--muted)">{max}</text>
        {pts.map((p, i) => {
          const h = (p.count / max) * (H - 16);
          return <rect key={i} x={pad + i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} fill="var(--teal)" rx="2"><title>{`${fmtDateTime(p.start)} · ${p.count} ${tx('olay', 'events')}`}</title></rect>;
        })}
        <text x={pad} y={H + 14} font-size="10" fill="var(--muted)">{fmtDateTime(t0)}</text>
        <text x={W} y={H + 14} font-size="10" fill="var(--muted)" text-anchor="end">{fmtDateTime(t1)}</text>
      </svg>
      <figcaption class="small muted">
        {tx(
          `Her çubuk ${r.series.bucketMs >= 86400_000 ? '1 gün' : `${r.series.bucketMs / 3600_000} saat`}. Turuncu kesikli alan, birincil kaynağa (${r.coverage.primarySource}) erişilemeyen dönemi gösterir.`,
          `Each bar represents ${r.series.bucketMs >= 86400_000 ? '1 day' : `${r.series.bucketMs / 3600_000} hours`}. Dashed amber shading marks intervals where the primary source (${r.coverage.primarySource}) was unreachable.`,
        )}
      </figcaption>
    </figure>
  );
}

export function ReportsPage() {
  const s = useAppState();
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [region, setRegion] = useState<'tr' | 'world'>('tr');
  const [minMag, setMinMag] = useState(0);
  const { data, error, offline } = useFetch<Report>(`/api/reports?range=${range}&region=${region}&minMag=${minMag}`, [s.lang], 60_000);
  const en = isEn();

  return (
    <div class="stack" style="margin-top:12px">
      <div class="tabs" role="tablist" aria-label={tx('Zaman aralığı', 'Time range')}>
        {([
          ['24h', tx('Son 24 saat', 'Last 24 hours')],
          ['7d', tx('Son 7 gün', 'Last 7 days')],
          ['30d', tx('Son 30 gün', 'Last 30 days')],
        ] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={range === k} onClick={() => setRange(k)}>{l}</button>
        ))}
      </div>
      <div class="chips">
        <button class="chip" aria-pressed={region === 'tr'} onClick={() => setRegion('tr')}>{tx('Türkiye ve çevresi', 'Türkiye & region')}</button>
        <button class="chip" aria-pressed={region === 'world'} onClick={() => setRegion('world')}>{tx('Dünya', 'Worldwide')}</button>
        {[0, 2, 3, 4].map((m) => <button key={m} class="chip" aria-pressed={minMag === m} onClick={() => setMinMag(m)}>{m ? `M ${m}+` : tx('Tüm büyüklükler', 'All magnitudes')}</button>)}
      </div>
      {error && <Notice kind="amber" icon="wifiOff">{tx('Kaynağa erişilemiyor:', 'Source unreachable:')} {error}</Notice>}
      {data && (
        <>
          <div class="grid2">
            <div class="card"><div class="small muted">{tx('Tekilleştirilmiş olay', 'Deduplicated events')}</div><div style="font-size:2.2rem;font-weight:850">{data.total.toLocaleString(en ? 'en-US' : 'tr-TR')}</div></div>
            <div class="card"><div class="small muted">{tx('En büyük kayıt', 'Largest event')}</div>
              {data.largest ? <><div style="font-size:1.6rem;font-weight:850">M {fmtNum(data.largest.magnitude)} <span class="small">{data.largest.magType}</span></div><a href={`#/olay/${encodeURIComponent(data.largest.id)}`} class="small">{data.largest.place} · {fmtDateTime(data.largest.time)}</a></> : <div>—</div>}
            </div>
          </div>
          <div class="card"><h3>{tx('Zamana göre', 'Over time')}</h3><Series r={data} /></div>
          <div class="card"><h3>{tx('Büyüklük dağılımı', 'Magnitude distribution')}</h3><Bars items={data.magBuckets} label={tx('Büyüklük dağılımı', 'Magnitude distribution')} /></div>
          <div class="card"><h3>{tx('Derinlik dağılımı', 'Depth distribution')}</h3><Bars items={data.depthBuckets} label={tx('Derinlik dağılımı', 'Depth distribution')} /></div>
          <div class="card">
            <h3>{tx('Bölgesel karşılaştırma', 'Regional breakdown')}</h3>
            <div class="table-wrap"><table class="data">
              <thead><tr><th>{region === 'tr' ? tx('İl / deniz', 'Province / sea') : tx('Bölge', 'Region')}</th><th class="num">{tx('Olay', 'Events')}</th><th class="num">{tx('En büyük', 'Max M')}</th></tr></thead>
              <tbody>{data.regions.map((g) => <tr key={g.name}><td>{g.name}</td><td class="num">{g.count}</td><td class="num">{g.max == null ? '—' : fmtNum(g.max)}</td></tr>)}</tbody>
            </table></div>
          </div>
          <div class="card small">
            <h3>{tx('Filtre ve veri kapsamı', 'Filter & data coverage')}</h3>
            <dl class="kv">
              <dt>{tx('Filtre', 'Filter')}</dt><dd>{region === 'tr' ? tx('Türkiye ve çevresi', 'Türkiye & surroundings') : tx('Dünya', 'Worldwide')} · {range === '24h' ? tx('son 24 saat', 'last 24 hours') : range === '7d' ? tx('son 7 gün', 'last 7 days') : tx('son 30 gün', 'last 30 days')} · {minMag ? `M ${minMag}+` : tx('tüm büyüklükler', 'all magnitudes')}</dd>
              <dt>{tx('Saat dilimi', 'Time zone')}</dt><dd>Europe/Istanbul ({tx('veriler UTC saklanır', 'stored in UTC')})</dd>
              <dt>{tx('Kapsam', 'Coverage')}</dt><dd>{data.coverage.note}</dd>
              <dt>{tx('Platform verisi', 'Data since')}</dt><dd>{data.coverage.platformDataSince ? fmtDateTime(data.coverage.platformDataSince) : tx('bilinmiyor', 'unknown')}</dd>
              <dt>{tx('Kesinti / boşluk', 'Outages / gaps')}</dt><dd>{data.gaps.length ? data.gaps.map((g) => `${g.source} ${fmtDateTime(g.start_at)} – ${g.end_at ? fmtDateTime(g.end_at) : tx('sürüyor', 'ongoing')}${g.reason ? ` (${g.reason})` : ''}`).join('; ') : tx('Bu aralıkta kayıtlı kesinti yok', 'No recorded outages in this window')}</dd>
              <dt>{tx('Üretildi', 'Generated')}</dt><dd>{fmtDateTime(data.generatedAt, true)}{offline ? tx(' (çevrimdışı kopya)', ' (offline copy)') : ''}</dd>
            </dl>
          </div>
        </>
      )}
    </div>
  );
}

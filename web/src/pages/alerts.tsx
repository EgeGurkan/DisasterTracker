import { Icon } from '../icons.tsx';
import { eewNotAvailableText, reasonLabel } from '../../../shared/src/match.ts';
import { serverOnlyText, STANDALONE } from '../standalone.ts';
import type { Route } from '../router.ts';
import { useAppState } from '../state.ts';
import { Notice, useFetch } from '../ui.tsx';
import type { DeliveryInfo } from './events.tsx';
import { fmtDateTime, fmtTime, lang, tx } from '../i18n.ts';

interface AlertsResp {
  eew: { available: boolean; text: string };
  alerts: { key: string; provider: string; alertId: string; version: number; msgType: string; status: string; state: string; issuedAt: string; expiresAt: string; updatedAt: string; area: { circles: { lat: number; lon: number; radiusKm: number }[] }; magnitude: number | null; headline: string | null }[];
}

export function AlertsPage({ r: _r }: { r: Route }) {
  const s = useAppState();
  const l = lang();
  const { data } = useFetch<AlertsResp>(`/api/alerts${s.env === 'drill' ? '?test=1' : ''}`, [s.lang], 15_000);
  const { data: mine } = useFetch<DeliveryInfo[] & { __offline?: boolean }>(s.device ? '/api/devices/me/deliveries' : null, [s.lang], 15_000);

  const stateLabel: Record<string, [string, string, string]> = {
    active: [tx('Etkin', 'Active'), 'red', 'alert'],
    expired: [tx('Süresi doldu', 'Expired'), 'neutral', 'clock'],
    cancelled: [tx('Geri çekildi', 'Cancelled'), 'amber', 'close'],
  };

  const kindLabel: Record<string, [string, string]> = {
    catalog: [tx('Deprem bildirimi', 'Earthquake alert'), 'teal'],
    retraction: [tx('Geri çekildi', 'Retracted'), 'amber'],
    eew: [tx('Sarsıntı uyarısı', 'Shaking alert'), 'red'],
    'eew-cancel': [tx('Uyarı geri çekildi', 'Alert cancelled'), 'amber'],
    test: [tx('Bildirim denemesi', 'Notification test'), 'neutral'],
  };

  return (
    <div class="stack" style="margin-top:12px">
      <Notice kind="amber" icon="info">
        <strong>{tx('Sarsıntı erken uyarısı:', 'Earthquake early warning:')}</strong> {eewNotAvailableText(l)}
        <div class="small" style="margin-top:4px">{tx(
          'Erken uyarı yalnız yetkili ve dağıtım izni doğrulanmış bir sağlayıcıdan gelirse çalışır. Merkez üssüne yakın yerlerde sarsıntı uyarıdan önce ulaşabilir. Deprem kataloğundaki ilk ölçüm (ön çözüm) erken uyarı değildir.',
          'Early warning operates only when provided by an authorized feed with verified distribution rights. Near the epicenter, shaking may arrive before any alert. Preliminary catalog solutions are not early warnings.',
        )}</div>
      </Notice>

      <div class="section-title">{tx('Yetkili uyarılar', 'Authorized alerts')}</div>
      {data && data.alerts.length === 0 && <div class="card empty">{tx('Kayıtlı uyarı yok.', 'No recorded alerts.')}</div>}
      {data?.alerts.map((a) => {
        const [lbl, cls, ic] = stateLabel[a.state] ?? [a.state, 'neutral', 'info'];
        return (
          <div class="card" key={a.key}>
            <div class="row wrap">
              <span class={`pill ${cls}`}><Icon name={ic} />{lbl}</span>
              {a.status === 'test' && <span class="pill amber">TEST</span>}
              <strong>{tx('Sarsıntı erken uyarısı', 'Earthquake early warning')}</strong>
            </div>
            <dl class="kv" style="margin-top:8px">
              <dt>{tx('Yayımlayan', 'Provider')}</dt><dd>{a.provider}</dd>
              <dt>{tx('Yayımlanma', 'Issued')}</dt><dd>{fmtDateTime(a.issuedAt, true)}</dd>
              <dt>{tx('Son değişiklik', 'Updated')}</dt><dd>{fmtDateTime(a.updatedAt, true)} ({tx('sürüm', 'version')} {a.version}{a.msgType === 'update' ? tx(', güncellendi', ', updated') : ''})</dd>
              <dt>{tx('Geçerlilik', 'Valid until')}</dt><dd>{fmtTime(a.expiresAt, true)}</dd>
              <dt>{tx('Hedef alan', 'Target area')}</dt><dd>{a.area.circles.map((c) => `${c.lat.toFixed(2)}, ${c.lon.toFixed(2)} (${c.radiusKm} km)`).join('; ')}</dd>
            </dl>
          </div>
        );
      })}

      <div class="section-title">{tx('Bu cihaza gelen bildirimler', 'Notifications sent to this device')}</div>
      {STANDALONE ? <Notice icon="bell">{serverOnlyText()}</Notice>
        : !s.device && <Notice icon="bell">{tx('Bildirim geçmişi için', 'For notification history,')} <a href="#/ayarlar/bildirimler">{tx('bildirimleri aç', 'enable notifications')}</a>.</Notice>}
      {mine && mine.length === 0 && <div class="card empty">{tx('Henüz bildirim yok.', 'No notifications yet.')}</div>}
      {mine?.map((d) => {
        const [lbl, cls] = kindLabel[d.kind] ?? [d.kind, 'neutral'];
        const href = (d as unknown as { eventId: string | null }).eventId ? `#/olay/${encodeURIComponent((d as unknown as { eventId: string }).eventId)}?d=${d.id}` : undefined;
        return (
          <div class="card" key={d.id}>
            <div class="row wrap"><span class={`pill ${cls}`}>{lbl}</span><span class="small muted">{fmtDateTime(d.stages.queuedAt!, true)}</span></div>
            <p style="margin:6px 0 2px"><strong>{d.title}</strong></p>
            <p class="small">{d.body}</p>
            <p class="small muted">{tx('Durum:', 'Status:')} {d.state}{d.reasons ? ` · ${tx('Neden:', 'Reason:')} ${d.reasons.map((x) => reasonLabel(x, l)).join(', ')}` : ''}</p>
            {href && <a class="btn sm" href={href}>{tx('Ayrıntı ve süreler', 'Details & timings')}</a>}
          </div>
        );
      })}
    </div>
  );
}

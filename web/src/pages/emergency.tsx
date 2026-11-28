import { useEffect, useRef, useState } from 'preact/hooks';
import type { PushPayload } from '../../../shared/src/types.ts';
import { Icon } from '../icons.tsx';
import { go, type Route } from '../router.ts';
import { getState, setState, useAppState, type Contact } from '../state.ts';
import { Ext, Notice, Sheet, toast } from '../ui.tsx';
import { oneShotPosition } from '../geo.ts';
import { hasTouch, isAndroid, isIOS } from '../platform.ts';
import { STANDALONE } from '../standalone.ts';
import { fmtTime, isEn, tx } from '../i18n.ts';
// Ses dosyaları paketle dağıtılır (tek dosya sürümde sayfanın içine gömülür).
import whistleUrl from '../assets/whistle.wav';
import sirenUrl from '../assets/siren.wav';

// ---------------- Alarm (ön planda gelen geçerli erken uyarı) ----------------
interface Alarm { p: PushPayload; at: number }
let alarm: Alarm | null = null;
let sirenOn = false;
const alarmSubs = new Set<() => void>();
const siren = typeof Audio !== 'undefined' ? new Audio(sirenUrl) : null;
if (siren) { siren.loop = true; siren.preload = 'auto'; }

function emit() { alarmSubs.forEach((f) => f()); }
export function stopSiren() { sirenOn = false; siren?.pause(); if (navigator.vibrate) navigator.vibrate(0); emit(); }
export function clearAlarm() { stopSiren(); alarm = null; emit(); }

export function useAlarm(): { alarm: Alarm | null; sirenOn: boolean } {
  const [, f] = useState(0);
  useEffect(() => {
    const sub = () => f((n) => n + 1);
    alarmSubs.add(sub);
    const onSw = (e: Event) => {
      const d = (e as CustomEvent).detail as { type?: string; payload?: PushPayload; expired?: boolean };
      if (d?.type !== 'push' || !d.payload) return;
      const p = d.payload;
      if (p.kind === 'eew-cancel') { clearAlarm(); toast(tx('Sarsıntı uyarısı geri çekildi.', 'Shaking alert cancelled.')); return; }
      if (p.kind !== 'eew' || d.expired) return;
      if (p.expiresAtMs && Date.now() >= p.expiresAtMs) return;
      alarm = { p, at: Date.now() };
      if (p.critical && !p.silent && siren) {
        sirenOn = true;
        siren.currentTime = 0;
        void siren.play().catch(() => { sirenOn = false; emit(); });
        if (navigator.vibrate) navigator.vibrate([600, 200, 600, 200, 600]);
      }
      emit();
      go('/acil');
    };
    window.addEventListener('afet-sw', onSw);
    const t = setInterval(() => { if (alarm?.p.expiresAtMs && Date.now() >= alarm.p.expiresAtMs) clearAlarm(); }, 1000);
    return () => { alarmSubs.delete(sub); window.removeEventListener('afet-sw', onSw); clearInterval(t); };
  }, []);
  return { alarm, sirenOn };
}

// ---------------- Düdük ----------------
const whistle = typeof Audio !== 'undefined' ? new Audio(whistleUrl) : null;
if (whistle) { whistle.loop = true; whistle.preload = 'auto'; whistle.volume = 1; }
let sosTimer: number | null = null;

function startWhistle(mode: 'continuous' | 'sos', vibrate: boolean) {
  if (!whistle) return;
  stopWhistle();
  whistle.volume = 1;
  if (mode === 'continuous') {
    whistle.loop = true;
    whistle.currentTime = 0;
    void whistle.play();
    if (vibrate && navigator.vibrate) navigator.vibrate(Array.from({ length: 60 }, (_, i) => (i % 2 ? 300 : 700)));
    return;
  }
  const seq = [250, 250, 250, 250, 250, 600, 750, 250, 750, 250, 750, 600, 250, 250, 250, 250, 250, 2000];
  let i = 0;
  whistle.loop = true;
  const step = () => {
    const on = i % 2 === 0;
    if (on) { whistle.currentTime = 0; void whistle.play(); if (vibrate && navigator.vibrate) navigator.vibrate(seq[i % seq.length]!); }
    else whistle.pause();
    sosTimer = window.setTimeout(step, seq[i % seq.length]!);
    i++;
  };
  step();
}
function stopWhistle() {
  if (sosTimer) { clearTimeout(sosTimer); sosTimer = null; }
  whistle?.pause();
  if (navigator.vibrate) navigator.vibrate(0);
}

// ---------------- Korunma adımları (AFAD kaynaklı özet) ----------------
function getSteps(): Record<string, { label: string; step: string; detail: string }> {
  if (isEn()) {
    return {
      inside: { label: 'Indoors', step: 'Drop, Cover, Hold On.', detail: 'Get under a sturdy table or crouch next to solid furniture and shield your head and neck. Stay away from windows, glass, and heavy cabinets. Do not use stairs or elevators until shaking stops.' },
      outside: { label: 'Outdoors', step: 'Move clear of buildings, poles, and wires.', detail: 'Crouch in an open area and protect your head. Avoid standing near exterior walls or under balconies.' },
      vehicle: { label: 'In a vehicle', step: 'Pull over safely and stay inside.', detail: 'Slow down and stop away from bridges, overpasses, tunnels, and power lines; set the parking brake and remain inside until shaking stops.' },
      limited: { label: 'Limited mobility', step: 'Lock, Cover, Hold On.', detail: 'If using a wheelchair, lock the brakes, lean forward, and shield your head and neck with your arms or a pillow. If in bed, turn face-down and protect your head with a pillow.' },
    };
  }
  return {
    inside: { label: 'İçerideyim', step: 'Çök, Kapan, Tutun.', detail: 'Sağlam bir masanın altına gir ya da yanına çök, başını ve enseni koru. Pencere, cam ve devrilebilecek eşyalardan uzak dur. Sarsıntı bitene kadar merdiven ve asansör kullanma.' },
    outside: { label: 'Dışarıdayım', step: 'Binalardan, direklerden ve tellerden uzaklaş.', detail: 'Açık bir alanda çök ve başını koru. Duvar diplerinde ve balkon altlarında durma.' },
    vehicle: { label: 'Araçtayım', step: 'Güvenli yerde dur, araçta kal.', detail: 'Köprü, üst geçit, tünel ve elektrik hatlarından uzak bir yerde yavaşça dur; el frenini çek, sarsıntı geçene kadar araçta kal.' },
    limited: { label: 'Hareket kısıtlılığım var', step: 'Kilitle, Kapan, Tutun.', detail: 'Tekerlekli sandalyedeysen frenleri kilitle, öne eğil, başını ve enseni kollarınla ya da bir yastıkla koru. Yataktaysan yüzüstü dön ve başını yastıkla koru.' },
  };
}

export function draftText(kind: 'safe' | 'danger', loc: string | null, address: string): string {
  const t = fmtTime(Date.now());
  if (isEn()) {
    if (kind === 'safe') return `I am safe. Wanted to let you know. Time: ${t}.${loc ? ' ' + loc : ''}`;
    const where = [address.trim(), loc].filter(Boolean).join(' · ');
    return `I am in danger and need help. ${where || '(no location attached)'}. Time: ${t}.`;
  }
  if (kind === 'safe') return `Güvendeyim. Bunu sana haber vermek istedim. Saat ${t}.${loc ? ' ' + loc : ''}`;
  const where = [address.trim(), loc].filter(Boolean).join(' · ');
  return `Tehlikedeyim, yardıma ihtiyacım var. ${where || '(konum eklenmedi)'}. Saat ${t}.`;
}

function normPhone(p: string): string {
  let d = p.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10) d = '90' + d;
  return d;
}

export function smsHref(phone: string, body: string): string {
  const sep = isIOS ? '&' : '?';
  return `sms:${phone.replace(/\s/g, '')}${sep}body=${encodeURIComponent(body)}`;
}
export function waHref(phone: string, body: string): string {
  return `https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(body)}`;
}

function useOfflineReady(): { ready: boolean | null; total: number; failed: number } {
  const [st, setSt] = useState<{ ready: boolean | null; total: number; failed: number }>({ ready: null, total: 0, failed: 0 });
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) { if (alive) setSt({ ready: false, total: 0, failed: 0 }); return; }
        const r = await fetch('/__offline_status');
        const j = (await r.json()) as { total?: number; failed?: number };
        if (alive) setSt({ ready: !!j.total && !j.failed, total: j.total ?? 0, failed: j.failed ?? 0 });
      } catch { if (alive) setSt({ ready: false, total: 0, failed: 0 }); }
    };
    void check();
    const onSw = () => void check();
    window.addEventListener('afet-sw', onSw);
    navigator.serviceWorker?.addEventListener('controllerchange', onSw);
    return () => { alive = false; window.removeEventListener('afet-sw', onSw); };
  }, []);
  return st;
}

export function EmergencyPage({ r }: { r: Route }) {
  const s = useAppState();
  const { alarm: a, sirenOn: sOn } = useAlarm();
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState<'safe' | 'danger' | null>(null);
  const [show112, setShow112] = useState(false);
  const off = useOfflineReady();
  const steps = getSteps();
  const ctxStep = steps[s.emergencyContext]!;
  const isDrill = s.env === 'drill';
  const canDial = hasTouch && (isIOS || isAndroid);

  useEffect(() => () => stopWhistle(), []);
  useEffect(() => { if (r.query.get('islem') === 'duduk') toggleWhistle(); }, []);

  const toggleWhistle = () => {
    if (playing) { stopWhistle(); setPlaying(false); return; }
    startWhistle(s.whistle.mode, s.whistle.vibrate);
    setPlaying(true);
  };

  const call112 = (e: Event) => {
    if (isDrill) { e.preventDefault(); toast(tx('Tatbikat modu: gerçek 112 aranmadı. Deneme arama hedefi kullanıldı (tel:112 açılacaktı).', 'Drill mode: 112 was not dialed (tel:112 would open on production devices).')); return; }
    if (!canDial) { e.preventDefault(); setShow112(true); }
  };

  return (
    <div class="stack" style="margin-top:12px">
      {a && (
        <section class="alarm-banner" role="alert" aria-live="assertive">
          <h2>{a.p.title}</h2>
          <div class="step">{a.p.title.includes('Bulunduğun') || a.p.title.includes('your area') ? ctxStep.step : tx('Yakınlarına sarsıntı geçtikten sonra ulaş.', 'Try reaching loved ones after shaking stops.')}</div>
          <p>{a.p.body}</p>
          <p class="small">{tx('Alındı', 'Received')} {fmtTime(a.at, true)}{a.p.expiresAtMs ? ` · ${tx('geçerlilik', 'valid until')} ${fmtTime(a.p.expiresAtMs, true)}` : ''}</p>
          <div class="row wrap" style="margin-top:8px">
            <button class="btn" onClick={stopSiren} disabled={!sOn}><Icon name="volume" /> {sOn ? tx('Alarmı sustur', 'Mute siren') : tx('Alarm sessiz', 'Siren muted')}</button>
            <button class="btn" onClick={clearAlarm}><Icon name="close" /> {tx('Ekranı kapat', 'Dismiss banner')}</button>
            <button class="btn" onClick={() => setMsg('safe')}><Icon name="users" /> {tx('Yakınlara durum gönder', 'Send status to contacts')}</button>
          </div>
        </section>
      )}

      <section class="protect" aria-label={tx('Korunma adımı', 'Protective action')}>
        <div class="chips" role="radiogroup" aria-label={tx('Bulunduğun durum', 'Your situation')}>
          {Object.entries(steps).map(([k, v]) => (
            <button key={k} class="chip" role="radio" aria-checked={s.emergencyContext === k}
              onClick={() => setState(() => ({ emergencyContext: k as typeof s.emergencyContext }))}>{v.label}</button>
          ))}
        </div>
        <p class="big-step">{ctxStep.step}</p>
        <p class="small muted" style="margin:0">{ctxStep.detail} {tx('Kaynak:', 'Source:')} <Ext href="https://afad.gov.tr/deprem-oncesi-ani-ve-sonrasi-alabileceginiz-onlemleri-biliyor-musunuz">AFAD</Ext></p>
      </section>

      <div class="sos-grid">
        <button class={`btn big amber whistle-btn ${playing ? 'on' : ''}`} style="grid-column:1/-1" onClick={toggleWhistle} aria-pressed={playing}>
          <Icon name={playing ? 'stop' : 'whistle'} />{playing ? tx('Düdüğü durdur', 'Stop whistle') : tx('Düdüğü çal', 'Play whistle')}
        </button>
        <button class="btn big primary" onClick={() => setMsg('safe')}><Icon name="shieldCheck" />{tx('Güvendeyim', 'I am safe')}</button>
        <button class="btn big danger" onClick={() => setMsg('danger')}><Icon name="alert" />{tx('Tehlikedeyim', 'I need help')}</button>
        <a class="btn big call-btn" style="grid-column:1/-1" href={isDrill ? '#/acil' : 'tel:112'} onClick={call112}>
          <Icon name="phone" />{tx('112’yi ara', 'Call 112')}{isDrill ? tx(' (TEST cihazı)', ' (TEST device)') : ''}
        </a>
      </div>
      <p class="small muted" style="margin:0 4px">{tx('Arama telefonunun arama ekranında açılır; aramayı sen başlatırsın. Arama ve SMS için hücresel hizmet, WhatsApp ve yeni uyarılar için internet gerekir.', 'Opens your phone dialer so you initiate the call. Voice calls and SMS require cellular service; WhatsApp and new alerts require internet.')}</p>

      <details class="card">
        <summary style="cursor:pointer;min-height:44px;display:flex;align-items:center;gap:10px"><Icon name="volume" /><strong>{tx('Düdük ayarları ve ses ipuçları', 'Whistle settings & audio tips')}</strong></summary>
        <div class="chips" role="radiogroup" aria-label={tx('Çalma biçimi', 'Playback mode')} style="margin-top:10px">
          <button class="chip" role="radio" aria-checked={s.whistle.mode === 'continuous'} aria-pressed={s.whistle.mode === 'continuous'} onClick={() => setState((x) => ({ whistle: { ...x.whistle, mode: 'continuous' } }))}>{tx('Sürekli', 'Continuous')}</button>
          <button class="chip" role="radio" aria-checked={s.whistle.mode === 'sos'} aria-pressed={s.whistle.mode === 'sos'} onClick={() => setState((x) => ({ whistle: { ...x.whistle, mode: 'sos' } }))}>{tx('Kesikli (SOS)', 'SOS pattern')}</button>
          {'vibrate' in navigator && (
            <button class="chip" aria-pressed={s.whistle.vibrate} onClick={() => setState((x) => ({ whistle: { ...x.whistle, vibrate: !x.whistle.vibrate } }))}>{tx('Titreşim', 'Vibration')} {s.whistle.vibrate ? tx('açık', 'on') : tx('kapalı', 'off')}</button>
          )}
        </div>
        <div style="margin-top:10px"><Notice icon="volume">{isEn()
          ? <>Plays at the highest volume allowed by your device speaker and volume setting. <strong>Press the physical volume-up button if volume is low.</strong> Disconnect headphones or Bluetooth speakers so sound comes from the phone speaker.</>
          : <>Düdük, cihaz hoparlörünün ve senin ses ayarının izin verdiği en yüksek düzeyde çalar. <strong>Ses kısıksa telefonun yan tarafındaki ses açma tuşuna bas.</strong> Kulaklık veya Bluetooth hoparlör bağlıysa ses oradan çıkar: kulaklığı çıkar ya da Bluetooth’u kapat, sonra çal. Sessiz modda iPhone’da ses kesilebilir.</>}</Notice></div>
      </details>

      <div class="card">
        <div class="row"><h3 style="margin:0">{tx('Acil kişilerim', 'Emergency contacts')}</h3><span class="spacer" /><a class="btn sm" href="#/ayarlar/kisiler"><Icon name="edit" /> {tx('Düzenle', 'Edit')}</a></div>
        {s.contacts.length === 0
          ? <p class="small muted" style="margin-top:8px">{tx('Henüz kişi yok. Güvendeyim/Tehlikedeyim taslakları için kişi ekle.', 'No contacts yet. Add contacts for quick Safe / Need Help drafts.')}</p>
          : <ul class="timeline">{s.contacts.map((c) => <li key={c.id}><span>{c.name}</span><a class="v" href={`tel:${c.phone}`}>{c.phone}</a></li>)}</ul>}
      </div>

      <div class="card">
        <h3>{STANDALONE ? tx('Rehber ve plan', 'Guide & family plan') : tx('Çevrimdışı kullanım', 'Offline readiness')}</h3>
        <p class="small" aria-live="polite">
          {STANDALONE ? tx('Sayfa açık kaldığı sürece düdük, kişilerin, mesaj taslakları ve rehber internetsiz de çalışır.', 'As long as this page remains open, the whistle, contacts, message drafts, and guide work without internet.')
            : off.ready === null ? tx('Durum kontrol ediliyor…', 'Checking status…')
            : off.ready ? <><span class="pill green"><Icon name="check" /> {tx('Hazır', 'Ready')}</span> {tx(`Acil ekranı, düdük sesi, rehber ve aile planı bu cihaza kaydedildi (${off.total} dosya).`, `Emergency screen, whistle audio, guide, and family plan are cached on this device (${off.total} files).`)}</>
            : <><span class="pill amber">{tx('Kaydediliyor', 'Caching')}</span> {tx('İlk başarılı yüklemeden sonra çevrimdışı kullanım hazır olur.', 'Offline mode becomes ready after the initial load completes.')} {off.failed ? tx(`${off.failed} dosya kaydedilemedi; bağlantı gelince yeniden denenecek.`, `${off.failed} files pending; will retry when online.`) : ''}</>}
        </p>
        <div class="row wrap">
          <a class="btn sm" href="#/hazirlik/rehber"><Icon name="info" /> {tx('Rehber', 'Guide')}</a>
          <a class="btn sm" href="#/hazirlik/plan"><Icon name="home" /> {tx('Aile planım', 'Family plan')}</a>
          <Ext href="https://www.turkiye.gov.tr/afet-ve-acil-durum-yonetimi-acil-toplanma-alani-sorgulama">{tx('Toplanma alanı (e-Devlet)', 'Assembly area (e-Devlet)')}</Ext>
        </div>
      </div>

      {msg && <MessageSheet kind={msg} onClose={() => setMsg(null)} />}
      {show112 && (
        <Sheet title={tx('112 Acil Çağrı', '112 Emergency Call')} onClose={() => setShow112(false)}>
          <p>{tx('Bu cihazda arama işleyicisi yok. Telefonundan şu numarayı ara:', 'No phone dialer detected on this device. Dial from your phone:')}</p>
          <div class="call112" aria-label="112">112</div>
          <button class="btn block" onClick={() => { void navigator.clipboard?.writeText('112'); toast(tx('112 kopyalandı', '112 copied')); }}><Icon name="copy" /> {tx('Numarayı kopyala', 'Copy number')}</button>
        </Sheet>
      )}
    </div>
  );
}

function MessageSheet({ kind, onClose }: { kind: 'safe' | 'danger'; onClose: () => void }) {
  const s = useAppState();
  const [withLoc, setWithLoc] = useState(false);
  const [loc, setLoc] = useState<string | null>(null);
  const [locState, setLocState] = useState<'idle' | 'busy' | 'fail'>('idle');
  const [address, setAddress] = useState('');
  const created = useRef(Date.now());
  const [text, setText] = useState(() => draftText(kind, null, ''));
  const [opened, setOpened] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);

  useEffect(() => { if (!edited) setText(draftText(kind, loc, address)); }, [loc, address, s.lang]);
  useEffect(() => { setState(() => ({ draft: { kind, text, createdAt: created.current, withLocation: withLoc } })); }, [text]);

  const addLoc = async (on: boolean) => {
    setWithLoc(on);
    if (!on) { setLoc(null); return; }
    setLocState('busy');
    const p = await oneShotPosition();
    if (!p) { setLocState('fail'); setLoc(null); return; }
    setLocState('idle');
    setLoc(`${tx('Konum', 'Location')}: https://www.openstreetmap.org/?mlat=${p.coords.latitude.toFixed(5)}&mlon=${p.coords.longitude.toFixed(5)}#map=17/${p.coords.latitude.toFixed(5)}/${p.coords.longitude.toFixed(5)} (${tx('ölçüm', 'measured')} ${fmtTime(p.timestamp, true)}, ±${Math.round(p.coords.accuracy)} m)`);
  };

  const ageMin = Math.floor((Date.now() - created.current) / 60000);
  const open = (c: Contact, ch: 'sms' | 'wa') => {
    setOpened(tx(
      `${c.name} için ${ch === 'sms' ? 'SMS' : 'WhatsApp'} taslağı açıldı. Göndermeyi o uygulamada sen tamamla.`,
      `Opened ${ch === 'sms' ? 'SMS' : 'WhatsApp'} draft for ${c.name}. Complete sending in that app.`,
    ));
    window.location.href = ch === 'sms' ? smsHref(c.phone, text) : waHref(c.phone, text);
  };

  return (
    <Sheet title={kind === 'safe' ? tx('Güvendeyim mesajı', 'I am safe message') : tx('Tehlikedeyim — yardım iste', 'I need help — emergency draft')} onClose={onClose}>
      <div class="stack">
        {kind === 'danger' && (
          <a class="btn block danger" href={s.env === 'drill' ? '#/acil' : 'tel:112'} onClick={(e) => { if (s.env === 'drill') { e.preventDefault(); toast(tx('Tatbikat modu: gerçek 112 aranmadı.', 'Drill mode: 112 was not dialed.')); } }}>
            <Icon name="phone" /> {tx('112’yi ara', 'Call 112')}
          </a>
        )}
        <label class="row" style="min-height:44px"><input type="checkbox" checked={withLoc} onChange={(e) => void addLoc((e.target as HTMLInputElement).checked)} style="width:22px;height:22px" /> {tx('Konumumu ekle', 'Include my GPS location')}</label>
        {locState === 'busy' && <p class="small"><span class="spin" /> {tx('Konum alınıyor…', 'Getting location…')}</p>}
        {locState === 'fail' && <Notice kind="amber">{tx('Konum bulunamadı. Adresini aşağıya yazabilir ya da konumsuz devam edebilirsin.', 'Could not determine location. You can type your address below or continue without GPS.')}</Notice>}
        {kind === 'danger' && (
          <div class="field"><label for="addr">{tx('Adres veya tarif (isteğe bağlı)', 'Address or floor/apartment details (optional)')}</label><input id="addr" class="input" value={address} onInput={(e) => setAddress((e.target as HTMLInputElement).value)} placeholder={tx('Ör. Bornova, Kazımdirik Mh. 372 Sk. No 5, 3. kat', 'e.g. Bornova, 372 St. No 5, 3rd floor')} /></div>
        )}
        <div class="field">
          <label for="msgtext">{tx('Mesaj taslağı', 'Message draft')}</label>
          <textarea id="msgtext" class="input" value={text} onInput={(e) => { setEdited(true); setText((e.target as HTMLTextAreaElement).value); }} />
          {ageMin >= 10 && <Notice kind="amber">{tx(`Bu taslak ${ageMin} dk önce hazırlandı.`, `Draft prepared ${ageMin}m ago.`)} <button class="btn sm" onClick={() => { setEdited(false); setText(draftText(kind, loc, address)); created.current = Date.now(); }}>{tx('Saati güncelle', 'Refresh timestamp')}</button></Notice>}
        </div>
        {s.contacts.length === 0 ? (
          <Notice icon="users">{tx('Kayıtlı acil kişi yok.', 'No saved emergency contacts.')} <a href="#/ayarlar/kisiler">{tx('Kişi ekle', 'Add contact')}</a> {tx('veya metni kopyalayıp istediğin uygulamada paylaş.', 'or copy the text to share in any app.')}</Notice>
        ) : (
          <div>
            <div class="label" style="font-weight:650;margin-bottom:6px">{tx('Alıcı ve kanal', 'Recipient & channel')}</div>
            {s.contacts.map((c) => (
              <div key={c.id} class="row wrap" style="padding:8px 0;border-bottom:1px solid var(--line)">
                <span style="flex:1;min-width:140px"><strong>{c.name}</strong><br /><span class="small muted">{c.phone}</span></span>
                <button class="btn sm" onClick={() => open(c, 'sms')}>SMS</button>
                <button class="btn sm" onClick={() => open(c, 'wa')}>WhatsApp</button>
              </div>
            ))}
            <p class="small muted" style="margin-top:6px">{tx('WhatsApp yüklü değilse açılan sayfa uygulamayı bulamaz; bu durumda SMS’i veya kopyalamayı kullan.', 'If WhatsApp is not installed, use SMS or copy the text instead.')}</p>
          </div>
        )}
        <div class="row wrap">
          <button class="btn" onClick={() => { void navigator.clipboard?.writeText(text).then(() => toast(tx('Metin kopyalandı', 'Text copied'))); }}><Icon name="copy" /> {tx('Metni kopyala', 'Copy text')}</button>
          {'share' in navigator && <button class="btn" onClick={() => void navigator.share({ text }).catch(() => {})}><Icon name="share" /> {tx('Paylaş', 'Share')}</button>}
        </div>
        {opened && <Notice kind="teal" icon="check"><strong>{tx('Mesaj hazır.', 'Draft ready.')}</strong> {opened} {tx('Teslim bilgisi yalnız kanal bunu doğrularsa görünür; bu uygulama mesajı kendisi göndermez.', 'Delivery is handled by your chosen messaging app.')}</Notice>}
      </div>
    </Sheet>
  );
}

export function getDraft() { return getState().draft; }

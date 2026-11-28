import { useState } from 'preact/hooks';
import { akakceSearch, getContentMeta, getGuide, getInsurance, getKit, type GuideSection } from '../content.ts';
import { Icon } from '../icons.tsx';
import { go, type Route } from '../router.ts';
import { setState, useAppState, type KitItemState } from '../state.ts';
import { Ext, Notice } from '../ui.tsx';
import { fmtDateTime, isEn, tx } from '../i18n.ts';

export function PreparePage({ r }: { r: Route }) {
  useAppState();
  const tab = r.path[1] ?? 'rehber';
  const tabs = [
    ['rehber', tx('Rehber', 'Guide')],
    ['plan', tx('Aile planı', 'Family Plan')],
    ['canta', tx('Afet çantam', 'Emergency Kit')],
    ['zemin', tx('Zemin ve bina', 'Ground & Building')],
    ['sigorta', tx('Sigorta', 'Insurance')],
  ] as const;

  return (
    <div style="margin-top:12px">
      <div class="tabs" role="tablist" aria-label={tx('Hazırlık bölümleri', 'Preparedness sections')}>
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(`/hazirlik/${k}`)}>{l}</button>)}
      </div>
      {tab === 'rehber' && <Guide />}
      {tab === 'plan' && <Plan />}
      {tab === 'canta' && <Kit />}
      {tab === 'zemin' && <Soil />}
      {tab === 'sigorta' && <Insurance />}
    </div>
  );
}

function Meta() {
  const m = getContentMeta();
  return (
    <p class="small muted">
      {tx('İçerik sürümü', 'Content version')} {m.version} · {tx('yayın', 'published')} {m.published} · {m.reviewer} · {tx('Dayanak:', 'Basis:')} {m.basis}.{' '}
      <Ext href="https://afad.gov.tr/deprem-oncesi-ani-ve-sonrasi-alabileceginiz-onlemleri-biliyor-musunuz">{tx('AFAD rehberi', 'AFAD guide')}</Ext>
    </p>
  );
}

function Sections({ secs }: { secs: GuideSection[] }) {
  const s = useAppState();
  return (
    <>
      {secs.map((sec) => {
        const done = sec.items.filter((i) => s.guideChecks[i.id]).length;
        return (
          <div class="card" key={sec.id}>
            <div class="row"><h3 style="margin:0;flex:1">{sec.title}</h3><span class="small muted">{done}/{sec.items.length}</span></div>
            {sec.items.map((i) => (
              <label key={i.id} class="row" style="align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line);min-height:44px">
                <input type="checkbox" style="width:24px;height:24px;margin-top:2px;flex:none" checked={!!s.guideChecks[i.id]}
                  onChange={(e) => setState((x) => ({ guideChecks: { ...x.guideChecks, [i.id]: (e.target as HTMLInputElement).checked } }))} />
                <span><strong>{i.title}</strong><br /><span class="small muted">{i.text}</span></span>
              </label>
            ))}
          </div>
        );
      })}
    </>
  );
}

function Guide() {
  const [t, setT] = useState<'before' | 'during' | 'after'>('before');
  const guide = getGuide();
  return (
    <div class="stack">
      <div class="chips" role="tablist">
        {([
          ['before', tx('Öncesinde', 'Before')],
          ['during', tx('Sarsıntı sırasında', 'During shaking')],
          ['after', tx('Sonrasında', 'After')],
        ] as const).map(([k, l]) => (
          <button key={k} class="chip" role="tab" aria-selected={t === k} onClick={() => setT(k)}>{l}</button>
        ))}
      </div>
      <Sections secs={guide[t]} />
      {t === 'after' && <Notice icon="users">{tx('Resmî toplanma alanı sorgusu:', 'Official emergency assembly area lookup:')} <Ext href="https://www.turkiye.gov.tr/afet-ve-acil-durum-yonetimi-acil-toplanma-alani-sorgulama">{tx('e-Devlet toplanma alanı sorgusu', 'e-Devlet assembly area lookup')}</Ext></Notice>}
      <Meta />
      <p class="small muted">{tx('İşaretlediğin maddeler ve aile planın bu cihazda saklanır, çevrimdışı da açılır.', 'Checked items and your family plan are stored locally on this device and work offline.')}</p>
    </div>
  );
}

function Plan() {
  const s = useAppState();
  const guide = getGuide();
  const set = (k: keyof typeof s.plan, v: string) => setState((x) => ({ plan: { ...x.plan, [k]: v, updatedAt: new Date().toISOString() } }));
  const field = (k: 'meetingPoint' | 'outOfCityContact' | 'assemblyArea' | 'notes', label: string, ph: string, area = false) => (
    <div class="field">
      <label for={`p-${k}`}>{label}</label>
      {area ? <textarea id={`p-${k}`} class="input" value={s.plan[k]} placeholder={ph} onInput={(e) => set(k, (e.target as HTMLTextAreaElement).value)} />
        : <input id={`p-${k}`} class="input" value={s.plan[k]} placeholder={ph} onInput={(e) => set(k, (e.target as HTMLInputElement).value)} />}
    </div>
  );
  return (
    <div class="stack">
      <div class="card">
        <h3>{tx('Aile planım', 'My Family Plan')}</h3>
        {field('meetingPoint', tx('Buluşma yeri (evin dışında)', 'Meeting point (outside home)'), tx('Ör. Sokak başındaki park, çeşmenin önü', 'e.g. Corner park entrance'))}
        {field('outOfCityContact', tx('İl dışı irtibat kişisi', 'Out-of-city contact person'), tx('Ör. Ankara’daki Ayşe teyze, 0532…', 'e.g. Relative in Ankara, +90 532…'))}
        {field('assemblyArea', tx('Resmî toplanma alanı', 'Official assembly area'), tx('e-Devlet’ten öğrendiğin alan adı', 'Area name from e-Devlet inquiry'))}
        {field('notes', tx('Notlar (ilaçlar, kim kimi alacak, evcil hayvan)', 'Notes (medications, school pickup, pets)'), '', true)}
        <p class="small muted">{s.plan.updatedAt ? `${tx('Son değişiklik', 'Last updated')} ${fmtDateTime(s.plan.updatedAt)}` : tx('Henüz kaydedilmedi', 'Not saved yet')} · {tx('yalnız bu cihazda saklanır.', 'stored only on this device.')}</p>
        <Ext href="https://www.turkiye.gov.tr/afet-ve-acil-durum-yonetimi-acil-toplanma-alani-sorgulama">{tx('Toplanma alanını e-Devlet’te sorgula', 'Look up assembly area on e-Devlet')}</Ext>
      </div>
      <Sections secs={guide.before.filter((x) => x.id === 'plan')} />
    </div>
  );
}

function Kit() {
  const s = useAppState();
  const h = s.household;
  const kitList = getKit();
  const items = kitList.filter((k) => k.group === 'temel' || (k.group === 'cocuk' && h.children) || (k.group === 'yasli' && h.elderly) || (k.group === 'engelli' && h.disabled) || (k.group === 'evcil' && h.pets));
  const all = [...items.map((k) => ({ id: k.id, title: k.title })), ...s.customKit];
  const marked = all.filter((k) => s.kit[k.id]?.have === true).length;
  const pct = all.length ? Math.round((marked / all.length) * 100) : 0;
  const blank: KitItemState = { have: null, qty: 0, checkedAt: null, remindAt: null, note: '' };
  const setItem = (id: string, p: Partial<KitItemState>) => setState((x) => ({ kit: { ...x.kit, [id]: { ...blank, ...(x.kit[id] ?? {}), ...p } } }));
  const [newItem, setNewItem] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const due = all.filter((k) => s.kit[k.id]?.remindAt && s.kit[k.id]!.remindAt! <= today);
  const en = isEn();

  return (
    <div class="stack">
      <div class="card">
        <div class="row"><h3 style="margin:0;flex:1">{tx('Hazırlık durumu', 'Kit readiness')}</h3><strong>{en ? `${pct}%` : `%${pct}`}</strong></div>
        <div class="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={tx('Çanta tamamlanma oranı', 'Emergency kit completion')}><i style={{ width: `${pct}%` }} /></div>
        <p class="small muted" style="margin-top:6px">{tx(`${marked}/${all.length} kalem “Evde var” olarak işaretlendi. İlk 72 saat için.`, `${marked}/${all.length} items marked “Have at home”. Designed for the first 72 hours.`)}</p>
        {due.length > 0 && <Notice kind="amber" icon="clock">{tx('Kontrol zamanı gelen kalemler:', 'Items due for check/expiry:')} {due.map((d) => d.title).join(', ')}</Notice>}
      </div>
      <div class="card">
        <h3>{tx('Hane profili', 'Household profile')}</h3>
        <div class="grid2">
          {([
            ['adults', tx('Yetişkin', 'Adults')],
            ['children', tx('Çocuk', 'Children')],
            ['elderly', tx('Yaşlı', 'Older adults')],
            ['disabled', tx('Engelli birey', 'Disabled')],
            ['pets', tx('Evcil hayvan', 'Pets')],
          ] as const).map(([k, l]) => (
            <div class="field" key={k}><label for={`h-${k}`}>{l}</label>
              <input id={`h-${k}`} class="input" type="number" min={0} max={20} value={h[k]} onInput={(e) => setState((x) => ({ household: { ...x.household, [k]: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) } }))} /></div>
          ))}
        </div>
      </div>
      {items.map((k) => {
        const st = s.kit[k.id];
        const q = k.qty(h);
        return (
          <div class="card" key={k.id}>
            <div class="row" style="align-items:flex-start">
              <div style="flex:1"><strong>{k.title}</strong><div class="small muted">{k.spec}</div><div class="small">{tx('Önerilen:', 'Recommended:')} {q} {k.unit}</div></div>
              {st?.have === true && <span class="pill green"><Icon name="check" />{tx('Evde var', 'Ready')}</span>}
              {st?.have === false && <span class="pill amber">{tx('Eksik', 'Missing')}</span>}
            </div>
            <div class="row wrap" style="margin-top:8px">
              <button class="chip" aria-pressed={st?.have === true} onClick={() => setItem(k.id, { have: true, checkedAt: today })}>{tx('Evde var', 'Have at home')}</button>
              <button class="chip" aria-pressed={st?.have === false} onClick={() => setItem(k.id, { have: false })}>{tx('Eksik', 'Missing')}</button>
              <label class="small">{tx('Son kullanma / kontrol', 'Expiry / check date')} <input type="date" class="input" style="width:auto;min-height:44px" value={st?.remindAt ?? ''} onInput={(e) => setItem(k.id, { remindAt: (e.target as HTMLInputElement).value || null })} /></label>
            </div>
            {st?.have === false && (k.product || k.search) && (
              <div class="notice" style="margin-top:10px">
                <Icon name="bag" />
                <div class="small">
                  {k.product ? <><strong>{k.product.name}</strong><br />{k.product.note}<br /></> : null}
                  <Ext href={k.product?.url ?? akakceSearch(k.search!)}>{tx('Akakçe’de fiyatları karşılaştır', 'Compare prices on Akakçe')}</Ext>
                  {k.id === 'fener' && <> · <Ext href="https://www.decathlon.com.tr/tum-sporlar/hiking-trekking-outdoor/pilli-kafa-lambalari">{tx('Decathlon kafa lambaları', 'Decathlon headlamps')}</Ext></>}
                  <div class="muted">{tx('Güncel fiyat ve stok ilgili sitede kontrol edilir. Ticari ortaklık yok.', 'Check live price and stock on the linked site. No commercial affiliation.')}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {s.customKit.map((c) => (
        <div class="card row" key={c.id}>
          <span style="flex:1"><strong>{c.title}</strong></span>
          <button class="chip" aria-pressed={s.kit[c.id]?.have === true} onClick={() => setItem(c.id, { have: !(s.kit[c.id]?.have === true) })}>{tx('Evde var', 'Have at home')}</button>
          <button class="btn sm ghost" aria-label={`${tx('Sil', 'Remove')} ${c.title}`} onClick={() => setState((x) => ({ customKit: x.customKit.filter((y) => y.id !== c.id) }))}><Icon name="trash" /></button>
        </div>
      ))}
      <form class="card row" onSubmit={(e) => { e.preventDefault(); if (!newItem.trim()) return; setState((x) => ({ customKit: [...x.customKit, { id: `c${Date.now()}`, title: newItem.trim(), spec: '' }] })); setNewItem(''); }}>
        <label class="sr-only" for="newkit">{tx('Yeni kalem', 'Custom item')}</label>
        <input id="newkit" class="input" placeholder={tx('Kendi kalemini ekle', 'Add custom item')} value={newItem} onInput={(e) => setNewItem((e.target as HTMLInputElement).value)} />
        <button class="btn" type="submit"><Icon name="plus" /> {tx('Ekle', 'Add')}</button>
      </form>
      <p class="small muted">{tx('Liste AFAD afet çantası önerilerine dayanır.', 'Checklist based on AFAD emergency kit guidelines.')} <Ext href="https://www.afad.gov.tr/kurumlar/afad.gov.tr/e_Kutuphane/Afisler_Brosurler/Sivil_Savunma/Afisler/13_afad_bilgilendirme_afisleri_tr_afet_cantasi_info_.pdf">{tx('AFAD çanta listesi (PDF)', 'AFAD emergency kit poster (PDF)')}</Ext></p>
    </div>
  );
}

function Soil() {
  return (
    <div class="stack">
      <div class="card">
        <h3>{tx('Konumumun zemini ve diri faylar', 'Local Ground & Active Faults')}</h3>
        <Notice kind="teal" icon="map">
          {isEn()
            ? <><strong>Active fault lines</strong> (GEM / EMME & MTA compilation) are available directly on the <a href="#/harita">Map</a> tab. Parcel-level soil class requires official municipal or geotechnical studies.</>
            : <><strong>Diri fay hatları</strong> (GEM / EMME & MTA derlemesi) <a href="#/harita">Harita</a> ekranında doğrudan gösterilir. Parsel bazında zemin sınıfı için resmî belediye mikrobölgeleme raporları ve yerinde zemin etüdü gerekir.</>}
        </Notice>
        <ul class="small" style="padding-left:18px;margin-top:10px">
          <li>{tx('İstanbul:', 'Istanbul:')} <Ext href="https://depremzemin.ibb.istanbul/tr/istanbul-ili-mikrobolgeleme-projeleri">{tx('İBB mikrobölgeleme projeleri ve raporları', 'IMM microzonation projects & reports')}</Ext></li>
          <li>{tx('Ulusal deprem tehlikesi:', 'National seismic hazard:')} <Ext href="https://tdth.afad.gov.tr/TDTH/loginControl.xhtml">{tx('AFAD Türkiye Deprem Tehlike Haritası', 'AFAD Türkiye Seismic Hazard Map')}</Ext></li>
          <li>{tx('Diri faylar:', 'Active faults:')} <Ext href="https://yerbilimleri.mta.gov.tr/Default.aspx">{tx('MTA Yerbilimleri görüntüleyicisi', 'MTA Geoscience Viewer')}</Ext></li>
        </ul>
      </div>
      <div class="card">
        <h3>{tx('Bu bilgiyle ne yapabilirim?', 'What can I do with this information?')}</h3>
        <ul class="small" style="padding-left:18px">
          <li>{isEn()
            ? <>Building strength cannot be read from regional maps alone: request an <strong>on-site structural assessment</strong> from an authorized engineering firm.</>
            : <>Binanın dayanımı ve parsel etüdü haritadan okunamaz: yetkili bir kuruluştan <strong>yerinde yapı incelemesi</strong> iste.</>}</li>
          <li>{tx('Kentsel dönüşüm süreci:', 'Urban renewal process:')} <Ext href="https://www.kdb.gov.tr/">{tx('Kentsel Dönüşüm Başkanlığı', 'Presidency of Urban Transformation')}</Ext></li>
          <li>{tx('Veri olmayan yer için “bilinmiyor” kabul et, “güvenli” varsayma.', 'Treat areas without verified data as “unknown”, never automatically “safe”.')}</li>
        </ul>
      </div>
    </div>
  );
}

function Insurance() {
  const list = getInsurance();
  return (
    <div class="stack">
      <p class="small muted">{tx('Bilgilendirme amaçlıdır; ürün önerisi değildir. Poliçe şartları için sigorta şirketine ve resmî kaynaklara başvur.', 'For informational purposes only; not financial advice. Consult your insurer and official terms for policy details.')}</p>
      {list.map((i) => (
        <div class="card" key={i.id}>
          <h3>{i.title}</h3>
          <dl class="kv"><dt>{tx('Neyi korur', 'Covers')}</dt><dd>{i.who}</dd><dt>{tx('Neye bak', 'Check')}</dt><dd>{i.check}</dd></dl>
          <p class="small" style="margin-top:8px"><Ext href={i.link}>{i.linkText}</Ext></p>
        </div>
      ))}
    </div>
  );
}

// Hazırlık içeriği (TR & EN). Sürüm ve inceleme bilgisiyle tutulur.

import { isEn } from './i18n.ts';

export const CONTENT_META = {
  version: '0.2',
  published: '2026-11-27',
  reviewer: 'AFAD açık rehber uyarlaması',
  basis: 'AFAD “Deprem öncesi, anı ve sonrası alabileceğiniz önlemler” ve AFAD afet çantası afişi',
};

export function getContentMeta() {
  if (isEn()) {
    return {
      version: '0.2',
      published: '2026-11-27',
      reviewer: 'Adapted from public AFAD guidance',
      basis: 'AFAD “Precautions Before, During, and After an Earthquake” and AFAD Emergency Kit poster',
    };
  }
  return CONTENT_META;
}

export interface GuideItem { id: string; title: string; text: string }
export interface GuideSection { id: string; title: string; items: GuideItem[] }

export const GUIDE: { before: GuideSection[]; during: GuideSection[]; after: GuideSection[] } = {
  before: [
    { id: 'ev', title: 'Evde eşyaları sabitle', items: [
      { id: 'b1', title: 'Yüksek ve ağır mobilyaları duvara sabitle', text: 'Kitaplık, vitrin ve dolapları metal köşebent veya gergi ile taşıyıcı duvara bağla.' },
      { id: 'b2', title: 'Ağır eşyaları alt raflara taşı', text: 'Yatak ve oturma yerlerinin üzerine düşebilecek eşyaları kaldır.' },
      { id: 'b3', title: 'Şofben, kombi ve tüpleri sabitle', text: 'Gaz ve su bağlantılarında esnek bağlantı kullan; vanaların yerini tüm hane öğrensin.' },
      { id: 'b4', title: 'Güvenli noktaları belirle', text: 'Her odada sağlam masa yanı gibi “Çök, Kapan, Tutun” yerlerini önceden seç.' },
    ] },
    { id: 'plan', title: 'Aile iletişim planı', items: [
      { id: 'b5', title: 'İl dışında bir irtibat kişisi seç', text: 'Yerel hatlar yoğunken herkesin haber vereceği başka şehirde bir kişi belirle.' },
      { id: 'b6', title: 'Buluşma yerini kararlaştır', text: 'Ev dışında yürüme mesafesinde bir buluşma noktası ve resmî toplanma alanını öğren.' },
      { id: 'b7', title: 'Toplanma alanını sorgula', text: 'e-Devlet “Acil Toplanma Alanı Sorgulama” ile adresinin alanını öğren ve yolu bir kez yürü.' },
    ] },
  ],
  during: [
    { id: 'in', title: 'Bina içindeysen', items: [
      { id: 'd1', title: 'Çök, Kapan, Tutun', text: 'Sağlam bir eşyanın yanına çök, başını ve enseni koru, sarsıntı bitene kadar tutun.' },
      { id: 'd2', title: 'Pencere ve camlardan uzak dur', text: 'Devrilebilecek dolap ve raflardan da uzaklaş. Merdiven ve asansör kullanma.' },
    ] },
    { id: 'out', title: 'Açık alandaysan', items: [
      { id: 'd3', title: 'Bina, direk ve tellerden uzaklaş', text: 'Açık bir alanda çök ve başını koru.' },
    ] },
    { id: 'car', title: 'Araçtaysan', items: [
      { id: 'd4', title: 'Güvenli yerde dur, araçta kal', text: 'Köprü, tünel ve üst geçitlerden uzakta dur; el frenini çek.' },
    ] },
    { id: 'lim', title: 'Hareket kısıtlılığın varsa', items: [
      { id: 'd5', title: 'Kilitle, Kapan, Tutun', text: 'Tekerlekli sandalyenin frenlerini kilitle, öne eğil, başını ve enseni koru.' },
    ] },
  ],
  after: [
    { id: 'aft', title: 'Sarsıntı geçince', items: [
      { id: 'a1', title: 'Artçılara hazırlıklı ol', text: 'Hasarlı binaya girme; artçı sarsıntılarda yine Çök, Kapan, Tutun.' },
      { id: 'a2', title: 'Resmî duyuruları izle', text: 'AFAD, valilik ve belediye duyurularını takip et; doğrulanmamış bilgiyi yayma.' },
      { id: 'a3', title: 'Yakınlarına kısa haber ver', text: 'Hatları meşgul etmemek için kısa mesaj kullan. Acil ekranındaki “Güvendeyim” taslağını kullanabilirsin.' },
      { id: 'a4', title: 'Toplanma alanına git', text: 'Gerekirse önceden öğrendiğin toplanma alanına yürüyerek git.' },
    ] },
  ],
};

const GUIDE_EN: { before: GuideSection[]; during: GuideSection[]; after: GuideSection[] } = {
  before: [
    { id: 'ev', title: 'Secure items at home', items: [
      { id: 'b1', title: 'Anchor tall and heavy furniture to walls', text: 'Fasten bookshelves, cabinets, and wardrobes to structural walls with L-brackets or straps.' },
      { id: 'b2', title: 'Move heavy objects to lower shelves', text: 'Remove objects that could fall onto beds or seating areas.' },
      { id: 'b3', title: 'Secure water heaters, boilers, and cylinders', text: 'Use flexible gas and water connectors; make sure everyone knows where shut-off valves are.' },
      { id: 'b4', title: 'Identify safe spots in each room', text: 'Choose sturdy tables or interior corners in advance for “Drop, Cover, Hold On”.' },
    ] },
    { id: 'plan', title: 'Family communication plan', items: [
      { id: 'b5', title: 'Pick an out-of-town contact person', text: 'Designate one relative in another city whom everyone messages when local lines are congested.' },
      { id: 'b6', title: 'Agree on a meeting point', text: 'Pick a walkable spot outside your home and learn your official assembly area.' },
      { id: 'b7', title: 'Look up your assembly area', text: 'Check e-Devlet “Emergency Assembly Area Inquiry” for your address and walk the route once.' },
    ] },
  ],
  during: [
    { id: 'in', title: 'If indoors', items: [
      { id: 'd1', title: 'Drop, Cover, Hold On', text: 'Crouch beside or under sturdy furniture, protect your head and neck, and hold on until shaking stops.' },
      { id: 'd2', title: 'Stay away from windows and glass', text: 'Keep clear of tall cabinets and shelves. Never use stairs or elevators during shaking.' },
    ] },
    { id: 'out', title: 'If outdoors', items: [
      { id: 'd3', title: 'Move away from buildings, poles, and power lines', text: 'Drop to the ground in an open area and protect your head.' },
    ] },
    { id: 'car', title: 'If in a vehicle', items: [
      { id: 'd4', title: 'Pull over safely and stay inside', text: 'Stop clear of bridges, tunnels, and overpasses; set the parking brake.' },
    ] },
    { id: 'lim', title: 'If you have limited mobility', items: [
      { id: 'd5', title: 'Lock, Cover, Hold On', text: 'Lock wheelchair brakes, lean forward, and shield your head and neck.' },
    ] },
  ],
  after: [
    { id: 'aft', title: 'When shaking stops', items: [
      { id: 'a1', title: 'Expect aftershocks', text: 'Do not enter damaged buildings; Drop, Cover, Hold On again during aftershocks.' },
      { id: 'a2', title: 'Follow official announcements', text: 'Rely on AFAD, governorates, and municipalities; do not spread unverified rumors.' },
      { id: 'a3', title: 'Send brief updates to loved ones', text: 'Use SMS or messaging apps to keep voice lines free. Use the “I am safe” draft on the Emergency screen.' },
      { id: 'a4', title: 'Head to your assembly area', text: 'Walk to your designated emergency assembly area if evacuation is needed.' },
    ] },
  ],
};

export function getGuide() {
  return isEn() ? GUIDE_EN : GUIDE;
}

export interface KitItem { id: string; title: string; spec: string; qty: (h: Household) => number; unit: string; group: 'temel' | 'cocuk' | 'yasli' | 'engelli' | 'evcil'; search?: string; product?: { name: string; url: string; note: string } }
export interface Household { adults: number; children: number; elderly: number; disabled: number; pets: number }

const people = (h: Household) => Math.max(1, h.adults + h.children + h.elderly + h.disabled);

export const KIT: KitItem[] = [
  { id: 'su', title: 'İçme suyu', spec: 'Kişi başı günde en az 2 L, 3 gün', qty: (h) => people(h) * 6, unit: 'L', group: 'temel', search: 'pet şişe su 0.5 lt' },
  { id: 'gida', title: 'Dayanıklı yiyecek', spec: 'Pişirme gerektirmeyen, uzun ömürlü; konserve açacağı', qty: (h) => people(h) * 3, unit: 'günlük', group: 'temel', search: 'konserve açacağı' },
  { id: 'ilkyardim', title: 'İlk yardım çantası', spec: 'Sargı bezi, flaster, antiseptik, makas, eldiven', qty: () => 1, unit: 'adet', group: 'temel', search: 'ilk yardım çantası' },
  { id: 'ilac', title: 'Kişisel ilaçlar ve reçete kopyası', spec: 'En az 3 günlük; son kullanma tarihini kontrol et', qty: (h) => people(h), unit: 'kişi', group: 'temel' },
  { id: 'hijyen', title: 'Hijyen ürünleri', spec: 'Islak mendil, el dezenfektanı, tuvalet kâğıdı, çöp poşeti', qty: () => 1, unit: 'set', group: 'temel', search: 'ıslak mendil' },
  { id: 'fener', title: 'Fener / kafa lambası', spec: 'Eller serbest kalsın diye kafa lambası; şarjlı veya pilli', qty: (h) => people(h), unit: 'adet', group: 'temel',
    product: { name: 'Forclaz HL100 şarj edilebilir kafa lambası (120 lümen)', url: 'https://www.akakce.com/fener/en-ucuz-forclaz-sarj-edilebilen-kafa-lambasi-i-120-lumen-hl100-fiyati,1663539800.html', note: 'Aynı model ve paket adediyle karşılaştır. Decathlon ürün listesi: decathlon.com.tr → Pilli kafa lambaları.' } },
  { id: 'pil', title: 'Yedek pil', spec: 'Fener ve radyoya uygun boyutta', qty: () => 8, unit: 'adet', group: 'temel', search: 'AA pil 8li' },
  { id: 'radyo', title: 'Pilli / dinamolu radyo', spec: 'FM; mümkünse el dinamolu', qty: () => 1, unit: 'adet', group: 'temel', search: 'dinamolu radyo' },
  { id: 'duduk', title: 'Fiziksel düdük', spec: 'Yüksek sesli, bilyesiz (enkaz altında da çalışır)', qty: (h) => people(h), unit: 'adet', group: 'temel',
    product: { name: 'Düdük seçenekleri', url: 'https://www.akakce.com/duduk.html', note: 'Bilyesiz, plastik ve kordonlu modeller tercih edilir.' } },
  { id: 'giysi', title: 'Mevsimlik giysi ve battaniye', spec: 'Yedek iç çamaşırı, çorap, yağmurluk, termal battaniye', qty: (h) => people(h), unit: 'set', group: 'temel', search: 'termal battaniye' },
  { id: 'belge', title: 'Önemli belgelerin kopyası', spec: 'Kimlik, tapu, sigorta poliçesi; su geçirmez poşette', qty: () => 1, unit: 'dosya', group: 'temel', search: 'su geçirmez dosya' },
  { id: 'powerbank', title: 'Taşınabilir şarj cihazı', spec: 'En az 10.000 mAh, kablolarıyla, dolu', qty: () => 1, unit: 'adet', group: 'temel', search: 'powerbank 10000 mah' },
  { id: 'nakit', title: 'Bir miktar nakit', spec: 'Küçük banknotlar', qty: () => 1, unit: '', group: 'temel' },
  { id: 'bebek', title: 'Bebek/çocuk ihtiyaçları', spec: 'Mama, bez, biberon, sevdiği küçük oyuncak', qty: (h) => h.children, unit: 'çocuk', group: 'cocuk', search: 'bebek bezi' },
  { id: 'yasli', title: 'Yaşlı bireyler için', spec: 'Gözlük, işitme cihazı pili, baston, ilaç listesi', qty: (h) => h.elderly, unit: 'kişi', group: 'yasli' },
  { id: 'engelli', title: 'Engelli bireyler için', spec: 'Yedek yardımcı cihaz parçaları, şarj, iletişim kartı', qty: (h) => h.disabled, unit: 'kişi', group: 'engelli' },
  { id: 'evcil', title: 'Evcil hayvan', spec: 'Mama, su, tasma, taşıma çantası, aşı karnesi kopyası', qty: (h) => h.pets, unit: 'hayvan', group: 'evcil', search: 'kedi taşıma çantası' },
];

const KIT_EN: KitItem[] = [
  { id: 'su', title: 'Drinking water', spec: 'At least 2 L per person per day, for 3 days', qty: (h) => people(h) * 6, unit: 'L', group: 'temel', search: 'pet şişe su 0.5 lt' },
  { id: 'gida', title: 'Non-perishable food', spec: 'Ready-to-eat, long shelf-life; manual can opener', qty: (h) => people(h) * 3, unit: 'days', group: 'temel', search: 'konserve açacağı' },
  { id: 'ilkyardim', title: 'First aid kit', spec: 'Bandages, tape, antiseptic, scissors, gloves', qty: () => 1, unit: 'kit', group: 'temel', search: 'ilk yardım çantası' },
  { id: 'ilac', title: 'Personal medications & prescriptions', spec: 'At least 3 days supply; check expiration dates', qty: (h) => people(h), unit: 'person', group: 'temel' },
  { id: 'hijyen', title: 'Hygiene supplies', spec: 'Wet wipes, sanitizer, toilet paper, trash bags', qty: () => 1, unit: 'set', group: 'temel', search: 'ıslak mendil' },
  { id: 'fener', title: 'Flashlight / headlamp', spec: 'Hands-free headlamp; rechargeable or battery-powered', qty: (h) => people(h), unit: 'pcs', group: 'temel',
    product: { name: 'Forclaz HL100 rechargeable headlamp (120 lm)', url: 'https://www.akakce.com/fener/en-ucuz-forclaz-sarj-edilebilen-kafa-lambasi-i-120-lumen-hl100-fiyati,1663539800.html', note: 'Compare exact model and pack count.' } },
  { id: 'pil', title: 'Spare batteries', spec: 'Matching your flashlight and radio', qty: () => 8, unit: 'pcs', group: 'temel', search: 'AA pil 8li' },
  { id: 'radyo', title: 'Battery / hand-crank radio', spec: 'FM receiver; hand-crank dynamo preferred', qty: () => 1, unit: 'pcs', group: 'temel', search: 'dinamolu radyo' },
  { id: 'duduk', title: 'Physical whistle', spec: 'Loud, pealess whistle (works under debris)', qty: (h) => people(h), unit: 'pcs', group: 'temel',
    product: { name: 'Emergency whistle options', url: 'https://www.akakce.com/duduk.html', note: 'Prefer pealess plastic models with lanyard.' } },
  { id: 'giysi', title: 'Seasonal clothing & thermal blanket', spec: 'Spare underwear, socks, raincoat, emergency blanket', qty: (h) => people(h), unit: 'set', group: 'temel', search: 'termal battaniye' },
  { id: 'belge', title: 'Copies of important documents', spec: 'ID, title deed, insurance policies in a waterproof pouch', qty: () => 1, unit: 'folder', group: 'temel', search: 'su geçirmez dosya' },
  { id: 'powerbank', title: 'Power bank', spec: 'At least 10,000 mAh, kept charged with cables', qty: () => 1, unit: 'pcs', group: 'temel', search: 'powerbank 10000 mah' },
  { id: 'nakit', title: 'Small-denomination cash', spec: 'For when card terminals are offline', qty: () => 1, unit: '', group: 'temel' },
  { id: 'bebek', title: 'Infant / child supplies', spec: 'Formula, diapers, bottle, small comfort toy', qty: (h) => h.children, unit: 'child', group: 'cocuk', search: 'bebek bezi' },
  { id: 'yasli', title: 'Older adults', spec: 'Spare glasses, hearing-aid batteries, cane, medication list', qty: (h) => h.elderly, unit: 'person', group: 'yasli' },
  { id: 'engelli', title: 'People with disabilities', spec: 'Backup assistive parts, chargers, medical info card', qty: (h) => h.disabled, unit: 'person', group: 'engelli' },
  { id: 'evcil', title: 'Pets', spec: 'Food, water, leash, carrier, vaccination record copy', qty: (h) => h.pets, unit: 'pet', group: 'evcil', search: 'kedi taşıma çantası' },
];

export function getKit(): KitItem[] {
  return isEn() ? KIT_EN : KIT;
}

export function akakceSearch(q: string): string {
  return `https://www.akakce.com/arama/?q=${encodeURIComponent(q)}`;
}

export const INSURANCE = [
  { id: 'dask', title: 'DASK — Zorunlu Deprem Sigortası', who: 'Binanın kendisi (konut yapısı). Eşyalar kapsam dışıdır.', check: 'Poliçenin adresi ve metrekaresi doğru mu; yenileme tarihi; teminat limiti ve muafiyet.', link: 'https://www.dask.gov.tr/tr/teminat-ve-kapsami', linkText: 'DASK teminat ve kapsamı' },
  { id: 'konut', title: 'İsteğe bağlı konut sigortası', who: 'Eşyalar ve DASK limitini aşan bina hasarı (poliçeye göre).', check: 'Deprem ek teminatı var mı; eşya değeri; muafiyet oranı; geçici konaklama teminatı.', link: 'https://www.tsb.org.tr/', linkText: 'Türkiye Sigorta Birliği' },
  { id: 'hayat', title: 'Hayat sigortası', who: 'Sigortalı kişi ve lehtarlar.', check: 'Deprem kaynaklı vefatın istisna olup olmadığı; lehtar bilgileri güncel mi.', link: 'https://www.tsb.org.tr/', linkText: 'Türkiye Sigorta Birliği' },
  { id: 'saglik', title: 'Sağlık sigortası', who: 'Sigortalı kişinin tedavi giderleri.', check: 'Afet/deprem kaynaklı yaralanma kapsamı; anlaşmalı kurumlar; acil durum hattı.', link: 'https://www.tsb.org.tr/', linkText: 'Türkiye Sigorta Birliği' },
];

const INSURANCE_EN = [
  { id: 'dask', title: 'DASK — Compulsory Earthquake Insurance', who: 'The residential building structure itself. Household contents are excluded.', check: 'Verify address and gross floor area on the policy, renewal date, coverage cap, and deductible.', link: 'https://www.dask.gov.tr/tr/teminat-ve-kapsami', linkText: 'DASK coverage details' },
  { id: 'konut', title: 'Optional Home Insurance', who: 'Household contents and structural damage exceeding DASK limits (policy-dependent).', check: 'Check whether earthquake rider is included, insured contents value, coinsurance/deductible, and temporary accommodation.', link: 'https://www.tsb.org.tr/', linkText: 'Insurance Association of Türkiye' },
  { id: 'hayat', title: 'Life Insurance', who: 'The insured person and designated beneficiaries.', check: 'Confirm earthquake-related loss is covered without exclusion and beneficiary details are current.', link: 'https://www.tsb.org.tr/', linkText: 'Insurance Association of Türkiye' },
  { id: 'saglik', title: 'Health Insurance', who: 'Medical treatment expenses of the insured person.', check: 'Check disaster/earthquake injury coverage, network hospitals, and emergency assistance line.', link: 'https://www.tsb.org.tr/', linkText: 'Insurance Association of Türkiye' },
];

export function getInsurance() {
  return isEn() ? INSURANCE_EN : INSURANCE;
}

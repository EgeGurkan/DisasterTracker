// Entegrasyon envanteri. Kullanım izni doğrulanan kaynaklar canlı adaptör olarak çalışır.

export interface InventoryItem {
  id: string;
  name: string;
  nameEn: string;
  officialAccess: string;
  coverage: string;
  coverageEn: string;
  product: string;
  productEn: string;
  updateFrequency: string;
  updateFrequencyEn: string;
  attribution: string;
  attributionEn: string;
  status: 'canlı-adaptör' | 'izin-bekleniyor' | 'inceleniyor' | 'yalnız-bağlantı';
  statusNote: string;
  statusNoteEn: string;
  owner: string;
}

export const INVENTORY: InventoryItem[] = [
  {
    id: 'AFAD', name: 'AFAD Deprem Dairesi', nameEn: 'AFAD Earthquake Department',
    officialAccess: 'https://deprem.afad.gov.tr/event-service (apiv2/event/filter)',
    coverage: 'Türkiye ve yakın çevresi', coverageEn: 'Türkiye and surrounding region',
    product: 'Olay kataloğu, revizyonlar (isEventUpdate/lastUpdateDate)', productEn: 'Event catalog and revisions (isEventUpdate/lastUpdateDate)',
    updateFrequency: 'Yoklama 20 sn', updateFrequencyEn: 'Polled every 20 s',
    attribution: 'Kaynak: AFAD Deprem Dairesi.', attributionEn: 'Source: AFAD Earthquake Department.',
    status: 'canlı-adaptör', statusNote: 'Canlı adaptör ve 30 günlük geri doldurma etkin.', statusNoteEn: 'Live adapter and 30-day backfill active.', owner: 'ekip',
  },
  {
    id: 'KOERI', name: 'Boğaziçi Üniv. Kandilli Rasathanesi ve Deprem Araştırma Enstitüsü (KRDAE)', nameEn: 'Boğaziçi Univ. Kandilli Observatory and Earthquake Research Institute (KOERI)',
    officialAccess: 'http://www.koeri.boun.edu.tr/scripts/lst0.asp',
    coverage: 'Türkiye ve yakın çevresi', coverageEn: 'Türkiye and surrounding region',
    product: 'Son depremler listesi (Mw/ML/Md) ve EIDA istasyonları', productEn: 'Recent earthquakes catalog (Mw/ML/Md) and EIDA stations',
    updateFrequency: 'Yoklama 30 sn', updateFrequencyEn: 'Polled every 30 s',
    attribution: 'Kaynak: Boğaziçi Üniversitesi KRDAE Bölgesel Deprem-Tsunami İzleme ve Değerlendirme Merkezi.',
    attributionEn: 'Source: Boğaziçi University KOERI Regional Earthquake-Tsunami Monitoring Center.',
    status: 'canlı-adaptör', statusNote: 'Kullanım izni alındı; canlı adaptör ve EIDA istasyon akışı etkin.', statusNoteEn: 'Permission granted; live event adapter and EIDA station feed active.', owner: 'ekip',
  },
  {
    id: 'EMSC', name: 'EMSC SeismicPortal', nameEn: 'EMSC SeismicPortal',
    officialAccess: 'https://www.seismicportal.eu/fdsnws/event/1/ (FDSN event)',
    coverage: 'Avrupa-Akdeniz ve dünya', coverageEn: 'Euro-Mediterranean and worldwide',
    product: 'Olay kataloğu, kaynak kimlikleri (unid)', productEn: 'Event catalog and source identifiers (unid)',
    updateFrequency: 'Yoklama 60 sn', updateFrequencyEn: 'Polled every 60 s',
    attribution: 'Kaynak: EMSC. Kullanım koşulları: seismicportal.eu', attributionEn: 'Source: EMSC. Terms: seismicportal.eu',
    status: 'canlı-adaptör', statusNote: 'FDSN event servisi.', statusNoteEn: 'FDSN event service.', owner: 'ekip',
  },
  {
    id: 'USGS', name: 'USGS Earthquake Hazards Program', nameEn: 'USGS Earthquake Hazards Program',
    officialAccess: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
    coverage: 'Dünya (M2,5+ küresel, ABD ayrıntılı, tsunami bayrakları)', coverageEn: 'Worldwide (M2.5+ global, detailed US, tsunami flags)',
    product: 'GeoJSON özet akışları ve tsunami işaretli depremler', productEn: 'GeoJSON summary feeds and tsunami-flagged events',
    updateFrequency: 'Yoklama 60 sn', updateFrequencyEn: 'Polled every 60 s',
    attribution: 'Kamu malı (ABD federal); atıf: USGS.', attributionEn: 'Public domain (US Federal); credit: USGS.',
    status: 'canlı-adaptör', statusNote: '2.5_hour akışı + açılışta 4.5_month geri doldurma.', statusNoteEn: '2.5_hour feed + 4.5_month startup backfill.', owner: 'ekip',
  },
  {
    id: 'NOA', name: 'Atina Ulusal Gözlemevi Jeodinamik Enstitüsü (NOA)', nameEn: 'National Observatory of Athens Institute of Geodynamics (NOA)',
    officialAccess: 'https://eida.gein.noa.gr/fdsnws/event/1/',
    coverage: 'Ege Denizi, Yunanistan ve Doğu Akdeniz', coverageEn: 'Aegean Sea, Greece, and Eastern Mediterranean',
    product: 'FDSN olay ve istasyon servisleri', productEn: 'FDSN event and station services',
    updateFrequency: 'Yoklama 60 sn', updateFrequencyEn: 'Polled every 60 s',
    attribution: 'Kaynak: NOA-IG (HL ağı, CC BY 4.0).', attributionEn: 'Source: NOA-IG (HL network, CC BY 4.0).',
    status: 'canlı-adaptör', statusNote: 'Ege ve Batı Anadolu birleştirmesi için canlı adaptör etkin.', statusNoteEn: 'Live adapter active for Aegean and Western Anatolia merging.', owner: 'ekip',
  },
  {
    id: 'GEOFON', name: 'GFZ GEOFON', nameEn: 'GFZ GEOFON',
    officialAccess: 'https://geofon.gfz.de/waveform/webservices/fdsnws.php',
    coverage: 'Dünya ve Avrupa-Akdeniz', coverageEn: 'Worldwide and Euro-Mediterranean',
    product: 'FDSN olay kataloğu ve istasyon (station) servisleri', productEn: 'FDSN event catalog and station services',
    updateFrequency: 'Olay 60 sn · İstasyon günlük', updateFrequencyEn: 'Events 60 s · Stations daily',
    attribution: 'Kaynak: GFZ Helmholtz Centre for Geosciences (CC BY 4.0).', attributionEn: 'Source: GFZ Helmholtz Centre for Geosciences (CC BY 4.0).',
    status: 'canlı-adaptör', statusNote: 'Hem deprem kataloğu hem Sismik Ağ istasyon metaverisi etkin.', statusNoteEn: 'Both earthquake catalog and Seismic Network station metadata active.', owner: 'ekip',
  },
  {
    id: 'INGV', name: 'INGV (İtalya Ulusal Jeofizik ve Volkanoloji Enstitüsü)', nameEn: 'INGV (National Institute of Geophysics and Volcanology)',
    officialAccess: 'https://webservices.ingv.it/fdsnws/event/1/',
    coverage: 'İtalya ve Akdeniz çevresi', coverageEn: 'Italy and Mediterranean region',
    product: 'FDSN deprem kataloğu ve MedNet istasyonları', productEn: 'FDSN earthquake catalog and MedNet stations',
    updateFrequency: 'Yoklama 90 sn', updateFrequencyEn: 'Polled every 90 s',
    attribution: 'Kaynak: INGV (CC BY 4.0).', attributionEn: 'Source: INGV (CC BY 4.0).',
    status: 'canlı-adaptör', statusNote: 'Akdeniz olay kataloğu ve Türkiye/Akdeniz MN istasyonları etkin.', statusNoteEn: 'Mediterranean catalog and Türkiye/MedNet MN stations active.', owner: 'ekip',
  },
  {
    id: 'JMA', name: 'Japonya Meteoroloji Ajansı (JMA)', nameEn: 'Japan Meteorological Agency (JMA)',
    officialAccess: 'https://www.jma.go.jp/bosai/quake/data/list.json',
    coverage: 'Japonya ve Batı Pasifik', coverageEn: 'Japan and Western Pacific',
    product: 'Deprem ve tsunami bültenleri', productEn: 'Earthquake and tsunami bulletins',
    updateFrequency: 'Yoklama 90 sn', updateFrequencyEn: 'Polled every 90 s',
    attribution: 'Kaynak: Japan Meteorological Agency (JMA).', attributionEn: 'Source: Japan Meteorological Agency (JMA).',
    status: 'canlı-adaptör', statusNote: 'JMA deprem ve tsunami bülten akışları etkin.', statusNoteEn: 'JMA seismic and tsunami bulletin feeds active.', owner: 'ekip',
  },
  {
    id: 'GEONET', name: 'GeoNet (Yeni Zelanda)', nameEn: 'GeoNet (New Zealand)',
    officialAccess: 'https://api.geonet.org.nz/quake?MMI=-1',
    coverage: 'Yeni Zelanda ve Güneybatı Pasifik', coverageEn: 'New Zealand and Southwest Pacific',
    product: 'GeoNet Quake API v2', productEn: 'GeoNet Quake API v2',
    updateFrequency: 'Yoklama 120 sn', updateFrequencyEn: 'Polled every 120 s',
    attribution: 'Kaynak: GNS Science / GeoNet (CC BY 4.0).', attributionEn: 'Source: GNS Science / GeoNet (CC BY 4.0).',
    status: 'canlı-adaptör', statusNote: 'GeoNet Quake API canlı adaptörü etkin.', statusNoteEn: 'GeoNet Quake API live adapter active.', owner: 'ekip',
  },
  {
    id: 'NASA-EONET', name: 'NASA EONET (Doğal Afet İzleme Sistemi)', nameEn: 'NASA EONET (Earth Observatory Natural Event Tracker)',
    officialAccess: 'https://eonet.gsfc.nasa.gov/api/v3/events',
    coverage: 'Dünya geneli ve Akdeniz', coverageEn: 'Worldwide and Mediterranean',
    product: 'Yangın, sel, şiddetli fırtına ve volkan olayları', productEn: 'Wildfire, flood, severe storm, and volcano events',
    updateFrequency: 'Önbellek 3 dk', updateFrequencyEn: '3 min cache',
    attribution: 'Kamu malı (NASA EOSDIS / EONET v3).', attributionEn: 'Public domain (NASA EOSDIS / EONET v3).',
    status: 'canlı-adaptör', statusNote: 'Afetler sekmeleri ve harita katmanı için canlı adaptör etkin.', statusNoteEn: 'Live adapter active for Disasters tabs and map markers.', owner: 'ekip',
  },
  {
    id: 'GDACS', name: 'GDACS (BM / AB Küresel Afet Uyarı Sistemi)', nameEn: 'GDACS (UN / EC Global Disaster Alert System)',
    officialAccess: 'https://www.gdacs.org/xml/rss.xml',
    coverage: 'Dünya ve Avrupa-Akdeniz', coverageEn: 'Worldwide and Euro-Mediterranean',
    product: 'Sel, kasırga/fırtına, orman yangını, volkan ve tsunami uyarıları', productEn: 'Flood, cyclone/storm, wildfire, volcano, and tsunami alerts',
    updateFrequency: 'Önbellek 3 dk', updateFrequencyEn: '3 min cache',
    attribution: 'Kaynak: GDACS (UN OCHA & European Commission JRC).', attributionEn: 'Source: GDACS (UN OCHA & European Commission JRC).',
    status: 'canlı-adaptör', statusNote: 'Çoklu afet beslemesi sunucu adaptöründe etkin.', statusNoteEn: 'Multi-hazard alert feed active on server adapter.', owner: 'ekip',
  },
  {
    id: 'NOAA-HAZARDS', name: 'NOAA NWS, IEM ve USGS Volkan Programı', nameEn: 'NOAA NWS, IEM & USGS Volcano Hazards Program',
    officialAccess: 'https://api.weather.gov/alerts/active',
    coverage: 'Küresel volkan/tsunami ve Kuzey Amerika şiddetli hava olayları', coverageEn: 'Global volcano/tsunami & severe weather/tornado reports',
    product: 'Hortum, ani sel, fırtına, tsunami ve aktif volkan uyarıları', productEn: 'Tornado, flash flood, storm, tsunami, and active volcano alerts',
    updateFrequency: 'Önbellek 3 dk', updateFrequencyEn: '3 min cache',
    attribution: 'Kamu malı (NOAA / NWS / USGS) ve IEM.', attributionEn: 'Public domain (NOAA / NWS / USGS) and IEM.',
    status: 'canlı-adaptör', statusNote: 'Hortum, sel, fırtına, volkan ve tsunami sekmeleri için canlı adaptör etkin.', statusNoteEn: 'Live adapter active for Tornado, Flood, Storm, Volcano, and Tsunami tabs.', owner: 'ekip',
  },
  {
    id: 'MTA', name: 'Diri Fay Katmanı (MTA / GEM Küresel Diri Faylar)', nameEn: 'Active Faults Layer (MTA / GEM Global Active Faults)',
    officialAccess: 'https://yerbilimleri.mta.gov.tr/Default.aspx',
    coverage: 'Türkiye ve Doğu Akdeniz', coverageEn: 'Türkiye and Eastern Mediterranean',
    product: 'Uygulama içi diri fay çizgileri (EMME/MTA uyumlu derleme)', productEn: 'In-app active fault lines (harmonized EMME/MTA compilation)',
    updateFrequency: 'Harita katmanı (24 sa önbellek)', updateFrequencyEn: 'Map layer (24 h cache)',
    attribution: 'Kaynak: GEM Global Active Faults / EMME & MTA (CC BY-SA 4.0).', attributionEn: 'Source: GEM Global Active Faults / EMME & MTA (CC BY-SA 4.0).',
    status: 'canlı-adaptör', statusNote: 'Harita ekranında açılıp kapatılabilir diri fay katmanı etkin.', statusNoteEn: 'Toggleable active faults layer enabled on the Map screen.', owner: 'ekip',
  },
  {
    id: 'AFAD-TDTH', name: 'AFAD Türkiye Deprem Tehlike Haritası', nameEn: 'AFAD Türkiye Seismic Hazard Map',
    officialAccess: 'https://tdth.afad.gov.tr/', coverage: 'Türkiye', coverageEn: 'Türkiye',
    product: 'Ulusal deprem tehlikesi', productEn: 'National seismic hazard viewer',
    updateFrequency: '—', updateFrequencyEn: '—', attribution: 'AFAD koşulları', attributionEn: 'AFAD terms',
    status: 'yalnız-bağlantı', statusNote: 'Etkileşimli resmî araca yönlendirme.', statusNoteEn: 'Links to official interactive viewer.', owner: 'ekip',
  },
  {
    id: 'EEW-TR', name: 'Sarsıntı erken uyarı sağlayıcısı (Türkiye)', nameEn: 'Earthquake Early Warning Provider (Türkiye)',
    officialAccess: '—', coverage: '—', coverageEn: '—',
    product: 'Yetkili erken uyarı mesajı', productEn: 'Authorized early warning message',
    updateFrequency: 'Gerçek zamanlı', updateFrequencyEn: 'Real-time',
    attribution: '—', attributionEn: '—', status: 'izin-bekleniyor',
    statusNote: 'Doğrulanmış yetkili akış yok; yalnız imzalı TEST sağlayıcısı tatbikat cihazlarında çalışır.',
    statusNoteEn: 'No verified public feed yet; only signed TEST provider runs on drill devices.', owner: 'atanmadı',
  },
];

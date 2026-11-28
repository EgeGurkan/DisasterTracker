// Özgün çizgi simgeler (24×24, currentColor). Dekoratif kullanımda aria-hidden.
import type { JSX } from 'preact';

const P: Record<string, JSX.Element> = {
  quake: <><path d="M2 12h3l2-6 3 12 3-9 2 5 2-2h5" /></>,
  flood: <><path d="M12 3c-2.5 3.2-4 5.2-4 7a4 4 0 0 0 8 0c0-1.8-1.5-3.8-4-7Z" /><path d="M2 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" /><path d="M2 21.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" /></>,
  storm: <><path d="M17.5 17H7a4.5 4.5 0 0 1-.8-8.9A6 6 0 0 1 18 9h.5a3.5 3.5 0 0 1-.5 7" /><path d="m13 13-3 4h4l-2 4" /></>,
  tornado: <><path d="M3 5h18" /><path d="M5 9h14" /><path d="M7 13h11" /><path d="M9 17h7" /><path d="M10 21h3" /></>,
  fire: <><path d="M12 22a7 7 0 0 0 7-7c0-3.5-2.5-6.5-5-9-.5 2.5-2 4-3 4-.8-1.8-.5-4 1-6-4 2.2-7 6.2-7 11a7 7 0 0 0 7 7Z" /><path d="M12 22a3 3 0 0 0 3-3c0-1.6-1.2-3-3-4.5-1.8 1.5-3 2.9-3 4.5a3 3 0 0 0 3 3Z" /></>,
  volcano: <><path d="m2 21 6.5-11h7L22 21H2Z" /><path d="m9.5 10 1.5 3 2-2 1.5 2" /><path d="M12 6V3M9 7 7.5 4.5M15 7l1.5-2.5" /></>,
  tsunami: <><path d="M2 16c2-4.5 5.5-8 10-8 3.2 0 5.5 1.6 5.5 3.6 0 1.6-1.3 2.6-2.8 2.4-.9-.1-1.7-.8-1.7-1.7" /><path d="M2 20c2 1.2 4 1.2 6 0s4-1.2 6 0 4 1.2 6 0" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></>,
  sos: <><path d="M12 3v3M5.6 5.6l2 2M18.4 5.6l-2 2" /><path d="M6 20a6 6 0 0 1 12 0Z" /><path d="M4 20h16" /></>,
  bell: <><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  antenna: <><path d="M12 12v9M8 21h8" /><circle cx="12" cy="10" r="2" /><path d="M7.8 5.8a6 6 0 0 0 0 8.4M16.2 5.8a6 6 0 0 1 0 8.4M5 3a10 10 0 0 0 0 14M19 3a10 10 0 0 1 0 14" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4V5Z" /></>,
  backpack: <><path d="M7 8a5 5 0 0 1 10 0v12H7V8Z" /><path d="M10 3h4M9 14h6M9 14v3h6v-3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  pin: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  locate: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  depth: <><path d="M12 4v14M7 13l5 5 5-5" /></>,
  ruler: <><path d="M3 17 17 3l4 4L7 21l-4-4Z" /><path d="M7 13l2 2M10 10l2 2M13 7l2 2" /></>,
  source: <><path d="M4 4h12l4 4v12H4V4Z" /><path d="M8 12h8M8 16h5" /></>,
  chev: <><path d="m9 6 6 6-6 6" /></>,
  back: <><path d="m15 6-6 6 6 6" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  whistle: <><path d="M3 10h9a5 5 0 1 1-5 5" /><path d="M12 10V7h3" /><path d="M17 4l2-1M19 8h2M18 6l2-1" /></>,
  phone: <><path d="M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2Z" /></>,
  check: <><path d="m5 12 5 5 9-10" /></>,
  shieldCheck: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17v.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  heart: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  share: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v7h14v-7" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></>,
  wifiOff: <><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.4-1.7M2 9.5a15 15 0 0 1 4.5-2.8M22 9.5A15 15 0 0 0 11 5.1" /><circle cx="12" cy="20" r=".5" /></>,
  volume: <><path d="M4 9h4l5-4v14l-5-4H4V9Z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  stop: <><rect x="6" y="6" width="12" height="12" rx="2" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></>,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14a5 5 0 0 1 6 6" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  tool: <><path d="M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2Z" /></>,
  ext: <><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></>,
  oled: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" /></>,
  bag: <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  radio: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8 17 3" /><circle cx="8" cy="14" r="2" /><path d="M13 13h5M13 16h5" /></>,
  ops: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" /><path d="M4 3v5h5" /><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" /><path d="M20 21v-5h-5" /></>,
  down: <><path d="m6 9 6 6 6-6" /></>,
};

export function Icon({ name, label }: { name: keyof typeof P | string; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label} focusable="false">
      {P[name] ?? P.info}
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0A1324" />
      <circle cx="16" cy="16" r="9.6" fill="none" stroke="#F5A524" stroke-width="2.2" />
      <path d="M10 17a6 6 0 0 1 12 0" fill="none" stroke="#F6F4EF" stroke-width="1.8" />
      <circle cx="16" cy="16" r="2.7" fill="#3CC7C9" />
    </svg>
  );
}

// Uygulama simgelerini ve ses dosyalarını bağımlılıksız üretir (PNG + WAV).
import { deflateSync } from 'node:zlib';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(join(pub, 'icons'), { recursive: true });

// ---------- PNG ----------
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
};
function png(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const SS = 3;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const [cr, cg, cb, ca] = draw((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
        r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const NAVY = [10, 19, 36], AMBER = [245, 165, 36], TEAL = [60, 199, 201], OFF = [246, 244, 239];
function logo(scale) {
  return (u, v) => {
    const x = (u - 0.5) / scale, y = (v - 0.5) / scale;
    const d = Math.hypot(x, y);
    if (Math.abs(d - 0.30) < 0.035) return [...AMBER, 1];
    if (Math.abs(d - 0.19) < 0.03 && y < 0.05) return [...OFF, 1];
    if (d < 0.085) return [...TEAL, 1];
    return [...NAVY, 1];
  };
}
writeFileSync(join(pub, 'icons', 'icon-192.png'), png(192, logo(1)));
writeFileSync(join(pub, 'icons', 'icon-512.png'), png(512, logo(1)));
writeFileSync(join(pub, 'icons', 'icon-maskable-512.png'), png(512, logo(0.72)));
writeFileSync(join(pub, 'icons', 'apple-touch-icon.png'), png(180, logo(0.9)));
writeFileSync(join(pub, 'icons', 'badge-96.png'), png(96, (u, v) => {
  const d = Math.hypot(u - 0.5, v - 0.5);
  return Math.abs(d - 0.32) < 0.07 || d < 0.12 ? [255, 255, 255, 1] : [0, 0, 0, 0];
}));

// ---------- WAV ----------
function wav(seconds, sampleRate, fn) {
  const n = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.01, (seconds - t) / 0.01);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, fn(t) * env)) * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
// Düdük: ~3,1 kHz, insan kulağının en duyarlı olduğu aralık; hafif titreşimli (trill) ve harmonikli.
writeFileSync(join(pub, 'whistle.wav'), wav(1.0, 22050, (t) => {
  const f = 3150 + 120 * Math.sin(2 * Math.PI * 28 * t);
  const ph = 2 * Math.PI * f * t;
  return 0.95 * Math.tanh(2.2 * (Math.sin(ph) + 0.25 * Math.sin(2 * ph)));
}));
// Uyarı sireni (yalnız uygulama ön plandayken, geçerli erken uyarıda): 650→1300 Hz tarama.
writeFileSync(join(pub, 'siren.wav'), wav(1.2, 22050, (t) => {
  const f0 = 650, f1 = 1300, T = 1.2;
  const phase = 2 * Math.PI * (f0 * t + ((f1 - f0) / (2 * T)) * t * t);
  return 0.9 * Math.tanh(1.8 * Math.sin(phase));
}));
// Uygulama kodunun içe aktardığı kopyalar (normal derlemede ayrı dosya, tek dosya derlemede gömülü)
const srcAssets = join(pub, '..', 'src', 'assets');
mkdirSync(srcAssets, { recursive: true });
for (const f of ['whistle.wav', 'siren.wav']) copyFileSync(join(pub, f), join(srcAssets, f));
console.log('simgeler ve sesler üretildi →', pub);

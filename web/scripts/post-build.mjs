// Derleme sonrası: Service Worker'a çevrimdışı önbellek listesini ve sürümü yazar.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dist);
const hash = createHash('sha256');
const list = files
  .map((p) => '/' + relative(dist, p).split(sep).join('/'))
  .filter((u) => u !== '/sw.js' && !u.endsWith('.map'))
  .sort();
for (const u of list) hash.update(u).update(readFileSync(join(dist, u)));
const version = hash.digest('hex').slice(0, 12);
const swPath = join(dist, 'sw.js');
const sw = readFileSync(swPath, 'utf8')
  .replace('self.__PRECACHE__ = [];', `self.__PRECACHE__ = ${JSON.stringify(['/', ...list.filter((u) => u !== '/index.html'), '/index.html'])};`)
  .replace("self.__VERSION__ = 'dev';", `self.__VERSION__ = '${version}';`);
writeFileSync(swPath, sw);
console.log(`sw.js: ${list.length} dosya önbelleğe alınacak, sürüm ${version}`);

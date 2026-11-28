import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pub = (p: string) => fileURLToPath(new URL(`./public/${p}`, import.meta.url));
const dataUri = (p: string) => `data:image/png;base64,${readFileSync(pub(p)).toString('base64')}`;

/** Tek dosya sürüm: simgeleri sayfaya gömer, ayrı dosya gerektiren bağlantıları kaldırır. */
function inlineHtmlAssets(): Plugin {
  return {
    name: 'afet-inline-html-assets',
    transformIndexHtml(html) {
      return html
        .replace(/<link rel="manifest"[^>]*>\s*/, '')
        .replace('href="/icons/icon-192.png"', `href="${dataUri('icons/icon-192.png')}"`)
        .replace('href="/icons/apple-touch-icon.png"', `href="${dataUri('icons/apple-touch-icon.png')}"`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
    base: standalone ? './' : '/',
    plugins: [preact(), ...(standalone ? [viteSingleFile(), inlineHtmlAssets()] : [])],
    define: { 'import.meta.env.VITE_STANDALONE': JSON.stringify(standalone ? '1' : '0') },
    // Tek dosya sürümde public/ (sw.js, manifest) kopyalanmaz: GitHub'a yalnız index.html konur.
    publicDir: standalone ? false : 'public',
    server: {
      port: 5173,
      fs: { allow: ['..'] },
      proxy: { '/api': 'http://localhost:8787' },
    },
    build: {
      target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 2000,
      // Tek dosya sürüm proje köküne index.html olarak yazılır (GitHub Pages kökten yayınlar).
      outDir: standalone ? '..' : 'dist',
      emptyOutDir: !standalone,
    },
  };
});

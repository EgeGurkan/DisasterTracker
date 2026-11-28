// Hakkında: GitHub README dosyasını (İngilizce) derleme anında sayfaya gömer ve basit bir Markdown görünümüyle gösterir.
import type { ComponentChildren } from 'preact';
import readmeFull from '../../../README.md?raw';

// Uygulamada README'nin yalnız kullanıcıya dönük ilk bölümü gösterilir; geliştirici bölümü işaretten sonra başlar.
const readme = readmeFull.split('<!-- about:end -->')[0]!;
import { lang } from '../i18n.ts';
import { useAppState } from '../state.ts';

/** Satır içi: `kod`, **kalın**, [bağlantı](url), \ kaçışları. */
function inline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)/g;
  const src = text.replace(/\\([&_*#|\\-])/g, '$1');
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    if (m[1] != null) out.push(<code key={k++}>{m[1]}</code>);
    else if (m[2] != null) out.push(<strong key={k++}>{inline(m[2])}</strong>);
    else if (m[3] != null) out.push(<a key={k++} href={m[4]} target="_blank" rel="noopener noreferrer">{inline(m[3])}</a>);
    else if (m[5] != null) out.push(<a key={k++} href={m[5]} target="_blank" rel="noopener noreferrer">{m[5]}</a>);
    last = re.lastIndex;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function render(md: string): ComponentChildren[] {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: ComponentChildren[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) buf.push(lines[i++]!);
      i++;
      out.push(<pre key={k++}><code>{buf.join('\n')}</code></pre>);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const body = inline(h[2]!);
      out.push(level === 1 ? <h2 key={k++}>{body}</h2> : level === 2 ? <h3 key={k++}>{body}</h3> : <h4 key={k++}>{body}</h4>);
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(lines[i++]!);
      const [head, , ...body] = rows;
      out.push(
        <div key={k++} class="table-wrap">
          <table class="data">
            <thead><tr>{cells(head!).map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{cells(r).map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const li = /^(\s*)(-|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]!);
      const items: ComponentChildren[] = [];
      while (i < lines.length) {
        const m = /^(\s*)(-|\d+\.)\s+(.*)$/.exec(lines[i]!);
        if (!m) break;
        const nested = m[1]!.length >= 2;
        items.push(<li key={i} class={nested ? 'nested' : undefined}>{inline(m[3]!)}</li>);
        i++;
      }
      out.push(ordered ? <ol key={k++}>{items}</ol> : <ul key={k++}>{items}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#|```|\||\s*(-|\d+\.)\s)/.test(lines[i]!)) para.push(lines[i++]!);
    out.push(<p key={k++}>{inline(para.join(' '))}</p>);
  }
  return out;
}

export function AboutPage() {
  useAppState();
  return (
    <div class="stack" style="margin-top:10px">
      {lang() === 'tr' && <p class="small muted" style="margin:0 2px">Bu sayfa projenin GitHub README dosyasıdır (İngilizce).</p>}
      <article class="card md" lang="en">{render(readme)}</article>
    </div>
  );
}

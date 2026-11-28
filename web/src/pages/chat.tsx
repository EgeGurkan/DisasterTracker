import { useState } from 'preact/hooks';
import { api, ApiError } from '../api.ts';
import { Icon } from '../icons.tsx';
import { go, type Route } from '../router.ts';
import { setState, useAppState } from '../state.ts';
import { Notice, toast, useFetch } from '../ui.tsx';
import { fmtTime, isEn, tx } from '../i18n.ts';

interface Msg { id: string; nick: string; text: string; at: string; author: string; label: string }

const ROOM_EN: Record<string, string> = {
  marmara: 'Marmara',
  ege: 'Aegean',
  akdeniz: 'Mediterranean',
  'ic-anadolu': 'Central Anatolia',
  karadeniz: 'Black Sea',
  'dogu-anadolu': 'Eastern Anatolia',
  guneydogu: 'Southeastern Anatolia',
};

export function ChatPage({ r }: { r: Route }) {
  const s = useAppState();
  const room = r.path[1] ?? null;
  const { data: rooms } = useFetch<{ id: string; name: string }[]>('/api/chat/rooms');
  const roomName = (x: { id: string; name: string }) => (isEn() ? ROOM_EN[x.id] ?? x.name : x.name);

  if (!room) {
    return (
      <div class="stack" style="margin-top:12px">
        <Notice kind="amber" icon="info">
          {isEn()
            ? <>Chat messages are unverified <strong>Community</strong> posts. Official alerts are never posted here. Participation is optional and muting chat does not affect earthquake alerts.</>
            : <>Sohbet <strong>Topluluk</strong> iletileridir; doğrulanmamıştır. Resmî uyarılar burada yayımlanmaz. Katılım isteğe bağlıdır ve sohbeti kapatmak deprem bildirimlerini etkilemez.</>}
        </Notice>
        <div class="card flush">
          {rooms?.map((x) => {
            const joined = s.chat.joined.includes(x.id);
            return (
              <div key={x.id} class="list-link">
                <span class="ic"><Icon name="chat" /></span>
                <span style="flex:1"><span class="t">{roomName(x)}</span><br /><span class="d">{joined ? (s.chat.muted.includes(x.id) ? tx('Katıldın · sessizde', 'Joined · muted') : tx('Katıldın', 'Joined')) : tx('Katılmadın', 'Not joined')}</span></span>
                {joined ? <a class="btn sm" href={`#/sohbet/${x.id}`}>{tx('Aç', 'Open')}</a>
                  : <button class="btn sm" onClick={() => { setState((st) => ({ chat: { ...st.chat, joined: [...st.chat.joined, x.id] } })); go(`/sohbet/${x.id}`); }}>{tx('Katıl', 'Join')}</button>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  const found = rooms?.find((x) => x.id === room);
  return <Room id={room} name={found ? roomName(found) : room} />;
}

function Room({ id, name }: { id: string; name: string }) {
  const s = useAppState();
  const { data, reload } = useFetch<Msg[]>(`/api/chat/${id}`, [], 8000);
  const [text, setText] = useState('');
  const muted = s.chat.muted.includes(id);
  const send = async (e: Event) => {
    e.preventDefault();
    if (!s.device) { toast(tx('İleti göndermek için Ayarlar’dan cihazını kaydet (bildirimleri aç).', 'Enable notifications in Settings first to register your device before posting.')); return; }
    if (!s.chat.nick) { toast(tx('Önce bir takma ad yaz.', 'Enter a nickname first.')); return; }
    try { await api(`/api/chat/${id}`, { method: 'POST', json: { nick: s.chat.nick, text } }); setText(''); reload(); }
    catch (err) { toast(err instanceof ApiError ? err.message : tx('Gönderilemedi', 'Could not send')); }
  };
  const report = async (m: Msg) => {
    try { await api('/api/chat-report', { method: 'POST', json: { messageId: m.id, reason: 'user-report' } }); toast(tx('Şikâyetin moderasyona iletildi.', 'Report submitted to moderation.')); }
    catch { toast(tx('Şikâyet için cihaz kaydı gerekir.', 'Device registration required to report.')); }
  };
  const visible = (data ?? []).filter((m) => !s.chat.blocked.includes(m.author));
  return (
    <div class="stack" style="margin-top:12px">
      <div class="row wrap">
        <a class="btn sm ghost" href="#/sohbet"><Icon name="back" /> {tx('Odalar', 'Rooms')}</a>
        <h2 style="margin:0;flex:1">{name}</h2>
        <button class="btn sm" aria-pressed={muted} onClick={() => setState((st) => ({ chat: { ...st.chat, muted: muted ? st.chat.muted.filter((x) => x !== id) : [...st.chat.muted, id] } }))}>{muted ? tx('Sesi aç', 'Unmute') : tx('Sessize al', 'Mute')}</button>
        <button class="btn sm" onClick={() => { setState((st) => ({ chat: { ...st.chat, joined: st.chat.joined.filter((x) => x !== id) } })); go('/sohbet'); }}>{tx('Ayrıl', 'Leave')}</button>
      </div>
      <p class="small muted">{tx('Tüm iletiler', 'All messages are labeled')} <span class="pill neutral">{tx('Topluluk', 'Community')}</span> {tx('olarak etiketlenir. Kesin adres, telefon ve sağlık bilgisi paylaşma.', '— do not share exact addresses, phone numbers, or medical details.')}</p>
      <div aria-live="polite">
        {visible.length === 0 && <div class="empty">{tx('Henüz ileti yok.', 'No messages yet.')}</div>}
        {visible.map((m) => (
          <div class="chat-msg" key={m.id}>
            <div class="who"><span class="pill neutral">{tx('Topluluk', 'Community')}</span><strong>{m.nick}</strong><span>{fmtTime(m.at)}</span>
              <span class="spacer" />
              <button class="btn sm ghost" style="min-height:36px" onClick={() => void report(m)}>{tx('Şikâyet et', 'Report')}</button>
              <button class="btn sm ghost" style="min-height:36px" onClick={() => { setState((st) => ({ chat: { ...st.chat, blocked: [...st.chat.blocked, m.author] } })); toast(tx('Bu kişinin iletileri gizlendi.', 'Messages from this user hidden.')); }}>{tx('Engelle', 'Block')}</button>
            </div>
            <div style="margin-top:4px;white-space:pre-wrap">{m.text}</div>
          </div>
        ))}
      </div>
      <form class="card" onSubmit={send}>
        <div class="field"><label for="nick">{tx('Takma ad', 'Nickname')}</label><input id="nick" class="input" maxLength={24} value={s.chat.nick} onInput={(e) => setState((st) => ({ chat: { ...st.chat, nick: (e.target as HTMLInputElement).value } }))} /></div>
        <div class="field"><label for="msg">{tx('İleti', 'Message')}</label><textarea id="msg" class="input" maxLength={500} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} /></div>
        <button class="btn primary" type="submit" disabled={!text.trim()}>{tx('Gönder', 'Send')}</button>
      </form>
    </div>
  );
}

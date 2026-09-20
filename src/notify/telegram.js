// Alertas por Telegram (llegan al móvil al instante, sin app propia).
// Requiere TELEGRAM_BOT_TOKEN (de @BotFather) y TELEGRAM_CHAT_ID (tu chat con el bot).
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

export const telegramConfigured = () => Boolean(TOKEN && CHAT);

async function call(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description}`);
  return j;
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const eur = (n) => (n == null ? 'A consultar' : n.toLocaleString('es-ES') + ' €');

export function formatListing(l, kind) {
  const head = kind === 'new' ? '🆕 <b>Alta nueva</b>' : kind === 'price_drop' ? `🔻 <b>Baja de precio</b> (${eur(l.prevPrice)} → ${eur(l.price)}, −${l.dropPct}%)` : '🔺 <b>Sube de precio</b>';
  const risk = l.flags.filter((f) => /sin posesi|ocupad|situaci|remate|subasta|llaves|reo/i.test(f));
  return [
    head,
    `<b>${esc(l.title)}</b>`,
    `${esc(l.muni)} · ${esc(l.comarca)} · ${esc(l.src)}`,
    `<b>${eur(l.price)}</b>${l.eur_m2 ? ` · ${l.eur_m2.toLocaleString('es-ES')} €/m²` : ''}${l.m2 ? ` · ${l.m2} m²` : ''}${l.rooms ? ` · ${l.rooms} hab` : ''}`,
    risk.length ? `⚠️ ${esc(risk.join(', '))}` : '',
    l.analisis?.pendiente ? `🏗️ Terreno: pendiente ${l.analisis.pendiente} · cimentación ${l.analisis.dificultad} · excavación ${l.analisis.excavacion}${l.analisis.notas ? ` · ${esc(l.analisis.notas)}` : ''}` : '',
    `<a href="${l.url}">Ver ficha</a>`,
  ].filter(Boolean).join('\n');
}

export async function sendAlert(l, kind) {
  const text = formatListing(l, kind);
  if (l.img) {
    try {
      return await call('sendPhoto', { chat_id: CHAT, photo: l.img, caption: text, parse_mode: 'HTML' });
    } catch { /* la foto puede fallar (hotlink); seguimos con texto */ }
  }
  return call('sendMessage', { chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: false });
}

export async function sendSummary(text) {
  return call('sendMessage', { chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

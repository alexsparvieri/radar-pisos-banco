// Orquestador: baja todas las fuentes, filtra por la zona, compara con el estado anterior,
// registra altas / bajas de precio / retiradas, avisa por Telegram y regenera la web (docs/).
//
//   node src/run.js            ejecución completa
//   node src/run.js --dry      no guarda ni avisa (solo muestra el diff)
//   node src/run.js --only solvia,aliseda   solo esas fuentes
//   node src/run.js --no-site  no regenera docs/
import { municipioDe } from './zona.js';
import { loadListings, saveListings, appendHistory, appendRun } from './store.js';
import { telegramConfigured, sendAlert, sendSummary } from './notify/telegram.js';
import { buildSite } from './site/build.js';
import { fetchSolvia } from './sources/solvia.js';
import { fetchAliseda } from './sources/aliseda.js';
import { fetchServihabitat } from './sources/servihabitat.js';
import { fetchAltamira } from './sources/altamira.js';
import { fetchHipoges } from './sources/hipoges.js';
import { fetchBankinter } from './sources/bankinter.js';
import { fetchUnicaja } from './sources/unicaja.js';
import { fetchHabitaclia } from './sources/habitaclia.js';
import { fetchFotocasa } from './sources/fotocasa.js';
import { fetchPisos } from './sources/pisos.js';
import { motivoExclusion } from './rules.js';
import { analizarPendientes } from './analisis/terrenos.js';
import { geocodificarPendientes } from './geo/geocode.js';

// Orden = prioridad al deduplicar (el mismo inmueble anunciado en varios sitios se queda con la primera fuente)
// Habitaclia comparte anuncios con fotocasa: el conector existe (src/sources/habitaclia.js) pero no se ejecuta.
const SOURCES = { solvia: fetchSolvia, aliseda: fetchAliseda, servihabitat: fetchServihabitat, altamira: fetchAltamira, hipoges: fetchHipoges, unicaja: fetchUnicaja, bankinter: fetchBankinter, fotocasa: fetchFotocasa, pisos: fetchPisos };
const SRC_NAME = { solvia: 'Solvia', aliseda: 'Aliseda', servihabitat: 'Servihabitat', altamira: 'Altamira', hipoges: 'Hipoges', unicaja: 'Unicaja', bankinter: 'Bankinter', fotocasa: 'Fotocasa', pisos: 'pisos.com', habitaclia: 'Habitaclia' };
void fetchHabitaclia;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const NO_SITE = args.includes('--no-site');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? (args[onlyIdx + 1] || '').split(',').filter(Boolean) : [];
const MAX_ALERTS = parseInt(process.env.MAX_ALERTS || '25', 10);
const today = new Date().toISOString().slice(0, 10);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function finish(raw) {
  const m = municipioDe(raw.town);
  if (!m) return null;
  const l = { ...raw, id: String(raw.id), key: `${raw.src}:${raw.id}`, muni: m.name, comarca: m.comarca, flags: [...new Set((raw.flags || []).filter(Boolean))] };
  l.eur_m2 = l.price && l.m2 ? Math.round(l.price / l.m2) : null;
  const motivo = motivoExclusion(l);
  if (motivo) { excluidos[motivo] = (excluidos[motivo] || 0) + 1; return null; }
  delete l.town; delete l.desc; delete l.area;
  return l;
}
const excluidos = {};
// Clave de deduplicación entre fuentes: mismo municipio + precio + superficie (±2 m²) + habitaciones
const dupKey = (l) => `${l.muni}|${l.price}|${Math.round((l.m2 || 0) / 2)}|${l.rooms || ''}`;
const dupSeen = new Map(); // key -> primera clave de listing vista en esta corrida

const prev = loadListings();
const next = { ...prev };
const events = [];
const ok = [];
const failed = [];
const counts = {};
let duplicados = 0;
// las fichas que ya están en el estado también participan en la deduplicación (para no crear duplicados nuevos)
for (const l of Object.values(prev)) if (!l.removed && l.m2) dupSeen.set(dupKey(l), l.key);

for (const [name, fn] of Object.entries(SOURCES)) {
  if (only.length && !only.includes(name)) continue;
  const t0 = Date.now();
  try {
    const rows = await fn(log);
    const inZone = rows.map(finish).filter(Boolean);
    counts[name] = { total: rows.length, zona: inZone.length, s: Math.round((Date.now() - t0) / 1000) };
    log(`[${name}] ${rows.length} bajadas, ${inZone.length} en zona`);
    if (rows.length === 0) throw new Error('0 resultados: se asume fallo de la fuente');
    ok.push(SRC_NAME[name]);
    const seen = new Set();
    for (const l of inZone) {
      // duplicado de otra fuente ya procesada: se anota en el original y no se crea ficha aparte
      const dk = dupKey(l);
      if (l.m2 && dupSeen.has(dk) && dupSeen.get(dk) !== l.key) {
        const orig = next[dupSeen.get(dk)];
        if (orig) { orig.tambien = [...new Set([...(orig.tambien || []), `${l.src}: ${l.url}`])]; }
        duplicados++;
        continue;
      }
      if (l.m2) dupSeen.set(dk, l.key);
      seen.add(l.key);
      const old = prev[l.key];
      if (!old) {
        next[l.key] = { ...l, firstSeen: today, lastSeen: today };
        events.push({ type: 'new', date: today, key: l.key, price: l.price });
      } else {
        const merged = { ...old, ...l, firstSeen: old.firstSeen, lastSeen: today, baseline: old.baseline, misses: 0, removed: undefined };
        if (!l.imgs?.length && old.imgs?.length) merged.imgs = old.imgs; // no perder la galería si esta vez no vino
        if (!l.img && old.img) merged.img = old.img;
        if (old.removed) events.push({ type: 'back', date: today, key: l.key, price: l.price });
        if (old.price && l.price && old.price !== l.price) {
          const pct = Math.round((1 - l.price / old.price) * 100);
          events.push({ type: l.price < old.price ? 'price_drop' : 'price_up', date: today, key: l.key, from: old.price, to: l.price, pct });
          merged.prevPrice = old.price; merged.dropPct = pct;
          merged.priceHistory = [...(old.priceHistory || [{ date: old.firstSeen, price: old.price }]), { date: today, price: l.price }];
        }
        next[l.key] = merged;
      }
    }
    // retiradas: estaban antes en esta fuente y ya no aparecen en DOS ejecuciones seguidas
    // (una sola ausencia puede ser cobertura parcial del portal, no una venta)
    for (const [k, old] of Object.entries(prev)) {
      if (old.src === SRC_NAME[name] && !seen.has(k) && !old.removed) {
        const misses = (old.misses || 0) + 1;
        if (misses >= 2) {
          next[k] = { ...old, misses, removed: today };
          events.push({ type: 'removed', date: today, key: k, price: old.price });
        } else {
          next[k] = { ...old, misses };
        }
      }
    }
  } catch (e) {
    failed.push(`${SRC_NAME[name]}: ${e.message}`);
    log(`[${name}] FALLO: ${e.message}`);
  }
}

const news = events.filter((e) => e.type === 'new');
const drops = events.filter((e) => e.type === 'price_drop');
const removed = events.filter((e) => e.type === 'removed');
log(`altas ${news.length} · bajadas de precio ${drops.length} · retiradas ${removed.length} · fallos ${failed.length} · duplicados entre fuentes ${duplicados}`);
log(`excluidos por reglas: ${JSON.stringify(excluidos)}`);

if (!DRY) {
  saveListings(next);
  // Anuncios sin coordenadas: geolocalizar por dirección (Nominatim, 1 petición/s, tope por corrida) para el filtro de la N-340
  try { if (await geocodificarPendientes(next, { log })) saveListings(next); } catch (e) { log('geocode:', e.message); }
  // Terrenos: análisis de fotos con Claude (pendiente, cimentación, excavación). Solo los que aún no lo tienen.
  try { if (await analizarPendientes(next, { log })) saveListings(next); } catch (e) { log('analisis:', e.message); }
  appendHistory(events);
  appendRun({ date: new Date().toISOString(), counts, failed, new: news.length, drops: drops.length, removed: removed.length, duplicados, excluidos });
  if (!NO_SITE) buildSite(next, log);

  if (telegramConfigured()) {
    const alerts = [...news.map((e) => [next[e.key], 'new']), ...drops.map((e) => [next[e.key], 'price_drop'])]
      .filter(([l]) => l && !l.baseline)
      .sort((a, b) => (a[0].price || 9e9) - (b[0].price || 9e9));
    let sent = 0;
    for (const [l, kind] of alerts.slice(0, MAX_ALERTS)) {
      try { await sendAlert(l, kind); sent++; } catch (e) { log('telegram:', e.message); }
      await new Promise((r) => setTimeout(r, 400));
    }
    if (alerts.length > MAX_ALERTS || failed.length) {
      await sendSummary(`Radar: ${news.length} altas, ${drops.length} bajadas, ${removed.length} retiradas. Enviadas ${sent}/${alerts.length} alertas.${failed.length ? `\n⚠️ Fuentes con fallo: ${failed.join('; ')}` : ''}`).catch(() => {});
    }
  } else {
    log('Telegram no configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID): no se envían alertas');
  }
} else {
  for (const e of [...news, ...drops].slice(0, 30)) log(e.type, next[e.key]?.muni, next[e.key]?.price, next[e.key]?.url);
  for (const e of removed.slice(0, 30)) log('removed', e.key, prev[e.key]?.muni, prev[e.key]?.url);
}

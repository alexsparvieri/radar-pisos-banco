// Geocodificación de los anuncios que llegan sin coordenadas (Aliseda, Servihabitat, Unicaja, Bankinter),
// con Nominatim (OpenStreetMap): 1 petición por segundo, resultado guardado en el propio listing
// (lat, lng, geo: 'calle' | 'municipio'). Si la calle no se resuelve, se usa el centroide del municipio.
import { sleep } from '../http.js';
import { MUNICIPIOS } from '../zona.js';

const UA = 'radar-pisos-banco/0.1 (uso personal; contacto: alexsparvieri@hotmail.com)';
const byName = new Map(MUNICIPIOS.map((m) => [m.name, m]));

function direccionDe(l) {
  const t = l.addr || (l.title || '').replace(/^.*? en (venta en )?/i, '').replace(/,\s*(Tarragona|Barcelona)\s*$/i, '');
  // quitar el municipio del final si está repetido y limpiar puntos suspensivos
  return t.replace(new RegExp(`,\\s*${(l.muni || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').replace(/\.\.\./g, '').trim();
}

export async function geocodificarPendientes(listings, { max = parseInt(process.env.GEOCODE_MAX || '150', 10), log = console.log } = {}) {
  const pend = Object.values(listings).filter((l) => !l.removed && (l.lat == null || l.lng == null) && !l.geo).slice(0, max);
  if (!pend.length) return 0;
  let calle = 0, muni = 0;
  for (const l of pend) {
    const dir = direccionDe(l);
    let hit = null;
    if (dir && dir.length > 4 && !/^(piso|casa|vivienda|terreno|chalet)/i.test(dir)) {
      try {
        const q = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'es', street: dir, city: l.muni, county: '', state: 'Cataluña' });
        const r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'es' }, signal: AbortSignal.timeout(20000) });
        if (r.ok) { const j = await r.json(); if (j[0]) hit = j[0]; }
      } catch { /* sin resultado */ }
      await sleep(1100);
    }
    if (hit) { l.lat = +hit.lat; l.lng = +hit.lon; l.geo = 'calle'; calle++; }
    else { const m = byName.get(l.muni); if (m) { l.lat = m.lat; l.lng = m.lng; l.geo = 'municipio'; muni++; } else { l.geo = 'sin'; } }
  }
  log(`[geocode] ${pend.length} anuncios: ${calle} por calle, ${muni} por centroide de municipio`);
  return pend.length;
}

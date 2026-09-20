// Geocodificación de los anuncios que llegan sin coordenadas (Aliseda, Servihabitat, Unicaja, Bankinter).
// Primario: Photon (komoot, OpenStreetMap) con sesgo hacia la zona; se acepta el resultado solo si el municipio
// devuelto coincide con el del anuncio. Si no hay calle utilizable o no coincide, se usa el centroide del municipio
// (geo: 'municipio', que la web marca como aproximado). Máximo 1 petición por segundo.
import { sleep } from '../http.js';
import { MUNICIPIOS, norm } from '../zona.js';

const UA = 'radar-pisos-banco/0.1 (uso personal; contacto: alexsparvieri@hotmail.com)';
const byName = new Map(MUNICIPIOS.map((m) => [m.name, m]));

export function direccionDe(l) {
  let t = l.addr || (l.title || '').replace(/^.*? en (venta en )?/i, '');
  t = t.replace(/,\s*(Tarragona|Barcelona)\s*$/i, '').replace(/\.\.\./g, '');
  if (l.muni) t = t.replace(new RegExp(`,\\s*${l.muni.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
  return t.replace(/\s+/g, ' ').trim();
}

async function photon(q, m) {
  const p = new URLSearchParams({ q, limit: '3', bbox: '0.85,40.85,2.45,41.85' }); // solo dentro de la zona (evita "Barcelona, Venezuela")
  if (m?.lat) { p.set('lat', m.lat); p.set('lon', m.lng); }
  const r = await fetch(`https://photon.komoot.io/api/?${p}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (r.status === 429) throw new Error('429');
  if (!r.ok) return null;
  const j = await r.json();
  return j.features || [];
}

export async function geocodificarPendientes(listings, { max = parseInt(process.env.GEOCODE_MAX || '150', 10), log = console.log } = {}) {
  const pend = Object.values(listings).filter((l) => !l.removed && (l.lat == null || l.lng == null) && !l.geo).slice(0, max);
  if (!pend.length) return 0;
  let calle = 0, muni = 0, fallos = 0;
  for (const l of pend) {
    const m = byName.get(l.muni);
    const dir = direccionDe(l);
    let hit = null;
    if (dir && dir.length > 4 && !/^(piso|casa|vivienda|terreno|chalet|solar)\b/i.test(dir) && m) {
      try {
        const feats = await photon(`${dir}, ${l.muni}`, m);
        const wantMuni = norm(l.muni);
        hit = (feats || []).find((f) => {
          const p = f.properties || {};
          const [lng, lat] = f.geometry?.coordinates || [];
          if (!(lat > 40.85 && lat < 41.85 && lng > 0.85 && lng < 2.45)) return false;
          const cand = [p.city, p.town, p.village, p.county, p.district, p.locality, p.name].filter(Boolean).map(norm);
          return cand.some((c) => c === wantMuni || c.includes(wantMuni) || wantMuni.includes(c)) && ['street', 'house', 'residential', 'living_street', 'pedestrian', 'tertiary', 'secondary', 'primary', 'unclassified', 'steps', 'footway', 'track', 'service', 'road', 'quarter', 'neighbourhood', 'suburb', 'hamlet', 'plot', 'construction'].includes(p.osm_value);
        });
      } catch (e) {
        fallos++;
        if (e.message === '429') { log('[geocode] Photon limita las peticiones: se para hasta la próxima corrida'); break; }
      }
      await sleep(1000);
    }
    if (hit) { l.lng = +hit.geometry.coordinates[0].toFixed(6); l.lat = +hit.geometry.coordinates[1].toFixed(6); l.geo = 'calle'; calle++; }
    else if (m) { l.lat = m.lat; l.lng = m.lng; l.geo = 'municipio'; muni++; }
    else { l.geo = 'sin'; }
  }
  log(`[geocode] ${pend.length} anuncios: ${calle} por calle, ${muni} por centroide de municipio, ${fallos} errores`);
  return pend.length;
}

// fotocasa (Adevinta). Portal generalista: agencias, bancos y particulares. La página de resultados lleva los
// anuncios embebidos como JSON (30 por página) con indicadores muy útiles para las reglas del catálogo:
// isOccupied, isBareOwnership (nuda propiedad), isAuctioned, isRentedWithTenants. Habitaclia comparte la misma
// base de anuncios, por eso no se rastrea aparte. Se consulta por comarca con tope de precio en la URL.
import { http, sleep, toNum } from '../http.js';
import { MAX_PRICE } from '../rules.js';

const BASE = 'https://www.fotocasa.es';
export const COMARCAS = ['baix-penedes', 'alt-penedes', 'garraf', 'anoia', 'baix-llobregat', 'barcelones', 'valles-occidental', 'alt-camp', 'tarragones', 'conca-de-barbera', 'bages'];
const TIPO = { Flat: 'Piso', Apartment: 'Apartamento', Penthouse: 'Ático', Duplex: 'Dúplex', Studio: 'Estudio', Loft: 'Loft', GroundFloor: 'Planta baja', House: 'Casa', Chalet: 'Chalet', TerracedHouse: 'Casa adosada', SemidetachedHouse: 'Casa pareada', CountryHouse: 'Casa rural', Villa: 'Chalet', Land: 'Terreno', Residential: 'Terreno residencial', Urban: 'Suelo urbano' };

/** Extrae el array JSON de anuncios embebido en el HTML (empieza por [{"accuracy"...). */
export function extractAds(html) {
  const start = html.indexOf('[{"accuracy"');
  if (start < 0) return [];
  let depth = 0, inStr = false, esc = false, i = start;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '[' || c === '{') depth++; else if (c === ']' || c === '}') { depth--; if (depth === 0) break; }
  }
  try { return JSON.parse(html.slice(start, i + 1)); } catch { return []; }
}

export function mapAd(a, cat) {
  const f = Object.fromEntries((a.features || []).map((x) => [x.key, x.value]));
  const type = cat === 'terreno' ? (TIPO[a.buildingSubtype] || 'Terreno') : (TIPO[a.buildingSubtype] || TIPO[a.buildingType] || 'Vivienda');
  const imgs = (a.multimedia || []).filter((m) => m.type === 'image').map((m) => m.src).slice(0, 12);
  const flags = [];
  if (a.isOccupied) flags.push('Ocupado');
  if (a.isBareOwnership) flags.push('Nuda propiedad');
  if (a.isAuctioned) flags.push('Subasta');
  if (a.isRentedWithTenants) flags.push('Alquilado con inquilinos');
  if (a.isNewConstruction) flags.push('Obra nueva');
  if (a.reducedPrice) flags.push('Rebajado');
  if (a.clientAlias) flags.push(`Anuncia: ${a.clientAlias}`);
  const detail = a.detail?.['es-ES'] || Object.values(a.detail || {})[0] || '';
  const addr = a.address || {};
  return {
    src: 'Fotocasa', id: String(a.id), url: BASE + detail,
    title: `${type} en ${addr.district ? addr.district + ', ' : ''}${addr.municipality || ''}`,
    type, cat, town: addr.municipality || addr.city || '', prov: addr.province || '',
    price: a.rawPrice || toNum(a.price) || null, priceOld: a.reducedPrice ? toNum(a.reducedPrice) : null,
    m2: f.surface || null, rooms: f.rooms || null, baths: f.bathrooms || null,
    img: imgs[0] || null, imgs, lat: a.coordinates?.latitude ?? null, lng: a.coordinates?.longitude ?? null,
    flags, desc: (a.description || '').slice(0, 600), agency: a.clientAlias || null,
  };
}

export async function fetchFotocasa(log = console.log) {
  const out = new Map();
  for (const [seccion, cat] of [['viviendas', 'vivienda'], ['terrenos-residenciales', 'terreno']]) for (const c of COMARCAS) {
    let total = null;
    for (let page = 1; page <= 200; page++) {
      const url = `${BASE}/es/comprar/${seccion}/${c}/todas-las-zonas/l${page > 1 ? '/' + page : ''}?maxPrice=${MAX_PRICE}`;
      let html;
      try { html = await http(url, { timeout: 40000 }); } catch (e) { log(`[fotocasa] ${seccion} ${c} pág ${page}: ${e.message}`); break; }
      if (page === 1) total = toNum((html.match(/([\d.]+)\s+(Casas y pisos|anuncios|Terrenos)/) || [])[1]);
      const ads = extractAds(html);
      let nuevos = 0;
      for (const a of ads) { const l = mapAd(a, cat); if (!out.has(l.id)) nuevos++; out.set(l.id, l); }
      if (page === 1 || page % 10 === 0) log(`[fotocasa] ${seccion} ${c} pág ${page}: ${ads.length} (total ${total})`);
      if (ads.length < 25 || nuevos === 0 || (total && page * 30 >= total)) break;
      await sleep(300);
    }
  }
  return [...out.values()];
}

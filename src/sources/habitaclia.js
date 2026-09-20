// Habitaclia (Adevinta; comparte base de anuncios con fotocasa). Portal generalista: agencias y particulares.
// La página de resultados lleva los anuncios embebidos en window.__INITIAL_PROPS__ (30 por página, con
// descripción, coordenadas, fotos y editor). Se consulta por comarca con tope de precio en la URL.
import { http, sleep } from '../http.js';
import { MAX_PRICE } from '../rules.js';

const BASE = 'https://www.habitaclia.com';
export const COMARCAS = [
  'tarragona-provincia/baix-penedes', 'tarragona-provincia/alt-camp', 'tarragona-provincia/tarragones', 'tarragona-provincia/conca-de-barbera',
  'barcelona-provincia/alt-penedes', 'barcelona-provincia/garraf', 'barcelona-provincia/anoia', 'barcelona-provincia/baix-llobregat',
  'barcelona-provincia/barcelones', 'barcelona-provincia/valles-occidental', 'barcelona-provincia/bages',
];
const TIPO = { flat: 'Piso', apartment: 'Apartamento', penthouse: 'Ático', duplex: 'Dúplex', studio: 'Estudio', loft: 'Loft', house: 'Casa', chalet: 'Chalet', terracedHouse: 'Casa adosada', semiDetachedHouse: 'Casa pareada', countryHouse: 'Casa rural', villa: 'Chalet', groundFloor: 'Planta baja', land: 'Terreno' };

export function parsePage(html) {
  const i = html.indexOf('window.__INITIAL_PROPS__');
  if (i < 0) throw new Error('sin __INITIAL_PROPS__');
  const s = html.indexOf('JSON.parse("', i) + 11;
  let e = s + 1;
  for (; e < html.length; e++) { if (html[e] === '\\') { e++; continue; } if (html[e] === '"') break; }
  const j = JSON.parse(JSON.parse(html.slice(s, e + 1)));
  const ctx = j.initialSearchResultsPage.initialSearchContext;
  return { items: ctx.results.items || [], pagination: ctx.results.pagination || {} };
}

export function mapItem(x) {
  const sm = x.summary || {}, loc = sm.location || {}, p = x.property || {}, tr = x.transaction || {};
  const imgs = (sm.multimedia?.images || []).map((im) => im.url).filter(Boolean).slice(0, 12);
  const type = TIPO[p.propertySubtype] || TIPO[p.propertyType] || p.propertySubtype || 'Vivienda';
  const street = loc.address?.streetName && loc.address.streetName !== 'N/A' ? `${loc.address.streetName}${loc.address.streetNumber ? ' ' + loc.address.streetNumber : ''}` : (loc.district || '');
  const flags = [];
  if (x.kind === 'newConstruction') flags.push('Obra nueva');
  if (tr.price?.priceDrop) flags.push('Rebajado');
  if (sm.publisher?.name) flags.push(`Anuncia: ${sm.publisher.tradeName || sm.publisher.name}`);
  return {
    src: 'Habitaclia', id: String(x.legacyNumericId || x.id),
    url: BASE + (x.navigationUrl || '').split('?')[0],
    title: sm.title || `${type} en ${street}, ${loc.municipality}`,
    type, cat: p.propertyType === 'land' ? 'terreno' : 'vivienda',
    town: loc.municipality || '', prov: loc.province || '',
    price: tr.price?.amount || null,
    priceOld: tr.price?.priceDrop?.previousPrice || null,
    m2: p.builtSurface || p.landArea || null, rooms: p.rooms || null, baths: p.bathrooms || null,
    img: imgs[0] || null, imgs,
    lat: loc.coordinates?.latitude ?? null, lng: loc.coordinates?.longitude ?? null,
    flags, desc: (sm.description || '').slice(0, 600), addr: street, agency: sm.publisher?.tradeName || sm.publisher?.name || null,
  };
}

export async function fetchHabitaclia(log = console.log) {
  const out = new Map();
  for (const c of COMARCAS) {
    let total = null;
    for (let page = 1; page <= 200; page++) {
      const url = `${BASE}/comprar/viviendas/${c}/s${page > 1 ? '/' + page : ''}?maxPrice=${MAX_PRICE}`;
      let parsed;
      try { parsed = parsePage(await http(url, { timeout: 40000 })); } catch (e) { log(`[habitaclia] ${c} pág ${page}: ${e.message}`); break; }
      for (const x of parsed.items) { const l = mapItem(x); out.set(l.id, l); }
      total = parsed.pagination.totalCount;
      if (page === 1 || page % 10 === 0) log(`[habitaclia] ${c} pág ${page}/${parsed.pagination.totalPages}: ${parsed.items.length} (total ${total})`);
      if (!parsed.items.length || page >= (parsed.pagination.totalPages || 1)) break;
      await sleep(250);
    }
  }
  return [...out.values()];
}

// pisos.com (Vocento). Portal generalista: agencias y particulares. HTML servidor con tarjetas .ad-preview
// (30 por página) y JSON-LD con coordenadas. Se consulta por comarca con tope de precio en la URL
// (el portal cuela algún anuncio destacado por encima del tope: lo filtran las reglas del catálogo).
import * as cheerio from 'cheerio';
import { http, sleep, toNum } from '../http.js';
import { MAX_PRICE } from '../rules.js';

const BASE = 'https://www.pisos.com';
export const COMARCAS = ['baix_penedes', 'alt_penedes', 'garraf', 'anoia', 'baix_llobregat', 'barcelones', 'valles_occidental', 'alt_camp', 'tarragones', 'conca_de_barbera', 'bages'];

export function parsePage(html, cat) {
  const $ = cheerio.load(html);
  const geo = new Map();
  $('script[type="application/ld+json"]').each((_, s) => {
    try { const j = JSON.parse($(s).html()); if (j.url && j.geo) geo.set(j.url, { lat: toNum(j.geo.latitude), lng: toNum(j.geo.longitude), img: j.image }); } catch { /* ignorar */ }
  });
  const out = [];
  $('.ad-preview').each((_, el) => {
    const a = $(el);
    const link = a.find('a.ad-preview__title').first();
    const href = link.attr('href');
    if (!href) return;
    const id = href.match(/-(\d+_\d+)\/?$/)?.[1] || href;
    const title = link.text().replace(/\s+/g, ' ').trim();
    const sub = a.find('.ad-preview__subtitle').first().text().replace(/\s+/g, ' ').trim();
    const chars = a.find('.ad-preview__char').map((_, x) => $(x).text().replace(/\s+/g, ' ').trim()).get();
    const m2 = toNum(chars.find((c) => /m²/.test(c))?.replace(/m².*/, ''));
    const rooms = toNum(chars.find((c) => /hab/.test(c)));
    const baths = toNum(chars.find((c) => /bañ/.test(c)));
    const imgs = [...new Set(a.find('.carousel img').map((_, x) => $(x).attr('src') || $(x).attr('data-src')).get().filter(Boolean))].slice(0, 12);
    const tags = a.find('[class*="product-tag"], .product-badge, .ad-preview__suggested').map((_, x) => $(x).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);
    const desc = a.find('.ad-preview__description').first().text().replace(/\s+/g, ' ').trim().slice(0, 600);
    const g = geo.get(href) || {};
    // subtítulo "Zona, Municipio" o "Municipio": el municipio es el último tramo
    const town = sub.split(',').pop()?.trim() || '';
    const type = title.split(' en ')[0].trim() || (cat === 'terreno' ? 'Terreno' : 'Vivienda');
    out.push({
      src: 'pisos.com', id, url: BASE + href, title: title + (sub ? `, ${sub}` : ''), type, cat, town, prov: '',
      price: toNum(a.find('.ad-preview__price').first().text()), priceOld: null, m2, rooms, baths,
      img: imgs[0] || g.img || null, imgs, lat: g.lat ?? null, lng: g.lng ?? null,
      flags: tags.filter((t) => !/más caro|más barato/i.test(t)), desc,
    });
  });
  const total = toNum((html.match(/([\d.]+)\s+resultados/) || [])[1]);
  return { items: out, total };
}

export async function fetchPisos(log = console.log) {
  const out = new Map();
  for (const [seccion, cat] of [['pisos', 'vivienda'], ['terrenos', 'terreno']]) for (const c of COMARCAS) {
    let total = null;
    for (let page = 1; page <= 100; page++) {
      const url = `${BASE}/venta/${seccion}-${c}/hasta-${MAX_PRICE}/${page > 1 ? page + '/' : ''}`;
      let r;
      try { r = parsePage(await http(url, { timeout: 40000 }), cat); } catch (e) { log(`[pisos.com] ${seccion} ${c} pág ${page}: ${e.message}`); break; }
      if (page === 1) total = r.total;
      let nuevos = 0;
      for (const l of r.items) { if (!out.has(l.id)) nuevos++; out.set(l.id, l); }
      if (page === 1 || page % 10 === 0) log(`[pisos.com] ${seccion} ${c} pág ${page}: ${r.items.length} (total ${total})`);
      if (r.items.length < 25 || nuevos === 0 || (total && page * 30 >= total)) break;
      await sleep(300);
    }
  }
  return [...out.values()];
}

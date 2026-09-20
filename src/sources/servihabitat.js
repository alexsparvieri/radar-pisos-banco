// Servihabitat (CaixaBank / Lone Star; comercializa también Kutxabank y Sareb).
// Liferay con HTML servidor: /es/venta/vivienda/{provincia-comarca}?delta=20&start=N (start = nº de página).
// Cada tarjeta .product-item lleva spans GTM ocultos con m2, habitaciones, baños y municipio.
import * as cheerio from 'cheerio';
import { http, sleep, toNum } from '../http.js';

const BASE = 'https://www.servihabitat.com';
// Comarcas de la zona tal como las nombra Servihabitat en la URL
export const ZONAS = [
  'tarragona-baixpenedes', 'tarragona-altcamp', 'tarragona-tarragones', 'tarragona-tarragonaciudad', 'tarragona-concadebarbera',
  'barcelona-altpenedes', 'barcelona-anoia', 'barcelona-baixllobregat', 'barcelona-barcelones',
  'barcelona-garraf', 'barcelona-vallesoccidental', 'barcelona-bages',
];

export async function fetchServihabitat(log = console.log) {
  const out = [];
  for (const zona of ZONAS) {
    let total = null;
    for (let start = 1; start <= 30; start++) {
      const html = await http(`${BASE}/es/venta/vivienda/${zona}?delta=20&start=${start}`);
      const $ = cheerio.load(html);
      if (start === 1) total = toNum($('.product-list').attr('data-total'));
      const items = $('.product-item');
      items.each((_, el) => {
        const g = (k) => $(el).find(`span[gtm="${k}"]`).attr('gtm-value') || null;
        const a = $(el).find('a[href*="/es/venta/"]').first();
        const text = $(el).text().replace(/\s+/g, ' ');
        const prices = [...text.matchAll(/([\d.]{4,})\s*€/g)].map((m) => toNum(m[1]));
        const title =
          (text.match(/((Casa|Piso|Vivienda|Ático|Dúplex|Planta baja|Estudio|Loft|Chalet)[^€]*? en venta en [^€]*?, (Tarragona|Barcelona))/i) ||
            text.match(/(Promoción en [^€]*?, (Tarragona|Barcelona))/i) || [])[1] || text.slice(0, 120).trim();
        let town = (g('location-town') || '').replace(/^(.*),\s*(el|la|l'|els|les)$/i, '$2 $1');
        const flags = (text.match(/En rentabilidad|Llaves no disponibles|Sin posesión|Precio negociable|Incluye otros inmuebles|Promoción comercial|Novedad/gi) || [])
          .map((s) => s.trim()).filter((v, i, arr) => arr.indexOf(v) === i);
        if (g('product-without-posession')) flags.push('Sin posesión');
        const extra = (g('product-extra') || '').replace(/[\[\]]/g, '');
        if (extra) flags.push(extra);
        const img = $(el).find('img.img-car, img[src*="imagenes.servihabitat.com"], img[data-src]').first();
        out.push({
          src: 'Servihabitat',
          id: $(el).attr('data-id'),
          url: a.attr('href') ? BASE + a.attr('href').split('#')[0] : `${BASE}/es/venta/vivienda/${zona}`,
          title,
          type: title.split(' en venta')[0],
          town,
          prov: zona.startsWith('tarragona') ? 'Tarragona' : 'Barcelona',
          price: prices[0] ?? null,
          priceOld: prices[1] && prices[1] > prices[0] ? prices[1] : null,
          m2: toNum(g('product-m2')),
          rooms: toNum(g('product-room-num')) || null,
          baths: toNum(g('product-bath-num')) || null,
          img: (img.attr('data-src') || img.attr('src') || null)?.replace('/w450-h/', '/w800-h/') || null,
          lat: null,
          lng: null,
          flags,
          area: g('location-area'),
        });
      });
      log(`[servihabitat] ${zona} pág ${start}: ${items.length} (total ${total})`);
      if (items.length < 20) break;
      await sleep(300);
    }
  }
  return out;
}

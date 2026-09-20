// Aliseda Inmobiliaria (Anticipa/Blackstone; activos ex-Santander/Popular y comercializador de Sareb).
// Web Angular con SSR: el HTML de /comprar-viviendas/cataluna/{provincia}?page=N ya trae las tarjetas.
import * as cheerio from 'cheerio';
import { http, sleep, toNum } from '../http.js';

const BASE = 'https://www.alisedainmobiliaria.com';
const PROVINCIAS = ['tarragona', 'barcelona'];

export async function fetchAliseda(log = console.log) {
  const out = [];
  for (const [seccion, cat] of [['comprar-viviendas', 'vivienda'], ['comprar-terrenos', 'terreno']]) for (const prov of PROVINCIAS) {
    let total = null;
    for (let page = 1; page <= 200; page++) {
      const html = await http(`${BASE}/${seccion}/cataluna/${prov}${page > 1 ? `?page=${page}` : ''}`);
      const $ = cheerio.load(html);
      if (page === 1) total = toNum(($('body').text().match(/(\d[\d.]*)\s+(Viviendas|Terrenos)/) || [])[1]);
      const cards = $('article.container-card');
      cards.each((_, el) => {
        const a = $(el).find('a.card').first();
        const href = a.attr('href') || '';
        const title = $(el).find('.card__title').text().replace(/\s+/g, ' ').trim();
        const chars = {};
        $(el).find('.card__characteristics > span').each((_, s) => {
          chars[$(s).find('b').text().trim()] = $(s).find('div').text().trim();
        });
        const parts = title.split(',').map((s) => s.trim());
        const town = parts.length >= 2 ? parts[parts.length - 2] : '';
        // la tarjeta SSR trae las primeras ~5 fotos del carrusel; el CDN alisedaassets.com rechaza el hotlink,
        // así que nos quedamos con la imagen original en Google Storage
        const raw = $(el).find('img.gallery__carousel-image, img[class*=carousel]').map((_, im) => $(im).attr('src') || $(im).attr('ngsrc') || '').get();
        const imgs = [...new Set(raw.map((u) => u.replace(/^https:\/\/alisedaassets\.com\/cdn-cgi\/image\/[^/]+\//, '')).filter((u) => /^https?:/.test(u)))].slice(0, 12);
        const img = imgs[0] || null;
        const flags = [];
        const camp = $(el).find('.campaigns').text().replace(/\s+/g, ' ').trim();
        if (camp) flags.push(camp);
        const feat = $(el).find('.card__features').text().replace(/\s+/g, ' ').trim();
        if (/sin posesi|ocupad/i.test(feat + ' ' + camp)) flags.push('Sin posesión');
        if (/VPO|protecci/i.test(a.attr('title') || '')) flags.push('VPO');
        if (/obra nueva/i.test(a.attr('title') || '')) flags.push('Obra nueva');
        out.push({
          src: 'Aliseda',
          id: href.split('/').pop().split('?')[0],
          url: BASE + href,
          title,
          type: title.split(' en ')[0],
          cat,
          town,
          prov: prov === 'tarragona' ? 'Tarragona' : 'Barcelona',
          price: toNum($(el).find('.card__price--bold').first().text()),
          priceOld: toNum($(el).find('.card__price--line-through').first().text()),
          m2: toNum(chars['Sup. Total']),
          rooms: toNum(chars['Habit.']),
          baths: toNum(chars['Baños']),
          img,
          imgs,
          lat: null,
          lng: null,
          flags,
          desc: (a.attr('title') || '').slice(0, 400),
        });
      });
      if (page % 10 === 1) log(`[aliseda] ${cat} ${prov} pág ${page}: ${cards.length} (total ${total})`);
      if (cards.length < 12) break;
      await sleep(300);
    }
  }
  return out;
}

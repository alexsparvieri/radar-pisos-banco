// Unicaja Inmuebles (GIA, Gestión de Inmuebles Adquiridos). Portal clásico (Struts): listado HTML por provincia
// sin precio; el precio, las habitaciones y la foto grande están en la ficha (una petición por inmueble).
// Poco stock en Cataluña (decenas), así que consultar todas las fichas es barato.
import * as cheerio from 'cheerio';
import { http, toNum, mapLimit } from '../http.js';

const BASE = 'https://unicajainmuebles.com';
const PROVINCIAS = [{ id: 8, nombre: 'Barcelona' }, { id: 43, nombre: 'Tarragona' }];
const EXCLUIR = /^(Local|Garaje|Oficina|Nave|Trastero|Almac[eé]n)/i;
const TERRENO = /solar|terreno|finca|parcela|suelo/i;

export async function fetchUnicaja(log = console.log) {
  const out = [];
  for (const p of PROVINCIAS) {
    const html = await http(`${BASE}/busquedaHeader.do?definitionName=inicio&tipoInmueble=8&tipoOperacion=1&provincia=${p.id}`);
    const $ = cheerio.load(html);
    let n = 0;
    $('.contenedorPromocion').each((_, el) => {
      const c = $(el);
      const val = (label) => c.find('label.titulo').filter((_, l) => $(l).text().trim().startsWith(label)).next('label.valor').first();
      const tipo = val('Tipo').text().trim();
      if (!tipo || EXCLUIR.test(tipo)) return;
      const ref = (c.find('a[href*="fichainmueble.do?referencia="]').attr('href') || '').match(/referencia=(\d+)/)?.[1];
      if (!ref) return;
      const town = (val('Municipio').attr('title') || val('Municipio').text()).trim();
      const img = c.find('img[src*="/unicaja/datos/"]').first().attr('src');
      out.push({
        src: 'Unicaja', id: ref, url: `${BASE}/fichainmueble.do?referencia=${ref}`,
        title: `${tipo} en ${town}`, type: tipo, cat: TERRENO.test(tipo) ? 'terreno' : 'vivienda', town, prov: p.nombre,
        price: null, priceOld: null, m2: toNum(val('Sup. Const.').text()) || null, rooms: null, baths: null,
        img: img ? BASE + img : null, imgs: [], lat: null, lng: null,
        flags: c.find('.rebajado, .marca_liquidacion').length ? ['Rebajado'] : [], cp: val('Código Postal').text().trim(),
      });
      n++;
    });
    log(`[unicaja] ${p.nombre}: ${n} viviendas/terrenos (de ${$('.contenedorPromocion').length} inmuebles)`);
  }
  await mapLimit(out, 3, async (l) => {
    try {
      const d = await http(l.url, { timeout: 20000, retries: 1 });
      const t = d.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&euro;/g, '€').replace(/\s+/g, ' ');
      l.price = toNum(t.match(/Compra\*?:\s*([\d.]+(?:,\d+)?)\s*€/)?.[1]) || null;
      l.rooms = toNum(t.match(/Habitaciones:\s*(\d+)/)?.[1]) || null;
      l.baths = toNum(t.match(/Baños:\s*(\d+)/)?.[1]) || null;
      l.m2 = l.m2 || toNum(t.match(/Const:\s*([\d.,]+)\s*m/)?.[1]) || null;
      const desc = t.match(/Descripción:\s*(.{0,400}?)(Calificación|Incidencia|Simulador|$)/)?.[1]?.trim();
      if (desc) { l.desc = desc; const calle = desc.match(/en la calle ([^.,]+)/i)?.[1]; if (calle) l.title = `${l.type} en ${calle.trim()}, ${l.town}`; }
      if (/PROINDIVISO/i.test(t)) l.flags.push('Proindiviso (parte del inmueble)');
      if (/CON INCIDENCIAS/i.test(t)) l.flags.push('Con incidencias');
      if (/ocupad|sin posesi/i.test(t)) l.flags.push('Sin posesión');
      const imgs = [...new Set([...d.matchAll(/src="(\/unicaja\/datos\/[^"]+_(?:250x150|208x150)\.(?:png|jpg))"/gi)].map((m) => BASE + m[1]))];
      if (imgs.length) { l.imgs = imgs.slice(0, 12); l.img = l.img || imgs[0]; }
    } catch { /* se queda con lo del listado */ }
  });
  return out;
}

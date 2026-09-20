// Altamira Inmuebles (doValue; activos de Santander, fondos y "cesión de remate" de subastas).
// API JSON interna: POST /nodejs/getResultados {buscador:{idGestion:1 (venta), idTipologia:1 (vivienda), idProvincia}, filtros:{pagina, limite}}
import { http, sleep, slug } from '../http.js';

const BASE = 'https://www.altamirainmuebles.com';
const PROVINCIAS = [{ id: 43, nombre: 'Tarragona' }, { id: 8, nombre: 'Barcelona' }];

export async function fetchAltamira(log = console.log) {
  const out = [];
  // idTipologia 1 = Pisos y Casas, 9 = Suelos (getTipologias)
  for (const [idTipologia, cat] of [[1, 'vivienda'], [9, 'terreno']]) for (const p of PROVINCIAS) {
    for (let pagina = 1; pagina <= 20; pagina++) {
      const body = {
        buscador: { idGestion: 1, idTipologia, idProvincia: p.id, idPoblacion: null, provincia: p.nombre },
        filtros: {
          obranueva: false, segundamano: false, order: 1, pagina, limite: '100', modoVisualizacion: 'L',
          cntxParamSubastasActivo: '1', cntxParamSubastasSarebActivo: '1', cntxParamSubastasCodSocsAAM: '1,2,7',
        },
      };
      const j = await http(`${BASE}/nodejs/getResultados`, { method: 'POST', body, json: true });
      const m = j.minifichas || [];
      for (const x of m) {
        const flags = (x.elementospromocionales || []).map((e) => e.etiqueta).filter(Boolean);
        if (x.subasta01) flags.push('Subasta');
        if (x.condicionesespeciales01) flags.push('Condiciones especiales');
        out.push({
          src: 'Altamira',
          id: x.referencia,
          url: x.cinmueble
            ? `${BASE}/venta-de-${slug(x.tipologia)}/${slug(x.provinciaurl || p.nombre)}/${slug(x.poblacionurl || x.poblacion)}/segunda-mano/${x.referencia}/${x.cinmueble}/1`
            : `${BASE}/venta-viviendas/${slug(p.nombre)}/`,
          title: `${x.tipologia} en ${x.calle || x.poblacion}, ${x.poblacion}`,
          type: x.tipologia,
          cat,
          town: x.poblacion,
          prov: p.nombre,
          price: x.preciovisible === 0 ? null : x.precio || null,
          priceOld: x.precioventaanterior > x.precio ? x.precioventaanterior : null,
          m2: x.superficie || null,
          rooms: x.numhab || null,
          baths: x.numbanos || null,
          img: x.fotos?.[0]?.urlfoto || null,
          imgs: (x.fotos || []).map((f) => f.urlfotogrande || f.urlfoto).filter(Boolean).slice(0, 12),
          lat: x.latitud ?? null,
          lng: x.longitud ?? null,
          flags,
          addr: x.calle || '',
        });
      }
      log(`[altamira] ${cat} ${p.nombre} pág ${pagina}: ${m.length} (total ${j.totalResultados})`);
      if (m.length < 100) break;
      await sleep(400);
    }
  }
  return out;
}

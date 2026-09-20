// Solvia (Intrum; ex Banco Sabadell, absorbió Haya/Casaktua; comercializa Ibercaja).
// API JSON interna descubierta desde la web Angular:
//   POST /api/inmuebles/v2/buscarInmuebles  {idProvincia, idPoblacion (código INE), idCategoriaTipoVivienda:"1"}
//     -> máx. 20 resultados, sin paginación utilizable (el servidor ignora numeroPagina).
//   GET  /api/inmuebles/v1/cercanos?filtro=(geo.latitud==LAT;geo.longitud==LNG)&tamanoPagina=N
//     -> hasta ~1000 inmuebles más cercanos al punto (todas las categorías), con geo e imágenes.
// Estrategia: consulta por municipio; si un municipio tiene >20 viviendas, se completa con "cercanos"
// desde su centroide y se filtra por poblacion.id.
import { http, sleep } from '../http.js';
import { MUNICIPIOS } from '../zona.js';

const BASE = 'https://www.solvia.es';

function fromList(x) {
  let img = (x.listaImagenesInmueble_vPC || [])[0] || (x.listaImagenesInmueble || [])[0] || (x.imagenBuscador && !/no-foto/.test(x.imagenBuscador) ? x.imagenBuscador : null);
  if (img && !/^https?:/.test(img)) img = 'https://cdnsolvproep.solvia.es/' + img.replace(/^\/+/, ''); // el endpoint "cercanos" devuelve rutas relativas
  const pobl = x.poblacion?.nombre || x.poblacion?.name || '';
  const tipo = x.tipoVivienda?.nombre || x.tipoVivienda?.name || 'Vivienda';
  const idVivienda = x.idVivienda ?? String(x.id).split('-')[0];
  const idPromocion = x.idPromocion ?? String(x.id).split('-')[1];
  const flags = [];
  if (x.situacionEspecial) flags.push('Situación especial');
  if (x.reservado || x.caracteristicas?.reservado) flags.push('Reservado');
  if (x.enSubasta || x.subasta) flags.push('Subasta');
  if (x.sinPosesion) flags.push('Sin posesión');
  if (x.campanya?.texto || x.campanya?.name) flags.push((x.campanya.texto || x.campanya.name).trim());
  if (x.novedad) flags.push('Novedad');
  if (x.idEstado === 1) flags.push('Obra nueva');
  if (x.reformar || x.caracteristicas?.reformar) flags.push('A reformar');
  const town = pobl.replace(/^(.*)\s*\((el|la|l'|els|les)\)$/i, '$2 $1').trim();
  return {
    src: 'Solvia',
    id: String(x.id),
    url: `${BASE}/es/propiedades/comprar/${slugify(tipo)}-${slugify(town)}-${idVivienda}-${idPromocion}`,
    title: x.tituloFicha || `${tipo} en ${x.direccion || town}, ${town}`,
    type: tipo,
    town,
    prov: x.provincia?.nombre || x.provincia?.name || '',
    price: x.mostrarPrecio === false ? null : (x.precio || null),
    priceOld: x.primerPrecioPublicacion && x.precio && x.primerPrecioPublicacion > x.precio ? x.primerPrecioPublicacion : null,
    m2: x.totalM2 || x.m2 || null,
    rooms: x.totalDormitorios || x.dormitorios || null,
    baths: x.totalBanyos || x.banyos || null,
    img: img ? img.replace(/\\/g, '/') : null,
    lat: x.geo?.latitud ?? null,
    lng: x.geo?.longitud ?? null,
    flags,
    addr: x.direccion || '',
  };
}

const slugify = (s) => (s || 'x').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

export async function fetchSolvia(log = console.log) {
  const out = new Map();
  let partial = [];
  for (const m of MUNICIPIOS) {
    try {
      const j = await http(`${BASE}/api/inmuebles/v2/buscarInmuebles`, {
        method: 'POST',
        json: true,
        body: { idProvincia: m.ine.slice(0, 2), idPoblacion: parseInt(m.ine, 10), idCategoriaTipoVivienda: '1' },
      });
      for (const x of j.inmuebles || []) out.set(String(x.id), fromList(x));
      if (j.paginacion?.hayPaginaSiguiente) partial.push({ ...m, total: j.paginacion.numeroTotalResultados });
    } catch (e) {
      log(`[solvia] ${m.name}: ${e.message}`);
    }
    await sleep(250);
  }
  // Completar municipios grandes con el endpoint geográfico
  for (const m of partial) {
    if (!m.lat) { log(`[solvia] ${m.name}: sin centroide, quedan ${m.total - 20} sin cubrir`); continue; }
    try {
      const n = Math.min(1000, Math.max(300, m.total * 6));
      const j = await http(`${BASE}/api/inmuebles/v1/cercanos?filtro=(geo.latitud==${m.lat};geo.longitud==${m.lng})&tamanoPagina=${n}`, { json: true, timeout: 60000 });
      let added = 0;
      for (const x of j.resultado || []) {
        if (String(x.categoriaTipoVivienda?.id) !== '1') continue;
        if (String(x.poblacion?.id) !== String(parseInt(m.ine, 10))) continue;
        if (!out.has(String(x.id))) { out.set(String(x.id), fromList(x)); added++; }
      }
      log(`[solvia] ${m.name}: ${m.total} declaradas, +${added} vía geo`);
    } catch (e) {
      log(`[solvia] geo ${m.name}: ${e.message}`);
    }
  }
  return [...out.values()];
}

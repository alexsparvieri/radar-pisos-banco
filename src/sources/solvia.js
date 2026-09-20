// Solvia (Intrum; ex Banco Sabadell, absorbió Haya/Casaktua; comercializa Ibercaja).
// API JSON interna descubierta desde la web Angular:
//   POST /api/inmuebles/v2/buscarInmuebles  {idProvincia, idPoblacion (código INE), idCategoriaTipoVivienda:"1"}
//     -> máx. 20 resultados, sin paginación utilizable (el servidor ignora numeroPagina).
//   GET  /api/inmuebles/v1/cercanos?filtro=(geo.latitud==LAT;geo.longitud==LNG)&tamanoPagina=N
//     -> hasta ~1000 inmuebles más cercanos al punto (todas las categorías), con geo e imágenes.
// Estrategia: consulta por municipio; si un municipio tiene >20 viviendas, se completa con "cercanos"
// desde su centroide y se filtra por poblacion.id.
import { http, mapLimit } from '../http.js';
import { MUNICIPIOS } from '../zona.js';

const BASE = 'https://www.solvia.es';

function fromList(x) {
  const fixUrl = (u) => (u && !/^https?:/.test(u) ? 'https://cdnsolvproep.solvia.es/' + u.replace(/^\/+/, '') : u)?.replace(/\\/g, '/'); // "cercanos" devuelve rutas relativas
  const imgs = (x.listaImagenesInmueble_vPC || x.listaImagenesInmueble || []).map((u) => fixUrl(typeof u === 'string' ? u : u.url)).filter(Boolean).slice(0, 12);
  let img = imgs[0] || (x.imagenBuscador && !/no-foto/.test(x.imagenBuscador) ? fixUrl(x.imagenBuscador) : null);
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
  // usoWeb 1 = ficha pública normal. Los activos de terceros (Cerberus/Divarian, Sareb…) llegan con usoWeb 2 y la web
  // de Solvia no publica su ficha ("Producto no encontrado"): el enlace útil es el listado del municipio.
  const provSlug = slugify(x.provincia?.nombre || x.provincia?.name || '');
  const conFicha = x.usoWeb == null || Number(x.usoWeb) === 1;
  if (!conFicha) flags.push('Sin ficha web en Solvia (solo por contacto, ref. ' + idVivienda + ')');
  return {
    src: 'Solvia',
    id: String(x.id),
    cat: String(x.categoriaTipoVivienda?.id) === '4' ? 'terreno' : 'vivienda',
    url: conFicha
      ? `${BASE}/es/propiedades/comprar/${slugify(tipo)}-${slugify(town)}-${idVivienda}-${idPromocion}`
      : `${BASE}/es/comprar/${String(x.categoriaTipoVivienda?.id) === '4' ? 'suelos' : 'viviendas'}/${provSlug}/${slugify(pobl)}`,
    title: x.tituloFicha || `${tipo} en ${x.direccion || town}, ${town}`,
    type: tipo,
    town,
    prov: x.provincia?.nombre || x.provincia?.name || '',
    price: x.mostrarPrecio === false ? null : (x.precio || null),
    priceOld: x.primerPrecioPublicacion && x.precio && x.primerPrecioPublicacion > x.precio ? x.primerPrecioPublicacion : null,
    m2: x.totalM2 || x.m2 || null,
    rooms: x.totalDormitorios || x.dormitorios || null,
    baths: x.totalBanyos || x.banyos || null,
    img: img || null,
    imgs,
    lat: x.geo?.latitud ?? null,
    lng: x.geo?.longitud ?? null,
    flags,
    addr: x.direccion || '',
  };
}

const slugify = (s) => (s || 'x').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

export async function fetchSolvia(log = console.log) {
  const out = new Map();
  const partial = [];
  const t0 = Date.now();
  // categoría 1 = Viviendas, 4 = Suelos
  const CATS = ['1', '4'];
  await mapLimit(MUNICIPIOS.flatMap((m) => CATS.map((cat) => ({ m, cat }))), 4, async ({ m, cat }) => {
    try {
      const j = await http(`${BASE}/api/inmuebles/v2/buscarInmuebles`, {
        method: 'POST',
        json: true,
        timeout: 20000,
        body: { idProvincia: m.ine.slice(0, 2), idPoblacion: parseInt(m.ine, 10), idCategoriaTipoVivienda: cat },
      });
      for (const x of j.inmuebles || []) out.set(String(x.id), fromList(x));
      if (j.paginacion?.hayPaginaSiguiente) partial.push({ ...m, cat, total: j.paginacion.numeroTotalResultados });
    } catch (e) {
      log(`[solvia] ${m.name} cat ${cat}: ${e.message}`);
    }
  });
  log(`[solvia] ${MUNICIPIOS.length} municipios × ${CATS.length} categorías en ${Math.round((Date.now() - t0) / 1000)}s; ${partial.length} con más de 20`);
  // Completar municipios grandes con el endpoint geográfico (devuelve los N inmuebles más cercanos al centroide)
  for (const m of partial) {
    if (!m.lat) { log(`[solvia] ${m.name}: sin centroide, quedan ${m.total - 20} sin cubrir`); continue; }
    try {
      // los N más cercanos al centroide incluyen inmuebles de municipios vecinos: hay que pedir bastantes más que el total
      const n = Math.min(1000, Math.max(500, m.total * 12));
      const j = await http(`${BASE}/api/inmuebles/v1/cercanos?filtro=(geo.latitud==${m.lat};geo.longitud==${m.lng})&tamanoPagina=${n}`, { json: true, timeout: 90000, retries: 1 });
      let added = 0;
      for (const x of j.resultado || []) {
        if (String(x.categoriaTipoVivienda?.id) !== m.cat) continue;
        if (String(x.poblacion?.id) !== String(parseInt(m.ine, 10))) continue;
        if (!out.has(String(x.id))) { const l = fromList(x); l.fromGeo = true; out.set(l.id, l); added++; }
      }
      log(`[solvia] ${m.name} cat ${m.cat}: ${m.total} declaradas, +${added} vía geo`);
    } catch (e) {
      log(`[solvia] geo ${m.name}: ${e.message}`);
    }
  }
  // El endpoint geográfico no trae fotos ni el indicador de "situación especial" (ocupado / judicial):
  // completar con la ficha básica (una llamada por inmueble) los que vienen de geo o no tienen foto.
  const pendientes = [...out.values()].filter((l) => !l.imgs?.length || l.fromGeo).slice(0, parseInt(process.env.SOLVIA_MAX_DETALLE || '1200', 10));
  let enriched = 0;
  await mapLimit(pendientes, 4, async (l) => {
    try {
      const d = await http(`${BASE}/api/inmuebles/v2/${l.id}/detalleBasico`, { json: true, timeout: 15000, retries: 1 });
      const imgs = (d.listaImagenesInmueblePc || []).map((i) => (i.url || '').replace(/\\/g, '/')).filter((u) => u && !/no-foto/.test(u)).slice(0, 12);
      const img = imgs[0] || (d.imagenBuscadorPc || d.imagenBuscador || '').replace(/\\/g, '/') || null;
      if (imgs.length) l.imgs = imgs;
      if (img && !/no-foto/.test(img) && !l.img) { l.img = img; enriched++; }
      const situ = d.enSituacionEspecial === true || d.enSituacionEspecial === '1' || d.enSituacionEspecial === 1;
      if (situ && !l.flags.includes('Situación especial')) l.flags.push('Situación especial');
      if (d.precio && !l.price && d.mostrarPrecio !== false) l.price = d.precio;
    } catch { /* se queda como está */ }
  });
  for (const l of out.values()) delete l.fromGeo;
  if (pendientes.length) log(`[solvia] fichas consultadas: ${pendientes.length}, fotos añadidas ${enriched}`);
  return [...out.values()];
}

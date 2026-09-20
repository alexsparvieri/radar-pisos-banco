// Reglas del catálogo: lo que NO entra en el radar. Se aplican a todas las fuentes en run.js.
// Cambiar aquí y correr `node scripts/rebaseline.js` para que el estado guardado quede coherente.

export const MAX_PRICE = 200000; // tope de precio (€). Sin precio publicado tampoco entra.

// Inmuebles que no se pueden comprar y disponer: ocupados, judiciales, alquilados, nuda propiedad, proindivisos…
export const EXCLUIR = /sin posesi|ocupad|possession|llaves no disponibles|no se puede visitar|sin acceso|cesi[oó]n de remate|situaci[oó]n especial|subasta|proindivis|pro indivis|indivis|nuda propiedad|usufruct|en rentabilidad|alquilad|inquilin|arrendad|con incidencias|obra parada|litigio|precario|okupa|derecho de superficie|sobre plano|vitalicio/i;

// Terrenos: solo urbanos (fuera rústicos, urbanizables sin desarrollar, no consolidados, agrícolas…)
export const TERRENO_NO_URBANO = /r[uú]stic|rural|agr[ií]col|agrari|urbanizable|no consolidad|no urbanizable|forestal|secano|regad[ií]o|olivar|vi[ñn]a|cultivo|finca r|huert|parcela r[uú]stica|sin desarrollar|sectorizad|programad|industrial/i;
export const TERRENO_URBANO = /urbano|solar|parcela urbana|residencial|edificable|construir/i;

export const TEXTO_REGLAS = {
  precio: `Precio máximo ${MAX_PRICE.toLocaleString('es-ES')} € (y mínimo 1.000 €, para descartar anuncios con precio de relleno)`,
  fuera: 'Fuera del catálogo: ocupados, sin posesión, sin acceso o sin visita, subastas y cesiones de remate, situación especial, alquilados/en rentabilidad, nuda propiedad, usufructos, proindivisos, con incidencias, obra parada y sobre plano',
  terrenos: 'Terrenos: solo suelo urbano o solares edificables (no rústicos, agrícolas ni urbanizables sin desarrollar)',
};

/** Devuelve el motivo de exclusión o null si el inmueble entra en el catálogo. */
export function motivoExclusion(l) {
  if (l.price == null || !(l.price >= 1000)) return 'sin precio'; // 0, 1 € o similares = precio de relleno del anunciante
  if (l.price > MAX_PRICE) return 'precio > tope';
  const texto = [l.title, l.type, ...(l.flags || []), l.desc || ''].join(' | ');
  if (EXCLUIR.test(texto)) return 'no disponible para comprar y disponer';
  if (l.cat === 'terreno') {
    if (TERRENO_NO_URBANO.test(texto) && !/urbano|solar/i.test(l.type || '')) return 'terreno no urbano';
  }
  return null;
}

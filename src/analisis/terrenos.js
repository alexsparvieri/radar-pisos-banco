// Análisis de fotos de terrenos con Claude: pendiente, dificultad de cimentación y estado de excavación.
// Es una ESTIMACIÓN visual orientativa (no sustituye un estudio geotécnico ni una visita). El resultado se
// guarda en listing.analisis y no se vuelve a pedir salvo que cambien las fotos.
//
// Requiere ANTHROPIC_API_KEY (o un perfil de `ant auth login`). Opcional: ANALISIS_MODEL (por defecto claude-opus-5),
// ANALISIS_EFFORT (low|medium|high; por defecto medium), ANALISIS_MAX (máx. terrenos por corrida; por defecto 120),
// ANALISIS_FOTOS (fotos por terreno; por defecto 4).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { mapLimit } from '../http.js';

export const MODEL = process.env.ANALISIS_MODEL || 'claude-opus-5';
const EFFORT = process.env.ANALISIS_EFFORT || 'medium';
const MAX_FOTOS = parseInt(process.env.ANALISIS_FOTOS || '4', 10);

export const analisisConfigurado = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const Resultado = z.object({
  fotos_del_terreno: z.boolean().describe('true si al menos una foto muestra el terreno real (no solo planos, mapas, renders o carteles)'),
  pendiente: z.enum(['llano', 'suave', 'moderada', 'fuerte', 'indeterminado']).describe('llano <3%, suave 3-10%, moderada 10-25%, fuerte >25%'),
  dificultad_cimentacion: z.enum(['baja', 'media', 'alta', 'indeterminado']).describe('por pendiente, roca aflorante, necesidad de muros de contención o de vaciado, acceso de maquinaria'),
  excavacion: z.enum(['hecha', 'parcial', 'no', 'indeterminado']).describe('hecha = movimiento de tierras, vaciado, zanjas o cimentación ya ejecutados; parcial = desbroce/explanación o inicio; no = terreno virgen'),
  estructuras: z.array(z.enum(['muro_contencion', 'cimientos', 'ruina', 'vallado', 'acceso_rodado', 'roca_aflorante', 'arbolado_denso'])).describe('elementos visibles'),
  notas: z.string().max(240).describe('1-2 frases en español con lo relevante para cimentar y edificar'),
  confianza: z.number().min(0).max(1),
});

const SYSTEM = `Eres un aparejador con experiencia en solares y geotecnia visual. Vas a ver fotos de un terreno en venta en Cataluña.
Evalúa solo lo que se ve; si las fotos no muestran el terreno (mapa, plano, render, cartel, calle sin el solar), marca fotos_del_terreno=false y todo 'indeterminado'.
Sé prudente: si dudas entre dos grados de pendiente, elige el peor. La dificultad de cimentación combina pendiente, roca, muros de contención necesarios, vaciados y acceso de maquinaria.
Excavación 'hecha' exige ver movimiento de tierras, vaciado, zanjas, zapatas o muros de cimentación ya ejecutados en ESTE solar.`;

async function bajarImagen(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const u = url.replace(/\?rule=original$/, '?rule=web_580x387_ar'); // fotocasa: versión más ligera
    const r = await fetch(u, { signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4.5 * 1024 * 1024 || buf.length < 2000) return null;
    return { type: 'image', source: { type: 'base64', media_type: type, data: buf.toString('base64') } };
  } catch { return null; } finally { clearTimeout(t); }
}

/** Analiza un terreno; devuelve el objeto analisis o null si no hay fotos utilizables. */
export async function analizarTerreno(client, l) {
  const urls = [...new Set([l.img, ...(l.imgs || [])].filter(Boolean))].slice(0, MAX_FOTOS);
  const imgs = (await Promise.all(urls.map(bajarImagen))).filter(Boolean);
  if (!imgs.length) return { sin_fotos: true, fecha: new Date().toISOString().slice(0, 10), modelo: MODEL };
  const texto = `Terreno en venta: ${l.title}. Municipio: ${l.muni || l.town || ''}. Superficie: ${l.m2 || '?'} m². Precio: ${l.price || '?'} €.${l.desc ? ` Descripción del anuncio: ${String(l.desc).slice(0, 500)}` : ''}\nAnaliza las ${imgs.length} fotos.`;
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: EFFORT, format: zodOutputFormat(Resultado) },
    messages: [{ role: 'user', content: [...imgs, { type: 'text', text: texto }] }],
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    return { indeterminado: true, motivo: response.stop_reason, fecha: new Date().toISOString().slice(0, 10), modelo: MODEL };
  }
  const r = response.parsed_output;
  return {
    fotos_del_terreno: r.fotos_del_terreno, pendiente: r.pendiente, dificultad: r.dificultad_cimentacion, excavacion: r.excavacion,
    estructuras: r.estructuras, notas: r.notas, confianza: r.confianza, fotos: imgs.length,
    fecha: new Date().toISOString().slice(0, 10), modelo: MODEL,
    tokens: { in: response.usage.input_tokens, out: response.usage.output_tokens },
  };
}

/** Analiza los terrenos del estado que aún no tienen análisis (o cuyas fotos cambiaron). Devuelve cuántos se analizaron. */
export async function analizarPendientes(listings, { max = parseInt(process.env.ANALISIS_MAX || '120', 10), log = console.log } = {}) {
  if (!analisisConfigurado()) { log('[analisis] sin ANTHROPIC_API_KEY: no se analizan fotos de terrenos'); return 0; }
  const firma = (l) => [l.img, ...(l.imgs || [])].filter(Boolean).slice(0, MAX_FOTOS).join('|');
  const pendientes = Object.values(listings)
    .filter((l) => !l.removed && l.cat === 'terreno' && (!l.analisis || (l.analisis.firma && l.analisis.firma !== firma(l))))
    .sort((a, b) => (a.price || 0) - (b.price || 0))
    .slice(0, max);
  if (!pendientes.length) return 0;
  const client = new Anthropic();
  let ok = 0, tokIn = 0, tokOut = 0;
  await mapLimit(pendientes, 3, async (l) => {
    try {
      const a = await analizarTerreno(client, l);
      a.firma = firma(l);
      l.analisis = a;
      if (a.tokens) { tokIn += a.tokens.in; tokOut += a.tokens.out; }
      ok++;
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) log('[analisis] límite de peticiones, se reintenta en la próxima corrida');
      else if (e instanceof Anthropic.AuthenticationError) log('[analisis] clave inválida');
      else log(`[analisis] ${l.key}: ${e.message}`);
    }
  });
  log(`[analisis] terrenos analizados: ${ok}/${pendientes.length} (modelo ${MODEL}, tokens ${tokIn} in / ${tokOut} out)`);
  return ok;
}

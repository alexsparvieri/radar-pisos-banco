// Analiza con Claude las fotos de los terrenos que aún no tienen análisis y regenera la web.
//   node --env-file=.env scripts/analizar.js            (hasta ANALISIS_MAX, por defecto 120)
//   node --env-file=.env scripts/analizar.js 500        (hasta 500)
import { loadListings, saveListings } from '../src/store.js';
import { analizarPendientes } from '../src/analisis/terrenos.js';
import { buildSite } from '../src/site/build.js';

const max = parseInt(process.argv[2] || process.env.ANALISIS_MAX || '120', 10);
const L = loadListings();
const total = Object.values(L).filter((l) => !l.removed && l.cat === 'terreno').length;
const sin = Object.values(L).filter((l) => !l.removed && l.cat === 'terreno' && !l.analisis).length;
console.log(`terrenos: ${total}, sin análisis: ${sin}, se analizan hasta ${max}`);
const n = await analizarPendientes(L, { max });
if (n) { saveListings(L); buildSite(L); }

// Marca todo el inventario actual como línea base (sin alertas ni "NUEVO"), aplica las reglas del catálogo
// al estado guardado (quita lo que ya no cumple: precio, ocupados, terrenos no urbanos…) y limpia la historia.
// Útil tras cambiar conectores, reglas o la zona, para no recibir una avalancha de falsas altas.
//   node scripts/rebaseline.js
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadListings, saveListings } from '../src/store.js';
import { motivoExclusion } from '../src/rules.js';

const L = loadListings();
const today = new Date().toISOString().slice(0, 10);
let n = 0, dropped = 0; const porMotivo = {};
for (const [k, l] of Object.entries(L)) {
  const motivo = l.removed ? 'retirado' : motivoExclusion(l);
  if (motivo) { delete L[k]; dropped++; porMotivo[motivo] = (porMotivo[motivo] || 0) + 1; continue; }
  l.baseline = true; l.firstSeen = l.firstSeen || today; l.misses = 0; delete l.prevPrice; delete l.dropPct; n++;
}
saveListings(L);
for (const f of ['history.jsonl', 'runs.jsonl']) { const p = path.join(ROOT, 'data', f); if (fs.existsSync(p)) fs.writeFileSync(p, ''); }
console.log(`baseline: ${n} inmuebles marcados, ${dropped} eliminados ${JSON.stringify(porMotivo)}, historia limpia`);

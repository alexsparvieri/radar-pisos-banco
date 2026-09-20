// Marca todo el inventario actual como línea base (sin alertas ni "NUEVO") y limpia la historia.
// Útil tras cambiar conectores o la zona, para no recibir una avalancha de falsas altas.
//   node scripts/rebaseline.js
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadListings, saveListings } from '../src/store.js';

const L = loadListings();
const today = new Date().toISOString().slice(0, 10);
let n = 0, dropped = 0;
for (const [k, l] of Object.entries(L)) {
  if (l.removed) { delete L[k]; dropped++; continue; }
  l.baseline = true; l.firstSeen = l.firstSeen || today; l.misses = 0; delete l.prevPrice; delete l.dropPct; n++;
}
saveListings(L);
for (const f of ['history.jsonl', 'runs.jsonl']) { const p = path.join(ROOT, 'data', f); if (fs.existsSync(p)) fs.writeFileSync(p, ''); }
console.log(`baseline: ${n} viviendas marcadas, ${dropped} retiradas eliminadas, historia limpia`);

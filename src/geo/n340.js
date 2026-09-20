// Clasifica un punto según de qué lado de la N-340 queda: 'mar' (entre la carretera y el mar) o 'interior'.
// La traza (data/n340.json) viene de OpenStreetMap: tramos de la N-340 y N-340a entre Tarragona y Barcelona.
// Entre Tarragona y El Vendrell la N-340 va pegada a la costa; desde El Vendrell sube por L'Arboç, Vilafranca,
// Sant Sadurní, Martorell y Molins de Rei hasta Barcelona, así que "hacia el mar" incluye el Garraf y el litoral
// del Baix Llobregat. El mar queda siempre al sureste de la traza en esta zona.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let SEGS = null;
function segs() {
  if (!SEGS) SEGS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'n340.json'), 'utf8')).segs;
  return SEGS;
}

const COS = Math.cos((41.25 * Math.PI) / 180); // escala longitud→km aprox. en la zona
const KM = 111.32;

/** Devuelve { lado: 'mar'|'interior', km } o null si no hay coordenadas. */
export function ladoN340(lat, lng) {
  if (lat == null || lng == null || !Number.isFinite(+lat) || !Number.isFinite(+lng)) return null;
  const px = +lng * COS, py = +lat;
  let best = null;
  for (const [la1, lo1, la2, lo2] of segs()) {
    const ax = lo1 * COS, ay = la1, bx = lo2 * COS, by = la2;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d2 = (px - cx) ** 2 + (py - cy) ** 2;
    if (!best || d2 < best.d2) best = { d2, ax, ay, dx, dy, cx, cy };
  }
  // normal "hacia el mar": la que apunta más al sureste (+lng, −lat)
  let nx = best.dy, ny = -best.dx;
  if (nx * 1 + ny * -1 < 0) { nx = -nx; ny = -ny; }
  const side = (px - best.cx) * nx + (py - best.cy) * ny;
  return { lado: side >= 0 ? 'mar' : 'interior', km: Math.round(Math.sqrt(best.d2) * KM * 10) / 10 };
}

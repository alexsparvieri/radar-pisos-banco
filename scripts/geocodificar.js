// Geocodifica de una vez todos los anuncios sin coordenadas (1 petición/segundo a Nominatim) y regenera la web.
//   node scripts/geocodificar.js [max]
import { loadListings, saveListings } from '../src/store.js';
import { geocodificarPendientes } from '../src/geo/geocode.js';
import { buildSite } from '../src/site/build.js';

const L = loadListings();
const max = parseInt(process.argv[2] || '100000', 10);
const n = await geocodificarPendientes(L, { max });
if (n) { saveListings(L); buildSite(L); }

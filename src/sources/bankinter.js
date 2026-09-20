// Bankinter — portal propio muy pequeño (CGI clásico, tabla HTML).
// GET /www/es-es/cgi/ebk+inmuebles+listado?codProvincia=43|08
// Su WAF devuelve 403 al fetch de Node (huella TLS) pero acepta curl, así que se usa curl.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';
import { toNum } from '../http.js';

const run = promisify(execFile);
const BASE = 'https://www.bankinter.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const PROVINCIAS = [{ cod: '43', nombre: 'Tarragona' }, { cod: '08', nombre: 'Barcelona' }];

async function curl(url) {
  const { stdout } = await run('curl', ['-sL', '-m', '30', '-A', UA, url], { maxBuffer: 20 * 1024 * 1024 });
  if (!stdout || stdout.length < 500) throw new Error('respuesta vacía');
  return stdout;
}

export async function fetchBankinter(log = console.log) {
  const out = [];
  for (const p of PROVINCIAS) {
    const url = `${BASE}/www/es-es/cgi/ebk+inmuebles+listado?codProvincia=${p.cod}`;
    const html = await curl(url);
    const $ = cheerio.load(html);
    let n = 0;
    $('tr').each((_, tr) => {
      const td = $(tr).find('td').map((_, c) => $(c).text().replace(/\s+/g, ' ').trim()).get();
      if (td.length < 7) return;
      const [, poblacion, tipo, direccion, m2, precio, hab, banos] = td;
      if (!/EUR/.test(precio || '')) return;
      const id = ($(tr).find('a[href^="javascript:verDetalle"]').attr('href') || '').match(/'(\d+)'/)?.[1] || `${p.cod}-${n}`;
      const town = titleCase(poblacion).replace(/^(.*)\s*\((el|la|l'|els|les)\)$/i, '$2 $1').trim();
      out.push({
        src: 'Bankinter', id, url, title: `${tipo} en ${direccion}, ${town}`, type: tipo, town, prov: p.nombre,
        price: toNum(precio), priceOld: null, m2: toNum(m2), rooms: toNum(hab) || null, baths: toNum(banos) || null,
        img: null, lat: null, lng: null, flags: [], addr: direccion,
      });
      n++;
    });
    log(`[bankinter] ${p.nombre}: ${n}`);
  }
  return out;
}

const titleCase = (s) => (s || '').toLowerCase().replace(/(^|\s|\()(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

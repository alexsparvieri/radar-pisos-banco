// Zona de interés: municipios entre El Vendrell y Barcelona, hasta ~40-50 km hacia el interior.
// Fuente de la lista: data/municipios.json (código INE, nombre, comarca, centroide).
// Para ampliar/reducir la zona basta editar ese archivo (o marcar una comarca como "límite").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MUNICIPIOS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'municipios.json'), 'utf8'));

const STOP = new Set(['el', 'la', 'els', 'les', 'l', 'd', 'de', 'del', 'dels', 'i', 'y', 'en']);
export const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .join(' ');

// Núcleos, barrios y grafías alternativas -> municipio (null = explícitamente fuera de zona)
const ALIAS = {
  'segur calafell': 'calafell', 'lleger': 'calafell',
  'sant vicenc calders': 'vendrell', 'coma ruga': 'vendrell', 'barri maritim sant salvador': 'vendrell', 'sant salvador': 'vendrell',
  'roquetes': 'sant pere ribes',
  'valldoreix': 'sant cugat valles', 'mira sol': 'sant cugat valles', 'floresta': 'sant cugat valles',
  'fonts': 'terrassa',
  'sant pere molanta': 'olerdola', 'moja': 'olerdola',
  'trencarroques castellet gornal': 'castellet gornal', 'rocallisa': 'castellet gornal', 'clariana': 'castellet gornal', 'sant marcal': 'castellet gornal', 'torrelletes': 'castellet gornal',
  'palau plegamans': 'palau solita plegamans',
  'cabrera igualada': 'cabrera anoia',
  'roda bara': 'roda bera',
  'sant vicens horts': 'sant vicenc horts',
  'hospitalet': 'hospitalet llobregat',
  'arbos': 'arboc',
  'montroig mont roig camp': null, 'vilaseca vila seca': null,
};

const byNorm = new Map(MUNICIPIOS.map((m) => [norm(m.name), m]));

/** Devuelve el municipio de la zona para un nombre de población (o null si queda fuera). */
export function municipioDe(town) {
  let n = norm(town);
  if (/^bcn\b/.test(n)) n = 'barcelona'; // distritos de Barcelona en Servihabitat ("Bcn-Eixample")
  if (ALIAS[n] !== undefined) {
    if (ALIAS[n] === null) return null;
    n = ALIAS[n];
  }
  return byNorm.get(n) || null;
}

export const esLimite = (comarca) => /límite/.test(comarca || '');

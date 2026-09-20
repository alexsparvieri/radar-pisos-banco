import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const LISTINGS = path.join(DATA, 'listings.json');
const HISTORY = path.join(DATA, 'history.jsonl');
const RUNS = path.join(DATA, 'runs.jsonl');

export function loadListings() {
  try { return JSON.parse(fs.readFileSync(LISTINGS, 'utf8')); } catch { return {}; }
}
export function saveListings(map) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(LISTINGS, JSON.stringify(map));
}
export function appendHistory(events) {
  if (!events.length) return;
  fs.appendFileSync(HISTORY, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
}
export function appendRun(info) {
  fs.appendFileSync(RUNS, JSON.stringify(info) + '\n');
}
export function readHistory(limit = 500) {
  try {
    const lines = fs.readFileSync(HISTORY, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch { return []; }
}

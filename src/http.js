// fetch con cabeceras de navegador, timeout y reintentos. Todos los portales respondieron
// con estas cabeceras desde fuera del navegador (curl) en la exploración del 20-sep-2026.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export async function http(url, { method = 'GET', body, headers = {}, timeout = 30000, retries = 2, json = false } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        body: body && typeof body !== 'string' ? JSON.stringify(body) : body,
        headers: {
          'User-Agent': UA,
          'Accept': json ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,ca;q=0.8',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return json ? await res.json() : await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const toNum = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[^\d,.]/g, '');
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+,\d+$/.test(s)) return parseFloat(s.replace(',', '.'));
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

export const slug = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

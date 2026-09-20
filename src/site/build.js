// Genera docs/index.html: web estática unificada (se publica con GitHub Pages).
// Es autocontenida: lleva los datos embebidos, filtros, orden, fotos y marca las altas recientes.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readHistory } from '../store.js';

export function buildSite(listings, log = console.log) {
  const all = Object.values(listings).filter((l) => !l.removed);
  const generated = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' (hora España)';
  const rows = all.map((o) => ({ s: o.src, u: o.url, t: o.title, ty: o.type, m: o.muni, c: o.comarca, p: o.price, po: o.priceOld || o.prevPrice || null, q: o.m2, r: o.rooms, b: o.baths, g: o.img, f: (o.flags || []).join(' | '), e: o.eur_m2, fs: o.baseline ? null : o.firstSeen, pd: o.dropPct || null }));
  const comarcas = [...new Set(rows.map((r) => r.c))].sort();
  const srcs = [...new Set(rows.map((r) => r.s))].sort();
  const events = readHistory(300).filter((e) => ['new', 'price_drop', 'price_up'].includes(e.type)).reverse().slice(0, 40)
    .map((e) => ({ ...e, l: listings[e.key] })).filter((e) => e.l && !e.l.removed)
    .map((e) => ({ type: e.type, date: e.date, t: e.l.title, m: e.l.muni, p: e.l.price, from: e.from, pct: e.pct, u: e.l.url, s: e.l.src }));
  const html = template({ rows, comarcas, srcs, generated, events });
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'index.html'), html);
  fs.writeFileSync(path.join(ROOT, 'docs', 'listings.json'), JSON.stringify(all));
  log(`[site] docs/index.html ${(html.length / 1024).toFixed(0)} KB, ${rows.length} viviendas`);
}

function template({ rows, comarcas, srcs, generated, events }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Radar Penedès–Barcelona</title>
<meta name="description" content="Viviendas de bancos y servicers a la venta entre Tarragona y Barcelona, hasta 50 km hacia el interior">
<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify({ name: 'Radar Penedès–Barcelona', short_name: 'Radar', start_url: './', display: 'standalone', background_color: '#f6f4ef', theme_color: '#0f6e56' }))}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#f6f4ef;--card:#fffdf8;--ink:#1f1d1a;--ink2:#5a554c;--mute:#8b857a;--line:#e3ded3;--accent:#0f6e56;--warn:#b7791f;--bad:#b3261e;--chip:#ece8df;--shadow:0 1px 2px rgba(31,29,26,.06)}
@media (prefers-color-scheme:dark){:root{--bg:#171613;--card:#1f1e1a;--ink:#f1ede4;--ink2:#b8b1a4;--mute:#857e72;--line:#332f29;--accent:#3fb28f;--warn:#e0a54a;--bad:#ef6b62;--chip:#2a2723;--shadow:none}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 "IBM Plex Sans",system-ui,sans-serif;padding-block:0 32px;padding-inline:16px}
.wrap{max-width:1280px;margin:0 auto}
header{display:flex;flex-wrap:wrap;gap:8px 24px;align-items:baseline;padding-block:22px 10px}
h1{font:600 clamp(26px,4vw,38px)/1.05 Fraunces,Georgia,serif;margin:0;letter-spacing:-.01em}
.sub{color:var(--ink2);font-size:14px}.sub b{color:var(--ink);font-weight:600}
.stats{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:var(--ink2);margin:6px 0 14px}.stats span b{font-family:"IBM Plex Mono",monospace;color:var(--ink)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;box-shadow:var(--shadow);position:sticky;top:env(safe-area-inset-top,0px);z-index:5}
.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 12px;align-items:end}
.filters label{display:flex;flex-direction:column;gap:4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.filters select,.filters input{font:14px "IBM Plex Sans",system-ui,sans-serif;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:7px 8px;min-width:0}
.filters input:focus,.filters select:focus{outline:2px solid var(--accent);outline-offset:1px}
.row2{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-top:10px;font-size:13px}.row2 label{display:flex;gap:6px;align-items:center;color:var(--ink2)}
.count{margin-left:auto;font-family:"IBM Plex Mono",monospace;color:var(--ink2)}
.events{margin-top:16px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:13px}
.events h2{font:600 15px Fraunces,Georgia,serif;margin:0 0 6px}.events li{list-style:none;padding:3px 0;border-top:1px dashed var(--line)}.events ul{margin:0;padding:0}
.events .k{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--mute);margin-right:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px;margin-top:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow)}
.card.new{outline:2px solid var(--accent);outline-offset:-1px}
.ph{aspect-ratio:4/3;max-width:100%;background:var(--chip);position:relative;display:block}.ph img{width:100%;height:100%;object-fit:cover;display:block}
.ph .none{position:absolute;inset:0;display:grid;place-items:center;color:var(--mute);font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.src{position:absolute;left:8px;top:8px;background:var(--card);color:var(--ink);font:600 11px/1 "IBM Plex Sans",sans-serif;padding:5px 7px;border-radius:4px;letter-spacing:.04em}
.newb{position:absolute;right:8px;top:8px;background:var(--accent);color:#fff;font:600 11px/1 "IBM Plex Sans",sans-serif;padding:5px 7px;border-radius:4px}
.body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
.price{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.price b{font:600 22px/1 "IBM Plex Mono",monospace;font-variant-numeric:tabular-nums}
.price s{color:var(--mute);font-family:"IBM Plex Mono",monospace;font-size:13px}.price .m2{color:var(--ink2);font-size:12px;font-family:"IBM Plex Mono",monospace;margin-left:auto}
.title{font-weight:500;line-height:1.3}.title a{color:inherit;text-decoration:none}.title a:hover{text-decoration:underline}
.loc{color:var(--ink2);font-size:13px}.feat{display:flex;gap:10px;color:var(--ink2);font-size:13px;font-family:"IBM Plex Mono",monospace}
.tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:auto}.tag{font-size:11px;padding:2px 7px;border-radius:999px;background:var(--chip);color:var(--ink2)}
.tag.w{color:var(--warn);background:transparent;border:1px solid var(--warn)}.tag.b{color:var(--bad);background:transparent;border:1px solid var(--bad)}.tag.g{color:var(--accent);background:transparent;border:1px solid var(--accent)}
.more{display:block;margin:22px auto 0;padding:10px 22px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:500 14px "IBM Plex Sans",sans-serif;cursor:pointer}
.note{color:var(--mute);font-size:12px;margin-top:26px;line-height:1.5}
@media (max-width:520px){.panel{position:static}.grid{grid-template-columns:1fr 1fr;gap:10px}.price b{font-size:18px}.body{padding:8px 9px 10px}}
@media (max-width:380px){.grid{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<header><h1>Radar Penedès–Barcelona</h1><div class="sub">Viviendas de bancos y servicers en venta · Tarragona → Barcelona, hasta ~50 km hacia el interior · actualizado <b>${generated}</b></div></header>
<div class="stats" id="stats"></div>
<div class="panel"><div class="filters">
<label>Buscar<input id="q" type="search" placeholder="municipio, calle, tipo…"></label>
<label>Comarca<select id="fc"><option value="">Todas</option>${comarcas.map((c) => `<option>${c}</option>`).join('')}</select></label>
<label>Municipio<select id="fm"><option value="">Todos</option></select></label>
<label>Fuente<select id="fs"><option value="">Todas</option>${srcs.map((s) => `<option>${s}</option>`).join('')}</select></label>
<label>Tipo<select id="ft"><option value="">Todos</option><option value="piso">Piso / apartamento / ático / dúplex</option><option value="casa">Casa / chalet / adosado</option></select></label>
<label>Precio máx. €<input id="fp" type="number" step="10000" placeholder="p.ej. 150000"></label>
<label>m² mín.<input id="fq" type="number" step="10" placeholder="p.ej. 70"></label>
<label>Orden<select id="so"><option value="new">Novedades primero</option><option value="p">Precio ↑</option><option value="-p">Precio ↓</option><option value="e">€/m² ↑</option><option value="-e">€/m² ↓</option><option value="-q">m² ↓</option><option value="m">Municipio</option></select></label>
</div><div class="row2">
<label><input type="checkbox" id="fn"> solo altas de los últimos 7 días</label>
<label><input type="checkbox" id="fx"> ocultar «sin posesión / ocupado / llaves no disponibles / cesión de remate»</label>
<label><input type="checkbox" id="fi"> solo con foto</label>
<label><input type="checkbox" id="fl"> incluir zonas límite (Conca de Barberà, Bages)</label>
<span class="count" id="count"></span></div></div>
${events.length ? `<div class="events"><h2>Últimos movimientos</h2><ul>${events.map((e) => `<li><span class="k">${e.date}</span>${e.type === 'new' ? '🆕' : e.type === 'price_drop' ? '🔻' : '🔺'} <a href="${e.u}" target="_blank" rel="noopener">${esc(e.t)}</a> · ${esc(e.m)} · ${e.p ? e.p.toLocaleString('es-ES') + ' €' : 'a consultar'}${e.from ? ` (antes ${e.from.toLocaleString('es-ES')} €, ${e.pct > 0 ? '−' : '+'}${Math.abs(e.pct)}%)` : ''} · ${e.s}</li>`).join('')}</ul></div>` : ''}
<div class="grid" id="grid"></div>
<button class="more" id="more" hidden>Mostrar 60 más</button>
<div class="note" id="note"></div>
</div>
<script>
const D=${JSON.stringify(rows)};
const RISK=/sin posesi|ocupad|llaves no disponibles|cesi[oó]n de remate|situaci[oó]n especial|subasta|\\bREO\\b/i;
const fmt=n=>n==null?'—':n.toLocaleString('es-ES');
const $=id=>document.getElementById(id);
const els=['q','fc','fm','fs','ft','fp','fq','so','fn','fx','fi','fl'].map($);
const DAY=864e5, recent=d=>d&&(Date.now()-new Date(d).getTime())<7*DAY;
let shown=60;
function isPiso(t){return /piso|apartamento|ático|atico|dúplex|duplex|estudio|bajo|planta baja|loft|vivienda/i.test(t||'')}
function tags(r){const out=[];const f=r.f.toLowerCase();
 if(/sin posesi|ocupad|possession|sinposesion/.test(f))out.push(['b','Sin posesión']);
 if(/llaves no disponibles/.test(f))out.push(['w','Llaves no disponibles']);
 if(/cesi.n de remate/.test(f))out.push(['w','Cesión de remate']);
 if(/situaci.n especial/.test(f))out.push(['w','Situación especial']);
 if(/subasta/.test(f))out.push(['w','Subasta']);
 if(/reservado/.test(f))out.push(['w','Reservado']);
 if(/\\breo\\b/.test(f))out.push(['w','REO (adjudicado)']);
 if(/en rentabilidad/.test(f))out.push(['','Alquilado (en rentabilidad)']);
 if(/vpo/.test(f))out.push(['','VPO']);
 if(/obra nueva|a estrenar/.test(f))out.push(['g','Obra nueva']);
 if(/a reformar/.test(f))out.push(['','A reformar']);
 if(/negociable/.test(f))out.push(['g','Precio negociable']);
 if(/promoci.n/.test(f))out.push(['','Promoción']);
 if(r.po&&r.p&&r.po>r.p)out.push(['g','Rebajado −'+Math.round(100-100*r.p/r.po)+'%']);
 return out}
function apply(){const [q,fc,fm,fs,ft,fp,fq,so,fn,fx,fi,fl]=els.map(e=>e.type==='checkbox'?e.checked:e.value);
 const qq=q.trim().toLowerCase();
 let L=D.filter(r=>(!fc||r.c===fc)&&(!fm||r.m===fm)&&(!fs||r.s===fs)&&(!ft||(ft==='piso'?isPiso(r.ty):!isPiso(r.ty)))&&(!fp||(r.p&&r.p<=+fp))&&(!fq||(r.q&&r.q>=+fq))&&(!fn||recent(r.fs))&&(!fx||!RISK.test(r.f))&&(!fi||r.g)&&(fl||!/límite/.test(r.c))&&(!qq||(r.t+' '+r.m+' '+r.c+' '+r.ty).toLowerCase().includes(qq)));
 if(so==='new'){L.sort((a,b)=>(b.fs||'').localeCompare(a.fs||'')||((a.p||9e9)-(b.p||9e9)))}
 else{const k=so.replace('-','');const dir=so.startsWith('-')?-1:1;L.sort((a,b)=>{if(k==='m')return (a.m||'').localeCompare(b.m||'');const x=a[k],y=b[k];if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (x-y)*dir})}
 $('count').textContent=L.length+' de '+D.length;
 const g=$('grid');g.innerHTML='';
 for(const r of L.slice(0,shown)){const el=document.createElement('article');el.className='card'+(recent(r.fs)?' new':'');
  el.innerHTML='<a class="ph" href="'+r.u+'" target="_blank" rel="noopener">'+(r.g?'<img loading="lazy" src="'+r.g+'" alt="">':'<span class="none">sin foto</span>')+'<span class="src">'+r.s+'</span>'+(recent(r.fs)?'<span class="newb">NUEVO '+r.fs.slice(5)+'</span>':'')+'</a>'
  +'<div class="body"><div class="price"><b>'+(r.p?fmt(r.p)+' €':'A consultar')+'</b>'+(r.po&&r.po>r.p?'<s>'+fmt(r.po)+' €</s>':'')+(r.e?'<span class="m2">'+fmt(r.e)+' €/m²</span>':'')+'</div>'
  +'<div class="title"><a href="'+r.u+'" target="_blank" rel="noopener">'+esc(r.t)+'</a></div>'
  +'<div class="loc">'+esc(r.m)+' · '+esc(r.c)+'</div>'
  +'<div class="feat">'+(r.q?r.q+' m²':'—')+(r.r?' · '+r.r+' hab':'')+(r.b?' · '+r.b+' baños':'')+'</div>'
  +'<div class="tags">'+tags(r).map(([c,t])=>'<span class="tag '+c+'">'+t+'</span>').join('')+'</div></div>';
  g.appendChild(el)}
 $('more').hidden=L.length<=shown;}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function fillMuni(){const fc=$('fc').value;const ms=[...new Set(D.filter(r=>!fc||r.c===fc).map(r=>r.m))].sort((a,b)=>a.localeCompare(b));const cur=$('fm').value;$('fm').innerHTML='<option value="">Todos</option>'+ms.map(m=>'<option'+(m===cur?' selected':'')+'>'+esc(m)+'</option>').join('')}
els.forEach(e=>e.addEventListener('input',()=>{shown=60;if(e.id==='fc')fillMuni();apply();try{localStorage.setItem('radar-f',JSON.stringify(els.map(x=>x.type==='checkbox'?x.checked:x.value)))}catch(_){}}));
$('more').addEventListener('click',()=>{shown+=60;apply()});
try{const s=JSON.parse(localStorage.getItem('radar-f')||'null');if(s&&s.length===els.length)els.forEach((e,i)=>{if(e.type==='checkbox')e.checked=!!s[i];else e.value=s[i]??''})}catch(_){}
(function(){const by={};for(const r of D)by[r.s]=(by[r.s]||0)+1;const nn=D.filter(r=>recent(r.fs)).length;
 $('stats').innerHTML=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<span>'+k+' <b>'+v+'</b></span>').join('')+'<span>· total <b>'+D.length+'</b></span><span>· altas 7 días <b>'+nn+'</b></span>';
 $('note').innerHTML='<p>Fuentes: Solvia (Sabadell/Intrum; incluye ex-Haya, Casaktua e Ibercaja), Aliseda (Santander/Blackstone, comercializa Sareb), Servihabitat (CaixaBank; comercializa Kutxabank y Sareb), Altamira (doValue/Santander), Hipoges (comercializa Sareb), Bankinter. Las etiquetas «Sin posesión», «Situación especial», «REO» y «Cesión de remate» indican inmuebles ocupados o en proceso judicial: precio bajo, riesgo alto. Los precios no incluyen impuestos ni gastos. La tarjeta con borde verde es un alta de los últimos 7 días.</p>'})();
fillMuni();apply();
</script></body></html>`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

if (process.argv[1] && process.argv[1].endsWith('build.js')) {
  const { loadListings } = await import('../store.js');
  buildSite(loadListings());
}

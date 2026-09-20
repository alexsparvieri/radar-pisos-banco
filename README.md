# Radar de pisos de banco · El Vendrell → Barcelona

Agente que vigila los portales inmobiliarios de bancos y *servicers* en España, se queda con las
viviendas en venta de la franja **Tarragona capital – Barcelona capital, hasta ~50 km hacia el interior**
(Tarragonès, Baix Penedès, Alt Camp, Alt Penedès, Garraf, Anoia, Baix Llobregat, Barcelona + L'Hospitalet, Vallès Occidental;
y como «zona límite» Conca de Barberà y Bages sur), detecta **altas nuevas, bajadas de precio y retiradas**,
avisa por **Telegram** y publica una **web unificada** (fotos, filtros, orden por precio / €/m²) en GitHub Pages.

Proyecto personal, independiente de cualquier otro repositorio.

## Fuentes cubiertas

| Portal | Quién hay detrás | Cómo se lee |
|---|---|---|
| Solvia | Intrum (ex Sabadell; absorbió Haya y Casaktua; comercializa Ibercaja) | API JSON interna (`/api/inmuebles/v2/buscarInmuebles` por municipio + `/api/inmuebles/v1/cercanos` por geolocalización para municipios grandes) |
| Aliseda | Anticipa/Blackstone (ex Santander/Popular; comercializa Sareb) | HTML renderizado en servidor (`/comprar-viviendas/cataluna/{provincia}?page=N`) |
| Servihabitat | CaixaBank / Lone Star (comercializa Kutxabank y Sareb) | HTML por comarca (`/es/venta/vivienda/{prov-comarca}?delta=20&start=N`) |
| Altamira | doValue (Santander, fondos, cesiones de remate) | API JSON (`/nodejs/getResultados`) |
| Hipoges | servicer (comercializa Sareb) | API JSON (`/api/assets/listing`) |
| Bankinter | portal propio | tabla HTML (`ebk+inmuebles+listado?codProvincia=`) |

Descartados tras comprobarlos (20‑sep‑2026): **Haya** (dominio dado de baja, stock en Solvia), **Casaktua** (redirige a Solvia),
**Anticipa** (solo corporativa; su stock es Aliseda), **Sareb** (no vende a particulares; solo inventario por municipio y remite a Aliseda/Hipoges/Servihabitat),
**Unicaja Inmuebles**, **Abanca Inmobiliario**, **Ibercaja portal** (dominios inaccesibles o dados de baja), **Cajamar/Cimenta2** (sin stock en Cataluña).

## Cómo funciona

```
src/run.js            orquestador: baja fuentes → filtra zona → diff → historia → Telegram → web
src/zona.js           zona de interés (data/municipios.json: INE, comarca, centroide) y normalización de nombres
src/sources/*.js      un conector por portal; devuelven un esquema común
src/store.js          data/listings.json (estado), data/history.jsonl (eventos), data/runs.jsonl (log)
src/notify/telegram.js
src/site/build.js     genera docs/index.html + docs/listings.json (GitHub Pages)
```

Esquema de una vivienda: `src, id, url, title, type, muni, comarca, prov, price, priceOld, m2, rooms, baths, img, lat, lng, flags[], eur_m2, firstSeen, lastSeen, prevPrice, priceHistory[], removed`.

Las etiquetas de riesgo (`Sin posesión`, `Situación especial`, `REO`, `Cesión de remate`, `Llaves no disponibles`, `Subasta`)
se conservan tal cual las publica cada portal: son inmuebles ocupados o en proceso judicial, baratos pero con riesgo.

## Uso en local

```bash
npm install
node src/run.js --dry --only bankinter,altamira     # prueba sin guardar ni avisar
node src/run.js                                     # ejecución completa (~10 min por Solvia)
npm run serve                                       # ver la web en http://localhost:8080
```

Variables de entorno (opcional, para alertas): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `MAX_ALERTS` (por defecto 25).
Se pueden dejar en un archivo `.env` y cargar con `node --env-file=.env src/run.js`.

## Alertas al móvil (Telegram)

1. En Telegram, habla con **@BotFather** → `/newbot` → copia el *token*.
2. Escribe cualquier mensaje a tu bot nuevo y abre `https://api.telegram.org/bot<TOKEN>/getUpdates`: el `chat.id` que aparece es tu `TELEGRAM_CHAT_ID`.
3. Guarda ambos como *secrets* del repositorio (Settings → Secrets → Actions) o en `.env` para local.

Cada alta nueva llega con foto, precio, €/m², municipio, etiquetas de riesgo y enlace a la ficha. Las bajadas de precio llegan con el precio anterior y el %.

## Ejecución automática (GitHub Actions)

`.github/workflows/radar.yml` corre 4 veces al día, guarda `data/` y `docs/` en el propio repo y publica la web.
Activar **Settings → Pages → Deploy from branch → `main` /docs**. La web queda en `https://<usuario>.github.io/radar-pisos-banco/`.
Es instalable como app (PWA básica: «Añadir a pantalla de inicio»).

La primera carga (`data/listings.json`) es la foto del 20‑sep‑2026 marcada como `baseline`: no genera alertas; a partir de ahí todo lo nuevo sí.

## Ajustar la zona

Editar `data/municipios.json` (añadir/quitar municipios; el código INE es el que usa Solvia como `idPoblacion`).
Las comarcas cuyo nombre contiene «límite» se ocultan por defecto en la web y se pueden mostrar con un check.
Para Servihabitat hay que añadir además la comarca en `ZONAS` de `src/sources/servihabitat.js`.

## Roadmap

- [ ] Ficha ampliada por inmueble (descripción, todas las fotos, historial de precio) sin salir de la web.
- [ ] Mapa (Leaflet) con los inmuebles geolocalizados (Solvia, Altamira e Hipoges ya traen coordenadas).
- [ ] Scoring de oportunidad: €/m² frente a la mediana del municipio y descuento acumulado.
- [ ] Notificaciones push web (PWA) además de Telegram; app móvil nativa si hace falta.
- [ ] Más fuentes si aparecen (idealista/fotocasa «pro» de bancos como respaldo).

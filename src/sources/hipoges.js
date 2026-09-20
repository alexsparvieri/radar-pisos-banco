// Hipoges (servicer; comercializador de Sareb y fondos). API JSON: POST /api/assets/listing
// La mayoría de sus activos figuran como "reo" y muchos están ocupados: leer siempre la ficha.
import { http, sleep } from '../http.js';

const BASE = 'https://realestate.hipoges.com';
const PROVINCIAS = [{ code: 'ES_Tarragona_Cataluña', nombre: 'Tarragona' }, { code: 'ES_Barcelona_Cataluña', nombre: 'Barcelona' }];
const TYPES = ['flat', 'rustic', 'duplex', 'lofts', 'studio_apartment', 'house', 'finca', 'house_terraced', 'detached_house', 'house_independent',
  'land_urbano_residencial', 'land_urbanizable_residencial', 'land_finca_rustica', 'land_urbano', 'land_urbanizable', 'land_rustico', 'land'];
const HT = { flat: 'Piso', house: 'Casa', duplex: 'Dúplex', lofts: 'Loft', studio_apartment: 'Estudio', rustic: 'Casa rústica', finca: 'Finca', house_terraced: 'Casa adosada', detached_house: 'Chalet', house_independent: 'Chalet independiente',
  land_urbano_residencial: 'Suelo urbano residencial', land_urbanizable_residencial: 'Suelo urbanizable residencial', land_finca_rustica: 'Finca rústica', land_urbano: 'Suelo urbano', land_urbanizable: 'Suelo urbanizable', land_rustico: 'Suelo rústico', land: 'Terreno' };

export async function fetchHipoges(log = console.log) {
  const out = [];
  for (const p of PROVINCIAS) {
    for (let page = 1; page <= 30; page++) {
      const body = {
        query: {
          // orden por _id: estable entre páginas (con featuresBuildYear se repetían y perdían fichas)
          sort: [{ field: '_id', order: 1 }],
          joiner: 'and',
          conditions: [
            { name: '_address.country', operator: 'equal', value: 'Spain' },
            { name: '_assetInfo._operation.operationType', operator: 'equal', value: 'sale' },
            { joiner: 'or', conditions: TYPES.map((t) => ({ name: '_features.featuresType', operator: 'equal', value: t })) },
            { name: '_address._provinceId.province_code', operator: 'equal', value: p.code },
          ],
        },
        pagination: { itemsPerPage: 100, page },
      };
      const j = await http(`${BASE}/api/assets/listing`, { method: 'POST', body, json: true });
      const res = j.result || [];
      for (const x of res) {
        const f = x._features || {};
        const town = (x._address?.town || '').replace(/^(.*)\s*\((el|la|l'|els|les)\)$/i, '$2 $1').trim();
        const street = [x._address?.streetType, x._address?.streetName].filter(Boolean).join(' ');
        const desc = x._presentation?.descriptions?.find((d) => d.language === 'spanish')?.value || '';
        const flags = [];
        if (x._operation?.subType) flags.push(x._operation.subType.toUpperCase());
        if (x._operation?.possessionStatus) flags.push(x._operation.possessionStatus);
        if (/ocupada por terceros|no se puede visitar/i.test(desc)) flags.push('Ocupado');
        if (/subasta/i.test(x._operation?.subType || '')) flags.push('Subasta');
        out.push({
          src: 'Hipoges',
          id: x._assetInfo?.propertyReference || x._id,
          url: `${BASE}/es/detail/${x._assetInfo?.propertyReference || x._id}`,
          title: `${HT[f.featuresType] || f.featuresType || 'Vivienda'} en ${street || town}, ${town}`,
          type: HT[f.featuresType] || f.featuresType || 'Vivienda',
          cat: /^land/.test(f.featuresType || '') ? 'terreno' : 'vivienda',
          town,
          prov: p.nombre,
          price: x._operation?._price || null,
          priceOld: x._operation?._prevPrice > x._operation?._price ? x._operation._prevPrice : null,
          m2: f.featuresAreaConstructed || f.featuresAreaUsable || f.featuresAreaPlot || null,
          rooms: f.featuresBedroomNumber || null,
          baths: f.featuresBathroomNumber || null,
          img: x._assetInfo?.images?.[0]?.url || null,
          imgs: (x._assetInfo?.images || []).map((i) => i.url).filter(Boolean).slice(0, 12),
          lat: x._location?.coordinates?.[1] ?? null,
          lng: x._location?.coordinates?.[0] ?? null,
          flags,
          addr: street,
        });
      }
      log(`[hipoges] ${p.nombre} pág ${page}: ${res.length} (total ${j.total})`);
      if (res.length < 100) break;
      await sleep(400);
    }
  }
  return out;
}

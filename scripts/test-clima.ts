/** Prueba real contra Open-Meteo (necesita internet). Uso: npx tsx scripts/test-clima.ts */
import { obtenerClima, resumenCorto, infoClima } from '../src/clima/clima';
import { crearDbPrueba } from './db-prueba';

(async () => {
  const db = await crearDbPrueba();
  const p = await obtenerClima(db);
  if (!p) throw new Error('sin pronóstico');
  console.log(`✅ Clima ${p.ubicacion.nombre}: ${p.actual.temp}° ${infoClima(p.actual.codigo, p.actual.esDia).texto}; hoy ${resumenCorto(p.dias[0])}; ${p.horas.length} horas, ${p.dias.length} días`);
  const t0 = Date.now();
  await obtenerClima(db);
  console.log(`✅ Caché: segunda consulta en ${Date.now() - t0} ms`);
})().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});

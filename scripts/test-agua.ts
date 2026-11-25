/**
 * Pruebas de Agua: ajustes, horarios de recordatorio, pausa, progreso y base de datos.
 * Correr: npx tsx scripts/test-agua.ts
 */
import { enPausa, formatoMl, horasRecordatorio, leerAjustesAgua, progresoAgua, vasosParaMeta } from '../src/agua/logica';
import { crearDbPrueba } from './db-prueba';

let ok = 0;
let total = 0;
function prueba(nombre: string, cond: boolean, detalle?: unknown) {
  total++;
  if (cond) ok++;
  else console.error('❌', nombre, detalle !== undefined ? JSON.stringify(detalle) : '');
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const dia = new Date(2030, 4, 10);

const h = horasRecordatorio({ desde: '08:00', hasta: '22:00', cadaMin: 90 }, dia);
prueba('horas: parte 90 min después', hhmm(h[0]) === '09:30', h.map(hhmm));
prueba('horas: termina antes de las 22', hhmm(h[h.length - 1]) === '21:30' && h.length === 9, h.map(hhmm));
prueba('horas: mismo día', h.every((x) => x.getDate() === 10));
const noche = horasRecordatorio({ desde: '22:00', hasta: '01:00', cadaMin: 60 }, dia);
prueba('horas: cruza medianoche', noche.map(hhmm).join() === '23:00,00:00,01:00' && noche[1].getDate() === 11, noche.map(hhmm));
prueba('horas: tope 48', horasRecordatorio({ desde: '00:00', hasta: '23:59', cadaMin: 15 }, dia).length === 48);

prueba('pausa: antes', enPausa(new Date(2030, 4, 10, 10), new Date(2030, 4, 10, 12).toISOString()));
prueba('pausa: después', !enPausa(new Date(2030, 4, 10, 13), new Date(2030, 4, 10, 12).toISOString()));
prueba('pausa: sin pausa', !enPausa(new Date(), null));

const a = leerAjustesAgua({ metaMl: 'hola', vasoMl: '300', avisos: '1', cadaMin: '5', desde: '25:00', hasta: '21:00', pausaHasta: 'x' });
prueba('ajustes: valores raros → por defecto', a.metaMl === 2000 && a.vasoMl === 300 && a.cadaMin === 90 && a.desde === '08:00' && a.hasta === '21:00' && a.pausaHasta === null, a);
prueba('ajustes: avisos apagados', !leerAjustesAgua({ avisos: '0' }).avisos);

const p = progresoAgua(1500, 2000);
prueba('progreso 75%', p.porcentaje === 75 && !p.cumplida && p.faltan === 500, p);
prueba('progreso pasado de la meta', progresoAgua(2600, 2000).porcentaje === 100 && progresoAgua(2600, 2000).cumplida);
prueba('formato ml', formatoMl(250) === '250 ml' && formatoMl(2000) === '2 L' && formatoMl(1500) === '1,5 L', [formatoMl(250), formatoMl(2000), formatoMl(1500)]);
prueba('vasos para la meta', vasosParaMeta(2000, 300) === 7);

(async () => {
  const db = await crearDbPrueba();
  const agua = await import('../src/database/agua');
  const aj = await agua.ajustesAgua(db);
  prueba('db: ajustes por defecto', aj.metaMl === 2000 && aj.vasoMl === 250 && !aj.avisos, aj);
  await agua.tomarAgua(db, 250);
  await agua.tomarAgua(db, 250);
  prueba('db: dos vasos', (await agua.aguaDelDia(db)) === 500);
  prueba('db: deshacer', (await agua.deshacerUltimoVaso(db)) && (await agua.aguaDelDia(db)) === 250);
  await agua.guardarAjusteAgua(db, 'metaMl', 250);
  prueba('db: meta cumplida (rachas)', await agua.cumplioMetaAgua(db));
  await agua.guardarAjusteAgua(db, 'pausaHasta', null);
  await agua.guardarAjusteAgua(db, 'avisos', true);
  const aj2 = await agua.ajustesAgua(db);
  prueba('db: guardar ajustes', aj2.avisos && aj2.pausaHasta === null && aj2.metaMl === 250, aj2);
  const sem = await agua.aguaSemana(db);
  prueba('db: semana de 7 días con hoy al final', sem.length === 7 && sem[6].ml === 250 && sem[0].ml === 0, sem);
  let lanzo = false;
  try {
    await agua.tomarAgua(db, -5);
  } catch {
    lanzo = true;
  }
  prueba('db: no acepta negativo', lanzo);

  console.log(ok === total ? `✅ Agua: ${ok}/${total}` : `⚠️ Agua: ${ok}/${total}`);
  if (ok !== total) process.exitCode = 1;
})();

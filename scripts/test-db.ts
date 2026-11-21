/**
 * Prueba rápida de la base de datos SIN celular: corre las consultas reales
 * de src/database sobre SQLite de Node. Uso:  npx tsx scripts/test-db.ts
 */
import assert from 'node:assert/strict';

import { migrateDb } from '../src/database/schema';
import * as tareas from '../src/database/tareas';
import * as gastos from '../src/database/gastos';
import * as gym from '../src/database/gym';
import * as notas from '../src/database/notas';
import * as fijos from '../src/database/fijos';
import * as metas from '../src/database/metas';
import * as cuerpo from '../src/database/cuerpo';
import * as habitos from '../src/database/habitos';
import * as logros from '../src/database/logros';
import { compararMes } from '../src/database/estadisticas';
import { mensajeDomingo, mensajeManana } from '../src/notifications/mensajes';
import { getResumenHoy } from '../src/database/queries';
import { toISODate, endOfWeek } from '../src/utils/fechas';

import { crearDb } from './db-prueba';

async function main() {
  const db = crearDb();
  await migrateDb(db);
  await migrateDb(db); // dos veces: no debe fallar
  const hoy = toISODate();

  // Tareas
  const t1 = await tareas.crearTarea(db, { title: 'Pan', priority: 'alta', scope: 'diaria', due_date: hoy, repeat_type: 'none', repeat_days: [] });
  await tareas.crearTarea(db, { title: 'Agua', priority: 'baja', scope: 'diaria', due_date: null, repeat_type: 'daily', repeat_days: [] });
  await tareas.crearTarea(db, { title: 'Semanal', priority: 'media', scope: 'semanal', due_date: toISODate(endOfWeek()), repeat_type: 'none', repeat_days: [] });
  let lista = await tareas.tareasDelDia(db, hoy);
  assert.equal(lista.length, 2);
  await tareas.alternarTarea(db, { id: t1, repeat_type: 'none' }, true);
  const agua = lista.find((t) => t.title === 'Agua')!;
  await tareas.alternarTarea(db, agua, true, hoy);
  assert.deepEqual(await tareas.conteoHoy(db), { pendientes: 0, hechas: 2 });
  assert.equal((await tareas.tareasSemanales(db)).length, 1);
  assert.equal(await tareas.completadasEnRango(db, hoy, hoy), 2);

  // Gastos
  await gastos.crearGasto(db, { amount: 5000, category: 'comida', date: hoy });
  await gastos.crearGasto(db, { amount: 2500, category: 'transporte', note: 'micro', date: hoy });
  assert.equal(await gastos.totalEnRango(db, gastos.rangoSemana()), 7500);
  assert.equal((await gastos.totalPorCategoria(db, gastos.rangoMes()))[0].category, 'comida');
  assert.ok(gastos.avisoPresupuesto(70000, 85000, 100000));
  assert.equal(gastos.avisoPresupuesto(10, 20, 100000), null);

  // Gym
  await gym.guardarDiaRutina(db, 1, 'Pecho');
  const ex = await gym.obtenerOCrearEjercicio(db, 'Press banca');
  assert.equal(await gym.obtenerOCrearEjercicio(db, 'press  BANCA'), ex);
  await gym.agregarSerie(db, ex, hoy, 10, 40);
  await gym.agregarSerie(db, ex, hoy, 8, 45);
  const hist = await gym.historialEjercicio(db, ex);
  assert.equal(hist[0].maxPeso, 45);
  assert.equal(await gym.diasEntrenados(db, gastos.rangoSemana()), 1);

  // Notas
  const n = await notas.guardarNota(db, null, 'Hola\nmundo');
  assert.ok(n);
  assert.equal(await notas.guardarNota(db, n, '   '), null);
  assert.equal((await notas.listarNotas(db)).length, 0);

  // Gastos fijos: el de hoy se suma una sola vez; el de mañana todavía no.
  const hoyD = new Date();
  await fijos.crearFijo(db, { name: 'Spotify', amount: 6490, category: 'suscripciones', day_of_month: hoyD.getDate() });
  const manana = new Date(Date.now() + 86400000);
  if (manana.getMonth() === hoyD.getMonth()) {
    await fijos.crearFijo(db, { name: 'Arriendo', amount: 300000, category: 'hogar', day_of_month: manana.getDate() });
    assert.equal((await fijos.fijosQueVencenEn(db, manana)).length, 1);
  }
  assert.equal(await fijos.aplicarFijosDelMes(db), 1);
  assert.equal(await fijos.aplicarFijosDelMes(db), 0);
  assert.equal(fijos.diaDePagoEn({ day_of_month: 31 }, 2026, 1), 28);

  // Metas
  const meta = await metas.crearMeta(db, { name: 'Viaje al sur', target: 500000, deadline: null });
  await metas.abonar(db, meta, 10000);
  await metas.abonar(db, meta, 5000);
  assert.equal((await metas.obtenerMeta(db, meta))!.ahorrado, 15000);
  assert.equal((await metas.buscarMeta(db, 'abona a viaje'))!.id, meta);

  // Cuerpo: dos guardados el mismo día se combinan
  await cuerpo.guardarMedicion(db, hoy, { weight: 78.4 });
  await cuerpo.guardarMedicion(db, hoy, { waist: 84 });
  const med = await cuerpo.listarMediciones(db);
  assert.equal(med.length, 1);
  assert.equal(med[0].weight, 78.4);
  assert.equal(med[0].waist, 84);
  assert.equal((await cuerpo.ultimosValores(db)).weight?.valor, 78.4);

  // Hábitos: racha viva aunque hoy no esté marcado; mejor racha histórica
  const hab = await habitos.crearHabito(db, { name: 'Agua', icon: 'water', color: '#38BDF8' });
  const dia = (n: number) => toISODate(new Date(Date.now() - n * 86400000));
  for (const n of [1, 2, 3, 10, 11]) await habitos.alternarHabito(db, hab, true, dia(n));
  let hs = await habitos.listarHabitos(db);
  assert.equal(hs[0].racha, 3);
  assert.equal(hs[0].hechoHoy, false);
  await habitos.alternarHabito(db, hab, true);
  hs = await habitos.listarHabitos(db);
  assert.equal(hs[0].racha, 4);
  assert.equal(hs[0].mejorRacha, 4);
  assert.equal(habitos.calcularMejorRacha(['2026-01-01', '2026-01-02', '2026-01-04']), 2);

  // Logros: se desbloquean una sola vez
  const nuevos = await logros.evaluarLogros(db);
  const keys = nuevos.map((l) => l.key);
  assert.ok(keys.includes('tarea_1') && keys.includes('gym_1') && keys.includes('cuerpo_1') && keys.includes('meta_1') === false);
  assert.equal((await logros.evaluarLogros(db)).length, 0);
  assert.equal((await logros.logrosSinVer(db)).length, nuevos.length);

  // Estadísticas del mes
  const est = await compararMes(db, new Date().getFullYear(), new Date().getMonth());
  assert.ok(est.actual.tareasHechas >= 2);
  assert.equal(est.actual.diasGym.length, 1);
  assert.ok(est.actual.gastoTotal >= 7500);
  assert.equal(est.actual.habitos.length, 1);

  // Mensajes
  assert.ok(mensajeManana({ nombre: 'Tin', tareas: 2, gym: 'Pecho' }).cuerpo.includes('2 tareas'));
  assert.ok(mensajeDomingo({ tareas: 5, gym: 2, gasto: 10000, gastoAnterior: 15000, pedirRespaldo: false }).cuerpo.includes('menos'));

  const r = await getResumenHoy(db);
  assert.equal(r.gastoSemana, 7500 + 6490);
  console.log('✅ Todas las pruebas de base de datos pasaron');
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});

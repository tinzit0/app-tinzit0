/**
 * Pruebas de regresión: integridad de datos y concurrencia.
 * - Migraciones atómicas (una migración que falla no deja la versión adelantada).
 * - Respaldos: validación, rechazo de versiones futuras e incompletos, restauración atómica,
 *   compatibilidad con respaldos antiguos e integridad referencial.
 * - Avisos del banco: sin duplicados por reintento o doble toque, sin perder compras iguales legítimas.
 * - Gastos fijos sin duplicados con ejecuciones simultáneas.
 * - Horario: reemplazo todo-o-nada.
 * Correr: npx tsx scripts/test-integridad.ts
 */
import { crearDb, crearDbPrueba } from './db-prueba';

let ok = 0;
let total = 0;
function prueba(nombre: string, cond: boolean, detalle?: unknown) {
  total++;
  if (cond) ok++;
  else console.error('❌', nombre, detalle !== undefined ? JSON.stringify(detalle) : '');
}
async function lanza(fn: () => Promise<unknown>, re?: RegExp): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return re ? re.test(e instanceof Error ? e.message : String(e)) : true;
  }
}
const contar = async (db: any, tabla: string) => (await db.getFirstAsync(`SELECT COUNT(*) AS n FROM ${tabla}`)).n as number;

(async () => {
  const { aplicarMigraciones, VERSION_ESQUEMA, tablasHastaVersion } = await import('../src/database/schema');
  const { volcarDatos, restaurarDatos, contextoValidacion } = await import('../src/database/respaldoDatos');
  const { leerRespaldo, validarRespaldo } = await import('../src/database/respaldoFormato');
  const { procesarAvisos, aceptarAviso, descartarAviso } = await import('../src/database/finanzas');
  const { aplicarFijosDelMes, crearFijo } = await import('../src/database/fijos');
  const { crearRamo, guardarBloques, bloquesDeRamo, crearEvaluacion } = await import('../src/database/estudio');
  const { setSetting, getSetting } = await import('../src/database/queries');

  // ---------- Migraciones ----------
  {
    const db = crearDb();
    const malas = ['CREATE TABLE a (x INTEGER);', 'CREATE TABLE b (x INTEGER); INSERT INTO tabla_que_no_existe VALUES (1);'];
    const fallo = await lanza(() => aplicarMigraciones(db, malas));
    const v = (await db.getFirstAsync('PRAGMA user_version')).user_version;
    const b = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'b'");
    prueba('migración que falla: lanza error', fallo);
    prueba('migración que falla: la versión no avanza', v === 1, v);
    prueba('migración que falla: no deja la tabla a medias', !b, b);
    const v2 = await aplicarMigraciones(db, ['CREATE TABLE a (x INTEGER);', 'CREATE TABLE b (x INTEGER);']);
    prueba('reintento completa la migración', v2 === 2, v2);
  }
  {
    const db = await crearDbPrueba();
    const v = (await db.getFirstAsync('PRAGMA user_version')).user_version;
    prueba('migraciones reales: versión final', v === VERSION_ESQUEMA, v);
    prueba('migraciones reales: idempotentes', (await aplicarMigraciones(db, Array(VERSION_ESQUEMA).fill('SELECT 1;'))) === VERSION_ESQUEMA);
  }

  // ---------- Respaldos ----------
  const origen = await crearDbPrueba();
  await setSetting(origen, 'nombre', 'Prueba');
  await origen.runAsync("INSERT INTO expenses (amount, category, date) VALUES (5000, 'comida', '2026-11-20')");
  const ex = await origen.runAsync("INSERT INTO exercises (name) VALUES ('Press banca')");
  await origen.runAsync("INSERT INTO workout_sets (exercise_id, date, set_number, reps, weight) VALUES (?, '2026-11-20', 1, 10, 40)", ex.lastInsertRowId);
  const foto = await volcarDatos(origen);
  prueba('volcado: trae conteos', foto.counts?.expenses === 1 && foto.counts?.workout_sets === 1 && foto.formato === 2, foto.counts);

  const destino = await crearDbPrueba();
  await destino.runAsync("INSERT INTO notes (title, body) VALUES ('nota local', 'x')").catch(async () => {
    await destino.runAsync("INSERT INTO notes (body) VALUES ('nota local')");
  });
  const ctx = await contextoValidacion(destino);
  const r = await restaurarDatos(destino, JSON.parse(JSON.stringify(foto)));
  prueba('restaurar: copia todo', (await contar(destino, 'expenses')) === 1 && (await contar(destino, 'workout_sets')) === 1 && (await contar(destino, 'notes')) === 0, r);
  prueba('restaurar: ajustes', (await getSetting(destino, 'nombre')) === 'Prueba');

  // Versión futura
  const futura = { ...foto, schemaVersion: VERSION_ESQUEMA + 1 };
  prueba('rechaza versión futura', await lanza(async () => validarRespaldo(futura, ctx), /más nueva/));
  // Incompleto (falta una tabla)
  const incompleto = JSON.parse(JSON.stringify(foto));
  delete incompleto.tables.expenses;
  delete incompleto.counts.expenses;
  prueba('rechaza respaldo sin una tabla', await lanza(async () => validarRespaldo(incompleto, ctx), /incompleto/));
  // Cortado (conteo no calza)
  const cortado = JSON.parse(JSON.stringify(foto));
  cortado.tables.expenses = [];
  prueba('rechaza respaldo cortado', await lanza(async () => validarRespaldo(cortado, ctx), /cortado/));
  // JSON roto
  prueba('rechaza JSON roto', await lanza(async () => leerRespaldo('{"app":"tinzit0", "tab', ctx), /dañado/));
  // Valores raros
  const raro = JSON.parse(JSON.stringify(foto));
  raro.tables.expenses[0].amount = { mal: 1 };
  prueba('rechaza valores que no son simples', await lanza(async () => validarRespaldo(raro, ctx), /valor no válido/));
  // Booleanos → 0/1
  const bool = JSON.parse(JSON.stringify(foto));
  bool.tables.habits = [{ id: 1, name: 'Leer', archived: false }];
  bool.counts.habits = 1;
  prueba('booleanos se convierten', validarRespaldo(bool, ctx).data.tables.habits[0].archived === 0);

  // Restauración atómica: una fila mala (NOT NULL) no deja nada a medias
  const antes = await contar(destino, 'expenses');
  const malo = JSON.parse(JSON.stringify(foto));
  malo.tables.expenses.push({ id: 99, amount: null, category: 'comida', date: '2026-11-21' });
  malo.counts.expenses = 2;
  const fallo = await lanza(() => restaurarDatos(destino, malo));
  prueba('restauración fallida: lanza', fallo);
  prueba('restauración fallida: datos intactos', (await contar(destino, 'expenses')) === antes && (await contar(destino, 'workout_sets')) === 1);

  // Integridad referencial: serie de un ejercicio que no existe → se omite
  const huerfano = JSON.parse(JSON.stringify(foto));
  huerfano.tables.workout_sets.push({ id: 50, exercise_id: 999, date: '2026-11-21', set_number: 1, reps: 5, weight: 10 });
  huerfano.counts.workout_sets = 2;
  const rh = await restaurarDatos(destino, huerfano);
  const fk = await destino.getAllAsync('PRAGMA foreign_key_check');
  prueba('huérfanos: se omiten y no quedan relaciones rotas', rh.omitidas === 1 && fk.length === 0 && (await contar(destino, 'workout_sets')) === 1, rh);

  // Respaldo antiguo (versión 5): tablas nuevas vacías y ajustes por defecto repuestos
  const viejo = { app: 'tinzit0', schemaVersion: 5, exportedAt: '2026-01-01T00:00:00Z', tables: {} as Record<string, unknown[]> };
  for (const t of tablasHastaVersion(5)) viejo.tables[t] = t === 'settings' ? [{ key: 'nombre', value: 'Antiguo' }] : [];
  const val = validarRespaldo(viejo, ctx);
  prueba('antiguo: aceptado y avisa tablas nuevas', val.resumen.tablasNuevasVacias.includes('diary_cards'), val.resumen.tablasNuevasVacias);
  await restaurarDatos(destino, viejo as never);
  prueba('antiguo: restaura su nombre', (await getSetting(destino, 'nombre')) === 'Antiguo');
  prueba('antiguo: repone ajustes nuevos', (await getSetting(destino, 'gastos_auto_modo')) === 'preguntar' && (await getSetting(destino, 'notif_tarjeta')) === '1');
  prueba('antiguo: tablas nuevas vacías', (await contar(destino, 'expenses')) === 0);

  // ---------- Avisos del banco ----------
  const db = await crearDbPrueba();
  const ts = Date.now();
  const compra = (t: number) => ({ pkg: 'cl.bancoestado.app', title: 'Compra', text: 'Compra por $3.500 en CAFE CENTRAL con tu tarjeta', ts: t });
  await setSetting(db, 'gastos_auto_modo', 'auto');
  const r1 = await procesarAvisos(db, [compra(ts), compra(ts + 60_000), { pkg: 'com.whatsapp', title: 'x', text: 'y', ts }]);
  prueba('dos compras iguales legítimas (distinta hora) → dos gastos', r1.agregados === 2 && (await contar(db, 'expenses')) === 2, r1);
  prueba('procesados incluye lo que no es de banco (se quita de la cola)', r1.procesados.length === 3, r1.procesados.length);
  const r2 = await procesarAvisos(db, [compra(ts), compra(ts + 60_000)]);
  prueba('reintento del mismo aviso no duplica', r2.agregados === 0 && (await contar(db, 'expenses')) === 2 && r2.procesados.length === 2, r2);
  const r3 = await procesarAvisos(db, [{ pkg: 'cl.bancoestado.app', title: 'x', text: 'y', ts: Number.NaN } as never, compra(ts + 120_000)]);
  prueba('aviso dañado no bloquea a los demás', r3.agregados === 1, r3);
  prueba('cada gasto automático queda ligado a su aviso', (await db.getFirstAsync("SELECT COUNT(*) AS n FROM bank_alerts WHERE estado = 'agregado' AND expense_id IS NULL")).n === 0);

  await setSetting(db, 'gastos_auto_modo', 'preguntar');
  await procesarAvisos(db, [compra(ts + 300_000)]);
  const pend = await db.getFirstAsync("SELECT id FROM bank_alerts WHERE estado = 'pendiente'");
  const gastosAntes = await contar(db, 'expenses');
  const [g1, g2] = await Promise.all([aceptarAviso(db, pend.id), aceptarAviso(db, pend.id)]);
  prueba('doble toque en "Agregar" → un solo gasto', (await contar(db, 'expenses')) === gastosAntes + 1 && [g1, g2].filter(Boolean).length === 1, [g1, g2]);
  await descartarAviso(db, pend.id);
  prueba('descartar no deshace un aviso ya agregado', (await db.getFirstAsync('SELECT estado FROM bank_alerts WHERE id = ?', pend.id)).estado === 'agregado');

  // ---------- Gastos fijos ----------
  const dbf = await crearDbPrueba();
  const hoy = new Date();
  const fid = await crearFijo(dbf, { name: 'Spotify', amount: 4990, category: 'suscripciones', day_of_month: 1 });
  await dbf.runAsync("UPDATE fixed_expenses SET created_at = '2020-01-01 00:00:00' WHERE id = ?", fid);
  const [n1, n2, n3] = await Promise.all([aplicarFijosDelMes(dbf, hoy), aplicarFijosDelMes(dbf, hoy), aplicarFijosDelMes(dbf, hoy)]);
  prueba('fijos simultáneos → un solo cobro', n1 + n2 + n3 === 1 && (await contar(dbf, 'expenses')) === 1, [n1, n2, n3]);
  prueba('fijo ligado a su gasto', (await dbf.getFirstAsync('SELECT expense_id FROM fixed_payments WHERE fixed_id = ?', fid)).expense_id != null);

  // ---------- Horario y plan de estudio ----------
  const dbe = await crearDbPrueba();
  const rid = await crearRamo(dbe, { name: 'Física', color: '#38BDF8', teacher: null, room: null, passing: 4, min_attendance: 75 });
  await guardarBloques(dbe, rid, [{ weekday: 1, start_time: '08:30', end_time: '10:00' }]);
  const falla = await lanza(() => guardarBloques(dbe, rid, [{ weekday: 2, start_time: '10:00', end_time: '11:30' }, { weekday: null as never, start_time: '12:00', end_time: '13:00' }]));
  const bl = await bloquesDeRamo(dbe, rid);
  prueba('horario: si falla, queda el anterior', falla && bl.length === 1 && bl[0].weekday === 1, bl);
  const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 6);
  const iso = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;
  const eid = await crearEvaluacion(dbe, { course_id: rid, name: 'Prueba 1', weight: 30, grade: null, date: iso, study_hours: 3 }, hoy);
  const tareas = (await dbe.getFirstAsync('SELECT COUNT(*) AS n FROM tasks WHERE evaluation_id = ?', eid)).n;
  prueba('evaluación crea su plan junto', tareas >= 1, tareas);

  console.log(`${ok === total ? '✅' : '❌'} Integridad y concurrencia: ${ok}/${total}`);
  if (ok !== total) process.exit(1);
})();

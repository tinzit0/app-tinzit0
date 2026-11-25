/**
 * Pruebas de la parte en la nube SIN internet: qué se respalda (Bienestar nunca sale del teléfono),
 * cómo se combina al restaurar, rachas (días, "por mantener", mensajes sin culpa) y usuarios.
 * Correr: npx tsx scripts/test-nube.ts
 */
import { readFileSync } from 'node:fs';

import { combinarConLocal, estadoRacha, limpiarUsuario, mejorRachaDe, mensajeRacha, paraLaNube, rachasPorMantener, telefonoVacio, usuarioValido } from '../src/nube/logica';
import { crearDbPrueba } from './db-prueba';

let ok = 0;
let total = 0;
function prueba(nombre: string, cond: boolean, detalle?: unknown) {
  total++;
  if (cond) ok++;
  else console.error('❌', nombre, detalle !== undefined ? JSON.stringify(detalle) : '');
}

// ---------- Rachas ----------
const hoy = '2030-05-10';
const viva = { count: 5, best: 9, last_day: '2030-05-09' };
const e1 = estadoRacha(viva, hoy, false, false);
prueba('racha viva de ayer: se ve y está por mantener', e1.dias === 5 && e1.porMantener, e1);
const e2 = estadoRacha({ count: 6, best: 9, last_day: hoy }, hoy, true, true);
prueba('racha de hoy: al día', e2.dias === 6 && !e2.porMantener, e2);
const e3 = estadoRacha({ count: 5, best: 9, last_day: '2030-05-07' }, hoy, false, false);
prueba('racha cortada: 0 días, récord se mantiene', e3.dias === 0 && e3.record === 9 && !e3.porMantener, e3);
prueba('sin racha todavía', estadoRacha({ count: 0, best: 0, last_day: null }, hoy, false, false).dias === 0);
prueba('cambio de mes', estadoRacha({ count: 3, best: 3, last_day: '2030-04-30' }, '2030-05-01', false, false).porMantener);

// Mensajes: nunca culposos.
const culpa = /perdiste|fallaste|fracas|culpa|decepci|mal hecho|no cumpliste/i;
const estados = [e1, e2, e3, estadoRacha(viva, hoy, true, false), estadoRacha(viva, hoy, false, true), estadoRacha({ count: 0, best: 0, last_day: null }, hoy, true, false)];
prueba('mensajes amables', estados.every((e) => !culpa.test(mensajeRacha(e, 'Daniel'))), estados.map((e) => mensajeRacha(e, 'Daniel')));
prueba('mensaje cuando el amigo ya cumplió', /Daniel ya cumplió/.test(mensajeRacha(estadoRacha(viva, hoy, false, true), 'Daniel')));

const cache = JSON.stringify({
  yo: 'a',
  nombres: { b: 'Daniel' },
  rachas: [
    { id: 1, user_a: 'a', user_b: 'b', activity: 'agua', count: 4, best: 4, last_day: '2030-05-09' },
    { id: 2, user_a: 'a', user_b: 'b', activity: 'gym', count: 2, best: 2, last_day: '2030-05-01' },
  ],
});
const pm = rachasPorMantener(cache, hoy);
prueba('por mantener desde la caché', pm.length === 1 && pm[0].amigo === 'Daniel' && pm[0].actividad === 'agua' && pm[0].dias === 4, pm);
prueba('caché dañada no rompe', rachasPorMantener('{x', hoy).length === 0 && mejorRachaDe('{x') === null);
prueba('mejor racha viva', mejorRachaDe(cache, new Date(2030, 4, 10)) === 4);

// ---------- Usuarios ----------
prueba('usuario válido', usuarioValido('marti_23') && !usuarioValido('ma') && !usuarioValido('Marti'));
prueba('limpiar usuario', limpiarUsuario('  Martín Ñuñez! ') === 'martinnunez', limpiarUsuario('  Martín Ñuñez! '));

// ---------- SQL: RLS en todas las tablas ----------
const sql = readFileSync(new URL('../supabase/migrations/20261125000000_cuentas_amigos_rachas.sql', import.meta.url), 'utf8');
const tablas = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
prueba('sql: 5 tablas', tablas.length === 5, tablas);
prueba('sql: RLS en todas', tablas.every((t) => sql.includes(`alter table public.${t} enable row level security`)), tablas);
prueba('sql: sin service_role', !/service_role/i.test(sql.replace(/^--.*$/gm, '')));
prueba('sql: la app no edita los números de la racha', /revoke update on public\.streaks from authenticated/.test(sql) && !/for update to authenticated[\s\S]{0,40}streaks/.test(sql));
prueba('sql: realtime', /supabase_realtime add table public\.streaks/.test(sql));

// ---------- Respaldo: Bienestar nunca sale del teléfono ----------
(async () => {
  const db = await crearDbPrueba();
  const { volcarDatos } = await import('../src/database/respaldoDatos');
  const { validarRespaldo } = await import('../src/database/respaldoFormato');
  const { contextoValidacion } = await import('../src/database/respaldoDatos');
  const { setSetting } = await import('../src/database/queries');
  await db.runAsync("INSERT INTO diary_cards (date, animo) VALUES ('2030-05-10', 3)");
  await db.runAsync("INSERT INTO tasks (title) VALUES ('Estudiar')");
  await setSetting(db, 'plan_crisis', '{"contactos":["mamá"]}');
  await setSetting(db, 'nombre', 'Marti');

  const local = await volcarDatos(db);
  prueba('teléfono con datos no está vacío', !telefonoVacio(local));
  const nube = paraLaNube(local);
  const texto = JSON.stringify(nube);
  prueba('nube: sin tarjeta diaria ni plan de crisis', !('diary_cards' in nube.tables) && !texto.includes('mamá') && !texto.includes('plan_crisis'));
  prueba('nube: sí van las tareas y el nombre', nube.tables.tasks.length === 1 && texto.includes('Marti'));
  prueba('nube: conteos al día', Object.entries(nube.counts).every(([t, n]) => nube.tables[t].length === n));

  // Otro teléfono (vacío pero con su propio Bienestar) recibe el respaldo de la nube.
  const db2 = await crearDbPrueba();
  await db2.runAsync("INSERT INTO diary_cards (date, animo) VALUES ('2030-06-01', 8)");
  await setSetting(db2, 'plan_crisis', '{"contactos":["hermano"]}');
  const local2 = await volcarDatos(db2);
  prueba('teléfono nuevo está vacío', telefonoVacio(local2));
  const combinado = combinarConLocal(nube, local2);
  let valido = true;
  try {
    validarRespaldo(combinado, await contextoValidacion(db2));
  } catch (e) {
    valido = false;
    console.error(e);
  }
  prueba('combinado pasa la validación', valido);
  const { restaurarDatos } = await import('../src/database/respaldoDatos');
  await restaurarDatos(db2, combinado);
  const tareas = await db2.getAllAsync<{ title: string }>('SELECT title FROM tasks');
  const tarjetas = await db2.getAllAsync<{ animo: number }>('SELECT animo FROM diary_cards');
  const plan = await db2.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'plan_crisis'");
  prueba('restaurar: llegan las tareas', tareas.length === 1 && tareas[0].title === 'Estudiar', tareas);
  prueba('restaurar: se mantiene el Bienestar del teléfono', tarjetas.length === 1 && tarjetas[0].animo === 8 && plan?.value.includes('hermano'), { tarjetas, plan });

  console.log(ok === total ? `✅ Nube (cuentas, rachas, respaldo): ${ok}/${total}` : `⚠️ Nube: ${ok}/${total}`);
  if (ok !== total) process.exitCode = 1;
})();

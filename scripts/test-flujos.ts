/**
 * Pruebas de regresión: flujos que no deben perder ni duplicar datos.
 * - Pomodoro: pausa, retomar, fases que terminan con la app cerrada, bloque registrado una sola vez.
 * - Límite de tiempo para internet (clima / Spotify no bloquean).
 * - Consultas agrupadas (hábitos y ramos) dan lo mismo que antes.
 * Correr: npx tsx scripts/test-flujos.ts
 */
import {
  avanzar,
  duracionFase,
  iniciar,
  leerSesion,
  minutosHechos,
  pausar,
  restante,
  saltar,
  sesionNueva,
} from '../src/estudio/pomodoro';
import { conLimite } from '../src/utils/red';

let ok = 0;
let total = 0;
function prueba(nombre: string, cond: boolean, detalle?: unknown) {
  total++;
  if (cond) ok++;
  else console.error('❌', nombre, detalle !== undefined ? JSON.stringify(detalle) : '');
}

// ---------- Pomodoro ----------
const t0 = 1_000_000;
const MIN = 60_000;
let s = sesionNueva('25', 3, t0);
prueba('nueva: en pausa con 25 min', s.finEn === null && s.restante === 25 * MIN);
s = iniciar(s, t0);
prueba('iniciar: termina en 25 min', s.finEn === t0 + 25 * MIN);
s = pausar(s, t0 + 10 * MIN);
prueba('pausar: guarda lo que falta', s.finEn === null && s.restante === 15 * MIN);
prueba('en pausa el tiempo no corre', restante(s, t0 + 60 * MIN) === 15 * MIN);
s = iniciar(s, t0 + 20 * MIN);
prueba('retomar: sigue desde lo que faltaba', s.finEn === t0 + 35 * MIN);
const id1 = s.id;
let r = avanzar(s, t0 + 34 * MIN);
prueba('antes de terminar no cambia', !r.cambio && !r.terminado);
r = avanzar(s, t0 + 36 * MIN);
prueba('al terminar el enfoque: bloque para registrar', r.terminado?.id === id1 && r.terminado.minutos === 25 && r.terminado.ramo === 3, r.terminado);
prueba('y empieza el descanso desde que terminó', r.sesion.fase === 'descanso' && r.sesion.finEn === t0 + 40 * MIN && r.sesion.ciclos === 1, r.sesion);
const r2 = avanzar(r.sesion, t0 + 36 * MIN + 1000);
prueba('revisar de nuevo no vuelve a entregar el bloque', !r2.terminado);
// App cerrada mucho rato: terminan enfoque y descanso.
const larga = avanzar(iniciar(sesionNueva('25', null, t0), t0), t0 + 3 * 60 * MIN);
prueba('app cerrada: registra el bloque y queda listo para otro', !!larga.terminado && larga.sesion.fase === 'enfoque' && larga.sesion.finEn === null, larga.sesion);
prueba('saltar cambia de fase y de id', saltar(s, t0).fase === 'descanso' && saltar(s, t0).id !== s.id);
const corta = iniciar(sesionNueva('25', null, t0), t0);
prueba('terminar antes de 5 min no cuenta', minutosHechos(corta, t0 + 4 * MIN) === 0);
prueba('terminar a los 12 min cuenta 12', minutosHechos(corta, t0 + 12 * MIN + 30_000) === 12);
prueba('sesión guardada se lee', leerSesion(JSON.stringify(s))?.id === s.id);
prueba('sesión dañada se ignora', leerSesion('{"fase":"x"}') === null && leerSesion('no json') === null);
prueba('duraciones 50/10', duracionFase('descanso', '50') === 10 * MIN);

(async () => {
  // ---------- Límite de tiempo ----------
  const lenta = new Promise<string>((res) => setTimeout(() => res('tarde'), 300));
  prueba('conLimite: corta lo lento', (await conLimite(lenta, 50, 'sin clima')) === 'sin clima');
  prueba('conLimite: deja pasar lo rápido', (await conLimite(Promise.resolve('ok'), 50, 'x')) === 'ok');
  prueba('conLimite: error → valor por defecto', (await conLimite(Promise.reject(new Error('x')), 50, 'def')) === 'def');

  // ---------- Base de datos ----------
  const { crearDbPrueba } = await import('./db-prueba');
  const { registrarBloque, minutosEstudio, crearRamo, listarRamos, resumenRamo, listarRamosSimple, marcarAsistencia, crearEvaluacion } = await import(
    '../src/database/estudio'
  );
  const { crearHabito, alternarHabito, listarHabitos } = await import('../src/database/habitos');
  const { toISODate } = await import('../src/utils/fechas');
  const db = await crearDbPrueba();

  const [a, b] = await Promise.all([registrarBloque(db, 'blq-1', null, 25), registrarBloque(db, 'blq-1', null, 25)]);
  const hoy = toISODate();
  prueba('bloque registrado una sola vez (aunque se pida dos veces)', [a, b].filter(Boolean).length === 1 && (await minutosEstudio(db, hoy, hoy)).total === 25);
  await registrarBloque(db, 'blq-2', null, 25);
  prueba('otro bloque sí suma', (await minutosEstudio(db, hoy, hoy)).total === 50);

  const r1 = await crearRamo(db, { name: 'Álgebra', color: '#38BDF8', teacher: null, room: null, passing: 4, min_attendance: 75 });
  const r2b = await crearRamo(db, { name: 'Física', color: '#F472B6', teacher: null, room: null, passing: 4, min_attendance: 75 });
  await crearEvaluacion(db, { course_id: r1, name: 'P1', weight: 50, grade: 5.5, date: '2026-10-01', study_hours: 0 });
  await crearEvaluacion(db, { course_id: r2b, name: 'P1', weight: 40, grade: 3.5, date: '2026-10-02', study_hours: 0 });
  await marcarAsistencia(db, r1, true, '2026-10-01');
  await marcarAsistencia(db, r1, false, '2026-10-02');
  const agrupado = await listarRamos(db);
  const uno = await Promise.all((await listarRamosSimple(db)).map((x) => resumenRamo(db, x)));
  prueba('ramos: consulta agrupada = una por ramo', JSON.stringify(agrupado) === JSON.stringify(uno), { agrupado, uno });

  const h1 = await crearHabito(db, { name: 'Leer', icon: 'book', color: '#fff' });
  await crearHabito(db, { name: 'Agua', icon: 'water', color: '#fff' });
  await alternarHabito(db, h1, true);
  const hs = await listarHabitos(db);
  prueba('hábitos: consulta agrupada correcta', hs.length === 2 && hs.find((h) => h.id === h1)?.hechoHoy === true && hs.find((h) => h.id !== h1)?.total === 0, hs);

  console.log(`${ok === total ? '✅' : '❌'} Flujos (pomodoro, red, consultas): ${ok}/${total}`);
  if (ok !== total) process.exit(1);
})();

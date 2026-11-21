/**
 * Pruebas del Modo Estudiante: notas chilenas, plan de estudio, horario,
 * repetición espaciada, tarjetas/resumen automáticos, comandos de voz y base de datos.
 * Correr: npx tsx scripts/test-estudio.ts
 */
import {
  buscarRamoPorNombre,
  claseAhora,
  formatoNota,
  leerNota,
  notaNecesaria,
  planEstudio,
  promedio,
  repasar,
  resumirTexto,
  tarjetasDesdeTexto,
} from '../src/estudio/logica';
import { interpretar } from '../src/voice/interpretar';
import { responder } from '../src/voice/ejecutar';
import { crearDbPrueba } from './db-prueba';

let ok = 0;
let total = 0;
function prueba(nombre: string, cond: boolean, detalle?: unknown) {
  total++;
  if (cond) ok++;
  else console.error('❌', nombre, detalle !== undefined ? JSON.stringify(detalle) : '');
}

// ---------- Notas ----------
prueba('promedio ponderado', Math.abs((promedio([{ weight: 30, grade: 5 }, { weight: 30, grade: 6 }, { weight: 40, grade: null }]) ?? 0) - 5.5) < 1e-9);
prueba('promedio simple sin ponderación', promedio([{ weight: 0, grade: 4 }, { weight: 0, grade: 6 }]) === 5);
prueba('promedio vacío', promedio([]) === null);
const n1 = notaNecesaria([{ weight: 30, grade: 3.5 }, { weight: 30, grade: 4 }, { weight: 40, grade: null }], 4);
prueba('nota necesaria 4,4', n1.estado === 'necesita' && n1.necesaria === 4.4, n1);
const n2 = notaNecesaria([{ weight: 50, grade: 7 }, { weight: 50, grade: null }], 4);
prueba('nota necesaria: ya aprobado', n2.estado === 'necesita' ? n2.necesaria <= 1 : n2.estado === 'aprobado', n2);
const n3 = notaNecesaria([{ weight: 80, grade: 2 }, { weight: 20, grade: null }], 4);
prueba('nota necesaria: imposible', n3.estado === 'imposible', n3);
prueba('formato nota con coma', formatoNota(5.55) === '5,6' && formatoNota(3.95) === '4,0');
prueba('leer nota', leerNota('5,5') === 5.5 && leerNota('55') === 5.5 && leerNota('8') === null && leerNota('6') === 6);

// ---------- Plan de estudio ----------
const hoy = new Date(2026, 10, 16); // lunes 16 nov 2026
const plan = planEstudio(4, '2026-11-20', hoy);
prueba('plan: 4 h entre lun y jue', plan.reduce((s, b) => s + b.horas, 0) === 4 && plan.every((b) => b.fecha < '2026-11-20') && plan.length === 4, plan);
const plan2 = planEstudio(1, '2026-11-25', hoy);
prueba('plan: 1 h queda el día antes', plan2.length === 1 && plan2[0].fecha === '2026-11-24' && plan2[0].horas === 1, plan2);
const plan3 = planEstudio(2.5, '2026-11-25', hoy);
prueba('plan: 2,5 h en 2 días', plan3.length === 2 && plan3[1].horas === 1.5, plan3);
prueba('plan: prueba hoy → todo hoy', planEstudio(2, '2026-11-16', hoy)[0]?.fecha === '2026-11-16');

// ---------- Horario ----------
const bloques = [
  { weekday: 1, start_time: '08:30', end_time: '10:00', name: 'Cálculo' },
  { weekday: 1, start_time: '10:15', end_time: '11:45', name: 'Física' },
  { weekday: 3, start_time: '14:00', end_time: '15:30', name: 'Química' },
];
const c1 = claseAhora(bloques, new Date(2026, 10, 16, 9, 0));
prueba('clase ahora + siguiente', c1.actual?.name === 'Cálculo' && c1.siguiente?.name === 'Física' && c1.siguiente.enDias === 0, c1);
const c2 = claseAhora(bloques, new Date(2026, 10, 16, 18, 0));
prueba('siguiente clase otro día', c2.actual === null && c2.siguiente?.name === 'Química' && c2.siguiente.enDias === 2, c2);

// ---------- Repetición espaciada ----------
const t0 = { ease: 2.5, interval: 0, reps: 0 };
const r1 = repasar(t0, 2, hoy);
const r2 = repasar(r1, 2, hoy);
const r3 = repasar(r2, 2, hoy);
prueba('SM-2 intervalos crecen', r1.interval === 1 && r2.interval === 5 && r3.interval > 5, [r1, r2, r3]);
prueba('SM-2 "otra vez" reinicia', repasar(r3, 0, hoy).interval === 0 && repasar(r3, 0, hoy).reps === 0);

// ---------- Tarjetas y resumen ----------
const tarjetas = tarjetasDesdeTexto(`Mitocondria: produce la energía de la célula
- Fotosíntesis - proceso donde las plantas producen glucosa
La célula es la unidad básica de la vida.
P: ¿Capital de Chile?
R: Santiago
Texto suelto sin definición`);
prueba('tarjetas desde apuntes', tarjetas.length === 4 && tarjetas[0].front === '¿Mitocondria?' && tarjetas[2].front === '¿Qué es la célula?' && tarjetas[3].back === 'Santiago', tarjetas);
const largo =
  'La derivada mide el cambio instantáneo de una función. Hoy hablamos del clima en la sala. La derivada de una constante es cero. ' +
  'Las reglas de derivación permiten calcular la derivada rápido. El profe llegó tarde. La regla de la cadena sirve para derivar funciones compuestas. ' +
  'Mañana hay que traer calculadora.';
const res = resumirTexto(largo, 3);
prueba('resumen elige lo importante', res.length === 3 && res.every((o) => /deriva/.test(o)), res);

// ---------- Buscar ramo ----------
const ramos = [{ name: 'Cálculo I' }, { name: 'Física General' }, { name: 'Química Orgánica' }];
prueba('buscar ramo', buscarRamoPorNombre(ramos, 'calculo')?.name === 'Cálculo I' && buscarRamoPorNombre(ramos, 'la fisica')?.name === 'Física General' && buscarRamoPorNombre(ramos, 'historia') === null);

// ---------- Comandos de voz ----------
const casos: [string, string, Record<string, unknown>?][] = [
  ['cómo voy en cálculo', 'nota_promedio', { ramo: 'calculo' }],
  ['cuál es mi promedio', 'nota_promedio', { ramo: null }],
  ['mi promedio de física', 'nota_promedio', { ramo: 'fisica' }],
  ['cuánto necesito en el examen de física para pasar', 'nota_necesito', { ramo: 'fisica' }],
  ['qué nota necesito en cálculo', 'nota_necesito', { ramo: 'calculo' }],
  ['me saqué un 5,5 en la prueba 1 de cálculo', 'nota_agregar', { ramo: 'calculo', nota: 5.5, evaluacion: 'prueba 1' }],
  ['saqué un seis coma dos en química', 'nota_agregar', { ramo: 'quimica', nota: 6.2 }],
  ['qué clase tengo ahora', 'clase_ahora'],
  ['cuál es mi próxima clase', 'clase_ahora'],
  ['qué clases tengo mañana', 'clases_dia'],
  ['falté a física', 'asistencia', { ramo: 'fisica', presente: false }],
  ['fui a clase de cálculo', 'asistencia', { ramo: 'calculo', presente: true }],
  ['cuántas faltas llevo en física', 'asistencia_consulta', { ramo: 'fisica' }],
  ['tengo prueba de química el viernes', 'prueba_agregar', { ramo: 'quimica', nombre: 'Prueba' }],
  ['tengo certamen 2 de cálculo mañana', 'prueba_agregar', { ramo: 'calculo', nombre: 'Certamen 2' }],
  ['cuándo es mi próxima prueba', 'pruebas_proximas'],
  ['modo enfoque', 'pomodoro', { ramo: null }],
  ['empieza un pomodoro de cálculo', 'pomodoro', { ramo: 'calculo' }],
  ['cuánto estudié esta semana', 'estudio_semana'],
  ['resumen de la semana', 'resumen_semana'],
  ['graba la clase', 'estudio_ir', { ruta: '/grabar' }],
  ['escanea mis apuntes', 'estudio_ir', { ruta: '/escanear' }],
  ['repasar tarjetas', 'estudio_ir', { ruta: '/repaso' }],
  ['cuántas tarjetas tengo para repasar', 'tarjetas_pendientes'],
  ['abre mi horario', 'estudio_ir', { ruta: '/horario' }],
  // Lo de antes sigue igual:
  ['cómo voy hoy', 'resumen'],
  ['cómo me fue este mes', 'estadisticas_mes'],
  ['fui al gym', 'gym_hoy'],
  ['mis notas', 'leer_notas'],
  ['cómo uso el pomodoro', 'ayuda_app', { tema: 'pomodoro' }],
  ['cómo agrego un ramo', 'ayuda_app', { tema: 'estudio' }],
  ['cómo hago un respaldo', 'ayuda_app', { tema: 'respaldo' }],
  ['qué clases tengo hoy', 'clases_dia'],
];
for (const [f, tipo, campos] of casos) {
  const r = interpretar(f, hoy) as Record<string, unknown>;
  prueba(`voz: ${f}`, r.tipo === tipo && Object.entries(campos ?? {}).every(([k, v]) => r[k] === v), r);
}

// ---------- Base de datos + ejecutar ----------
(async () => {
  const db = await crearDbPrueba();
  const { crearRamo, guardarBloques, crearEvaluacion, listarRamos, proximasEvaluaciones, crearTarjetas, tarjetasParaHoy, guardarRepaso, registrarEstudio } = await import(
    '../src/database/estudio'
  );
  const idCalc = await crearRamo(db, { name: 'Cálculo I', color: '#38BDF8', teacher: null, room: 'B-204', passing: 4, min_attendance: 75 });
  await crearRamo(db, { name: 'Física General', color: '#F59E0B', teacher: null, room: null, passing: 4, min_attendance: 75 });
  await guardarBloques(db, idCalc, [{ weekday: 1, start_time: '08:30', end_time: '10:00' }]);
  await crearEvaluacion(db, { course_id: idCalc, name: 'Prueba 1', weight: 30, grade: 3.5, date: null, study_hours: 0 });
  await crearEvaluacion(db, { course_id: idCalc, name: 'Prueba 2', weight: 30, grade: 4, date: null, study_hours: 0 });
  await crearEvaluacion(db, { course_id: idCalc, name: 'Examen', weight: 40, grade: null, date: null, study_hours: 0 });

  const a = await responder(db, 'cómo voy en cálculo');
  prueba('resp: promedio cálculo', /3,8/.test(a.texto) && /4,4/.test(a.texto), a.texto);
  const b = await responder(db, 'me saqué un 6 en física');
  prueba('resp: anota nota', /6,0/.test(b.texto) && /Física General/.test(b.texto), b.texto);
  const c = await responder(db, 'falté a física');
  prueba('resp: falta', /0%/.test(c.texto) && /bajo el 75%/.test(c.texto), c.texto);
  const d = await responder(db, 'tengo prueba de física el viernes');
  prueba('resp: prueba + plan', /Anotado/.test(d.texto) && /plan/.test(d.texto), d.texto);
  const tareasPlan = await db.getAllAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tasks WHERE evaluation_id IS NOT NULL');
  prueba('plan crea tareas', (tareasPlan[0]?.n ?? 0) >= 1, tareasPlan);
  const e = await responder(db, 'cuándo es mi próxima prueba');
  prueba('resp: próximas', /Física General/.test(e.texto), e.texto);
  const f = await responder(db, 'modo enfoque de cálculo');
  prueba('resp: pomodoro navega', f.accion?.tipo === 'navegar' && f.accion.ruta.startsWith('/pomodoro?auto=1&ramo='), f.accion);
  await registrarEstudio(db, idCalc, 50);
  const g = await responder(db, 'cuánto estudié esta semana');
  prueba('resp: horas de estudio', /50 min/.test(g.texto), g.texto);
  const h = await responder(db, 'resumen de la semana');
  prueba('resp: resumen semanal', /Esta semana/.test(h.texto) && /estudiaste/.test(h.texto), h.texto);
  const ramos = await listarRamos(db);
  prueba('listar ramos con promedio', ramos.length === 2 && ramos.some((r) => r.promedio === 6), ramos.map((r) => r.promedio));
  prueba('próximas evaluaciones', (await proximasEvaluaciones(db, 14)).filter((x) => x.grade == null).length === 1);
  await crearTarjetas(db, idCalc, [{ front: '¿Derivada de x²?', back: '2x' }]);
  const pend = await tarjetasParaHoy(db);
  prueba('tarjeta para hoy', pend.length === 1);
  await guardarRepaso(db, pend[0], 2);
  prueba('tarjeta repasada sale de hoy', (await tarjetasParaHoy(db)).length === 0);
  const fz = await responder(db, 'necesito concentrarme');
  prueba('parecido: necesito concentrarme → enfoque', fz.intencion === 'pomodoro', fz.intencion);
  const k = await responder(db, 'qué clase tengo ahora');
  prueba('resp: clase ahora', /Cálculo I/.test(k.texto), k.texto);

  console.log(ok === total ? `✅ Modo Estudiante: ${ok}/${total}` : `⚠️ Modo Estudiante: ${ok}/${total}`);
  if (ok !== total) process.exitCode = 1;
})();

/**
 * Pruebas del asistente: ¿entiende las frases? Uso: npx tsx scripts/test-voz.ts
 */
import assert from 'node:assert/strict';

import { interpretar } from '../src/voice/interpretar';
import { detectarActivacion } from '../src/voice/texto';
import { responder } from '../src/voice/ejecutar';
import { crearDbPrueba } from './db-prueba';

const casos: [string, string, Record<string, unknown>?][] = [
  ['¿Qué tareas me faltan hoy?', 'tareas_hoy'],
  ['¿Y esta semana?', 'tareas_semana'],
  ['qué tengo pendiente', 'tareas_hoy'],
  ['Agrega una tarea: comprar pan mañana', 'agregar_tarea', { titulo: 'comprar pan' }],
  ['recuérdame llamar a la abuela el viernes', 'agregar_tarea', { titulo: 'llamar a la abuela' }],
  ['agrega una tarea urgente pagar la luz', 'agregar_tarea', { titulo: 'pagar la luz', prioridad: 'alta' }],
  ['Marca como hecha la tarea comprar pan', 'completar_tarea', { texto: 'comprar pan' }],
  ['ya terminé el informe', 'completar_tarea'],
  ['Anota un gasto de 5 mil en comida', 'agregar_gasto', { monto: 5000, categoria: 'comida' }],
  ['gasté 5 lucas en el almuerzo', 'agregar_gasto', { monto: 5000, categoria: 'comida', nota: 'almuerzo' }],
  ['gasté una luca en micro', 'agregar_gasto', { monto: 1000, categoria: 'transporte' }],
  ['anota un gasto de veinte lucas en el carrete', 'agregar_gasto', { monto: 20000, categoria: 'ocio' }],
  ['¿Cuánto he gastado esta semana?', 'gasto_periodo', { periodo: 'semana' }],
  ['cuánto llevo gastado este mes', 'gasto_periodo', { periodo: 'mes' }],
  ['cuánto me queda del presupuesto', 'presupuesto'],
  ['¿Qué me toca hoy en el gym?', 'gym_hoy'],
  ['¿Cómo va mi racha?', 'racha'],
  ['abona 10 lucas a mi meta', 'abonar_meta', { monto: 10000 }],
  ['¿cuánto peso marqué la última vez?', 'ultimo_peso'],
  ['cuánto levanté en press banca', 'ultimo_peso'],
  ['hola', 'saludo'],
  ['qué puedes hacer', 'ayuda'],
  ['bla bla nada que ver', 'desconocido'],
  ['ey tinzito qué me toca hoy en el gym', 'gym_hoy'],
];

let ok = 0;
for (const [frase, tipo, campos] of casos) {
  const r = interpretar(frase) as Record<string, unknown>;
  try {
    assert.equal(r.tipo, tipo);
    for (const [k, v] of Object.entries(campos ?? {})) assert.equal(r[k], v);
    ok++;
  } catch {
    console.error(`❌ "${frase}" →`, r);
  }
}

// Palabra de activación y sus variantes
const wake: [string, string | null][] = [
  ['ey tinzito', ''],
  ['hey tin zito qué tareas tengo', 'que tareas tengo'],
  ['oye tinsito', ''],
  ['ey tin sito', ''],
  ['ey tinzit0', ''],
  ['tinzito agrega una tarea', 'agrega una tarea'],
  ['tengo que ir al tinto', null],
  ['ey tú', null],
];
for (const [frase, esperado] of wake) {
  const r = detectarActivacion(frase);
  if (r === esperado) ok++;
  else console.error(`❌ activación "${frase}" →`, r, 'esperaba', esperado);
}

(async () => {
// Ejecución real contra una base de datos en memoria
const db = await crearDbPrueba();
const r1 = await responder(db, 'agrega una tarea: comprar pan mañana');
const r2 = await responder(db, 'recuérdame pagar la luz hoy');
const r3 = await responder(db, 'qué tareas me faltan hoy');
const r4 = await responder(db, 'marca como hecha la tarea pagar luz');
const r5 = await responder(db, 'anota un gasto de 5 lucas en comida');
const r6 = await responder(db, 'cuánto he gastado esta semana');
const r7 = await responder(db, 'abona 10 lucas a mi meta');
for (const [r, debe] of [[r1, 'Comprar pan'], [r2, 'Pagar la luz'], [r3, 'Pagar la luz'], [r4, 'como hecha'], [r5, '$5.000'], [r6, '$5.000'], [r7, 'No tienes metas']] as const) {
  if (r.texto.includes(debe)) ok++;
  else console.error('❌ respuesta', r.texto, '— esperaba', debe);
}
const total = casos.length + wake.length + 7;
console.log(ok === total ? `✅ Asistente: ${ok}/${total} frases entendidas` : `⚠️ ${ok}/${total}`);
if (ok !== total) process.exit(1);
})();

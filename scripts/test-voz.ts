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
  // --- Nuevas ---
  ['¿cómo está el tiempo?', 'clima', { cuando: 'ahora' }],
  ['¿va a llover mañana?', 'clima', { cuando: 'fecha', foco: 'lluvia' }],
  ['necesito paraguas hoy', 'clima', { cuando: 'hoy', foco: 'lluvia' }],
  ['qué temperatura hace', 'clima', { foco: 'temperatura' }],
  ['cómo va a estar el clima esta semana', 'clima', { cuando: 'semana' }],
  ['qué tengo mañana', 'tareas_dia'],
  ['tareas del viernes', 'tareas_dia'],
  ['pasa la tarea comprar pan para mañana', 'mover_tarea', { texto: 'comprar pan' }],
  ['borra la tarea comprar pan', 'eliminar_tarea', { texto: 'comprar pan' }],
  ['borra el último gasto', 'borrar_ultimo_gasto'],
  ['cuánto he gastado en comida este mes', 'gasto_categoria', { categoria: 'comida', periodo: 'mes' }],
  ['en qué gasté hoy', 'ultimos_gastos', { periodo: 'hoy' }],
  ['cambia mi presupuesto a 120 lucas', 'cambiar_presupuesto', { monto: 120000 }],
  ['quiero ahorrar 500 lucas para un viaje', 'crear_meta', { nombre: 'viaje', monto: 500000 }],
  ['hice 3 series de 10 de press banca con 40 kilos', 'registrar_serie', { ejercicio: 'press banca', series: 3, reps: 10, peso: 40 }],
  ['anota sentadilla 4x12 con 60', 'registrar_serie', { ejercicio: 'sentadilla', series: 4, reps: 12, peso: 60 }],
  ['tres series de doce de curl de bíceps con quince kilos', 'registrar_serie', { ejercicio: 'curl biceps', series: 3, reps: 12, peso: 15 }],
  ['anota mi peso 78,5', 'registrar_peso', { kg: 78.5 }],
  ['me pesé y marqué 77 kilos', 'registrar_peso', { kg: 77 }],
  ['crea un hábito de leer 20 minutos', 'crear_habito', { nombre: 'leer 20 minutos' }],
  ['anota una nota: comprar regalo para la mamá', 'crear_nota', { texto: 'comprar regalo para la mama' }],
  ['toma nota que el gas vence el 15', 'crear_nota'],
  ['léeme mis notas', 'leer_notas'],
  ['recuérdame en 20 minutos sacar la ropa', 'recordatorio', { texto: 'sacar la ropa', segundos: 1200 }],
  ['recuérdame en media hora llamar al Seba', 'recordatorio', { segundos: 1800 }],
  ['avísame en una hora que salga', 'recordatorio', { segundos: 3600 }],
  ['recuérdame mañana pagar la luz', 'agregar_tarea', { titulo: 'pagar la luz' }],
  ['abre whatsapp', 'abrir', { destino: 'whatsapp' }],
  ['llévame a mis gastos', 'abrir', { destino: 'gastos' }],
  ['cómo voy hoy', 'resumen'],
  ['qué hora es', 'fecha_hora', { que: 'hora' }],
  ['motívame', 'motivacion'],
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
// Preguntas de seguimiento con contexto
const seg: [string, string, string][] = [
  ['¿y mañana?', 'clima', 'clima'],
  ['y mañana', 'tareas_hoy', 'tareas_dia'],
  ['y este mes', 'gasto_periodo', 'gasto_periodo'],
];
for (const [frase, ultimo, esperado] of seg) {
  const r = interpretar(frase, new Date(), { ultimo: ultimo as never });
  if (r.tipo === esperado) ok++;
  else console.error('❌ seguimiento', frase, r);
}
// Ejecución de las acciones nuevas
const pruebas2: [string, string][] = [
  ['hice 3 series de 10 de press banca con 40 kilos', 'Press banca, 3 series de 10 con 40 kg'],
  ['anota mi peso 78,5', '78.5 kg'],
  ['crea un hábito de tomar agua', 'Tomar agua'],
  ['anota una nota: llamar al dentista', 'Llamar al dentista'],
  ['quiero ahorrar 300 lucas para un viaje', '$300.000'],
  ['abona 10 lucas a mi meta', 'Abonado $10.000'],
  ['cambia mi presupuesto a 120 lucas', '$120.000'],
  ['cuánto he gastado en comida este mes', 'En comida llevas $5.000'],
  ['borra el último gasto', 'Borré el último gasto: $5.000'],
  ['pasa la tarea comprar pan para el viernes', 'Pasé "Comprar pan"'],
  ['recuérdame en 20 minutos sacar la ropa', 'en 20 minutos'],
  ['abre whatsapp', 'Abriendo WhatsApp'],
  ['llévame a mis gastos', 'Vamos'],
  ['cómo voy hoy', 'esta semana'],
  ['léeme mis notas', 'Llamar al dentista'],
];
for (const [frase, debe] of pruebas2) {
  const r = await responder(db, frase);
  if (r.texto.includes(debe)) ok++;
  else console.error('❌ respuesta', frase, '→', r.texto, '— esperaba', debe);
}
const acc = await responder(db, 'recuérdame en 20 minutos sacar la ropa');
if (acc.accion?.tipo === 'recordatorio' && acc.accion.segundos === 1200) ok++; else console.error('❌ acción recordatorio', acc);
const total = casos.length + wake.length + 7 + seg.length + pruebas2.length + 1;
console.log(ok === total ? `✅ Asistente: ${ok}/${total} frases entendidas` : `⚠️ ${ok}/${total}`);
if (ok !== total) process.exit(1);
})();


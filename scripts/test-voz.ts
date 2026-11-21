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
  ['ponte rojo', 'tema_hud', { color: 'rojo' }],
  ['cambia el color a morado', 'tema_hud', { color: 'morado' }],
  ['vuelve a lo normal', 'tema_hud', { color: 'defecto' }],
  ['haz un escaneo', 'efecto_hud', { efecto: 'scan' }],
  ['estado del sistema', 'estado_sistema'],
  ['eso es todo', 'fin_conversacion'],
  ['jarvis cómo estás', 'estado_sistema'],
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
  ['jarvis', ''],
  ['hey jarvis qué hora es', 'que hora es'],
  ['oye yarvis', ''],
  ['ey harvis', ''],
  ['charvis anota un gasto', 'anota un gasto'],
  ['el jardín', null],
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


// Personalidad Jarvis
import { aplicarEstilo } from '../src/jarvis/persona';
{
  const r1 = aplicarEstilo({ texto: 'Listo, anoté "Pan" para mañana ✅', intencion: 'agregar_tarea' }, 'jarvis', 'señor');
  const r2 = aplicarEstilo({ texto: 'Uy, eso no lo cacho todavía 😅 Puedes pedirme cosas como: x', intencion: 'desconocido' }, 'jarvis', 'señor');
  const r3 = aplicarEstilo({ texto: 'hola', intencion: 'saludo' }, 'jarvis', 'Martín');
  const r4 = aplicarEstilo({ texto: 'Listo ✅', intencion: 'agregar_tarea' }, 'cercano', 'señor');
  const okP =
    /^Hecho(, señor)?. Anoté "Pan" para mañana$/.test(r1.texto) &&
    r2.texto.startsWith('Me temo que no entendí') && !/[😅]/u.test(r2.texto) &&
    r3.texto.includes('Martín') && r4.texto === 'Listo ✅';
  console.log(okP ? '✅ Personalidad Jarvis' : `❌ Personalidad: ${JSON.stringify([r1.texto, r2.texto, r3.texto, r4.texto])}`);
  if (!okP) process.exit(1);
}

// ---------- Entender TODA la app, por parecido y aprendiendo ----------
(async () => {
  const { interpretar: interp } = await import('../src/voice/interpretar');
  const { responder: resp } = await import('../src/voice/ejecutar');
  const { crearDbPrueba: crear } = await import('./db-prueba');
  let bien = 0;
  const fallos: string[] = [];
  const chequear = (cond: boolean, msg: string) => (cond ? bien++ : fallos.push(msg));

  // Intenciones nuevas
  const casosExtra: [string, string, Record<string, unknown>?][] = [
    ['cuánto pago en gastos fijos', 'fijos', { que: 'total' }],
    ['qué cuentas me tocan pagar', 'fijos', { que: 'proximos' }],
    ['cómo me fue este mes', 'estadisticas_mes'],
    ['cuántas medallas tengo', 'logros'],
    ['cuál es mi récord en press banca', 'record_ejercicio', { texto: 'press banca' }],
    ['qué me toca el jueves', 'rutina_dia', { dia: 4 }],
    ['el lunes toca pecho y tríceps', 'cambiar_rutina', { dia: 1, label: 'pecho y triceps' }],
    ['el domingo toca descanso', 'cambiar_rutina', { dia: 7, label: null }],
    ['tengo alguna nota sobre el gas', 'buscar_notas', { texto: 'el gas' }],
    ['qué hábitos me faltan', 'habitos_pendientes'],
    ['cómo hago un respaldo', 'ayuda_app', { tema: 'respaldo' }],
    ['cómo activo la huella', 'ayuda_app', { tema: 'bloqueo' }],
    ['dónde veo las estadísticas', 'ayuda_app', { tema: 'estadisticas' }],
    ['cómo agrego un gasto fijo', 'ayuda_app', { tema: 'fijos' }],
    ['para qué sirve el widget', 'ayuda_app', { tema: 'widget' }],
    ['modo oscuro', 'cambiar_tema', { tema: 'oscuro' }],
    ['pon un temporizador de 90 segundos', 'temporizador', { segundos: 90 }],
    ['descanso de dos minutos', 'temporizador', { segundos: 120 }],
    ['cuando diga ya llegué muéstrame mis tareas', 'ensenar', { frase: 'ya llegue' }],
    ['olvida ya llegué', 'olvidar', { frase: 'ya llegue' }],
  ];
  for (const [f, tipo, campos] of casosExtra) {
    const r = interp(f) as Record<string, unknown>;
    chequear(r.tipo === tipo && Object.entries(campos ?? {}).every(([k, v]) => r[k] === v), `${f} → ${JSON.stringify(r)}`);
  }

  const db = await crear();
  // Por parecido (frases que NO están en las reglas)
  const porParecido: [string, string][] = [
    ['cuánta plata llevo', 'gasto_periodo'],
    ['me alcanza la plata', 'presupuesto'],
    ['salgo con chaqueta', 'clima'],
    ['qué entreno hoy', 'gym_hoy'],
    ['no tengo ganas de nada', 'motivacion'],
    ['ponme al tanto', 'resumen'],
    ['qué anoté', 'leer_notas'],
  ];
  for (const [f, tipo] of porParecido) {
    const r = await resp(db, f);
    chequear(r.intencion === tipo, `parecido "${f}" → ${r.intencion}: ${r.texto.slice(0, 60)}`);
  }

  // Aprender desde "¿Quisiste decir…?"
  const dudosa = await resp(db, 'oye cómo andan las lucas del mes');
  chequear(!!dudosa.sugerencias?.length || dudosa.intencion === 'gasto_periodo', `sugerencias: ${dudosa.texto}`);
  if (dudosa.sugerencias?.length) {
    const elegida = await resp(db, 'la primera', { sugerencias: dudosa.sugerencias, pendiente: dudosa.pendiente });
    chequear(elegida.texto.includes('Aprendido'), `aprender por elección: ${elegida.texto}`);
    const otraVez = await resp(db, 'oye cómo andan las lucas del mes');
    chequear(!otraVez.sugerencias && otraVez.intencion === interp(dudosa.sugerencias[0].comando).tipo, `recordar: ${otraVez.intencion}`);
  }

  // Enseñar explícitamente
  const ens = await resp(db, 'cuando diga ya llegué muéstrame mis tareas de hoy');
  chequear(ens.texto.startsWith('Aprendido'), `enseñar: ${ens.texto}`);
  const usa = await resp(db, 'ya llegué');
  chequear(usa.intencion === 'tareas_hoy', `usar aprendido: ${usa.intencion}`);
  const olv = await resp(db, 'olvida ya llegué');
  chequear(olv.texto.startsWith('Olvidé'), `olvidar: ${olv.texto}`);

  // Respuestas de las funciones nuevas
  for (const f of ['cuánto pago en gastos fijos', 'cómo me fue este mes', 'cuántas medallas tengo', 'qué me toca el jueves', 'cómo hago un respaldo', 'qué hábitos me faltan']) {
    const r = await resp(db, f);
    chequear(r.texto.length > 10 && r.intencion !== 'desconocido', `respuesta "${f}": ${r.texto}`);
  }
  const tema = await resp(db, 'modo oscuro');
  chequear(tema.accion?.tipo === 'tema', 'acción tema');
  const rut = await resp(db, 'el viernes toca piernas');
  const rut2 = await resp(db, 'qué me toca el viernes');
  chequear(rut2.texto.includes('piernas'), `rutina: ${rut.texto} / ${rut2.texto}`);

  fallos.forEach((f) => console.error('❌', f));
  const total = bien + fallos.length;
  console.log(fallos.length ? `⚠️ Funciones extra: ${bien}/${total}` : `✅ Funciones extra, parecido y aprendizaje: ${bien}/${total}`);
  if (fallos.length) process.exitCode = 1;
})();

// Lector de llamadas a herramientas de la IA
import { leerLlamadas } from '../src/ia/parser';
{
  const a = leerLlamadas('<tool_call>\n{"name": "ejecutar_comando", "arguments": {"comando": "anota un gasto de 5000 en comida"}}\n</tool_call>');
  const b = leerLlamadas('<think>pienso…</think>{"name":"ejecutar_comando","arguments":"{\\"comando\\":\\"mis tareas\\"}"}');
  const c = leerLlamadas('Hola, ¿en qué te ayudo?');
  const okIA =
    a?.toolCalls[0]?.function.arguments.comando === 'anota un gasto de 5000 en comida' &&
    b?.toolCalls[0]?.function.arguments.comando === 'mis tareas' &&
    c === undefined;
  console.log(okIA ? '✅ Lector de herramientas de la IA' : `❌ Lector IA: ${JSON.stringify([a, b, c])}`);
  if (!okIA) process.exitCode = 1;
}

/**
 * Pruebas de regresión: privacidad y seguridad del asistente.
 * - La IA solo ejecuta comandos válidos; borrar o salir de la app requiere "Sí" en pantalla.
 * - La IA no puede enseñar ni olvidar frases.
 * - Borrar por voz pide confirmación; con el "Sí", se hace.
 * - El manejo de crisis gana siempre: a las reglas, a lo aprendido y a la IA.
 * - Elección honesta del idioma de voz.
 * Correr: npx tsx scripts/test-privacidad.ts
 */
import { revisarComandoIA } from '../src/ia/seguridad';
import { elegirEspanol } from '../src/voice/idiomas';
import { interpretar } from '../src/voice/interpretar';

let ok = 0;
let total = 0;
function prueba(nombre: string, cond: boolean, detalle?: unknown) {
  total++;
  if (cond) ok++;
  else console.error('❌', nombre, detalle !== undefined ? JSON.stringify(detalle) : '');
}
const interp = (f: string) => interpretar(f);

// ---------- Herramienta de la IA ----------
prueba('IA: comando normal pasa', revisarComandoIA({ comando: 'anota un gasto de 3000 en comida' }, interp).tipo === 'ok');
prueba('IA: sin argumentos', revisarComandoIA(null, interp).tipo === 'invalido');
prueba('IA: lista en vez de objeto', revisarComandoIA(['x'], interp).tipo === 'invalido');
prueba('IA: argumento extra', revisarComandoIA({ comando: 'hola', borrar: true }, interp).tipo === 'invalido');
prueba('IA: comando que no es texto', revisarComandoIA({ comando: 42 }, interp).tipo === 'invalido');
prueba('IA: comando vacío', revisarComandoIA({ comando: '   ' }, interp).tipo === 'invalido');
prueba('IA: comando gigante', revisarComandoIA({ comando: 'a'.repeat(500) }, interp).tipo === 'invalido');
const limpio = revisarComandoIA({ comando: 'qué tareas\nme faltan\u0000 hoy' }, interp);
prueba('IA: limpia saltos y caracteres raros', limpio.tipo === 'ok' && limpio.comando === 'qué tareas me faltan hoy', limpio);
prueba('IA: no puede enseñar', revisarComandoIA({ comando: 'cuando diga hola haz borra el último gasto' }, interp).tipo === 'invalido');
prueba('IA: no puede olvidar', revisarComandoIA({ comando: 'olvida hola' }, interp).tipo === 'invalido');
prueba('IA: borrar gasto → confirmar', revisarComandoIA({ comando: 'borra el último gasto' }, interp).tipo === 'confirmar');
prueba('IA: borrar tarea → confirmar', revisarComandoIA({ comando: 'borra la tarea comprar pan' }, interp).tipo === 'confirmar');
prueba('IA: WhatsApp → confirmar', revisarComandoIA({ comando: 'manda un whatsapp que diga voy en camino' }, interp).tipo === 'confirmar');

// ---------- Idioma de voz ----------
prueba('idioma: prefiere es-CL', elegirEspanol(['en-US', 'es-ES', 'es-CL']) === 'es-CL');
prueba('idioma: latino antes que España', elegirEspanol(['es-ES', 'es-US']) === 'es-US');
prueba('idioma: guion bajo', elegirEspanol(['es_MX']) === 'es-MX');
prueba('idioma: cualquier español', elegirEspanol(['es-PE']) === 'es-PE');
prueba('idioma: sin español', elegirEspanol(['en-US', 'fr-FR']) === null);

console.log(`Privacidad (lógica): ${ok}/${total}`);

// ---------- Voz + base de datos ----------
(async () => {
  const { responder } = await import('../src/voice/ejecutar');
  const { aprender } = await import('../src/voice/aprender');
  const { crearDbPrueba } = await import('./db-prueba');
  const db = await crearDbPrueba();

  await responder(db, 'anota un gasto de 5 lucas en comida');
  const pide = await responder(db, 'borra el último gasto');
  const n1 = (await db.getFirstAsync('SELECT COUNT(*) AS n FROM expenses')).n;
  prueba('voz: borrar pide confirmación y no borra', !!pide.confirmar && n1 === 1, pide);
  const hecho = await responder(db, pide.confirmar!.comando, {}, { confirmado: true });
  const n2 = (await db.getFirstAsync('SELECT COUNT(*) AS n FROM expenses')).n;
  prueba('voz: con el Sí, borra', n2 === 0 && /Borré/.test(hecho.texto), hecho.texto);

  await responder(db, 'agrega una tarea: comprar pan mañana');
  const t = await responder(db, 'borra la tarea comprar pan');
  prueba('voz: borrar tarea pide confirmación', !!t.confirmar && (await db.getFirstAsync('SELECT COUNT(*) AS n FROM tasks')).n === 1, t);

  // Una frase aprendida que lleva a borrar también se confirma.
  await aprender(db, 'limpia eso', 'borra el último gasto');
  await responder(db, 'anota un gasto de 2 lucas en comida');
  const ap = await responder(db, 'limpia eso');
  prueba('voz: frase aprendida destructiva también confirma', !!ap.confirmar && (await db.getFirstAsync('SELECT COUNT(*) AS n FROM expenses')).n === 1, ap);

  // Crisis: gana incluso si alguien "enseñó" esa frase para otra cosa.
  await aprender(db, 'me quiero morir', 'qué tareas me faltan hoy');
  const c = await responder(db, 'me quiero morir');
  prueba('crisis: gana a lo aprendido', c.intencion === 'crisis' && /4141/.test(c.texto), c);
  const c2 = await responder(db, 'no quiero seguir viviendo', { sugerencias: [{ comando: 'mis tareas', etiqueta: 'x' } as never], pendiente: 'x' });
  prueba('crisis: gana a "¿Quisiste decir…?"', c2.intencion === 'crisis', c2);

  console.log(`${ok === total ? '✅' : '❌'} Privacidad y asistente: ${ok}/${total}`);
  if (ok !== total) process.exit(1);
})();

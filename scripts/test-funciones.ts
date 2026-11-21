/**
 * Pruebas de las funciones nuevas: Inicio configurable, buscador, hábitos por días,
 * gastos repetidos, CSV, presupuestos por categoría y configuración inicial.
 * Correr: npx tsx scripts/test-funciones.ts
 */
import { buscarFunciones, FUNCIONES } from '../src/inicio/funciones';
import { alternar, leerModulos, MODULOS, mover, porDefecto } from '../src/inicio/modulos';
import { buscarDuplicados, clavePar, gastosACSV } from '../src/finanzas/duplicados';

let ok = 0;
let total = 0;
function prueba(nombre: string, cond: boolean, detalle?: unknown) {
  total++;
  if (cond) ok++;
  else console.error('❌', nombre, detalle !== undefined ? JSON.stringify(detalle) : '');
}

// ---------- Inicio ----------
prueba('inicio: por defecto todo visible', leerModulos(null).length === MODULOS.length && leerModulos(null).every((m) => m.visible));
prueba('inicio: dañado → por defecto', leerModulos('{mal').length === MODULOS.length);
const guardado = JSON.stringify([{ id: 'habitos', visible: true }, { id: 'clima', visible: false }, { id: 'inventado', visible: true }, { id: 'habitos', visible: false }]);
const l = leerModulos(guardado);
prueba('inicio: respeta tu orden, ignora ids raros y repetidos', l[0].id === 'habitos' && l[1].id === 'clima' && !l[1].visible && l.length === MODULOS.length, l);
prueba('inicio: módulos nuevos aparecen al final visibles', l.slice(2).every((m) => m.visible));
const sub = mover(porDefecto(), 'clima', -1);
prueba('inicio: subir', sub[0].id === 'clima');
prueba('inicio: no sale del borde', mover(porDefecto(), 'rapido', -1)[0].id === 'rapido');
prueba('inicio: ocultar', alternar(porDefecto(), 'musica').find((m) => m.id === 'musica')?.visible === false);

// ---------- Buscador ----------
prueba('buscar: vacío = todo', buscarFunciones('').length === FUNCIONES.length);
prueba('buscar: "plata" → Gastos', buscarFunciones('plata')[0]?.ruta === '/gastos', buscarFunciones('plata').map((f) => f.ruta));
prueba('buscar: sin tildes "boleta"', buscarFunciones('BOLETA').some((f) => f.ruta === '/boleta'));
prueba('buscar: "respirar" → calma', buscarFunciones('respirar')[0]?.ruta === '/calma');
prueba('buscar: varias palabras', buscarFunciones('gastos repetidos')[0]?.ruta === '/duplicados');
prueba('buscar: nada', buscarFunciones('xyzw').length === 0);

// ---------- Repetidos y CSV ----------
const g = (id: number, amount: number, date: string, note: string | null = null) => ({ id, amount, date, category: 'comida', note });
const pares = buscarDuplicados([g(1, 5990, '2026-11-10', 'LIDER · BancoEstado'), g(2, 5990, '2026-11-10', 'Lider'), g(3, 5990, '2026-11-20'), g(4, 1000, '2026-11-11'), g(5, 1000, '2026-11-14')]);
prueba('repetidos: mismo monto y día', pares.length === 1 && pares[0].a.id === 1 && pares[0].b.id === 2, pares);
prueba('repetidos: 1 día de diferencia sí', buscarDuplicados([g(1, 3000, '2026-11-10'), g(2, 3000, '2026-11-11')]).length === 1);
prueba('repetidos: 2 días no', buscarDuplicados([g(1, 3000, '2026-11-10'), g(2, 3000, '2026-11-12')]).length === 0);
prueba('repetidos: ignorados no vuelven', buscarDuplicados([g(1, 3000, '2026-11-10'), g(2, 3000, '2026-11-10')], new Set([clavePar(2, 1)])).length === 0);
prueba('repetidos: tres iguales → un par (no se repite un gasto)', buscarDuplicados([g(1, 3000, '2026-11-10'), g(2, 3000, '2026-11-10'), g(3, 3000, '2026-11-10')]).length === 1);
const csv = gastosACSV([g(1, 5990, '2026-11-10', 'Pan; leche "light"'), g(2, 1200, '2026-11-11')], () => 'Comida');
prueba('csv: BOM, encabezado y ; ', csv.startsWith('﻿Fecha;Monto;Categoría;Nota\r\n'), csv);
prueba('csv: escapa ; y comillas', csv.includes('"Pan; leche ""light"""'), csv);

(async () => {
  const { crearDbPrueba } = await import('./db-prueba');
  const { calcularRacha, calcularMejorRacha, crearHabito, listarHabitos, leerDias, tocaEl, alternarHabito } = await import('../src/database/habitos');
  const { avancePorCategoria, guardarPresupuesto, posiblesDuplicados, marcarNoDuplicado, hayGastoParecido } = await import('../src/database/presupuestos');
  const { debeMostrarBienvenida, setSetting } = await import('../src/database/queries');
  const { toISODate } = await import('../src/utils/fechas');

  // ---------- Hábitos por días ----------
  // Semana del lunes 2026-11-16: hábito lunes/miércoles/viernes.
  const lmv = [1, 3, 5];
  prueba('días: leer', JSON.stringify(leerDias('5,1,3,9')) === '[1,3,5]' && leerDias('1,2,3,4,5,6,7') === null && leerDias(null) === null);
  prueba('días: toca el lunes, no el martes', tocaEl(lmv, '2026-11-16') && !tocaEl(lmv, '2026-11-17'));
  const marcadas = new Set(['2026-11-16', '2026-11-18', '2026-11-20']); // L, M, V
  prueba('racha: días que no tocan no la cortan', calcularRacha(marcadas, '2026-11-21', lmv) === 3, calcularRacha(marcadas, '2026-11-21', lmv));
  prueba('racha diaria igual que antes', calcularRacha(marcadas, '2026-11-21', null) === 1);
  prueba('mejor racha con días', calcularMejorRacha([...marcadas].sort(), lmv) === 3);
  prueba('falta un día que tocaba: se corta', calcularRacha(new Set(['2026-11-16', '2026-11-20']), '2026-11-21', lmv) === 1);

  const db = await crearDbPrueba();
  prueba('bienvenida: app vacía la muestra', await debeMostrarBienvenida(db));
  const idH = await crearHabito(db, { name: 'Correr', icon: 'walk', color: '#fff', days: [2, 4] });
  const h = (await listarHabitos(db)).find((x) => x.id === idH)!;
  prueba('hábito guarda sus días', h.days === '2,4', h);
  await alternarHabito(db, idH, true);
  prueba('bienvenida: con datos ya no aparece', !(await debeMostrarBienvenida(db)));

  // ---------- Presupuestos ----------
  const hoy = toISODate();
  await db.runAsync("INSERT INTO expenses (amount, category, date, note) VALUES (12000, 'comida', ?, 'Lider')", hoy);
  await db.runAsync("INSERT INTO expenses (amount, category, date) VALUES (3000, 'transporte', ?)", hoy);
  await guardarPresupuesto(db, 'comida', 50000);
  const av = await avancePorCategoria(db);
  const comida = av.find((a) => a.category === 'comida');
  const transp = av.find((a) => a.category === 'transporte');
  prueba('presupuesto: límite y gastado', comida?.limite === 50000 && comida.gastado === 12000 && transp?.limite === 0 && transp.gastado === 3000, av);
  await guardarPresupuesto(db, 'comida', 0);
  prueba('presupuesto: 0 lo quita', (await avancePorCategoria(db)).find((a) => a.category === 'comida')?.limite === 0);

  // ---------- Repetidos en la base ----------
  prueba('parecido: avisa antes de anotar', (await hayGastoParecido(db, 12000, hoy))?.note === 'Lider');
  prueba('parecido: otro monto no', (await hayGastoParecido(db, 12001, hoy)) === null);
  await db.runAsync("INSERT INTO expenses (amount, category, date, note) VALUES (12000, 'comida', ?, 'LIDER · BancoEstado')", hoy);
  const pd = await posiblesDuplicados(db);
  prueba('repetidos en la base', pd.length === 1, pd);
  await marcarNoDuplicado(db, pd[0].b.id, pd[0].a.id);
  prueba('"no es repetido" lo esconde', (await posiblesDuplicados(db)).length === 0);
  await db.runAsync('DELETE FROM expenses WHERE id = ?', pd[0].a.id);
  prueba('borrar un gasto limpia sus marcas (cascada)', (await db.getFirstAsync('SELECT COUNT(*) AS n FROM expense_pairs_ok')).n === 0);
  await setSetting(db, 'bienvenida', '1');

  console.log(`${ok === total ? '✅' : '❌'} Funciones nuevas (inicio, buscador, hábitos, presupuestos, repetidos): ${ok}/${total}`);
  if (ok !== total) process.exit(1);
})();

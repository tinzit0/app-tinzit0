/**
 * Pruebas: avisos del banco, boletas, proyección de gastos y asistencia por ubicación.
 * Correr: npx tsx scripts/test-finanzas.ts
 */
import { clasesAsistidas } from '../src/estudio/logica';
import { esAppDeBanco, interpretarAviso, leerComercio, leerMonto, nombreBanco } from '../src/finanzas/banco';
import { leerBoleta } from '../src/finanzas/boleta';
import { proyectar } from '../src/finanzas/proyeccion';

let ok = 0;
let total = 0;
function prueba(nombre: string, cond: boolean, detalle?: unknown) {
  total++;
  if (cond) ok++;
  else console.error('❌', nombre, detalle !== undefined ? JSON.stringify(detalle) : '');
}

// ---------- Avisos del banco ----------
const compras: [string, string, number, string | null, string][] = [
  ['Compra aprobada', 'Compra por $5.990 en LIDER EXPRESS con tu tarjeta terminada en 1234', 5990, 'LIDER EXPRESS', 'comida'],
  ['CMR', 'Compraste $12.500 en UBER *TRIP el 20/11', 12500, 'UBER', 'transporte'],
  ['Cargo en tu cuenta', 'Se realizó un cargo de $8.990 en NETFLIX.COM', 8990, 'NETFLIX.COM', 'suscripciones'],
  ['CuentaRUT', 'Pagaste $3.200 en COPEC con tu CuentaRUT', 3200, 'COPEC', 'transporte'],
  ['Transacción', 'Se realizó una compra por $ 45.000 en FARMACIAS CRUZ VERDE.', 45000, 'FARMACIAS CRUZ VERDE', 'salud'],
  ['Compra', 'Utilizaste tu tarjeta de débito por $2.500 en MINIMARKET DON JUAN', 2500, 'MINIMARKET DON JUAN', 'comida'],
];
for (const [title, text, monto, comercio, cat] of compras) {
  const r = interpretarAviso({ title, text });
  prueba(`compra: ${text}`, r.tipo === 'compra' && r.monto === monto && (comercio === null || (r.comercio ?? '').startsWith(comercio.split(' ')[0])) && r.categoria === cat, r);
}
const ignorar: [string, string][] = [
  ['Abono recibido', 'Recibiste un abono de $150.000 en tu CuentaRUT'],
  ['Transferencia', 'Te transfirieron $20.000'],
  ['Clave dinámica', 'Tu código de verificación es 123456'],
  ['¡Oferta!', 'Aprovecha 30% de descuento exclusivo en Falabella'],
  ['Pago recibido', 'Recibimos el pago de tu tarjeta CMR por $80.000'],
  ['Compra rechazada', 'Tu compra por $9.990 fue rechazada'],
  ['Hola', 'Tu estado de cuenta ya está disponible'],
];
for (const [title, text] of ignorar) {
  const r = interpretarAviso({ title, text });
  prueba(`ignorar: ${text}`, r.tipo === 'ignorar', r);
}
const tr = interpretarAviso({ title: 'Transferencia exitosa', text: 'Transferiste $15.000 a Juan Pérez' });
prueba('transferencia enviada', tr.tipo === 'transferencia' && tr.monto === 15000, tr);
prueba('leer monto con espacios', leerMonto('monto: $ 1.234.567') === 1234567);
prueba('comercio nulo si no hay', leerComercio('Compra por $5.000') === null);
prueba('apps de banco', esAppDeBanco('cl.bancoestado.app') && esAppDeBanco('com.falabella.cmr') && !esAppDeBanco('com.whatsapp'));
prueba('nombre banco', nombreBanco('cl.bancoestado.mobile') === 'BancoEstado' && nombreBanco('cl.cmr.app') === 'Falabella');

// ---------- Boletas ----------
const hoy = new Date(2026, 10, 21);
const b1 = leerBoleta(
  `SUPERMERCADO LIDER
RUT 76.042.014-K
BOLETA ELECTRONICA N° 123456
FECHA 18/11/2026 HORA 19:22
PAN AMASADO        1.990
LECHE              1.250
SUBTOTAL           3.240
IVA                  517
TOTAL $            3.240
EFECTIVO           5.000
VUELTO             1.760`,
  hoy,
);
prueba('boleta: total', b1.monto === 3240, b1);
prueba('boleta: comercio', b1.comercio === 'SUPERMERCADO LIDER', b1);
prueba('boleta: fecha', b1.fecha === '2026-11-18', b1);
prueba('boleta: categoría', b1.categoria === 'comida', b1);
const b2 = leerBoleta(`COPEC\nCasa Matriz\n21-11-26\nGASOLINA 93\nTOTAL\n$ 25.000`, hoy);
prueba('boleta: total en la línea siguiente', b2.monto === 25000 && b2.categoria === 'transporte' && b2.fecha === '2026-11-21', b2);
const b3 = leerBoleta(`Cafe La Esquina\nCappuccino $2.900\nQueque $1.800\n$4.700`, hoy);
prueba('boleta: sin TOTAL usa el mayor con $', b3.monto === 4700 && b3.comercio === 'Cafe La Esquina', b3);
const b4 = leerBoleta(`TIENDA\nFecha 05/03/2031\nTotal: 1.000`, hoy);
prueba('boleta: fecha futura → hoy', b4.fecha === '2026-11-21' && b4.monto === 1000, b4);

// ---------- Proyección ----------
// Sábado 21 nov 2026: quedan sábado y domingo (2 días).
const p = proyectar({ hoy, presupuestoSemanal: 70_000, gastoSemanaAntesDeHoy: 50_000, gastoHoy: 3_000, gastoMes: 150_000, fijosCobradosMes: 30_000, fijosPendientesMes: 10_000, gastoMesAnterior: 200_000 });
prueba('por día', p.porDia === 10_000 && p.quedaHoy === 7_000 && p.diasRestantesSemana === 2, p);
// variable 120.000 en 21 días → ~5.714/día × 9 días = 51.429 + 150.000 + 10.000
prueba('fin de mes', p.finDeMes === 211_429, p);
prueba('estado pasado', p.presupuestoMes === 300_000 && p.estado === 'bien', p);
const sinPres = proyectar({ hoy, presupuestoSemanal: 0, gastoSemanaAntesDeHoy: 0, gastoHoy: 0, gastoMes: 0, fijosCobradosMes: 0, fijosPendientesMes: 0, gastoMesAnterior: 0 });
prueba('sin presupuesto', sinPres.porDia === null && sinPres.estado === 'sin_presupuesto');
const gastado = proyectar({ hoy, presupuestoSemanal: 50_000, gastoSemanaAntesDeHoy: 60_000, gastoHoy: 0, gastoMes: 250_000, fijosCobradosMes: 0, fijosPendientesMes: 0, gastoMesAnterior: 0 });
prueba('semana pasada de presupuesto → 0 por día', gastado.porDia === 0 && gastado.estado === 'pasado', gastado);

// ---------- Asistencia por ubicación ----------
const lunes = new Date(2026, 10, 16);
const bloques = [
  { id: 1, weekday: 1, start_time: '08:30', end_time: '10:00' },
  { id: 2, weekday: 1, start_time: '10:15', end_time: '11:45' },
  { id: 3, weekday: 1, start_time: '15:00', end_time: '16:30' },
];
const at = (h: number, m: number) => new Date(2026, 10, 16, h, m);
const a1 = clasesAsistidas(bloques, [{ entrada: at(8, 20), salida: at(12, 0) }], lunes, at(17, 0));
prueba('asistió a las dos de la mañana', a1.map((b) => b.id).join() === '1,2', a1);
const a2 = clasesAsistidas(bloques, [{ entrada: at(8, 25), salida: null }], lunes, at(8, 40));
prueba('llegó a tiempo y sigue dentro', a2.map((b) => b.id).join() === '1', a2);
const a3 = clasesAsistidas(bloques, [{ entrada: at(9, 50), salida: at(10, 30) }], lunes, at(17, 0));
prueba('pasó muy poco rato → no cuenta la 1, sí la 2 (15 min)', a3.map((b) => b.id).join() === '2', a3);
const a4 = clasesAsistidas(bloques, [], lunes, at(17, 0));
prueba('sin visitas → nada', a4.length === 0);

console.log(ok === total ? `✅ Finanzas y asistencia: ${ok}/${total}` : `⚠️ Finanzas y asistencia: ${ok}/${total}`);
if (ok !== total) process.exitCode = 1;

// ---------- Voz + base de datos ----------
(async () => {
  const { interpretar } = await import('../src/voice/interpretar');
  const { responder } = await import('../src/voice/ejecutar');
  const { crearDbPrueba } = await import('./db-prueba');
  let ok2 = 0;
  let total2 = 0;
  const p2 = (n: string, c: boolean, d?: unknown) => {
    total2++;
    if (c) ok2++;
    else console.error('❌', n, d !== undefined ? JSON.stringify(d) : '');
  };
  const casos: [string, string, Record<string, unknown>?][] = [
    ['cuánto puedo gastar hoy', 'gasto_diario'],
    ['cuánta plata me queda para hoy', 'gasto_diario'],
    ['cómo voy a terminar el mes', 'proyeccion_mes'],
    ['me va a alcanzar la plata', 'proyeccion_mes'],
    ['escanea una boleta', 'finanzas_ir', { ruta: '/boleta' }],
    ['revisa los gastos del banco', 'finanzas_ir', { ruta: '/gastos-banco' }],
    ['activa la asistencia automática', 'finanzas_ir', { ruta: '/campus' }],
    ['cómo activo los gastos del banco', 'ayuda_app', { tema: 'banco' }],
    ['cuánto me queda del presupuesto', 'presupuesto'],
    ['cuánto he gastado esta semana', 'gasto_periodo'],
  ];
  for (const [f, tipo, campos] of casos) {
    const r = interpretar(f) as Record<string, unknown>;
    p2(`voz: ${f}`, r.tipo === tipo && Object.entries(campos ?? {}).every(([k, v]) => r[k] === v), r);
  }

  const db = await crearDbPrueba();
  const { procesarAvisos, listarAvisos, aceptarAviso, obtenerProyeccion } = await import('../src/database/finanzas');
  const { setSetting } = await import('../src/database/queries');
  const ts = Date.now();
  const avisos = [
    { pkg: 'cl.bancoestado.app', title: 'Compra', text: 'Compra por $5.990 en LIDER EXPRESS con tu tarjeta', ts },
    { pkg: 'cl.bancoestado.app', title: 'Abono', text: 'Recibiste un abono de $10.000', ts: ts + 1 },
    { pkg: 'com.whatsapp', title: 'Juan', text: 'Compra por $1.000 en algo', ts: ts + 2 },
  ];
  const r1 = await procesarAvisos(db, avisos);
  p2('modo preguntar: queda pendiente', r1.pendientes === 1 && r1.agregados === 0, r1);
  const r1b = await procesarAvisos(db, avisos);
  p2('no duplica', r1b.pendientes === 0, r1b);
  const pend = await listarAvisos(db, ['pendiente']);
  await aceptarAviso(db, pend[0].id);
  const g = await db.getAllAsync<{ amount: number; category: string; note: string }>('SELECT amount, category, note FROM expenses');
  p2('aceptar crea gasto', g.length === 1 && g[0].amount === 5990 && g[0].category === 'comida' && /BancoEstado/.test(g[0].note), g);
  await setSetting(db, 'gastos_auto_modo', 'auto');
  const r2 = await procesarAvisos(db, [{ pkg: 'com.falabella.cmr', title: '', text: 'Compraste $12.500 en UBER *TRIP', ts: ts + 10 }]);
  p2('modo auto: anota solo', r2.agregados === 1, r2);

  await setSetting(db, 'presupuesto_semanal', '70000');
  const pr = await obtenerProyeccion(db);
  p2('proyección con datos', pr.porDia != null && pr.finDeMes >= 18490, pr);
  const v = await responder(db, 'cuánto puedo gastar hoy');
  p2('resp: cuánto puedo gastar', /Hoy (puedes gastar|ya te pasaste)/.test(v.texto), v.texto);
  const w = await responder(db, 'cómo voy a terminar el mes');
  p2('resp: fin de mes', /terminas el mes en/.test(w.texto), w.texto);

  // Asistencia automática: ramo con clase de 08:30 a 10:00 hoy, visita 08:20–11:00
  const { crearRamo, guardarBloques } = await import('../src/database/estudio');
  const { guardarCampus, conciliarAsistencia, registrarEntrada, registrarSalida } = await import('../src/database/campus');
  const hoyD = new Date();
  const dia = ((hoyD.getDay() + 6) % 7) + 1;
  const idR = await crearRamo(db, { name: 'Física', color: '#38BDF8', teacher: null, room: null, passing: 4, min_attendance: 75 });
  await guardarBloques(db, idR, [{ weekday: dia, start_time: '08:30', end_time: '10:00' }]);
  await guardarCampus(db, { lat: -36.8, lon: -73.0, radio: 300 });
  await setSetting(db, 'asistencia_auto', '1');
  const h = (hh: number, mm: number) => new Date(hoyD.getFullYear(), hoyD.getMonth(), hoyD.getDate(), hh, mm);
  await registrarEntrada(db, h(8, 20));
  await registrarSalida(db, h(11, 0));
  const marcados = await conciliarAsistencia(db, h(12, 0));
  p2('asistencia automática marca la clase', marcados.join() === 'Física', marcados);
  const otra = await conciliarAsistencia(db, h(12, 5));
  p2('no marca dos veces', otra.length === 0, otra);

  console.log(ok2 === total2 ? `✅ Voz y datos de finanzas: ${ok2}/${total2}` : `⚠️ Voz y datos de finanzas: ${ok2}/${total2}`);
  if (ok2 !== total2) process.exitCode = 1;
})();

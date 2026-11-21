/**
 * Pruebas de Bienestar: frases de riesgo, patrones, impulsos, resumen para terapia, voz y base de datos.
 * Correr: npx tsx scripts/test-bienestar.ts
 */
import { descubrirPatrones, detectarRiesgo, diaDificil, faseImpulso, resumenParaTerapia, tendenciaAnimo, type DiaBienestar } from '../src/bienestar/logica';
import { normalizar } from '../src/voice/texto';

let ok = 0;
let total = 0;
function prueba(nombre: string, cond: boolean, detalle?: unknown) {
  total++;
  if (cond) ok++;
  else console.error('❌', nombre, detalle !== undefined ? JSON.stringify(detalle) : '');
}

// ---------- Riesgo ----------
const riesgo = ['me quiero morir', 'quiero matarme', 'pienso en suicidarme', 'no quiero seguir viviendo', 'tengo ganas de hacerme daño', 'todos estarían mejor sin mí', 'quiero quitarme la vida'];
for (const f of riesgo) prueba(`riesgo: ${f}`, detectarRiesgo(normalizar(f)));
// ("me quiero morir de la risa" SÍ activa la ayuda: preferimos pecar de cuidadosos.)
const sinRiesgo = ['me muero de hambre', 'estoy cansado', 'mata la música', 'esta prueba me va a matar'];
for (const f of sinRiesgo) prueba(`sin riesgo: ${f}`, !detectarRiesgo(normalizar(f)));

// ---------- Impulso ----------
prueba('fase inicio', faseImpulso(0.1).titulo.includes('subiendo'));
prueba('fase cima', faseImpulso(0.45).titulo.includes('cima'));
prueba('fase baja', faseImpulso(0.8).titulo.includes('bajando'));
prueba('fase fin', faseImpulso(1).titulo.includes('Surfeaste'));

// ---------- Patrones ----------
function dias(n: number, f: (k: number, fecha: string, dow: number) => Partial<DiaBienestar>): DiaBienestar[] {
  const out: DiaBienestar[] = [];
  const base = new Date(2026, 9, 1); // 1 oct 2026
  for (let k = 0; k < n; k++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + k);
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ fecha, animo: 5, impulso: null, actue: false, sueno: null, gym: false, estudioMin: 0, gasto: 0, ...f(k, fecha, d.getDay()) });
  }
  return out;
}

const pocos = descubrirPatrones(dias(3, () => ({})));
prueba('pocos días: no inventa', pocos.length === 0, pocos);

const gym = descubrirPatrones(dias(20, (k) => ({ gym: k % 2 === 0, animo: k % 2 === 0 ? 8 : 5 })));
prueba('gym sube ánimo', gym.some((h) => h.icono === 'barbell-outline' && /gym/.test(h.texto)), gym);

const sueno = descubrirPatrones(dias(20, (k) => ({ sueno: k % 2 ? 8 : 5, animo: k % 2 ? 7 : 4 })));
prueba('sueño', sueno.some((h) => h.icono === 'moon-outline'), sueno);

const gasto = descubrirPatrones(dias(20, (k) => ({ animo: k % 2 ? 3 : 7, gasto: k % 2 ? 25000 : 8000 })));
prueba('gasto en días difíciles', gasto.some((h) => h.icono === 'card-outline' && h.tono === 'alerta'), gasto);

const domingos = dias(35, (_k, _f, dow) => ({ animo: dow === 0 ? 2 : 6 }));
const dom = descubrirPatrones(domingos);
prueba('día difícil (domingo)', dom.some((h) => /domingo/.test(h.texto)), dom);
prueba('diaDificil = domingo', diaDificil(domingos) === 0, diaDificil(domingos));
prueba('sin patrón no hay día difícil', diaDificil(dias(30, () => ({ animo: 6 }))) === null);

const sinDif = descubrirPatrones(dias(20, () => ({ animo: 6, gym: true })));
prueba('sin diferencias: no inventa', sinDif.length === 0, sinDif);

const imp = descubrirPatrones(dias(10, (k) => ({ impulso: 4, actue: k < 2, animo: 5 })));
prueba('impulsos resistidos', imp.some((h) => h.icono === 'water-outline' && /8/.test(h.texto)), imp);

const t = tendenciaAnimo(dias(14, (k) => ({ animo: k < 7 ? 4 : 7 })));
prueba('tendencia sube 3', t.promedio === 7 && t.cambio === 3, t);
prueba('tendencia vacía', tendenciaAnimo([]).promedio === null);

// ---------- Resumen para terapia ----------
const res = resumenParaTerapia(
  [
    { date: '2026-11-10', animo: 3, emociones: { tristeza: 4, rabia: 1 }, impulso: 4, actue: false, habilidades: ['tipp', 'stop'], sueno: 6, nota: 'Discusión con mi pareja' },
    { date: '2026-11-11', animo: 7, emociones: { tristeza: 1, alegria: 3 }, impulso: 0, actue: false, habilidades: ['tipp'], sueno: 8, nota: null },
  ],
  { total: 3, logrados: 2 },
  '2026-11-10',
  '2026-11-11',
);
prueba('resumen: promedio', /Ánimo promedio: 5 \/ 10/.test(res), res);
prueba('resumen: habilidades', /TIPP \(2\)/.test(res), res);
prueba('resumen: impulsos', /2 de 3/.test(res), res);
prueba('resumen: nota', /Discusión con mi pareja/.test(res), res);
prueba('resumen vacío', /Todavía no hay registros/.test(resumenParaTerapia([], { total: 0, logrados: 0 }, '2026-11-01', '2026-11-07')));

console.log(`Bienestar (lógica): ${ok}/${total}`);

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
    ['estoy a mil', 'bienestar_ir', { ruta: '/calma' }],
    ['ey tinzit0 necesito calmarme', 'bienestar_ir', { ruta: '/calma' }],
    ['tengo un ataque de ansiedad', 'bienestar_ir', { ruta: '/calma' }],
    ['tengo ganas de hacer una tontera', 'bienestar_ir', { ruta: '/impulso' }],
    ['tengo ganas de escribirle a mi ex', 'bienestar_ir', { ruta: '/impulso' }],
    ['mi plan de crisis', 'bienestar_ir', { ruta: '/plan-crisis' }],
    ['llenar mi tarjeta diaria', 'bienestar_ir', { ruta: '/tarjeta-diaria' }],
    ['muéstrame mis patrones', 'bienestar_ir', { ruta: '/patrones' }],
    ['quiero respirar', 'bienestar_ir', { ruta: '/calma?modo=respirar' }],
    ['me siento un 4', 'animo_registrar', { valor: 4 }],
    ['hoy estoy en un siete', 'animo_registrar', { valor: 7 }],
    ['me quiero morir', 'crisis'],
    ['cómo uso el plan de crisis', 'ayuda_app', { tema: 'bienestar' }],
    ['repasar tarjetas', 'estudio_ir', { ruta: '/repaso' }],
    ['cuánto puedo gastar hoy', 'gasto_diario'],
  ];
  for (const [f, tipo, campos] of casos) {
    const r = interpretar(f) as Record<string, unknown>;
    p2(`voz: ${f}`, r.tipo === tipo && Object.entries(campos ?? {}).every(([k, v]) => r[k] === v), r);
  }

  const db = await crearDbPrueba();
  const { guardarPlan, obtenerPlan, obtenerTarjeta, guardarTarjeta, registrarCalma, contarImpulsos, efectoCalma, datosBienestar } = await import('../src/database/bienestar');
  const { toISODate } = await import('../src/utils/fechas');

  const r1 = await responder(db, 'me siento un 3');
  p2('resp: ánimo anotado', /3 de 10/.test(r1.texto), r1.texto);
  p2('db: ánimo guardado', (await obtenerTarjeta(db))?.animo === 3);

  await guardarTarjeta(db, { date: toISODate(), animo: 6, emociones: { tristeza: 2 }, impulso: 3, actue: false, habilidades: ['stop'], sueno: 7.5, nota: '  ' });
  const tj = await obtenerTarjeta(db);
  p2('db: tarjeta completa', tj?.animo === 6 && tj.emociones.tristeza === 2 && tj.habilidades[0] === 'stop' && tj.sueno === 7.5 && tj.nota === null, tj);

  await guardarPlan(db, { senales: ['me aíslo', ' '], calma: ['ducha'], razones: ['mi familia'], contactos: [{ nombre: 'Cami', telefono: '+56911111111' }, { nombre: '', telefono: '' }] });
  const plan = await obtenerPlan(db);
  p2('db: plan limpio', plan.senales.length === 1 && plan.contactos.length === 1, plan);

  const cr = await responder(db, 'me quiero morir');
  p2('resp: crisis con *4141 y contacto', /4141/.test(cr.texto) && /Cami/.test(cr.texto) && cr.ruta === '/plan-crisis', cr);
  const cr2 = await responder(db, 'ey tinzit0 pienso en suicidarme');
  p2('resp: crisis con palabra de activación', /4141/.test(cr2.texto), cr2.texto);

  await registrarCalma(db, { tipo: 'impulso', logrado: true });
  await registrarCalma(db, { tipo: 'impulso', logrado: false });
  await registrarCalma(db, { tipo: 'calma', antes: 9, despues: 5 });
  const ci = await contarImpulsos(db);
  p2('db: impulsos', ci.total === 2 && ci.logrados === 1, ci);
  const ec = await efectoCalma(db);
  p2('db: efecto calma', ec.veces === 1 && ec.bajaPromedio === 4, ec);

  await db.runAsync("INSERT INTO expenses (amount, category, date) VALUES (5000, 'comida', ?)", toISODate());
  const d = await datosBienestar(db, 7);
  p2('db: datos cruzados', d.length === 7 && d[6].animo === 6 && d[6].gasto === 5000, d[6]);

  console.log(`Bienestar (voz + datos): ${ok2}/${total2}`);
  if (ok !== total || ok2 !== total2) process.exit(1);
})();

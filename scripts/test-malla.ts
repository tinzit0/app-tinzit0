/**
 * Pruebas de la malla interactiva: datos incluidos, link de mallapp.cl, prerrequisitos y base de datos.
 * Correr: npx tsx scripts/test-malla.ts
 */
import { abre, disponibilidad, faltantes, leerMallapp, mallaIcinfUbb, porSemestre, progreso, urlDatosMallapp, type RamoMalla } from '../src/malla/logica';
import { crearDbPrueba } from './db-prueba';

let ok = 0;
let total = 0;
function prueba(nombre: string, cond: boolean, detalle?: unknown) {
  total++;
  if (cond) ok++;
  else console.error('❌', nombre, detalle !== undefined ? JSON.stringify(detalle) : '');
}

// ---------- Datos incluidos ----------
const icinf = mallaIcinfUbb();
prueba('icinf: 60 ramos', icinf.length === 60, icinf.length);
prueba('icinf: 10 semestres', porSemestre(icinf).length === 10);
prueba('icinf: 300 créditos', icinf.reduce((s, r) => s + r.credits, 0) === 300);
const refs = new Set(icinf.map((r) => r.ref));
prueba('icinf: prerrequisitos existen y son de antes', icinf.every((r) => r.prereqs.every((p) => refs.has(p) && icinf.find((x) => x.ref === p)!.semester < r.semester)));

// ---------- Link de mallapp ----------
prueba('link normal', urlDatosMallapp('https://mallapp.cl/ues/ubiobio/ICINF') === 'https://mallapp.cl/universidades/ubiobio/ICINF.json');
prueba('link sin https y con /', urlDatosMallapp('mallapp.cl/ues/udec/ICI/') === 'https://mallapp.cl/universidades/udec/ICI.json');
prueba('link antiguo', urlDatosMallapp('https://malla.sbleit.net/ues/ubiobio/ICIN') === 'https://mallapp.cl/universidades/ubiobio/ICIN.json');
prueba('link de otro sitio', urlDatosMallapp('https://ejemplo.cl/ues/a/b') === null);
prueba('link con cosas raras', urlDatosMallapp('https://mallapp.cl/ues/../../x') === null);

// ---------- Leer datos bajados ----------
const leida = leerMallapp([
  { id: 1, name: 'Cálculo I', semestre: 1, sct: 6, area: 'Área Ciencias Básicas', preRequisitos: [] },
  { id: 2, name: 'Cálculo II', semestre: 2, sct: 6, preRequisitos: [1, 99] },
  { id: 3, name: '', semestre: 1 },
  'basura',
  { id: 4, name: 'Física', semestre: 'x' },
]);
prueba('leer: descarta lo malo', leida.length === 2, leida);
prueba('leer: quita prerrequisitos inexistentes', leida[1].prereqs.join() === '1', leida[1]);
prueba('leer: área sin "Área"', leida[0].area === 'Ciencias Básicas');
let lanzo = false;
try {
  leerMallapp({ hola: 1 });
} catch {
  lanzo = true;
}
prueba('leer: no es malla → error', lanzo);

// ---------- Prerrequisitos ----------
const ramos: RamoMalla[] = [
  { id: 1, name: 'A', semester: 1, credits: 6, area: null, prereqs: [], status: 'aprobado' },
  { id: 2, name: 'B', semester: 1, credits: 4, area: null, prereqs: [], status: 'pendiente' },
  { id: 3, name: 'C', semester: 2, credits: 5, area: null, prereqs: [1], status: 'pendiente' },
  { id: 4, name: 'D', semester: 2, credits: 5, area: null, prereqs: [1, 2], status: 'pendiente' },
  { id: 5, name: 'E', semester: 3, credits: 5, area: null, prereqs: [2], status: 'cursando' },
];
const ap = new Set([1]);
prueba('disp: aprobado', disponibilidad(ramos[0], ap) === 'aprobado');
prueba('disp: sin prerrequisitos', disponibilidad(ramos[1], ap) === 'disponible');
prueba('disp: prerrequisito aprobado', disponibilidad(ramos[2], ap) === 'disponible');
prueba('disp: falta uno', disponibilidad(ramos[3], ap) === 'bloqueado');
prueba('disp: cursando se respeta', disponibilidad(ramos[4], ap) === 'cursando');
prueba('faltantes', faltantes(ramos[3], ramos).map((r) => r.name).join() === 'B');
prueba('abre', abre(2, ramos).map((r) => r.name).join() === 'D,E');
const p = progreso(ramos);
prueba('progreso por créditos', p.aprobados === 1 && p.creditosAprobados === 6 && p.creditos === 25 && p.porcentaje === 24, p);
prueba('progreso vacío', progreso([]).porcentaje === 0);

// ---------- Base de datos ----------
(async () => {
  const db = await crearDbPrueba();
  const { cargarMalla, listarMalla, nombreMalla, cambiarEstadoMalla, guardarRamoMalla, eliminarRamoMalla, borrarMalla } = await import('../src/database/malla');
  const n = await cargarMalla(db, 'Ing. Civil Informática · UBB', icinf);
  const lista = await listarMalla(db);
  prueba('db: carga 60', n === 60 && lista.length === 60);
  prueba('db: nombre', (await nombreMalla(db)) === 'Ing. Civil Informática · UBB');
  const poo = lista.find((r) => r.name === 'Programación Orientada a Objetos')!;
  const intro = lista.find((r) => r.name === 'Introducción a la Programación')!;
  prueba('db: prerrequisitos con ids nuevos', poo.prereqs.join() === String(intro.id), poo);
  await cambiarEstadoMalla(db, intro.id, 'aprobado');
  const l2 = await listarMalla(db);
  const ap2 = new Set(l2.filter((r) => r.status === 'aprobado').map((r) => r.id));
  prueba('db: aprobar abre POO', disponibilidad(l2.find((r) => r.id === poo.id)!, ap2) === 'disponible');
  await eliminarRamoMalla(db, intro.id);
  const l3 = await listarMalla(db);
  prueba('db: quitar saca de prerrequisitos', l3.length === 59 && l3.find((r) => r.id === poo.id)!.prereqs.length === 0);
  const nuevo = await guardarRamoMalla(db, null, { name: 'Electivo X', semester: 11, credits: 5, prereqs: [poo.id] });
  prueba('db: agregar a mano', (await listarMalla(db)).find((r) => r.id === nuevo)?.prereqs.join() === String(poo.id));
  await borrarMalla(db);
  prueba('db: borrar malla', (await listarMalla(db)).length === 0 && (await nombreMalla(db)) === null);

  console.log(ok === total ? `✅ Malla: ${ok}/${total}` : `⚠️ Malla: ${ok}/${total}`);
  if (ok !== total) process.exitCode = 1;
})();

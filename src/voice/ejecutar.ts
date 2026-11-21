/**
 * Ejecuta lo que entendió el asistente y arma la respuesta (corta, cercana, en chileno).
 *
 * Devuelve:
 * - texto: lo que se muestra y se dice en voz alta
 * - ruta: un enlace opcional "Ver …" debajo de la burbuja
 * - accion: algo que la PANTALLA debe hacer (navegar, abrir una app, programar
 *   un recordatorio). Se separa así para que este archivo no dependa de módulos
 *   del celular y se pueda probar en el computador.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { consejoClima, diaDe, esLluvia, infoClima, obtenerClima, type Pronostico } from '@/clima/clima';
import { guardarMedicion, ultimosValores } from '@/database/cuerpo';
import {
  avisoPresupuesto,
  crearGasto,
  eliminarGasto,
  gastosEnRango,
  presupuestoSemanal,
  rangoMes,
  rangoSemana,
  totalEnRango,
  totalPorCategoria,
  ultimoGasto,
} from '@/database/gastos';
import { agregarSerie, listarEjercicios, obtenerOCrearEjercicio, rutinaDeHoy, seriesDeFecha, ultimaSerie } from '@/database/gym';
import { alternarHabito, crearHabito, listarHabitos, SUGERENCIAS } from '@/database/habitos';
import { abonar, buscarMeta, crearMeta, listarMetas } from '@/database/metas';
import { guardarNota, listarNotas } from '@/database/notas';
import { getSetting, setSetting } from '@/database/queries';
import {
  alternarTarea,
  crearTarea,
  eliminarTarea,
  moverTarea,
  tareasDelDia,
  tareasSemanales,
  todasLasTareas,
} from '@/database/tareas';
import { CATALOGO_APPS } from '@/utils/apps';
import { categoria } from '@/utils/categorias';
import { fechaLarga, fromISODate, startOfWeek, toISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';
import type { CambioHud, Panel } from '@/jarvis/paneles';
import { panelPara } from '@/jarvis/panelesDatos';
import { EJEMPLOS, interpretar, type Contexto, type Intencion } from './interpretar';
import { normalizar, parecido } from './texto';

export type Accion =
  | { tipo: 'navegar'; ruta: string }
  | { tipo: 'abrir_app'; pkg: string; nombre: string }
  | { tipo: 'recordatorio'; texto: string; segundos: number };

export type Respuesta = {
  texto: string;
  ruta?: string;
  accion?: Accion;
  intencion?: Intencion['tipo'];
  /** Datos para el panel holográfico (modo Jarvis). */
  panel?: Panel;
  /** Cambio de la interfaz pedido por voz. */
  hud?: CambioHud;
  /** true = terminar el modo conversación. */
  fin?: boolean;
};

/** Datos del celular que el ejecutor no puede leer solo (los pasa la pantalla). */
export type Sistema = { bateria?: number | null };

const azar = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lista "a, b y c". */
function lista(xs: string[]) {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
}

function cuandoDecir(iso: string | null) {
  if (!iso) return '';
  const hoy = toISODate();
  const manana = toISODate(new Date(Date.now() + 86400000));
  if (iso === hoy) return 'para hoy';
  if (iso === manana) return 'para mañana';
  return `para el ${fechaLarga(fromISODate(iso)).toLowerCase()}`;
}

function nombreDia(iso: string) {
  if (iso === toISODate()) return 'hoy';
  if (iso === toISODate(new Date(Date.now() + 86400000))) return 'mañana';
  return `el ${fechaLarga(fromISODate(iso)).toLowerCase()}`;
}

/** Pantallas a las que se puede ir por voz. */
const PANTALLAS: [RegExp, string][] = [
  [/^(hoy|inicio|home|principal)/, '/'],
  [/^tareas?/, '/tareas'],
  [/^(gastos fijos|fijos|cuentas)/, '/fijos'],
  [/^(gastos?|plata|finanzas)/, '/gastos'],
  [/^(gym|gimnasio|entreno)/, '/gym'],
  [/^notas?/, '/notas'],
  [/^habitos?/, '/habitos'],
  [/^(metas?|ahorro)/, '/metas'],
  [/^(clima|tiempo|pronostico)/, '/clima'],
  [/^(estadisticas|numeros|mi mes)/, '/estadisticas'],
  [/^(medallas|logros|trofeos)/, '/logros'],
  [/^(ajustes|configuracion|opciones)/, '/ajustes'],
  [/^rutina/, '/rutina'],
  [/^(peso|cuerpo|medidas)/, '/cuerpo'],
  [/^(apps|aplicaciones)/, '/apps'],
];

export async function responder(db: SQLiteDatabase, frase: string, contexto: Contexto = {}, sistema: Sistema = {}): Promise<Respuesta> {
  const i = interpretar(frase, new Date(), contexto);
  const r = await ejecutar(db, i, sistema);
  // El panel se arma DESPUÉS de ejecutar, así muestra los datos ya actualizados.
  const panel = await panelPara(db, i, sistema).catch(() => undefined);
  return { ...r, panel, intencion: i.tipo };
}

function textoClima(p: Pronostico, i: Extract<Intencion, { tipo: 'clima' }>): string {
  const ciudad = p.ubicacion.nombre.split(',')[0];
  if (i.cuando === 'semana') {
    const lluviosos = p.dias.filter((d) => d.lluvia >= 50).map((d) => nombreDia(d.fecha).replace(/^el /, ''));
    const max = Math.max(...p.dias.map((d) => d.max));
    const min = Math.min(...p.dias.map((d) => d.min));
    return `Esta semana en ${ciudad}: entre ${min}° y ${max}°. ${lluviosos.length ? `Ojo que llovería ${lista(lluviosos)} ☔` : 'Sin lluvia a la vista ☀️'}`;
  }
  if (i.cuando === 'ahora') {
    const info = infoClima(p.actual.codigo, p.actual.esDia);
    const hoy = p.dias[0];
    const consejo = hoy ? consejoClima(hoy) : '';
    return `Ahora en ${ciudad} hay ${p.actual.temp}° y está ${info.texto.toLowerCase()}${hoy ? `. Hoy máxima de ${hoy.max}° y mínima de ${hoy.min}°` : ''}.${consejo ? ` ${consejo}` : ''}`;
  }
  const fecha = i.cuando === 'hoy' ? toISODate() : (i.fecha ?? toISODate());
  const d = diaDe(p, fecha);
  if (!d) return 'Solo tengo el pronóstico de los próximos 7 días.';
  const cuando = nombreDia(fecha);
  if (i.foco === 'lluvia') {
    if (d.lluvia >= 60 || esLluvia(d.codigo)) return `Sí, ${cuando} es muy probable que llueva (${d.lluvia}%). Lleva paraguas ☔`;
    if (d.lluvia >= 30) return `Puede que llueva ${cuando} (${d.lluvia}%). Por si acaso, anda con paraguas 🌂`;
    return `No, ${cuando} no debería llover (${d.lluvia}%) ☀️`;
  }
  const consejo = consejoClima(d);
  return `${mayus(cuando)} en ${ciudad}: ${infoClima(d.codigo).texto.toLowerCase()}, máxima de ${d.max}° y mínima de ${d.min}°${d.lluvia >= 30 ? `, ${d.lluvia}% de lluvia` : ''}.${consejo ? ` ${consejo}` : ''}`;
}

export async function ejecutar(db: SQLiteDatabase, i: Intencion, sistema: Sistema = {}): Promise<Respuesta> {
  const nombre = (await getSetting(db, 'nombre')) ?? '';
  const hoy = toISODate();

  switch (i.tipo) {
    case 'saludo':
      return { texto: azar([`¡Hola${nombre ? `, ${nombre}` : ''}! ¿En qué te ayudo?`, `Aquí estoy${nombre ? `, ${nombre}` : ''} 👋 Dime nomás.`]) };

    case 'gracias':
      return { texto: azar(['De nada 🙌', '¡Para eso estoy!', 'Cuando quieras.']) };

    case 'ayuda':
      return {
        texto: `Puedo con tus tareas, gastos, metas, gym, peso, hábitos, notas, el clima y recordatorios. Prueba con:\n• ${EJEMPLOS.join('\n• ')}`,
      };

    case 'motivacion': {
      const frases = [
        'No tiene que ser perfecto, tiene que ser hoy. Una cosa a la vez 💪',
        'El que la sigue la consigue. Dale, que ya vas avanzando.',
        'Ánimo: los días chatos también suman, aunque no se note.',
        'Haz lo mínimo bien hecho y celebra. Mañana sumas otro poquito 🙌',
      ];
      const top = (await listarHabitos(db)).sort((a, b) => b.racha - a.racha)[0];
      return { texto: `${azar(frases)}${top && top.racha >= 2 ? ` Y mira: llevas ${top.racha} días seguidos con "${top.name}" 🔥` : ''}` };
    }

    case 'fecha_hora': {
      const ahora = new Date();
      if (i.que === 'hora') return { texto: `Son las ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}.` };
      return { texto: `Hoy es ${fechaLarga(ahora).toLowerCase()}.` };
    }

    case 'resumen': {
      const tareas = await tareasDelDia(db, hoy);
      const pend = tareas.filter((t) => !t.hecha).length;
      const gym = await rutinaDeHoy(db);
      const gastado = await totalEnRango(db, rangoSemana());
      const presu = await presupuestoSemanal(db);
      const habitos = await listarHabitos(db);
      const p = await obtenerClima(db).catch(() => null);
      const partes = [
        tareas.length === 0 ? 'no tienes tareas hoy' : pend === 0 ? `terminaste tus ${tareas.length} tareas 🙌` : `te quedan ${pend} de ${tareas.length} tareas`,
        gym ? `toca ${gym.toLowerCase()} en el gym` : 'hoy es descanso del gym',
        presu > 0 ? `llevas ${formatCLP(gastado)} de ${formatCLP(presu)} esta semana` : `llevas ${formatCLP(gastado)} gastados esta semana`,
      ];
      if (habitos.length) partes.push(`marcaste ${habitos.filter((h) => h.hechoHoy).length} de ${habitos.length} hábitos`);
      const clima = p ? ` Afuera: ${p.actual.temp}° y ${infoClima(p.actual.codigo, p.actual.esDia).texto.toLowerCase()}.` : '';
      return { texto: `${mayus(lista(partes))}.${clima}` };
    }

    case 'tareas_hoy': {
      const pendientes = (await tareasDelDia(db, hoy)).filter((t) => !t.hecha);
      if (pendientes.length === 0) return { texto: azar(['No te queda nada pendiente hoy. ¡Bien ahí! 🙌', 'Todo listo por hoy. Descansa tranqui.']), ruta: '/tareas' };
      const nombres = pendientes.slice(0, 5).map((t) => t.title);
      const extra = pendientes.length > 5 ? ` y ${pendientes.length - 5} más` : '';
      return { texto: `Te ${pendientes.length === 1 ? 'queda 1 tarea' : `quedan ${pendientes.length} tareas`}: ${lista(nombres)}${extra}.`, ruta: '/tareas' };
    }

    case 'tareas_dia': {
      const tareas = (await tareasDelDia(db, i.fecha)).filter((t) => !t.hecha);
      const cuando = nombreDia(i.fecha);
      if (!tareas.length) return { texto: `${mayus(cuando)} no tienes tareas. Día libre 😎`, ruta: '/tareas' };
      return { texto: `${mayus(cuando)} tienes ${tareas.length === 1 ? '1 tarea' : `${tareas.length} tareas`}: ${lista(tareas.slice(0, 5).map((t) => t.title))}.`, ruta: '/tareas' };
    }

    case 'tareas_semana': {
      const lunes = startOfWeek();
      let total = 0;
      const porDia: string[] = [];
      for (let d = 0; d < 7; d++) {
        const f = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + d);
        if (toISODate(f) < hoy) continue;
        const n = (await tareasDelDia(db, toISODate(f))).filter((t) => !t.hecha && !t.atrasada).length;
        if (n) porDia.push(`${n} el ${fechaLarga(f).split(' ')[0].toLowerCase()}`);
        total += n;
      }
      const semanales = (await tareasSemanales(db)).filter((t) => !t.hecha).length;
      total += semanales;
      if (total === 0) return { texto: 'Esta semana no tienes nada pendiente. Semana tranquila 😎', ruta: '/tareas' };
      return {
        texto: `Te quedan ${total} tareas esta semana${porDia.length ? `: ${lista(porDia)}` : ''}${semanales ? `, más ${semanales} sin día fijo` : ''}.`,
        ruta: '/tareas',
      };
    }

    case 'agregar_tarea': {
      const titulo = mayus(i.titulo);
      await crearTarea(db, {
        title: titulo,
        priority: i.prioridad,
        scope: i.semanal ? 'semanal' : 'diaria',
        due_date: i.fecha,
        repeat_type: 'none',
        repeat_days: [],
      });
      const cuando = i.semanal ? 'para esta semana' : cuandoDecir(i.fecha);
      return { texto: azar([`Listo, anoté "${titulo}" ${cuando} ✅`, `Hecho: "${titulo}" ${cuando}.`]) };
    }

    case 'completar_tarea': {
      const candidatas = (await tareasDelDia(db, hoy)).filter((t) => !t.hecha);
      const mejor = candidatas.map((t) => ({ t, p: parecido(i.texto, t.title) })).sort((a, b) => b.p - a.p)[0];
      if (!mejor || mejor.p < 0.34) {
        return { texto: `Mmm, no encontré una tarea pendiente que se parezca a "${i.texto}". ¿Me la dices como está escrita?`, ruta: '/tareas' };
      }
      await alternarTarea(db, mejor.t, true, hoy);
      const quedan = candidatas.length - 1;
      return {
        texto: `¡Bien! Marqué "${mejor.t.title}" como hecha. ${quedan === 0 ? 'Y con eso terminaste todo por hoy 🎉' : `Te ${quedan === 1 ? 'queda 1' : `quedan ${quedan}`}.`}`,
      };
    }

    case 'mover_tarea':
    case 'eliminar_tarea': {
      const candidatas = (await todasLasTareas(db)).filter((t) => !t.hecha);
      const mejor = candidatas.map((t) => ({ t, p: parecido(i.texto, t.title) })).sort((a, b) => b.p - a.p)[0];
      if (!mejor || mejor.p < 0.34) return { texto: `No encontré una tarea que se parezca a "${i.texto}".`, ruta: '/tareas' };
      if (i.tipo === 'eliminar_tarea') {
        await eliminarTarea(db, mejor.t.id);
        return { texto: `Listo, borré "${mejor.t.title}" 🗑️` };
      }
      if (mejor.t.repeat_type !== 'none') return { texto: `"${mejor.t.title}" se repite, así que no la puedo mover. Edítala en Tareas.`, ruta: '/tareas' };
      await moverTarea(db, mejor.t.id, i.fecha);
      return { texto: `Pasé "${mejor.t.title}" ${cuandoDecir(i.fecha)} 📅` };
    }

    case 'agregar_gasto': {
      const semana = rangoSemana();
      const antes = await totalEnRango(db, semana);
      await crearGasto(db, { amount: i.monto, category: i.categoria, note: i.nota, date: hoy });
      const despues = antes + i.monto;
      const aviso = avisoPresupuesto(antes, despues, await presupuestoSemanal(db));
      const cat = categoria(i.categoria).label.toLowerCase();
      return {
        texto: `Anotado: ${formatCLP(i.monto)} en ${cat}${i.nota ? ` (${i.nota})` : ''}. Llevas ${formatCLP(despues)} esta semana.${aviso ? ` ${aviso}` : ''}`,
      };
    }

    case 'borrar_ultimo_gasto': {
      const g = await ultimoGasto(db);
      if (!g) return { texto: 'No tienes gastos anotados.' };
      await eliminarGasto(db, g.id);
      return { texto: `Borré el último gasto: ${formatCLP(g.amount)} en ${categoria(g.category).label.toLowerCase()}${g.note ? ` (${g.note})` : ''}.` };
    }

    case 'gasto_periodo': {
      if (i.periodo === 'hoy') {
        const t = await totalEnRango(db, { desde: hoy, hasta: hoy });
        return { texto: t ? `Hoy llevas ${formatCLP(t)}.` : 'Hoy no has gastado nada. ¡Eso!', ruta: '/gastos' };
      }
      const r = i.periodo === 'mes' ? rangoMes() : rangoSemana();
      const total = await totalEnRango(db, r);
      if (i.periodo === 'mes') return { texto: `Este mes llevas ${formatCLP(total)}.`, ruta: '/gastos' };
      const p = await presupuestoSemanal(db);
      const resto = p > 0 ? (total > p ? ` Te pasaste por ${formatCLP(total - p)} 😬` : ` Te quedan ${formatCLP(p - total)} del presupuesto.`) : '';
      return { texto: `Esta semana llevas ${formatCLP(total)}.${resto}`, ruta: '/gastos' };
    }

    case 'gasto_categoria': {
      const r = i.periodo === 'mes' ? rangoMes() : rangoSemana();
      const fila = (await totalPorCategoria(db, r)).find((c) => c.category === i.categoria);
      const total = await totalEnRango(db, r);
      const cat = categoria(i.categoria).label.toLowerCase();
      const periodo = i.periodo === 'mes' ? 'este mes' : 'esta semana';
      if (!fila) return { texto: `No tienes gastos en ${cat} ${periodo}.`, ruta: '/gastos' };
      return {
        texto: `En ${cat} llevas ${formatCLP(fila.total)} ${periodo}${total ? `, el ${Math.round((fila.total / total) * 100)}% de lo que gastaste` : ''}.`,
        ruta: '/gastos',
      };
    }

    case 'ultimos_gastos': {
      const r = i.periodo === 'hoy' ? { desde: hoy, hasta: hoy } : rangoSemana();
      const gastos = await gastosEnRango(db, r);
      if (!gastos.length) return { texto: i.periodo === 'hoy' ? 'Hoy no has anotado gastos.' : 'Esta semana no has anotado gastos.' };
      const items = gastos.slice(0, 5).map((g) => `${formatCLP(g.amount)} en ${g.note || categoria(g.category).label.toLowerCase()}`);
      const total = gastos.reduce((s, g) => s + g.amount, 0);
      return { texto: `${i.periodo === 'hoy' ? 'Hoy' : 'Esta semana'} gastaste ${formatCLP(total)}: ${lista(items)}${gastos.length > 5 ? ' y más' : ''}.`, ruta: '/gastos' };
    }

    case 'presupuesto': {
      const p = await presupuestoSemanal(db);
      const total = await totalEnRango(db, rangoSemana());
      if (p <= 0) return { texto: 'No tienes presupuesto semanal configurado. Dime "cambia mi presupuesto a 100 lucas".', ruta: '/ajustes' };
      if (total > p) return { texto: `Te pasaste por ${formatCLP(total - p)} esta semana. Pisa el freno hasta el lunes 😬` };
      return { texto: `Te quedan ${formatCLP(p - total)} de ${formatCLP(p)} esta semana.` };
    }

    case 'cambiar_presupuesto': {
      await setSetting(db, 'presupuesto_semanal', String(Math.round(i.monto)));
      const total = await totalEnRango(db, rangoSemana());
      return { texto: `Listo, tu presupuesto semanal ahora es ${formatCLP(i.monto)}. Llevas ${formatCLP(total)} esta semana.` };
    }

    case 'metas': {
      const metas = await listarMetas(db);
      if (!metas.length) return { texto: 'Aún no tienes metas de ahorro. Dime por ejemplo "quiero ahorrar 300 lucas para un viaje".', ruta: '/metas' };
      return {
        texto: metas
          .slice(0, 3)
          .map((m) => `${m.name}: ${formatCLP(m.ahorrado)} de ${formatCLP(m.target)} (${Math.round((m.ahorrado / m.target) * 100)}%)`)
          .join('. '),
        ruta: '/metas',
      };
    }

    case 'crear_meta': {
      const nombreMeta = mayus(i.nombre);
      await crearMeta(db, { name: nombreMeta, target: i.monto, deadline: null });
      return { texto: `¡Meta creada! "${nombreMeta}" por ${formatCLP(i.monto)}. Cuando quieras me dices "abona 10 lucas" y le sumamos 💰`, ruta: '/metas' };
    }

    case 'abonar_meta': {
      const meta = await buscarMeta(db, i.texto);
      if (!meta) {
        const metas = await listarMetas(db);
        if (!metas.length) return { texto: 'No tienes metas todavía. Dime "quiero ahorrar 300 lucas para un viaje" y la creo.', ruta: '/metas' };
        return { texto: `¿A cuál meta? Tienes: ${lista(metas.map((m) => m.name))}. Dime por ejemplo "abona 10 lucas a ${metas[0].name}".` };
      }
      await abonar(db, meta.id, i.monto);
      const total = meta.ahorrado + i.monto;
      return {
        texto:
          total >= meta.target
            ? `¡Abonado! Con eso completaste "${meta.name}" 🎉 Juntaste ${formatCLP(total)}.`
            : `Abonado ${formatCLP(i.monto)} a "${meta.name}". Vas en ${formatCLP(total)} de ${formatCLP(meta.target)} (${Math.round((total / meta.target) * 100)}%).`,
      };
    }

    case 'gym_hoy': {
      const toca = await rutinaDeHoy(db);
      const series = (await seriesDeFecha(db, hoy)).length;
      if (series > 0) return { texto: `Hoy ya llevas ${series} series${toca ? ` de ${toca.toLowerCase()}` : ''}. ¡Sigue así! 💪`, ruta: '/gym' };
      if (!toca) return { texto: 'Hoy es día de descanso. Recupera energía 😌', ruta: '/gym' };
      return { texto: azar([`Hoy toca ${toca.toLowerCase()} 💪 ¡Dale con todo!`, `Te toca ${toca.toLowerCase()}. A darle.`]), ruta: '/gym' };
    }

    case 'registrar_serie': {
      // Si ya existe un ejercicio parecido, usamos ese (no creamos duplicados).
      const ejercicios = await listarEjercicios(db);
      const top = ejercicios.map((e) => ({ e, p: parecido(i.ejercicio, e.name) })).sort((a, b) => b.p - a.p)[0];
      const existe = top && top.p >= 0.5 ? top.e : null;
      const id = existe ? existe.id : await obtenerOCrearEjercicio(db, mayus(i.ejercicio));
      const nombreEj = existe ? existe.name : mayus(i.ejercicio);
      for (let k = 0; k < i.series; k++) await agregarSerie(db, id, hoy, i.reps, i.peso);
      return {
        texto: `💪 Anotado: ${nombreEj}, ${i.series} ${i.series === 1 ? 'serie' : 'series'} de ${i.reps}${i.peso ? ` con ${i.peso} kg` : ''}. ¡Bien ahí!`,
        ruta: '/gym',
      };
    }

    case 'registrar_peso': {
      const antes = (await ultimosValores(db)).weight;
      await guardarMedicion(db, hoy, { weight: i.kg });
      const dif = antes && antes.fecha !== hoy ? Math.round((i.kg - antes.valor) * 10) / 10 : null;
      return {
        texto: `Anoté tu peso: ${i.kg} kg.${dif !== null && dif !== 0 ? ` Son ${Math.abs(dif)} kg ${dif > 0 ? 'más' : 'menos'} que la última vez.` : ''}`,
        ruta: '/cuerpo',
      };
    }

    case 'ultimo_peso': {
      // ¿Nombró un ejercicio? Entonces es el peso levantado; si no, el peso corporal.
      const ejercicios = await listarEjercicios(db);
      const ej = ejercicios
        .map((e) => ({ e, p: parecido(i.texto, e.name) }))
        .filter((x) => x.p >= 0.5)
        .sort((a, b) => b.p - a.p)[0]?.e;
      if (ej) {
        const u = await ultimaSerie(db, ej.id);
        if (!u) return { texto: `Todavía no registras ${ej.name}.` };
        return { texto: `La última vez en ${ej.name} hiciste ${u.reps} reps con ${u.weight} kg (${fechaLarga(fromISODate(u.date)).toLowerCase()}).` };
      }
      const peso = (await ultimosValores(db)).weight;
      if (!peso) return { texto: 'Aún no registras tu peso. Dime por ejemplo "anota mi peso 78 kilos".', ruta: '/cuerpo' };
      return { texto: `Tu último peso fue ${peso.valor} kg, el ${fechaLarga(fromISODate(peso.fecha)).toLowerCase()}.`, ruta: '/cuerpo' };
    }

    case 'racha': {
      const habitos = await listarHabitos(db);
      if (!habitos.length) return { texto: 'Aún no tienes hábitos. Dime "crea un hábito de tomar agua" y empezamos a contar 🔥', ruta: '/habitos' };
      const nombrado = habitos.find((h) => parecido(i.texto, h.name) >= 0.5);
      if (nombrado) return { texto: `Llevas ${nombrado.racha} ${nombrado.racha === 1 ? 'día seguido' : 'días seguidos'} con "${nombrado.name}" (récord: ${nombrado.mejorRacha}).` };
      const top = [...habitos].sort((a, b) => b.racha - a.racha)[0];
      if (top.racha === 0) return { texto: 'Ahora no tienes rachas activas. Hoy es buen día para partir una 💪', ruta: '/habitos' };
      return { texto: `Tu mejor racha activa es "${top.name}": ${top.racha} ${top.racha === 1 ? 'día seguido' : 'días seguidos'} 🔥 ¡No la sueltes!`, ruta: '/habitos' };
    }

    case 'marcar_habito': {
      const habitos = (await listarHabitos(db)).filter((h) => !h.hechoHoy);
      const h = habitos.map((x) => ({ x, p: parecido(i.texto, x.name) })).sort((a, b) => b.p - a.p)[0];
      if (!h || h.p < 0.3) return { texto: 'No encontré ese hábito pendiente para hoy.', ruta: '/habitos' };
      await alternarHabito(db, h.x.id, true);
      return { texto: `¡Eso! Marqué "${h.x.name}". Racha: ${h.x.racha + 1} 🔥` };
    }

    case 'crear_habito': {
      const nombreHab = mayus(i.nombre);
      const sug = SUGERENCIAS.find((s) => parecido(nombreHab, s.name) >= 0.4);
      await crearHabito(db, { name: nombreHab, icon: sug?.icon ?? 'checkmark', color: sug?.color ?? '#CFF56B' });
      return { texto: `Listo, creé el hábito "${nombreHab}". Márcalo cada día y armamos una racha 🔥`, ruta: '/habitos' };
    }

    case 'crear_nota': {
      const texto = mayus(i.texto);
      await guardarNota(db, null, texto);
      return { texto: `Anotado en tus notas 📝: "${texto}"`, ruta: '/notas' };
    }

    case 'leer_notas': {
      const notas = await listarNotas(db);
      if (!notas.length) return { texto: 'No tienes notas todavía.', ruta: '/notas' };
      const primeras = notas.slice(0, 3).map((n) => n.body.split('\n')[0]);
      return { texto: `Tus últimas notas: ${lista(primeras.map((p) => `"${p}"`))}.`, ruta: '/notas' };
    }

    case 'clima': {
      const p = await obtenerClima(db).catch(() => null);
      if (!p) return { texto: 'No pude revisar el clima ahora. ¿Tienes internet?', ruta: '/clima' };
      return { texto: textoClima(p, i), ruta: '/clima' };
    }

    case 'recordatorio': {
      const cuando = i.hora
        ? `a las ${i.hora}`
        : i.segundos < 3600
          ? `en ${Math.round(i.segundos / 60)} minutos`
          : `en ${Math.round((i.segundos / 3600) * 10) / 10} ${i.segundos === 3600 ? 'hora' : 'horas'}`;
      return {
        texto: `Dale, te aviso ${cuando}: "${i.texto}" ⏰`,
        accion: { tipo: 'recordatorio', texto: mayus(i.texto), segundos: i.segundos },
      };
    }

    case 'abrir': {
      const d = normalizar(i.destino);
      const pantalla = PANTALLAS.find(([re]) => re.test(d));
      if (pantalla) return { texto: 'Vamos 👉', accion: { tipo: 'navegar', ruta: pantalla[1] } };
      const app = CATALOGO_APPS.find((a) => {
        const l = normalizar(a.label);
        return l === d || l.startsWith(d) || d.startsWith(l.split(' ')[0]);
      });
      if (app) return { texto: `Abriendo ${app.label}…`, accion: { tipo: 'abrir_app', pkg: app.pkg, nombre: app.label } };
      return { texto: `No sé abrir "${i.destino}" todavía. Puedo abrir pantallas de Tinzit0 (tareas, gastos, gym…) o tus apps (WhatsApp, Spotify…).` };
    }

    case 'tema_hud': {
      const nombres: Record<string, string> = {
        defecto: 'los colores originales', cian: 'cian', rojo: 'rojo', azul: 'azul', verde: 'verde', lima: 'lima',
        morado: 'morado', naranjo: 'naranjo', dorado: 'dorado', blanco: 'blanco', rosado: 'rosado',
      };
      return { texto: i.color === 'defecto' ? 'Interfaz restablecida.' : `Cambiando a ${nombres[i.color]}.`, hud: { color: i.color } };
    }

    case 'efecto_hud':
      return { texto: i.efecto === 'scan' ? 'Iniciando escaneo… Todo en orden.' : 'Pulso enviado.', hud: { efecto: i.efecto } };

    case 'fin_conversacion':
      return { texto: azar(['Aquí estaré cuando me necesites.', 'Quedo atento.', 'Hasta luego. Me quedo en espera.']), fin: true };

    case 'estado_sistema': {
      const tareas = await tareasDelDia(db, hoy);
      const pend = tareas.filter((t) => !t.hecha).length;
      const bat = sistema.bateria != null ? ` Batería al ${Math.round(sistema.bateria * 100)}%${sistema.bateria < 0.2 ? ', te recomiendo cargarla' : ''}.` : '';
      return {
        texto: `Todos los sistemas operativos.${bat} ${pend ? `Tienes ${pend} ${pend === 1 ? 'tarea pendiente' : 'tareas pendientes'} hoy.` : 'Sin tareas pendientes hoy.'}`,
      };
    }

    case 'desconocido':
    default:
      return {
        texto: `${azar(['Uy, eso no lo cacho todavía 😅', 'Perdón, no te entendí bien.', 'Mmm, esa no me la sé.'])} Puedes pedirme cosas como:\n• ${EJEMPLOS.slice(0, 4).join('\n• ')}`,
      };
  }
}

// ---------- Historial del chat ----------

export type MensajeChat = { id: number; role: 'user' | 'bot'; text: string; created_at: string };

export async function guardarMensaje(db: SQLiteDatabase, role: 'user' | 'bot', text: string) {
  await db.runAsync('INSERT INTO chat_messages (role, text) VALUES (?, ?)', role, text);
}

/** Mensajes de hoy (el chat se "limpia" solo cada día, pero el historial queda guardado). */
export async function mensajesDeHoy(db: SQLiteDatabase): Promise<MensajeChat[]> {
  return db.getAllAsync<MensajeChat>(`SELECT * FROM chat_messages WHERE date(created_at) = date('now','localtime') ORDER BY id`);
}

/** Texto apto para leer en voz alta (sin emojis ni viñetas). */
export function paraVoz(texto: string): string {
  return texto
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/•/g, '')
    .replace(/\$(\d{1,3}(?:\.\d{3})*)/g, (_, n) => `${n} pesos`)
    .replace(/(\d+)°/g, '$1 grados')
    .replace(/\s+/g, ' ')
    .trim();
}

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
import { compararMes } from '@/database/estadisticas';
import { contarAvisosPendientes, obtenerProyeccion } from '@/database/finanzas';
import { detectarRiesgo, textoAnimo } from '@/bienestar/logica';
import { obtenerPlan, registrarAnimo } from '@/database/bienestar';
import { diaDePagoEn, listarFijos } from '@/database/fijos';
import {
  buscarRamo,
  contarPendientes,
  crearEvaluacion,
  evaluacionesDeRamo,
  listarRamos,
  marcarAsistencia,
  minutosEstudio,
  ponerNota,
  proximasEvaluaciones,
  resumenRamo,
  todosLosBloques,
} from '@/database/estudio';
import { bloquesDelDia, claseAhora, formatoHoras, formatoNota, minutosHasta, redondearNota, textoNecesaria } from '@/estudio/logica';
import { agregarSerie, diasEntrenados, guardarDiaRutina, listarEjercicios, obtenerOCrearEjercicio, obtenerRutina, rutinaDeHoy, seriesDeFecha, ultimaSerie } from '@/database/gym';
import { desbloqueados, LOGROS } from '@/database/logros';
import { alternarHabito, crearHabito, listarHabitos, SUGERENCIAS } from '@/database/habitos';
import { abonar, buscarMeta, crearMeta, listarMetas } from '@/database/metas';
import { guardarNota, listarNotas } from '@/database/notas';
import { getSetting, setSetting } from '@/database/queries';
import {
  alternarTarea,
  completadasEnRango,
  crearTarea,
  eliminarTarea,
  moverTarea,
  tareasDelDia,
  tareasSemanales,
  todasLasTareas,
} from '@/database/tareas';
import { CATALOGO_APPS } from '@/utils/apps';
import { categoria } from '@/utils/categorias';
import { fechaLarga, fromISODate, nombreDiaMonFirst, startOfWeek, toISODate } from '@/utils/fechas';
import { ENLACES } from '@/utils/enlaces';
import { formatCLP } from '@/utils/moneda';
import type { CambioHud, Panel } from '@/jarvis/paneles';
import { panelPara } from '@/jarvis/panelesDatos';
import { aprender, buscarAprendido, olvidar, sugerir, type Sugerencia } from './aprender';
import { musicaPorDescarte } from './reglasApps';
import { EJEMPLOS, interpretar, type Contexto, type Intencion } from './interpretar';
import { normalizar, parecido, sinActivacion } from './texto';

export type Accion =
  | { tipo: 'navegar'; ruta: string }
  | { tipo: 'abrir_app'; pkg: string; nombre: string }
  | { tipo: 'recordatorio'; texto: string; segundos: number }
  | { tipo: 'tema'; tema: 'claro' | 'oscuro' | 'sistema' }
  | { tipo: 'url'; url: string; respaldo?: string }
  | { tipo: 'musica'; consulta: string }
  | { tipo: 'musica_control'; accion: 'pausa' | 'continuar' | 'siguiente' | 'anterior' }
  | { tipo: 'musica_sonando' };

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
  /** Opciones de "¿Quisiste decir…?" (y la frase original, para aprenderla). */
  sugerencias?: Sugerencia[];
  pendiente?: string;
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

/** Días desde hoy hasta una fecha ISO. */
function diasHasta(iso: string) {
  return Math.round((fromISODate(iso).getTime() - fromISODate(toISODate()).getTime()) / 86400000);
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
  [/^(musica|reproductor|mi musica)/, '/musica'],
  [/^(estudio|ramos?|cursos|modo estudiante|universidad)/, '/estudio'],
  [/^horario/, '/horario'],
  [/^(tarjetas|flashcards)/, '/tarjetas'],
  [/^(pomodoro|enfoque|modo enfoque)/, '/pomodoro'],
];

export async function responder(db: SQLiteDatabase, frase: string, contexto: Contexto = {}, sistema: Sistema = {}): Promise<Respuesta> {
  const t = normalizar(sinActivacion(frase));

  // 1) ¿Está respondiendo a un "¿Quisiste decir…?" ("la primera", "sí", "la segunda")?
  if (contexto.sugerencias?.length && contexto.pendiente) {
    const idx = /^(si|sip|esa|eso|la primera|primera|el primero|uno|1|correcto|exacto)$/.test(t)
      ? 0
      : /^(la segunda|segunda|el segundo|dos|2)$/.test(t)
        ? 1
        : /^(la tercera|tercera|el tercero|tres|3)$/.test(t)
          ? 2
          : /^(no|ninguna|ninguno|nada|olvidalo|cancela)$/.test(t)
            ? -1
            : null;
    if (idx === -1) return { texto: 'Entendido. Dime de otra forma lo que necesitas.', intencion: 'desconocido' };
    const s = idx !== null ? contexto.sugerencias[idx] : null;
    if (s) {
      await aprender(db, contexto.pendiente, s.comando);
      const r = await responder(db, s.comando, {}, sistema);
      return { ...r, texto: `${r.texto} (Aprendido: la próxima vez que digas "${contexto.pendiente}", lo haré directo.)` };
    }
  }

  // 0) Si la frase habla de hacerse daño, siempre se responde con ayuda (antes que cualquier otra cosa).
  if (detectarRiesgo(t)) return { ...(await ejecutar(db, { tipo: 'crisis' }, sistema)), intencion: 'crisis' };

  // 2) ¿Ya lo aprendió antes?
  const aprendido = await buscarAprendido(db, frase);
  const i0 = interpretar(aprendido ?? frase, new Date(), contexto);

  // 3) Enseñar / olvidar
  if (i0.tipo === 'ensenar') {
    const destino = interpretar(i0.comando);
    const sug = destino.tipo === 'desconocido' ? sugerir(i0.comando, 1)[0] : null;
    const comando = destino.tipo !== 'desconocido' ? i0.comando : sug && sug.puntaje >= 0.45 ? sug.comando : null;
    if (!comando) return { texto: `No sé hacer "${i0.comando}" todavía, así que no puedo asociarlo. Prueba con algo que ya entienda, como "mis tareas de hoy".`, intencion: 'ensenar' };
    await aprender(db, i0.frase, comando);
    return { texto: `Aprendido. Cuando digas "${i0.frase}", haré: ${comando}.`, intencion: 'ensenar' };
  }
  if (i0.tipo === 'olvidar') {
    const ok = await olvidar(db, i0.frase);
    return { texto: ok ? `Olvidé "${i0.frase}".` : `No tenía nada aprendido para "${i0.frase}".`, intencion: 'olvidar' };
  }

  // 4) Si no entendió: buscar por parecido
  let i: Intencion = i0;
  if (i.tipo === 'desconocido') {
    const sugs = sugerir(frase, 3);
    const musica = musicaPorDescarte(t);
    if (sugs[0] && sugs[0].puntaje >= 0.6) {
      i = interpretar(sugs[0].comando, new Date(), contexto);
    } else if (musica) {
      // "pon X" sin otra pista: lo tomamos como música.
      i = musica;
    } else if (sugs.length) {
      return {
        texto: `No estoy seguro de haberte entendido. ¿Quisiste decir: ${sugs.map((s, k) => `${k + 1}) ${s.etiqueta.toLowerCase()}`).join(', ')}? Toca una opción o dime "la primera".`,
        intencion: 'desconocido',
        sugerencias: sugs,
        pendiente: frase.trim(),
      };
    }
  }

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
        texto: `Puedo con tus tareas, gastos, gastos fijos, metas, gym, peso, hábitos, notas, medallas, estadísticas, el clima, recordatorios y temporizadores. También respondo "¿cómo hago…?" sobre la app. Si no te entiendo, te doy opciones y aprendo la que elijas; o enséñame: "cuando diga ya llegué, muéstrame mis tareas". Prueba con:\n• ${EJEMPLOS.join('\n• ')}`,
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

    case 'fijos': {
      const fijos = (await listarFijos(db)).filter((f) => f.active);
      if (!fijos.length) return { texto: 'No tienes gastos fijos registrados. Puedes agregarlos en Gastos → Fijos.', ruta: '/fijos' };
      if (i.que === 'total') {
        const total = fijos.reduce((s, f) => s + f.amount, 0);
        return { texto: `Pagas ${formatCLP(total)} al mes en ${fijos.length} gastos fijos: ${lista(fijos.slice(0, 4).map((f) => f.name))}.`, ruta: '/fijos' };
      }
      const ahora = new Date();
      const proximos = fijos
        .map((f) => {
          let d = diaDePagoEn(f, ahora.getFullYear(), ahora.getMonth());
          let fecha = new Date(ahora.getFullYear(), ahora.getMonth(), d);
          if (d < ahora.getDate()) {
            d = diaDePagoEn(f, ahora.getFullYear(), ahora.getMonth() + 1);
            fecha = new Date(ahora.getFullYear(), ahora.getMonth() + 1, d);
          }
          return { f, fecha };
        })
        .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
        .slice(0, 3);
      return {
        texto: `Próximos pagos: ${lista(proximos.map((p) => `${p.f.name} (${formatCLP(p.f.amount)}) ${nombreDia(toISODate(p.fecha))}`))}.`,
        ruta: '/fijos',
      };
    }

    case 'estadisticas_mes': {
      const ahora = new Date();
      const { actual: a, anterior: b } = await compararMes(db, ahora.getFullYear(), ahora.getMonth());
      const dif = a.gastoTotal - b.gastoTotal;
      const top = a.porCategoria[0];
      return {
        texto:
          `Este mes: ${a.tareasHechas} tareas hechas, ${a.diasGym.length} ${a.diasGym.length === 1 ? 'día' : 'días'} de gym y ${formatCLP(a.gastoTotal)} gastados` +
          `${b.gastoTotal ? ` (${dif > 0 ? `${formatCLP(dif)} más` : `${formatCLP(-dif)} menos`} que el mes pasado)` : ''}.` +
          `${top ? ` Donde más gastaste: ${categoria(top.category).label.toLowerCase()}.` : ''}`,
        ruta: '/estadisticas',
      };
    }

    case 'logros': {
      const ganados = await desbloqueados(db);
      const ultimo = [...ganados.entries()].sort((x, y) => y[1].localeCompare(x[1]))[0];
      const l = ultimo ? LOGROS.find((x) => x.key === ultimo[0]) : null;
      return {
        texto: ganados.size
          ? `Tienes ${ganados.size} de ${LOGROS.length} medallas.${l ? ` La última: "${l.titulo}".` : ''}`
          : `Aún no tienes medallas. La más fácil: completa tu primera tarea.`,
        ruta: '/logros',
      };
    }

    case 'record_ejercicio': {
      const ejercicios = (await listarEjercicios(db)).filter((e) => e.maxPeso);
      if (!ejercicios.length) return { texto: 'Aún no tienes ejercicios registrados en el gym.', ruta: '/gym' };
      const ej = i.texto ? ejercicios.map((e) => ({ e, p: parecido(i.texto, e.name) })).filter((x) => x.p >= 0.4).sort((a, b) => b.p - a.p)[0]?.e : null;
      if (ej) return { texto: `Tu récord en ${ej.name} es ${ej.maxPeso} kg.`, ruta: '/gym' };
      const top = [...ejercicios].sort((a, b) => (b.maxPeso ?? 0) - (a.maxPeso ?? 0)).slice(0, 3);
      return { texto: `Tus récords: ${lista(top.map((e) => `${e.name} ${e.maxPeso} kg`))}.`, ruta: '/gym' };
    }

    case 'rutina_dia': {
      const r = (await obtenerRutina(db)).find((x) => x.weekday === i.dia);
      const nombreD = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i.dia];
      return { texto: r ? `El ${nombreD} toca ${r.label.toLowerCase()}.` : `El ${nombreD} es día de descanso.`, ruta: '/gym' };
    }

    case 'cambiar_rutina': {
      await guardarDiaRutina(db, i.dia, i.label ? mayus(i.label) : null);
      const nombreD = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i.dia];
      return { texto: i.label ? `Listo, el ${nombreD} ahora toca ${i.label}.` : `Listo, el ${nombreD} queda de descanso.`, ruta: '/gym' };
    }

    case 'buscar_notas': {
      const notas = await listarNotas(db, i.texto);
      if (!notas.length) return { texto: `No encontré notas sobre "${i.texto}".`, ruta: '/notas' };
      return { texto: `Encontré ${notas.length === 1 ? '1 nota' : `${notas.length} notas`}: ${lista(notas.slice(0, 3).map((n) => `"${n.body.split('\n')[0]}"`))}.`, ruta: '/notas' };
    }

    case 'habitos_pendientes': {
      const h = await listarHabitos(db);
      if (!h.length) return { texto: 'No tienes hábitos todavía. Dime "crea un hábito de tomar agua".', ruta: '/habitos' };
      const pend = h.filter((x) => !x.hechoHoy);
      if (!pend.length) return { texto: `Marcaste todos tus hábitos de hoy. Excelente constancia.`, ruta: '/habitos' };
      return { texto: `Te ${pend.length === 1 ? 'falta 1 hábito' : `faltan ${pend.length} hábitos`}: ${lista(pend.map((x) => x.name))}.`, ruta: '/habitos' };
    }

    case 'ayuda_app': {
      const AYUDA: Record<string, [string, string]> = {
        respaldo: ['En Ajustes → Respaldo toca "Exportar respaldo" y guárdalo en Drive o mándatelo por correo. En un celular nuevo, usa "Importar respaldo". Te recuerdo hacerlo cada semana.', '/ajustes'],
        bloqueo: ['En Ajustes → Seguridad activa "Bloqueo con huella". Te la pide al abrir la app y al volver después de un minuto.', '/ajustes'],
        widget: ['Mantén presionado el fondo de tu pantalla de inicio, toca Widgets y busca "Tinzit0 · Hoy". Muestra tus tareas y el gasto de la semana.', '/'],
        notificaciones: ['En Ajustes → Notificaciones eliges la hora del resumen de la mañana, del recordatorio de la noche y del resumen del domingo. Ahí también puedes enviar una de prueba.', '/ajustes'],
        fijos: ['En Gastos toca "Fijos" y luego el +. Pones el monto y el día de pago: se suma solo cada mes y te aviso un día antes.', '/fijos'],
        metas: ['Dime "quiero ahorrar 300 lucas para un viaje" o ve a Gastos → Metas. Después me dices "abona 10 lucas" y le sumo.', '/metas'],
        habitos: ['Dime "crea un hábito de leer" o ve a Hoy → Hábitos. Lo marcas cada día y armas tu racha.', '/habitos'],
        gym: ['En Gym → "Registrar entrenamiento" anotas series, o dime "hice 3 series de 10 de press banca con 40 kilos". La rutina se cambia en "Editar rutina" o diciendo "el lunes toca pecho".', '/gym'],
        cuerpo: ['En Gym → "Peso y medidas", o dime "anota mi peso 78 kilos". Ahí ves el gráfico de tu evolución.', '/cuerpo'],
        presupuesto: ['Dime "cambia mi presupuesto a 100 lucas" o ve a Ajustes → Gastos. Te aviso al 80% y al 100%.', '/ajustes'],
        gastos: ['Dime "anota un gasto de 5 lucas en comida" o toca el + en Gastos. Ahí ves la semana, el mes y por categoría.', '/gastos'],
        tareas: ['Dime "agrega una tarea: comprar pan mañana" o toca el + en Tareas. Puedes hacer que se repita todos los días o ciertos días.', '/tareas'],
        notas: ['Dime "anota una nota: …" o toca el + en Notas. Se guardan solas y puedes fijarlas arriba.', '/notas'],
        tema: ['Dime "modo oscuro" o "modo claro", o cámbialo en Ajustes → Apariencia. Para mi color, dime "ponte rojo" o "ponte morado".', '/ajustes'],
        asistente: ['Toca el micrófono en Hoy y háblame. En Ajustes → Asistente eliges mi voz, cómo te llamo, y puedes activar que te escuche cuando digas "Tinzit0" con la app abierta. Si no te entiendo, elige una opción y lo aprendo.', '/ajustes'],
        apps: ['En Hoy, "Tus apps" → Editar, eliges hasta 8 apps para abrirlas de un toque. También puedes decirme "abre WhatsApp".', '/apps'],
        clima: ['El clima aparece en Hoy. Para cambiar la ciudad ve a Ajustes → Clima, o usa tu ubicación.', '/clima'],
        estadisticas: ['En Hoy toca "Tu mes en números", o dime "cómo me fue este mes".', '/estadisticas'],
        banco: ['En Gastos toca "Del banco" → "Activar gastos automáticos" y activa Tinzit0 en "Acceso a notificaciones". Si Android dice "ajuste restringido": Ajustes → Apps → Tinzit0 → ⋮ → "Permitir ajustes restringidos". Eliges si te pregunto cada compra o las anoto solas.', '/gastos-banco'],
        boleta: ['En Gastos toca "Boleta" (o dime "escanea una boleta"), sácale una foto y te dejo el gasto listo con el total, el local y la fecha.', '/boleta'],
        campus: ['En Estudio toca "Asistencia": estando en la U guardas la ubicación y la activas (Android pide ubicación "todo el tiempo"). Marco "fui" cuando estás en la U a la hora de la clase y, si no, te pregunto.', '/campus'],
        bienestar: ['En Hoy toca la tarjeta Bienestar. Ahí está "Estoy a mil" para bajar una emoción fuerte en 2 minutos, "Surfear impulso", tu tarjeta diaria, tus patrones y tu plan de crisis. También puedes decirme "estoy a mil" o "me siento un 5". Todo queda solo en tu celular.', '/bienestar'],
        proyeccion: ['En Gastos ves "Hoy puedes gastar" y cómo terminarías el mes a tu ritmo. Necesita un presupuesto semanal (Ajustes → Gastos). También pregúntame "¿cuánto puedo gastar hoy?".', '/gastos'],
        estudio: ['En Hoy toca "Estudio" → "Nuevo ramo". En cada ramo agregas tus evaluaciones con su ponderación y nota (de 1,0 a 7,0) y te digo tu promedio y cuánto necesitas para el 4,0. También puedes decirme "me saqué un 5,5 en la prueba de cálculo" o "tengo prueba de química el viernes" y te armo un plan de estudio.', '/estudio'],
        horario: ['Abre un ramo, toca el lápiz y agrega sus bloques (día y hora). Te aviso 10 minutos antes de cada clase y en Hoy ves la clase de ahora. Pregúntame "qué clase tengo ahora".', '/horario'],
        asistencia: ['En cada ramo toca "Fui hoy" o "Falté hoy", o dime "falté a física". Te muestro el porcentaje y te aviso si quedas bajo el mínimo.', '/estudio'],
        pomodoro: ['Dime "modo enfoque" o toca "Enfoque" en Estudio: 25 minutos de concentración y 5 de descanso. Te aviso al terminar y sumo las horas a tu ramo.', '/pomodoro'],
        tarjetas: ['En Estudio → Tarjetas creas preguntas y respuestas, o las armo desde tus notas. Cuando repasas, dime qué tan bien te la sabías y te la muestro justo antes de que se te olvide.', '/tarjetas'],
        grabar: ['En Estudio → "Grabar clase" toca el micrófono: paso a texto lo que se dice en clase. Al terminar te hago un resumen, lo guardas como nota o creo tarjetas.', '/grabar'],
        escanear: ['En Estudio → "Escanear" saca una foto a tus apuntes o la pizarra: leo el texto sin internet, lo corriges y lo guardas como nota o tarjetas.', '/escanear'],
        logros: ['Las medallas se ganan solas al cumplir metas: tareas, días de gym, rachas, ahorro. Míralas con el trofeo en Hoy.', '/logros'],
      };
      const [texto, ruta] = AYUDA[i.tema] ?? ['Puedo ayudarte con tareas, gastos, gym, hábitos, notas, metas y clima. Pregúntame "cómo hago…" cualquier cosa.', '/'];
      return { texto, ruta };
    }

    case 'cambiar_tema': {
      const nombres = { claro: 'claro', oscuro: 'oscuro', sistema: 'automático' } as const;
      return { texto: `Cambiando al modo ${nombres[i.tema]}.`, accion: { tipo: 'tema', tema: i.tema } };
    }

    case 'temporizador': {
      const txt = i.segundos >= 60 && i.segundos % 60 === 0 ? `${i.segundos / 60} ${i.segundos === 60 ? 'minuto' : 'minutos'}` : `${i.segundos} segundos`;
      return { texto: `Temporizador de ${txt} en marcha. Te aviso al terminar.`, accion: { tipo: 'recordatorio', texto: 'Tiempo cumplido', segundos: i.segundos } };
    }

    case 'ensenar':
    case 'olvidar':
      // Se resuelven en responder() (necesitan revisar lo aprendido).
      return { texto: 'Listo.' };

    case 'musica_reproducir':
      return { texto: `Poniendo ${i.consulta} en Spotify.`, accion: { tipo: 'musica', consulta: i.consulta } };

    case 'musica_control': {
      const txt = { pausa: 'Pausando la música.', continuar: 'Reanudando la música.', siguiente: 'Siguiente canción.', anterior: 'Canción anterior.' }[i.accion];
      return { texto: txt, accion: { tipo: 'musica_control', accion: i.accion } };
    }

    case 'musica_sonando':
      return { texto: 'Déjame revisar qué está sonando…', accion: { tipo: 'musica_sonando' } };

    case 'app_accion': {
      switch (i.accion) {
        case 'youtube':
          return { texto: `Buscando "${i.texto}" en YouTube.`, accion: { tipo: 'url', url: ENLACES.youtube(i.texto) } };
        case 'google':
          return { texto: `Buscando "${i.texto}" en Google.`, accion: { tipo: 'url', url: ENLACES.google(i.texto) } };
        case 'navegar':
          return { texto: `Abriendo la ruta a ${i.texto} en Maps.`, accion: { tipo: 'url', url: ENLACES.navegar(i.texto), respaldo: ENLACES.navegarWeb(i.texto) } };
        case 'mapa':
          return { texto: `Buscando ${i.texto} en el mapa.`, accion: { tipo: 'url', url: ENLACES.mapa(i.texto), respaldo: ENLACES.mapaWeb(i.texto) } };
        case 'whatsapp':
          return { texto: `Abriendo WhatsApp con tu mensaje. Elige a quién mandarlo.`, accion: { tipo: 'url', url: ENLACES.whatsapp(i.texto), respaldo: ENLACES.whatsappWeb(i.texto) } };
        case 'llamar':
          return { texto: `Llamando al ${i.texto}.`, accion: { tipo: 'url', url: ENLACES.llamar(i.texto) } };
      }
      return { texto: 'No sé hacer eso todavía.' };
    }

    // ---------- Plata: cuánto puedo gastar, fin de mes ----------
    case 'gasto_diario': {
      const p = await obtenerProyeccion(db);
      if (p.quedaHoy == null || p.porDia == null) return { texto: 'Aún no tienes presupuesto semanal. Dime "cambia mi presupuesto a 70 lucas" y te digo cuánto puedes gastar cada día.', ruta: '/gastos' };
      if (p.quedaHoy < 0) return { texto: `Hoy ya te pasaste ${formatCLP(-p.quedaHoy)} de lo que tocaba por día. Si mañana gastas menos, lo compensas.`, ruta: '/gastos' };
      return {
        texto: `Hoy puedes gastar ${formatCLP(p.quedaHoy)}.${p.diasRestantesSemana > 1 ? ` Para el resto de la semana te tocan unos ${formatCLP(p.porDia)} por día.` : ' Es el último día de la semana.'}`,
        ruta: '/gastos',
      };
    }

    case 'proyeccion_mes': {
      const p = await obtenerProyeccion(db);
      const base = `Si sigues a este ritmo (${formatCLP(p.ritmoDiario)} al día, sin contar fijos), terminas el mes en ${formatCLP(p.finDeMes)}`;
      if (p.presupuestoMes == null) return { texto: `${base}.`, ruta: '/gastos' };
      const fin = p.estado === 'pasado'
        ? `: te pasarías ${formatCLP(p.finDeMes - p.presupuestoMes)} de tu presupuesto del mes. Ojo con los gastos chicos.`
        : p.estado === 'ojo'
          ? `, justo al límite de tu presupuesto (${formatCLP(p.presupuestoMes)}).`
          : `, dentro de tu presupuesto (${formatCLP(p.presupuestoMes)}). Vas bien.`;
      return { texto: base + fin, ruta: '/gastos' };
    }

    // ---------- Bienestar ----------
    case 'crisis': {
      const plan = await obtenerPlan(db);
      const persona = plan.contactos[0];
      return {
        texto:
          'Siento mucho que estés pasando por algo tan fuerte. No tienes que pasarlo sin compañía. ' +
          'Llama ahora a la línea de prevención: asterisco 4141, es gratis y atienden las 24 horas. ' +
          (persona ? `También puedes llamar a ${persona.nombre}. ` : '') +
          'Si estás en peligro inmediato, llama al 131. Te abro tu plan de crisis.',
        accion: { tipo: 'navegar', ruta: '/plan-crisis' },
        ruta: '/plan-crisis',
      };
    }

    case 'animo_registrar': {
      await registrarAnimo(db, i.valor);
      const extra =
        i.valor <= 3
          ? ' Gracias por contármelo. Si quieres, hacemos juntos un ejercicio para bajar la intensidad: di "estoy a mil".'
          : i.valor >= 8
            ? ' ¡Qué bueno! Anota qué hiciste hoy, para repetirlo.'
            : '';
      return { texto: `Anoté tu ánimo de hoy: ${i.valor} de 10 (${textoAnimo(i.valor).toLowerCase()}).${extra}` };
    }

    case 'bienestar_ir': {
      const frases: Record<string, string> = {
        '/calma': 'Estoy contigo. Vamos a bajar la intensidad paso a paso.',
        '/impulso': 'Las ganas son como una ola: suben y bajan. Te acompaño mientras pasa.',
        '/plan-crisis': 'Abriendo tu plan de crisis. La línea *4141 es gratis, 24 horas.',
      };
      return { texto: frases[i.ruta] ?? `Abriendo ${i.nombre}.`, accion: { tipo: 'navegar', ruta: i.ruta }, ruta: i.ruta };
    }

    case 'finanzas_ir': {
      if (i.ruta === '/gastos-banco') {
        const n = await contarAvisosPendientes(db);
        return { texto: n ? `Tienes ${n} ${n === 1 ? 'gasto del banco' : 'gastos del banco'} por revisar. Abriendo.` : 'Abriendo los gastos del banco.', accion: { tipo: 'navegar', ruta: i.ruta }, ruta: i.ruta };
      }
      return { texto: `Abriendo ${i.nombre}.`, accion: { tipo: 'navegar', ruta: i.ruta }, ruta: i.ruta };
    }

    // ---------- Modo Estudiante ----------
    case 'estudio_ir':
      return { texto: `Abriendo ${i.nombre}.`, accion: { tipo: 'navegar', ruta: i.ruta }, ruta: i.ruta };

    case 'nota_promedio': {
      if (!i.ramo) {
        const ramos = (await listarRamos(db)).filter((r) => r.promedio != null);
        if (!ramos.length) return { texto: 'Aún no tienes notas. Agrega tus ramos y evaluaciones en Estudio, o dime "me saqué un 5,5 en la prueba de cálculo".', ruta: '/estudio' };
        const general = ramos.reduce((s, r) => s + (r.promedio ?? 0), 0) / ramos.length;
        const rojos = ramos.filter((r) => redondearNota(r.promedio ?? 0) < r.passing);
        return {
          texto: `Tu promedio general es ${formatoNota(general)}: ${lista(ramos.map((r) => `${r.name} ${formatoNota(r.promedio)}`))}.${rojos.length ? ` Ojo con ${lista(rojos.map((r) => r.name))}.` : ' Vas aprobando todo.'}`,
          ruta: '/estudio',
        };
      }
      const ramo = await buscarRamo(db, i.ramo);
      if (!ramo) {
        if (i.desdeNotas) return ejecutar(db, { tipo: 'buscar_notas', texto: i.ramo }, sistema);
        return { texto: `No tengo un ramo llamado "${i.ramo}". Agrégalo en Estudio → Nuevo ramo.`, ruta: '/estudio' };
      }
      const r = await resumenRamo(db, ramo);
      if (r.promedio == null) return { texto: `En ${ramo.name} todavía no tienes notas.`, ruta: `/ramo?id=${ramo.id}` };
      return { texto: `En ${ramo.name} llevas un ${formatoNota(r.promedio)}. ${textoNecesaria(r.necesaria, ramo.passing)}`, ruta: `/ramo?id=${ramo.id}` };
    }

    case 'nota_necesito': {
      const ramo = await buscarRamo(db, i.ramo);
      if (!ramo) {
        const ramos = await listarRamos(db);
        const urgentes = ramos.filter((r) => r.necesaria.estado === 'necesita' || r.necesaria.estado === 'imposible');
        if (!ramos.length) return { texto: 'Primero agrega tus ramos en Estudio.', ruta: '/estudio' };
        if (i.ramo) return { texto: `No encontré el ramo "${i.ramo}". Tus ramos son: ${lista(ramos.map((r) => r.name))}.`, ruta: '/estudio' };
        if (!urgentes.length) return { texto: 'Con lo que llevas, no tienes ramos en riesgo. Bien ahí.', ruta: '/estudio' };
        return { texto: urgentes.map((r) => `${r.name}: ${textoNecesaria(r.necesaria, r.passing)}`).join(' '), ruta: '/estudio' };
      }
      const r = await resumenRamo(db, ramo);
      return { texto: `${ramo.name}: ${textoNecesaria(r.necesaria, ramo.passing)}`, ruta: `/ramo?id=${ramo.id}` };
    }

    case 'nota_agregar': {
      const ramo = await buscarRamo(db, i.ramo);
      if (!ramo) return { texto: `No tengo el ramo "${i.ramo}". Créalo en Estudio y vuelve a decírmelo.`, ruta: '/estudio' };
      const evals = await evaluacionesDeRamo(db, ramo.id);
      // Si nombraste la evaluación, la buscamos; si no, la primera sin nota que ya pasó.
      const nombrada = i.evaluacion;
      const buscada = nombrada
        ? (evals.find((e) => parecido(nombrada, e.name) >= 0.5 && e.grade == null) ?? evals.find((e) => parecido(nombrada, e.name) >= 0.5))
        : null;
      const pendiente = buscada ?? (nombrada ? null : evals.find((e) => e.grade == null && (!e.date || e.date <= hoy)));
      let nombreEval: string;
      if (pendiente) {
        await ponerNota(db, pendiente.id, i.nota);
        nombreEval = pendiente.name;
      } else {
        nombreEval = nombrada ? mayus(nombrada) : `Nota ${evals.filter((e) => e.grade != null).length + 1}`;
        await crearEvaluacion(db, { course_id: ramo.id, name: nombreEval, weight: 0, grade: i.nota, date: hoy, study_hours: 0 });
      }
      const r = await resumenRamo(db, ramo);
      const felicita = i.nota >= 6 ? ' ¡Excelente nota! 🎉' : i.nota >= ramo.passing ? ' Bien ahí.' : ' Tranqui, todavía se puede levantar.';
      const alerta = r.necesaria.estado === 'necesita' || r.necesaria.estado === 'imposible' ? ` ${textoNecesaria(r.necesaria, ramo.passing)}` : '';
      return {
        texto: `Anoté un ${formatoNota(i.nota)} en ${nombreEval} de ${ramo.name}.${felicita} Tu promedio queda en ${formatoNota(r.promedio)}.${alerta}`,
        ruta: `/ramo?id=${ramo.id}`,
      };
    }

    case 'clase_ahora': {
      const bloques = await todosLosBloques(db);
      if (!bloques.length) return { texto: 'Aún no tienes tu horario. Agrega los bloques de cada ramo en Estudio.', ruta: '/estudio' };
      const { actual, siguiente } = claseAhora(bloques);
      const sala = (b: { sala: string | null }) => (b.sala ? ` en la sala ${b.sala}` : '');
      const partes: string[] = [];
      if (actual) partes.push(`Ahora tienes ${actual.name}${sala(actual)}, hasta las ${actual.end_time}.`);
      if (siguiente) {
        const falta = minutosHasta(siguiente.start_time);
        const cuando =
          siguiente.enDias === 0
            ? `hoy a las ${siguiente.start_time}${falta <= 60 ? ` (en ${falta} minutos)` : ''}`
            : siguiente.enDias === 1
              ? `mañana a las ${siguiente.start_time}`
              : `el ${nombreDiaMonFirst(siguiente.weekday)} a las ${siguiente.start_time}`;
        partes.push(`${actual ? 'Después' : 'Tu próxima clase'} es ${siguiente.name}${sala(siguiente)}, ${cuando}.`);
      }
      return { texto: partes.join(' ') || 'No tienes más clases esta semana.', ruta: '/horario' };
    }

    case 'clases_dia': {
      const fecha = i.fecha ? fromISODate(i.fecha) : new Date();
      const del = bloquesDelDia(await todosLosBloques(db), fecha);
      const cuando = nombreDia(toISODate(fecha));
      if (!del.length) return { texto: `${mayus(cuando)} no tienes clases.${cuando === 'hoy' ? ' Aprovecha de adelantar materia.' : ''}`, ruta: '/horario' };
      return {
        texto: `${mayus(cuando)} tienes ${del.length === 1 ? '1 clase' : `${del.length} clases`}: ${lista(del.map((b) => `${b.name} a las ${b.start_time}${b.sala ? ` (${b.sala})` : ''}`))}.`,
        ruta: '/horario',
      };
    }

    case 'asistencia': {
      const ramo = await buscarRamo(db, i.ramo);
      if (!ramo) return { texto: `No encontré el ramo "${i.ramo}".`, ruta: '/estudio' };
      await marcarAsistencia(db, ramo.id, i.presente);
      const r = await resumenRamo(db, ramo);
      const riesgo = r.asistencia != null && r.asistencia < ramo.min_attendance;
      return {
        texto: `${i.presente ? 'Marqué que fuiste' : 'Anoté tu falta'} a ${ramo.name}. Llevas ${r.asistencia}% de asistencia (${r.faltas} ${r.faltas === 1 ? 'falta' : 'faltas'}).${riesgo ? ` Ojo: estás bajo el ${ramo.min_attendance}% mínimo.` : ''}`,
        ruta: `/ramo?id=${ramo.id}`,
      };
    }

    case 'asistencia_consulta': {
      const ramo = i.ramo ? await buscarRamo(db, i.ramo) : null;
      if (ramo) {
        const r = await resumenRamo(db, ramo);
        if (!r.clases) return { texto: `Aún no registras asistencia en ${ramo.name}. Dime "fui a clase de ${ramo.name}" o "falté a ${ramo.name}".`, ruta: `/ramo?id=${ramo.id}` };
        return { texto: `En ${ramo.name} llevas ${r.asistencia}% de asistencia: ${r.faltas} ${r.faltas === 1 ? 'falta' : 'faltas'} de ${r.clases} clases.`, ruta: `/ramo?id=${ramo.id}` };
      }
      const ramos = (await listarRamos(db)).filter((r) => r.clases > 0);
      if (!ramos.length) return { texto: 'Aún no registras asistencia. Dime "falté a física" o márcala en cada ramo.', ruta: '/estudio' };
      const riesgo = ramos.filter((r) => (r.asistencia ?? 100) < r.min_attendance);
      return {
        texto: `${lista(ramos.map((r) => `${r.name} ${r.asistencia}% (${r.faltas} ${r.faltas === 1 ? 'falta' : 'faltas'})`))}.${riesgo.length ? ` Ojo con ${lista(riesgo.map((r) => r.name))}: bajo el mínimo.` : ''}`,
        ruta: '/estudio',
      };
    }

    case 'prueba_agregar': {
      const ramo = await buscarRamo(db, i.ramo);
      if (!ramo) return { texto: `No tengo el ramo "${i.ramo}". Créalo en Estudio → Nuevo ramo y vuelve a decírmelo.`, ruta: '/estudio' };
      const horas = i.fecha ? Math.min(6, Math.max(1, Math.round(diasHasta(i.fecha) / 2))) : 0;
      const id = await crearEvaluacion(db, { course_id: ramo.id, name: i.nombre, weight: 0, grade: null, date: i.fecha, study_hours: horas });
      const plan = horas ? ` Te armé un plan de ${formatoHoras(horas)} de estudio repartido en tus tareas.` : '';
      return {
        texto: `Anotado: ${i.nombre} de ${ramo.name}${i.fecha ? ` ${cuandoDecir(i.fecha).replace(/^para /, '')}` : ' (sin fecha todavía)'}.${plan} Puedes ajustar la ponderación en la app.`,
        ruta: `/evaluacion?id=${id}`,
      };
    }

    case 'pruebas_proximas': {
      let prox = (await proximasEvaluaciones(db, 45)).filter((e) => e.grade == null);
      if (i.ramo) {
        const ramo = await buscarRamo(db, i.ramo);
        if (ramo) prox = prox.filter((e) => e.course_id === ramo.id);
      }
      if (!prox.length) return { texto: 'No tienes pruebas anotadas en las próximas semanas. Dime "tengo prueba de cálculo el viernes" para agregar una.', ruta: '/estudio' };
      const fmt = (e: (typeof prox)[number]) => {
        const d = diasHasta(e.date ?? hoy);
        return `${e.name} de ${e.ramo} ${d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`}`;
      };
      return {
        texto: prox.length === 1 ? `Tu próxima evaluación: ${fmt(prox[0])}.` : `Tienes ${prox.length} evaluaciones: ${lista(prox.slice(0, 4).map(fmt))}.`,
        ruta: '/estudio',
      };
    }

    case 'pomodoro': {
      const ramo = await buscarRamo(db, i.ramo);
      const min = Number((await getSetting(db, 'pomodoro_min')) ?? 25) || 25;
      return {
        texto: `Modo enfoque${ramo ? ` para ${ramo.name}` : ''}: ${min} minutos de concentración. Deja el celular de lado, yo te aviso.`,
        accion: { tipo: 'navegar', ruta: `/pomodoro?auto=1${ramo ? `&ramo=${ramo.id}` : ''}` },
      };
    }

    case 'estudio_semana': {
      const semana = rangoSemana(new Date());
      const m = await minutosEstudio(db, semana.desde, semana.hasta);
      if (!m.total) return { texto: 'Esta semana todavía no registras estudio. Dime "modo enfoque" y partimos con un pomodoro.', ruta: '/estudio' };
      const detalle = m.porRamo.length > 1 || m.porRamo[0]?.name !== 'General' ? `: ${lista(m.porRamo.map((r) => `${r.name} ${formatoHoras(r.minutos / 60)}`))}` : '';
      return { texto: `Esta semana estudiaste ${formatoHoras(m.total / 60)}${detalle}.`, ruta: '/estudio' };
    }

    case 'tarjetas_pendientes': {
      const c = await contarPendientes(db);
      const pend = c.reduce((s, x) => s + x.pendientes, 0);
      const total = c.reduce((s, x) => s + x.total, 0);
      if (!total) return { texto: 'Aún no tienes tarjetas. Créalas en Estudio → Tarjetas, o desde tus apuntes.', ruta: '/tarjetas' };
      return {
        texto: pend ? `Tienes ${pend} ${pend === 1 ? 'tarjeta' : 'tarjetas'} para repasar hoy. Dime "repasar tarjetas" y partimos.` : `Tienes todo repasado por hoy (${total} tarjetas en total).`,
        ruta: '/tarjetas',
      };
    }

    case 'resumen_semana': {
      const semana = rangoSemana(new Date());
      const [tareas, gym, gasto, estudio, prox] = await Promise.all([
        completadasEnRango(db, semana.desde, semana.hasta),
        diasEntrenados(db, semana),
        totalEnRango(db, semana),
        minutosEstudio(db, semana.desde, semana.hasta),
        proximasEvaluaciones(db, 7),
      ]);
      const pend = prox.filter((e) => e.grade == null);
      const partes = [
        `completaste ${tareas === 1 ? '1 tarea' : `${tareas} tareas`}`,
        estudio.total ? `estudiaste ${formatoHoras(estudio.total / 60)}` : null,
        `fuiste ${gym === 1 ? '1 día' : `${gym} días`} al gym`,
        `gastaste ${formatCLP(gasto)}`,
      ].filter((x): x is string => !!x);
      const pruebas = pend.length
        ? ` Se ${pend.length === 1 ? 'viene 1 evaluación' : `vienen ${pend.length} evaluaciones`} en los próximos 7 días: ${lista(pend.slice(0, 3).map((e) => `${e.name} de ${e.ramo}`))}.`
        : ' No tienes pruebas en los próximos 7 días.';
      return { texto: `Esta semana ${lista(partes)}.${pruebas}` };
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

/**
 * Ejecuta lo que entendió el asistente y arma la respuesta (corta, cercana, en chileno).
 * Devuelve el texto a mostrar/decir y, opcionalmente, una pantalla a la que ir.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { ultimosValores } from '@/database/cuerpo';
import {
  avisoPresupuesto,
  crearGasto,
  presupuestoSemanal,
  rangoMes,
  rangoSemana,
  totalEnRango,
} from '@/database/gastos';
import { listarEjercicios, rutinaDeHoy, seriesDeFecha, ultimaSerie } from '@/database/gym';
import { alternarHabito, listarHabitos } from '@/database/habitos';
import { abonar, buscarMeta, listarMetas } from '@/database/metas';
import { getSetting } from '@/database/queries';
import { alternarTarea, crearTarea, tareasDelDia, tareasSemanales } from '@/database/tareas';
import { categoria } from '@/utils/categorias';
import { fechaLarga, fromISODate, startOfWeek, toISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';
import { EJEMPLOS, interpretar, type Intencion } from './interpretar';
import { parecido } from './texto';

export type Respuesta = { texto: string; ruta?: string };

const azar = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

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

export async function responder(db: SQLiteDatabase, frase: string): Promise<Respuesta> {
  return ejecutar(db, interpretar(frase));
}

export async function ejecutar(db: SQLiteDatabase, i: Intencion): Promise<Respuesta> {
  const nombre = (await getSetting(db, 'nombre')) ?? '';
  const hoy = toISODate();

  switch (i.tipo) {
    case 'saludo':
      return { texto: azar([`¡Hola${nombre ? `, ${nombre}` : ''}! ¿En qué te ayudo?`, `Aquí estoy${nombre ? `, ${nombre}` : ''} 👋 Dime nomás.`]) };

    case 'gracias':
      return { texto: azar(['De nada 🙌', '¡Para eso estoy!', 'Cuando quieras.']) };

    case 'ayuda':
      return { texto: `Puedo ayudarte con tus tareas, gastos, gym, hábitos y metas. Prueba con:\n• ${EJEMPLOS.join('\n• ')}` };

    case 'tareas_hoy': {
      const pendientes = (await tareasDelDia(db, hoy)).filter((t) => !t.hecha);
      if (pendientes.length === 0) return { texto: azar(['No te queda nada pendiente hoy. ¡Bien ahí! 🙌', 'Todo listo por hoy. Descansa tranqui.']), ruta: '/tareas' };
      const nombres = pendientes.slice(0, 5).map((t) => t.title);
      const extra = pendientes.length > 5 ? ` y ${pendientes.length - 5} más` : '';
      return {
        texto: `Te ${pendientes.length === 1 ? 'queda 1 tarea' : `quedan ${pendientes.length} tareas`}: ${lista(nombres)}${extra}.`,
        ruta: '/tareas',
      };
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
      const titulo = i.titulo.charAt(0).toUpperCase() + i.titulo.slice(1);
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
      const mejor = candidatas
        .map((t) => ({ t, p: parecido(i.texto, t.title) }))
        .sort((a, b) => b.p - a.p)[0];
      if (!mejor || mejor.p < 0.34) {
        return { texto: `Mmm, no encontré una tarea pendiente que se parezca a "${i.texto}". ¿Me la dices como está escrita?`, ruta: '/tareas' };
      }
      await alternarTarea(db, mejor.t, true, hoy);
      const quedan = candidatas.length - 1;
      return {
        texto: `¡Bien! Marqué "${mejor.t.title}" como hecha. ${quedan === 0 ? 'Y con eso terminaste todo por hoy 🎉' : `Te ${quedan === 1 ? 'queda 1' : `quedan ${quedan}`}.`}`,
      };
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

    case 'presupuesto': {
      const p = await presupuestoSemanal(db);
      const total = await totalEnRango(db, rangoSemana());
      if (p <= 0) return { texto: 'No tienes presupuesto semanal configurado. Lo puedes poner en Ajustes.', ruta: '/ajustes' };
      if (total > p) return { texto: `Te pasaste por ${formatCLP(total - p)} esta semana. Pisa el freno hasta el lunes 😬` };
      return { texto: `Te quedan ${formatCLP(p - total)} de ${formatCLP(p)} esta semana.` };
    }

    case 'metas': {
      const metas = await listarMetas(db);
      if (!metas.length) return { texto: 'Aún no tienes metas de ahorro. ¿Creamos una?', ruta: '/metas' };
      return {
        texto: metas
          .slice(0, 3)
          .map((m) => `${m.name}: ${formatCLP(m.ahorrado)} de ${formatCLP(m.target)} (${Math.round((m.ahorrado / m.target) * 100)}%)`)
          .join('. '),
        ruta: '/metas',
      };
    }

    case 'abonar_meta': {
      const meta = await buscarMeta(db, i.texto);
      if (!meta) {
        const metas = await listarMetas(db);
        if (!metas.length) return { texto: 'No tienes metas todavía. Crea una primero y después le abonamos.', ruta: '/metas' };
        return { texto: `¿A cuál meta? Tienes: ${lista(metas.map((m) => m.name))}. Dime por ejemplo "abona 10 lucas a ${metas[0].name}".` };
      }
      await abonar(db, meta.id, i.monto);
      const total = meta.ahorrado + i.monto;
      const lista_ = total >= meta.target;
      return {
        texto: lista_
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
      if (!peso) return { texto: 'Aún no registras tu peso. Puedes hacerlo en Gym → Peso y medidas.', ruta: '/cuerpo' };
      return { texto: `Tu último peso fue ${peso.valor} kg, el ${fechaLarga(fromISODate(peso.fecha)).toLowerCase()}.`, ruta: '/cuerpo' };
    }

    case 'racha': {
      const habitos = await listarHabitos(db);
      if (!habitos.length) return { texto: 'Aún no tienes hábitos. Crea uno y empezamos a contar la racha 🔥', ruta: '/habitos' };
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
  return db.getAllAsync<MensajeChat>(
    `SELECT * FROM chat_messages WHERE date(created_at) = date('now','localtime') ORDER BY id`,
  );
}

/** Texto apto para leer en voz alta (sin emojis ni viñetas). */
export function paraVoz(texto: string): string {
  return texto
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/•/g, '')
    .replace(/\$(\d{1,3}(?:\.\d{3})*)/g, (_, n) => `${n} pesos`)
    .replace(/\s+/g, ' ')
    .trim();
}

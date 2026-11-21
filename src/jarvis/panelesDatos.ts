/**
 * Arma el panel HUD que acompaña cada respuesta del asistente.
 * Por ejemplo: "¿qué tareas me faltan?" → panel con la lista de tareas;
 * "¿cómo está el clima?" → panel del clima con los próximos días.
 * Devuelve undefined si la intención no tiene panel.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { infoClima, obtenerClima } from '@/clima/clima';
import { ultimosValores } from '@/database/cuerpo';
import { gastosEnRango, presupuestoSemanal, rangoMes, rangoSemana, totalEnRango, totalPorCategoria } from '@/database/gastos';
import { listarEjercicios, rutinaDeHoy, seriesDeFecha } from '@/database/gym';
import { listarHabitos } from '@/database/habitos';
import { listarMetas } from '@/database/metas';
import { listarNotas } from '@/database/notas';
import { tareasDelDia, tareasSemanales } from '@/database/tareas';
import { categoria } from '@/utils/categorias';
import { fechaLarga, fromISODate, startOfWeek, toISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';
import type { Intencion } from '@/voice/interpretar';
import type { ItemPanel, Panel } from './paneles';

const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

export async function panelPara(db: SQLiteDatabase, i: Intencion, sistema: { bateria?: number | null } = {}): Promise<Panel | undefined> {
  const hoy = toISODate();
  switch (i.tipo) {
    case 'tareas_hoy':
    case 'completar_tarea':
    case 'agregar_tarea': {
      const t = await tareasDelDia(db, hoy);
      return {
        tipo: 'lista',
        titulo: 'TAREAS · HOY',
        items: t.map((x) => ({ texto: x.title, hecho: x.hecha, detalle: x.atrasada ? 'atrasada' : x.priority === 'alta' ? 'prioridad alta' : undefined })),
        vacio: 'Sin tareas para hoy',
      };
    }
    case 'tareas_dia': {
      const t = await tareasDelDia(db, i.fecha);
      return { tipo: 'lista', titulo: `TAREAS · ${fechaLarga(fromISODate(i.fecha)).toUpperCase()}`, items: t.map((x) => ({ texto: x.title, hecho: x.hecha })), vacio: 'Día libre' };
    }
    case 'tareas_semana': {
      const lunes = startOfWeek();
      const items: ItemPanel[] = [];
      for (let d = 0; d < 7; d++) {
        const f = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + d);
        const iso = toISODate(f);
        if (iso < hoy) continue;
        for (const x of await tareasDelDia(db, iso)) if (!x.atrasada) items.push({ texto: x.title, hecho: x.hecha, detalle: DIAS_CORTOS[f.getDay()] });
      }
      for (const x of await tareasSemanales(db)) items.push({ texto: x.title, hecho: x.hecha, detalle: 'SEMANA' });
      return { tipo: 'lista', titulo: 'TAREAS · SEMANA', items, vacio: 'Semana despejada' };
    }
    case 'gasto_periodo':
    case 'agregar_gasto':
    case 'borrar_ultimo_gasto':
    case 'presupuesto':
    case 'cambiar_presupuesto': {
      const semana = await totalEnRango(db, rangoSemana());
      const mes = await totalEnRango(db, rangoMes());
      const p = await presupuestoSemanal(db);
      const cats = (await totalPorCategoria(db, rangoMes())).slice(0, 3);
      return {
        tipo: 'cifras',
        titulo: 'FINANZAS',
        cifras: [
          { label: 'Semana', valor: formatCLP(semana), alerta: p > 0 && semana > p },
          { label: 'Presupuesto', valor: p > 0 ? `${Math.round((semana / p) * 100)}%` : '—', alerta: p > 0 && semana / p >= 0.8 },
          { label: 'Mes', valor: formatCLP(mes) },
          ...cats.map((c) => ({ label: categoria(c.category).label, valor: formatCLP(c.total) })),
        ],
      };
    }
    case 'gasto_categoria': {
      const cats = await totalPorCategoria(db, i.periodo === 'mes' ? rangoMes() : rangoSemana());
      return { tipo: 'cifras', titulo: `GASTOS · ${i.periodo === 'mes' ? 'MES' : 'SEMANA'}`, cifras: cats.map((c) => ({ label: categoria(c.category).label, valor: formatCLP(c.total) })) };
    }
    case 'ultimos_gastos': {
      const r = i.periodo === 'hoy' ? { desde: hoy, hasta: hoy } : rangoSemana();
      const g = await gastosEnRango(db, r);
      return {
        tipo: 'lista',
        titulo: i.periodo === 'hoy' ? 'GASTOS · HOY' : 'GASTOS · SEMANA',
        items: g.slice(0, 8).map((x) => ({ texto: x.note || categoria(x.category).label, detalle: formatCLP(x.amount) })),
        vacio: 'Sin gastos',
      };
    }
    case 'metas':
    case 'abonar_meta':
    case 'crear_meta': {
      const m = await listarMetas(db);
      return {
        tipo: 'lista',
        titulo: 'METAS DE AHORRO',
        items: m.map((x) => ({ texto: x.name, detalle: `${Math.round((x.ahorrado / x.target) * 100)}% · ${formatCLP(x.ahorrado)}`, hecho: x.ahorrado >= x.target })),
        vacio: 'Sin metas',
      };
    }
    case 'gym_hoy':
    case 'registrar_serie': {
      const series = await seriesDeFecha(db, hoy);
      if (series.length) {
        const por = new Map<string, { n: number; max: number }>();
        for (const s of series) {
          const v = por.get(s.name) ?? { n: 0, max: 0 };
          por.set(s.name, { n: v.n + 1, max: Math.max(v.max, s.weight) });
        }
        return { tipo: 'lista', titulo: 'ENTRENAMIENTO · HOY', items: [...por].map(([n, v]) => ({ texto: n, detalle: `${v.n} series · ${v.max} kg` })) };
      }
      const toca = await rutinaDeHoy(db);
      const ej = (await listarEjercicios(db)).slice(0, 4);
      return {
        tipo: 'cifras',
        titulo: 'GYM',
        cifras: [{ label: 'Hoy toca', valor: toca ?? 'Descanso' }, ...ej.map((e) => ({ label: e.name, valor: `${e.maxPeso ?? 0} kg` }))],
      };
    }
    case 'registrar_peso':
    case 'ultimo_peso': {
      const v = await ultimosValores(db);
      const cifras = [];
      if (v.weight) cifras.push({ label: 'Peso', valor: `${v.weight.valor} kg` });
      if (v.waist) cifras.push({ label: 'Cintura', valor: `${v.waist.valor} cm` });
      if (v.chest) cifras.push({ label: 'Pecho', valor: `${v.chest.valor} cm` });
      if (v.arm) cifras.push({ label: 'Brazo', valor: `${v.arm.valor} cm` });
      return cifras.length ? { tipo: 'cifras', titulo: 'CUERPO', cifras } : undefined;
    }
    case 'racha':
    case 'marcar_habito':
    case 'crear_habito': {
      const h = await listarHabitos(db);
      return { tipo: 'lista', titulo: 'HÁBITOS', items: h.map((x) => ({ texto: x.name, hecho: x.hechoHoy, detalle: `racha ${x.racha}` })), vacio: 'Sin hábitos' };
    }
    case 'leer_notas':
    case 'crear_nota': {
      const n = await listarNotas(db);
      return { tipo: 'lista', titulo: 'NOTAS', items: n.slice(0, 6).map((x) => ({ texto: x.body.split('\n')[0] })), vacio: 'Sin notas' };
    }
    case 'clima': {
      const p = await obtenerClima(db).catch(() => null);
      if (!p) return undefined;
      const info = infoClima(p.actual.codigo, p.actual.esDia);
      return {
        tipo: 'clima',
        ciudad: p.ubicacion.nombre.split(',')[0].toUpperCase(),
        temp: p.actual.temp,
        descripcion: info.texto,
        icono: info.icono,
        dias: p.dias.slice(0, 5).map((d) => ({ dia: DIAS_CORTOS[fromISODate(d.fecha).getDay()], max: d.max, min: d.min, lluvia: d.lluvia, icono: infoClima(d.codigo).icono })),
      };
    }
    case 'resumen':
    case 'estado_sistema': {
      const t = await tareasDelDia(db, hoy);
      const semana = await totalEnRango(db, rangoSemana());
      const p = await presupuestoSemanal(db);
      const h = await listarHabitos(db);
      const clima = await obtenerClima(db).catch(() => null);
      const cifras = [
        { label: 'Tareas', valor: `${t.filter((x) => x.hecha).length}/${t.length}` },
        { label: 'Gym', valor: (await rutinaDeHoy(db)) ?? 'Descanso' },
        { label: 'Semana', valor: formatCLP(semana), alerta: p > 0 && semana > p },
        { label: 'Hábitos', valor: `${h.filter((x) => x.hechoHoy).length}/${h.length}` },
      ];
      if (clima) cifras.push({ label: 'Clima', valor: `${clima.actual.temp}°` });
      if (sistema.bateria != null) cifras.push({ label: 'Batería', valor: `${Math.round(sistema.bateria * 100)}%`, alerta: sistema.bateria < 0.2 });
      return { tipo: 'cifras', titulo: i.tipo === 'estado_sistema' ? 'ESTADO DEL SISTEMA' : 'RESUMEN DEL DÍA', cifras };
    }
    default:
      return undefined;
  }
}

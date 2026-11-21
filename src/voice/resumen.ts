/**
 * Resumen en texto de todos tus datos, para que la IA (Claude) pueda responder
 * preguntas como "¿en qué gasté más este mes?" o "¿cómo voy con el gym?".
 * Separado de ia.ts para poder probarlo sin celular.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { infoClima, obtenerClima } from '@/clima/clima';
import { ultimosValores } from '@/database/cuerpo';
import { gastosEnRango, presupuestoSemanal, rangoMes, rangoSemana, totalEnRango, totalPorCategoria } from '@/database/gastos';
import { listarFijos } from '@/database/fijos';
import { listarEjercicios, obtenerRutina, seriesDeFecha } from '@/database/gym';
import { listarHabitos } from '@/database/habitos';
import { listarMetas } from '@/database/metas';
import { listarNotas } from '@/database/notas';
import { getSetting } from '@/database/queries';
import { tareasDelDia, tareasSemanales } from '@/database/tareas';
import { fechaLarga, toISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';

const linea = (titulo: string, items: string[]) => `${titulo}: ${items.length ? items.join('; ') : '(nada)'}`;

export async function construirResumen(db: SQLiteDatabase): Promise<string> {
  const hoy = new Date();
  const hoyISO = toISODate(hoy);
  const out: string[] = [];
  out.push(`Hoy es ${fechaLarga(hoy).toLowerCase()} (${hoyISO}), son las ${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}. La semana parte el lunes.`);
  const nombre = await getSetting(db, 'nombre');
  if (nombre) out.push(`El usuario se llama ${nombre}.`);

  // Tareas
  const tHoy = await tareasDelDia(db, hoyISO);
  out.push(linea('Tareas de hoy', tHoy.map((t) => `${t.hecha ? '[hecha]' : '[pendiente]'} ${t.title} (prioridad ${t.priority}${t.atrasada ? ', atrasada' : ''})`)));
  const proximas: string[] = [];
  for (let d = 1; d <= 7; d++) {
    const f = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + d));
    for (const t of await tareasDelDia(db, f)) if (!t.hecha && t.repeat_type === 'none') proximas.push(`${f}: ${t.title}`);
  }
  out.push(linea('Próximas tareas (7 días)', proximas));
  out.push(linea('Tareas de esta semana sin día fijo', (await tareasSemanales(db)).map((t) => `${t.hecha ? '[hecha]' : '[pendiente]'} ${t.title}`)));

  // Plata
  const semana = await totalEnRango(db, rangoSemana());
  const presu = await presupuestoSemanal(db);
  const mes = await totalEnRango(db, rangoMes());
  out.push(`Gasto esta semana: ${formatCLP(semana)}${presu ? ` de un presupuesto semanal de ${formatCLP(presu)}` : ''}. Gasto este mes: ${formatCLP(mes)}.`);
  out.push(linea('Gasto del mes por categoría', (await totalPorCategoria(db, rangoMes())).map((c) => `${c.category} ${formatCLP(c.total)}`)));
  out.push(linea('Últimos gastos', (await gastosEnRango(db, rangoMes())).slice(0, 8).map((g) => `${g.date} ${formatCLP(g.amount)} ${g.category}${g.note ? ` (${g.note})` : ''}`)));
  out.push(linea('Gastos fijos mensuales', (await listarFijos(db)).filter((f) => f.active).map((f) => `${f.name} ${formatCLP(f.amount)} día ${f.day_of_month}`)));
  out.push(linea('Metas de ahorro', (await listarMetas(db)).map((m) => `${m.name}: ${formatCLP(m.ahorrado)} de ${formatCLP(m.target)}${m.deadline ? ` (límite ${m.deadline})` : ''}`)));

  // Gym y cuerpo
  const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  out.push(linea('Rutina semanal', (await obtenerRutina(db)).map((r) => `${DIAS[r.weekday]}: ${r.label}`)));
  out.push(linea('Series de hoy', (await seriesDeFecha(db, hoyISO)).map((s) => `${s.name} ${s.reps}x${s.weight}kg`)));
  out.push(linea('Ejercicios', (await listarEjercicios(db)).slice(0, 10).map((e) => `${e.name} (récord ${e.maxPeso ?? 0} kg, última vez ${e.ultima ?? 'nunca'})`)));
  const peso = (await ultimosValores(db)).weight;
  if (peso) out.push(`Último peso corporal: ${peso.valor} kg (${peso.fecha}).`);

  // Hábitos y notas
  out.push(linea('Hábitos', (await listarHabitos(db)).map((h) => `${h.name} (${h.hechoHoy ? 'hecho hoy' : 'pendiente hoy'}, racha ${h.racha}, récord ${h.mejorRacha})`)));
  out.push(linea('Notas recientes', (await listarNotas(db)).slice(0, 5).map((n) => n.body.replace(/\s+/g, ' ').slice(0, 80))));

  // Clima
  const p = await obtenerClima(db).catch(() => null);
  if (p) {
    out.push(
      `Clima en ${p.ubicacion.nombre}: ahora ${p.actual.temp}° ${infoClima(p.actual.codigo, p.actual.esDia).texto}. ` +
        p.dias.map((d) => `${d.fecha}: ${infoClima(d.codigo).texto}, ${d.min}°-${d.max}°, lluvia ${d.lluvia}%`).join('; '),
    );
  }
  return out.join('\n');
}


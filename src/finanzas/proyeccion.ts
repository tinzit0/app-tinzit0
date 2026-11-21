/**
 * "¿Cuánto puedo gastar hoy?" y "¿cómo voy a terminar el mes?".
 * Función pura (scripts/test-finanzas.ts): recibe los totales y calcula.
 *
 * - Por día: lo que te queda del presupuesto semanal (sin contar lo de hoy),
 *   repartido entre hoy y el domingo. "Hoy te quedan" = eso menos lo que ya gastaste hoy.
 * - Fin de mes: lo gastado + tu ritmo diario (sin gastos fijos) × los días que faltan
 *   + los gastos fijos que todavía no se cobran este mes.
 */
export type DatosProyeccion = {
  hoy: Date;
  presupuestoSemanal: number;
  gastoSemanaAntesDeHoy: number;
  gastoHoy: number;
  gastoMes: number; // todo lo del mes hasta hoy (incluye fijos ya cobrados)
  fijosCobradosMes: number;
  fijosPendientesMes: number;
  gastoMesAnterior: number;
};

export type Proyeccion = {
  porDia: number | null; // null = sin presupuesto
  quedaHoy: number | null;
  diasRestantesSemana: number;
  finDeMes: number;
  presupuestoMes: number | null;
  ritmoDiario: number;
  estado: 'bien' | 'ojo' | 'pasado' | 'sin_presupuesto';
};

export function proyectar(d: DatosProyeccion): Proyeccion {
  const diaSemana = ((d.hoy.getDay() + 6) % 7) + 1; // lunes = 1
  const diasRestantesSemana = 8 - diaSemana; // incluye hoy
  const diasMes = new Date(d.hoy.getFullYear(), d.hoy.getMonth() + 1, 0).getDate();
  const diaMes = d.hoy.getDate();

  let porDia: number | null = null;
  let quedaHoy: number | null = null;
  if (d.presupuestoSemanal > 0) {
    porDia = Math.max(0, Math.floor((d.presupuestoSemanal - d.gastoSemanaAntesDeHoy) / diasRestantesSemana));
    quedaHoy = porDia - d.gastoHoy;
  }

  const variable = Math.max(0, d.gastoMes - d.fijosCobradosMes);
  // El ritmo usa los días ya completos más hoy; con pocos días todavía es inestable, pero sirve de guía.
  const ritmoDiario = variable / Math.max(1, diaMes);
  const finDeMes = Math.round(d.gastoMes + ritmoDiario * (diasMes - diaMes) + d.fijosPendientesMes);

  const presupuestoMes = d.presupuestoSemanal > 0 ? Math.round((d.presupuestoSemanal * diasMes) / 7) : null;
  const estado: Proyeccion['estado'] =
    presupuestoMes == null ? 'sin_presupuesto' : finDeMes > presupuestoMes * 1.05 ? 'pasado' : finDeMes > presupuestoMes * 0.9 ? 'ojo' : 'bien';

  return { porDia, quedaHoy, diasRestantesSemana, finDeMes, presupuestoMes, ritmoDiario: Math.round(ritmoDiario), estado };
}

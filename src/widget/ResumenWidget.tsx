/**
 * Diseño del widget "Tinzit0 · Hoy" (4×2 celdas):
 *   TINZIT0 · Hoy                         Pecho 💪
 *   3 tareas pendientes
 *   • Comprar pan  • Pagar la luz …
 *   Semana  $85.990 de $100.000  [=======   ]
 *
 * Los widgets de Android NO son React Native normal: se dibujan con
 * componentes especiales (FlexWidget, TextWidget) que la librería
 * convierte en una vista nativa.
 */
import type { DatosWidget } from './datos';
import { formatCLP } from '@/utils/moneda';
import { widgetLib } from './lib';

const C = {
  fondo: '#141416',
  texto: '#F4F4F2',
  suave: '#A1A1A6',
  tenue: '#6B6B70',
  acento: '#CFF56B',
  pista: '#2A2A2E',
  aviso: '#FFC24B',
  peligro: '#FF6B5E',
} as const;

export function ResumenWidget({ d }: { d: DatosWidget }) {
  const lib = widgetLib();
  if (!lib) return null;
  const { FlexWidget, TextWidget } = lib;

  const ratio = d.presupuesto > 0 ? Math.min(1, d.gastoSemana / d.presupuesto) : 0;
  const colorBarra = ratio >= 1 ? C.peligro : ratio >= 0.8 ? C.aviso : C.acento;
  const titular =
    d.total === 0 ? 'Día libre de tareas' : d.pendientes === 0 ? 'Todo listo hoy 🙌' : `${d.pendientes} ${d.pendientes === 1 ? 'tarea pendiente' : 'tareas pendientes'}`;

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.fondo,
        borderRadius: 24,
        padding: 16,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Encabezado */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextWidget text="TINZIT0 · HOY" style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: C.acento, letterSpacing: 0.12 }} />
        <TextWidget text={d.gym ? `${d.gym} 💪` : 'Descanso'} style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: C.suave }} />
      </FlexWidget>

      {/* Tareas */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'column' }}>
        <TextWidget text={titular} style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: C.texto }} />
        {d.titulos.length > 0 ? (
          <TextWidget
            text={d.titulos.map((t) => `• ${t}`).join('   ')}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: C.suave, marginTop: 4 }}
          />
        ) : null}
      </FlexWidget>

      {/* Gasto semanal */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'column' }}>
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}>
          <TextWidget text="Semana" style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: C.tenue }} />
          <TextWidget
            text={d.presupuesto > 0 ? `${formatCLP(d.gastoSemana)} de ${formatCLP(d.presupuesto)}` : formatCLP(d.gastoSemana)}
            style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: C.texto }}
          />
        </FlexWidget>
        {d.presupuesto > 0 ? (
          <FlexWidget style={{ width: 'match_parent', height: 6, marginTop: 6, backgroundColor: C.pista, borderRadius: 3, flexDirection: 'row' }}>
            {ratio > 0 ? <FlexWidget style={{ flex: ratio, height: 6, backgroundColor: colorBarra, borderRadius: 3 }} /> : null}
            {ratio < 1 ? <FlexWidget style={{ flex: 1 - ratio, height: 6 }} /> : null}
          </FlexWidget>
        ) : null}
      </FlexWidget>
    </FlexWidget>
  );
}

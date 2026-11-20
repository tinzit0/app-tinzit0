/**
 * Mapa de calor tipo calendario (como el de GitHub):
 * columnas = semanas, filas = días (lunes arriba, domingo abajo).
 * Cuanto más intenso el color, más hábitos cumpliste ese día.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { startOfWeek, toISODate } from '@/utils/fechas';
import { AppText } from './AppText';

type Props = {
  /** fecha 'YYYY-MM-DD' → cantidad cumplida ese día */
  datos: Map<string, number>;
  /** cantidad que se considera "100%" (ej: número de hábitos) */
  maximo: number;
  color: string;
  semanas?: number;
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function Heatmap({ datos, maximo, color, semanas = 16 }: Props) {
  const { colors } = useTheme();
  const [ancho, setAncho] = useState(0);
  const gap = 3;
  const celda = ancho > 0 ? Math.floor((ancho - gap * (semanas - 1)) / semanas) : 0;

  const hoy = new Date();
  const hoyISO = toISODate(hoy);
  const lunesActual = startOfWeek(hoy);
  const inicio = new Date(lunesActual);
  inicio.setDate(lunesActual.getDate() - 7 * (semanas - 1));

  const columnas: { fecha: Date; iso: string }[][] = [];
  for (let w = 0; w < semanas; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const f = new Date(inicio);
      f.setDate(inicio.getDate() + w * 7 + d);
      col.push({ fecha: f, iso: toISODate(f) });
    }
    columnas.push(col);
  }

  // Opacidad por nivel: 0 = vacío, luego 4 niveles de intensidad.
  const nivel = (n: number) => {
    if (n <= 0 || maximo <= 0) return 0;
    const r = n / maximo;
    return r >= 1 ? 1 : r >= 0.66 ? 0.75 : r >= 0.33 ? 0.5 : 0.3;
  };

  const total = [...datos.values()].filter((v) => v > 0).length;

  return (
    <View>
      <View
        onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', gap }}
        accessibilityRole="image"
        accessibilityLabel={`Mapa de calor: ${total} días con registros en las últimas ${semanas} semanas`}
      >
        {celda > 0
          ? columnas.map((col, w) => (
              <View key={w} style={{ gap }}>
                {col.map(({ iso }) => {
                  const futuro = iso > hoyISO;
                  const op = nivel(datos.get(iso) ?? 0);
                  return (
                    <View
                      key={iso}
                      style={{
                        width: celda,
                        height: celda,
                        borderRadius: Math.max(2, celda * 0.25),
                        backgroundColor: futuro ? 'transparent' : op > 0 ? color : colors.surfaceRaised,
                        opacity: op > 0 ? op : 1,
                        borderWidth: iso === hoyISO ? 1.5 : 0,
                        borderColor: colors.text,
                      }}
                    />
                  );
                })}
              </View>
            ))
          : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm }}>
        <AppText variant="caption" tone="tertiary">
          {inicio.getDate()} {MESES[inicio.getMonth()]}
        </AppText>
        <AppText variant="caption" tone="tertiary">Hoy</AppText>
      </View>
    </View>
  );
}

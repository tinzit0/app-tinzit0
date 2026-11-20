/**
 * Gráfico de línea simple (hecho a mano con SVG, sin librerías pesadas).
 * Muestra la evolución de un valor (ej: peso máximo por sesión).
 * Mide su propio ancho con onLayout, así se adapta a cualquier pantalla.
 */
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { AppText } from './AppText';

type Punto = { label: string; value: number };

type Props = {
  data: Punto[];
  height?: number;
  /** Cómo mostrar los valores del eje (ej: v => `${v} kg`). */
  format?: (v: number) => string;
};

export function LineChart({ data, height = 160, format = (v) => String(v) }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  if (data.length === 0) return null;

  const padTop = 12;
  const padBottom = 8;
  const values = data.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const rango = max - min;
  const innerH = height - padTop - padBottom;

  const x = (i: number) => (data.length === 1 ? width / 2 : (i / (data.length - 1)) * (width - 12) + 6);
  const y = (v: number) => padTop + innerH - ((v - min) / rango) * innerH;

  const linea = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${linea} L${x(data.length - 1)},${height} L${x(0)},${height} Z`;
  const ultimo = data[data.length - 1];

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm }}>
        <AppText variant="caption" tone="tertiary">Máx {format(Math.max(...values))}</AppText>
        <AppText variant="caption" tone="tertiary">Mín {format(Math.min(...values))}</AppText>
      </View>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="image"
        accessibilityLabel={`Gráfico. Último valor ${format(ultimo.value)}`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.accent} stopOpacity={0.22} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {/* Líneas guía horizontales */}
            {[0, 0.5, 1].map((p) => (
              <Line
                key={p}
                x1={0}
                x2={width}
                y1={padTop + innerH * p}
                y2={padTop + innerH * p}
                stroke={colors.border}
                strokeWidth={1}
              />
            ))}
            {data.length > 1 ? <Path d={area} fill="url(#area)" /> : null}
            {data.length > 1 ? (
              <Path d={linea} stroke={colors.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
            {data.map((d, i) => (
              <Circle
                key={i}
                cx={x(i)}
                cy={y(d.value)}
                r={i === data.length - 1 ? 5 : 3}
                fill={i === data.length - 1 ? colors.accent : colors.surface}
                stroke={colors.accent}
                strokeWidth={2}
              />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm }}>
        <AppText variant="caption" tone="tertiary">{data[0].label}</AppText>
        {data.length > 1 ? <AppText variant="caption" tone="tertiary">{ultimo.label}</AppText> : null}
      </View>
    </View>
  );
}

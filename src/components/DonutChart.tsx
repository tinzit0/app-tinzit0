/**
 * Gráfico de torta (en forma de anillo) para el gasto por categoría.
 * - Los segmentos se dibujan SIEMPRE en el orden fijo de las categorías
 *   (así dos colores parecidos nunca quedan juntos — validado para daltonismo).
 * - Un espacio de 2px separa cada segmento.
 * - Al lado va la leyenda con monto y %, así el color nunca es la única pista.
 * - Tocar una categoría (en el anillo o la leyenda) la destaca.
 */
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { CATEGORIAS, categoria, colorCategoria } from '@/utils/categorias';
import { formatCLP } from '@/utils/moneda';
import { AppText } from './AppText';

type Props = { datos: { category: string; total: number }[]; size?: number };

function arco(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${grande} 1 ${x1} ${y1}`;
}

export function DonutChart({ datos, size = 168 }: Props) {
  const { isDark } = useTheme();
  const [activa, setActiva] = useState<string | null>(null);

  // Orden fijo de categorías (no por monto).
  const orden = CATEGORIAS.map((c) => c.key);
  const lista = [...datos].filter((d) => d.total > 0).sort((a, b) => orden.indexOf(a.category) - orden.indexOf(b.category));
  const total = lista.reduce((s, d) => s + d.total, 0);

  const grosor = 22;
  const r = size / 2 - grosor / 2 - 2;
  const c = size / 2;
  const gap = lista.length > 1 ? 2 / r : 0; // 2px de separación, en radianes

  const angulos = lista.map((d) => (d.total / total) * Math.PI * 2);
  const segmentos = lista.map((d, k) => {
    const inicio = -Math.PI / 2 + angulos.slice(0, k).reduce((s, x) => s + x, 0);
    return { ...d, a0: inicio + gap / 2, a1: inicio + angulos[k] - gap / 2 };
  });

  const destacada = lista.find((d) => d.category === activa);

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size, alignSelf: 'center' }} accessibilityRole="image" accessibilityLabel={`Gasto total ${formatCLP(total)} repartido en ${lista.length} categorías`}>
        <Svg width={size} height={size}>
          {lista.length === 1 ? (
            <Circle cx={c} cy={c} r={r} stroke={colorCategoria(categoria(lista[0].category), isDark)} strokeWidth={grosor} fill="none" />
          ) : (
            <G>
              {segmentos.map((s) => (
                <Path
                  key={s.category}
                  d={arco(c, c, r, s.a0, Math.max(s.a0 + 0.001, s.a1))}
                  stroke={colorCategoria(categoria(s.category), isDark)}
                  strokeWidth={activa === s.category ? grosor + 6 : grosor}
                  strokeOpacity={activa && activa !== s.category ? 0.35 : 1}
                  fill="none"
                  // En web el SVG no acepta onPress (ahí se usa la leyenda).
                  {...(Platform.OS !== 'web' ? { onPress: () => setActiva(activa === s.category ? null : s.category) } : {})}
                />
              ))}
            </G>
          )}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.centro]} pointerEvents="none">
          <AppText variant="caption" tone="tertiary">{destacada ? categoria(destacada.category).label : 'Total'}</AppText>
          <AppText variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: size - grosor * 2 - 12 }}>
            {formatCLP(destacada ? destacada.total : total)}
          </AppText>
        </View>
      </View>

      <View style={styles.leyenda}>
        {lista.map((d) => {
          const cat = categoria(d.category);
          const pct = Math.round((d.total / total) * 100);
          return (
            <Pressable
              key={d.category}
              onPress={() => setActiva(activa === d.category ? null : d.category)}
              accessibilityRole="button"
              accessibilityLabel={`${cat.label}: ${formatCLP(d.total)}, ${pct} por ciento`}
              style={[styles.item, { opacity: activa && activa !== d.category ? 0.45 : 1 }]}
            >
              <View style={[styles.dot, { backgroundColor: colorCategoria(cat, isDark) }]} />
              <AppText variant="callout" style={{ flex: 1 }} numberOfLines={1}>{cat.label}</AppText>
              <AppText variant="callout" tabular>{formatCLP(d.total)}</AppText>
              <AppText variant="caption" tone="tertiary" tabular style={{ width: 38, textAlign: 'right' }}>{pct}%</AppText>
            </Pressable>
          );
        })}
        {lista.length === 0 ? <AppText variant="caption" tone="tertiary">Sin gastos este mes.</AppText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xl },
  centro: { alignItems: 'center', justifyContent: 'center' },
  leyenda: { gap: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  dot: { width: 10, height: 10, borderRadius: 3 },
});

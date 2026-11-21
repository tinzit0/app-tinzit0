/**
 * Panel holográfico con datos (lista, cifras o clima), estilo HUD:
 * bordes finos, esquinas marcadas y etiquetas en mayúsculas.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { fonts } from '@/theme/tokens';
import { HUD } from './colores';
import type { Panel } from './paneles';

function Esquinas({ color }: { color: string }) {
  const base = { position: 'absolute' as const, width: 12, height: 12, borderColor: color };
  return (
    <>
      <View style={[base, { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 }]} />
      <View style={[base, { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 }]} />
      <View style={[base, { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
      <View style={[base, { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 }]} />
    </>
  );
}

export function PanelHud({ panel, color }: { panel: Panel; color: string }) {
  const titulo = panel.tipo === 'clima' ? `CLIMA · ${panel.ciudad}` : panel.titulo;
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={[styles.panel, { borderColor: `${color}40`, backgroundColor: `${color}0D` }]}>
      <Esquinas color={color} />
      <AppText style={[styles.titulo, { color }]}>{titulo}</AppText>

      {panel.tipo === 'lista' ? (
        panel.items.length === 0 ? (
          <AppText style={styles.vacio}>{panel.vacio ?? 'Sin datos'}</AppText>
        ) : (
          <View style={{ gap: 6 }}>
            {panel.items.slice(0, 6).map((it, k) => (
              <View key={k} style={styles.fila}>
                <Ionicons name={it.hecho ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={it.hecho ? color : HUD.muyTenue} />
                <AppText style={[styles.texto, it.hecho && styles.hecho]} numberOfLines={1}>{it.texto}</AppText>
                {it.detalle ? <AppText style={styles.detalle} numberOfLines={1}>{it.detalle}</AppText> : null}
              </View>
            ))}
            {panel.items.length > 6 ? <AppText style={styles.detalle}>+{panel.items.length - 6} más</AppText> : null}
          </View>
        )
      ) : null}

      {panel.tipo === 'cifras' ? (
        <View style={styles.cifras}>
          {panel.cifras.slice(0, 6).map((c, k) => (
            <View key={k} style={styles.cifra}>
              <AppText style={styles.label} numberOfLines={1}>{c.label.toUpperCase()}</AppText>
              <AppText style={[styles.valor, c.alerta && { color: '#FF6B6B' }]} numberOfLines={1} adjustsFontSizeToFit>
                {c.valor}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {panel.tipo === 'clima' ? (
        <View style={{ gap: 10 }}>
          <View style={styles.fila}>
            <Ionicons name={panel.icono as keyof typeof Ionicons.glyphMap} size={28} color={color} />
            <AppText style={[styles.valor, { fontSize: 28 }]}>{panel.temp}°</AppText>
            <AppText style={styles.texto}>{panel.descripcion}</AppText>
          </View>
          <View style={styles.dias}>
            {panel.dias.map((d) => (
              <View key={d.dia} style={styles.dia}>
                <AppText style={styles.label}>{d.dia}</AppText>
                <Ionicons name={d.icono as keyof typeof Ionicons.glyphMap} size={16} color={HUD.texto} />
                <AppText style={styles.detalle}>{d.max}°/{d.min}°</AppText>
                <AppText style={[styles.detalle, { color: d.lluvia >= 40 ? color : 'transparent' }]}>{d.lluvia}%</AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 4, padding: 14, gap: 10 },
  titulo: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  texto: { fontFamily: fonts.medium, fontSize: 14, color: HUD.texto, flex: 1 },
  hecho: { color: HUD.muyTenue, textDecorationLine: 'line-through' },
  detalle: { fontFamily: fonts.medium, fontSize: 11, color: HUD.tenue, letterSpacing: 0.5 },
  vacio: { fontFamily: fonts.medium, fontSize: 13, color: HUD.tenue },
  cifras: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  cifra: { width: '33.33%', gap: 2, paddingRight: 8 },
  label: { fontFamily: fonts.semibold, fontSize: 9.5, letterSpacing: 1.4, color: HUD.muyTenue },
  valor: { fontFamily: fonts.bold, fontSize: 17, color: HUD.texto, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  dias: { flexDirection: 'row', justifyContent: 'space-between' },
  dia: { alignItems: 'center', gap: 3 },
});

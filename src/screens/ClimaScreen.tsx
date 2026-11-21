/**
 * Pronóstico completo: ahora, próximas 24 horas y los 7 días.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { consejoClima, infoClima, obtenerClima, type Pronostico } from '@/clima/clima';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fromISODate, toISODate } from '@/utils/fechas';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function ClimaScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [p, setP] = useState<Pronostico | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(
    async (forzar = false) => {
      setCargando(true);
      setP(await obtenerClima(db, forzar));
      setCargando(false);
    },
    [db],
  );

  useEffect(() => {
    cargar().catch(console.warn);
  }, [cargar]);

  if (!p) {
    return (
      <View style={[styles.centro, { backgroundColor: colors.bg }]}>
        {cargando ? <ActivityIndicator color={colors.accent} /> : <AppText tone="secondary">No pude obtener el clima. ¿Tienes internet?</AppText>}
      </View>
    );
  }

  const info = infoClima(p.actual.codigo, p.actual.esDia);
  const hoy = p.dias[0];
  const minSemana = Math.min(...p.dias.map((d) => d.min));
  const maxSemana = Math.max(...p.dias.map((d) => d.max));
  const rango = Math.max(1, maxSemana - minSemana);
  const actualizado = new Date(p.actualizado);

  return (
    <>
      <Stack.Screen
        options={{
          title: p.ubicacion.nombre.split(',')[0],
          headerRight: () => (
            <Pressable onPress={() => router.push('/ajustes')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cambiar ubicación">
              <Ionicons name="location-outline" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => cargar(true)} tintColor={colors.accent} colors={[colors.accent]} />}
      >
        {/* Ahora */}
        <View style={styles.ahora}>
          <Ionicons name={info.icono as keyof typeof Ionicons.glyphMap} size={64} color={colors.accent} />
          <AppText variant="display" tabular style={{ fontSize: 72, lineHeight: 80, letterSpacing: -3 }}>
            {p.actual.temp}°
          </AppText>
          <AppText variant="headline">{info.texto}</AppText>
          <AppText variant="callout" tone="secondary">
            Sensación {p.actual.sensacion}° · Viento {p.actual.viento} km/h · Humedad {p.actual.humedad}%
          </AppText>
          {hoy && consejoClima(hoy) ? (
            <AppText variant="callout" tone="accent" style={{ marginTop: space.xs }}>{consejoClima(hoy)}</AppText>
          ) : null}
        </View>

        {/* Próximas horas */}
        <Card style={{ paddingHorizontal: 0 }}>
          <AppText variant="overline" tone="tertiary" style={{ marginLeft: space.xl, marginBottom: space.md }}>Próximas 24 horas</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
            {p.horas.map((h, i) => {
              const ih = infoClima(h.codigo, Number(h.hora.slice(0, 2)) >= 7 && Number(h.hora.slice(0, 2)) < 21);
              return (
                <View key={i} style={styles.hora} accessibilityLabel={`${h.hora}: ${h.temp} grados, ${ih.texto}`}>
                  <AppText variant="caption" tone="tertiary">{i === 0 ? 'Ahora' : h.hora}</AppText>
                  <Ionicons name={ih.icono as keyof typeof Ionicons.glyphMap} size={22} color={colors.text} />
                  <AppText variant="callout" tabular>{h.temp}°</AppText>
                  <AppText variant="caption" style={{ color: h.lluvia >= 30 ? colors.accent : 'transparent', fontSize: 11 }}>{h.lluvia}%</AppText>
                </View>
              );
            })}
          </ScrollView>
        </Card>

        {/* 7 días */}
        <Card style={{ marginTop: space.md }}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.sm }}>7 días</AppText>
          {p.dias.map((d, i) => {
            const id = infoClima(d.codigo);
            const esHoy = d.fecha === toISODate();
            const izq = ((d.min - minSemana) / rango) * 100;
            const ancho = Math.max(6, ((d.max - d.min) / rango) * 100);
            return (
              <View
                key={d.fecha}
                style={[styles.dia, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                accessibilityLabel={`${esHoy ? 'Hoy' : DIAS[fromISODate(d.fecha).getDay()]}: ${id.texto}, máxima ${d.max}, mínima ${d.min}, ${d.lluvia}% de lluvia`}
              >
                <AppText variant="callout" style={{ width: 44 }}>{esHoy ? 'Hoy' : DIAS[fromISODate(d.fecha).getDay()]}</AppText>
                <Ionicons name={id.icono as keyof typeof Ionicons.glyphMap} size={20} color={colors.text} />
                <AppText variant="caption" tone={d.lluvia >= 30 ? 'accent' : 'tertiary'} style={{ width: 46, textAlign: 'right' }} tabular numberOfLines={1}>
                  {d.lluvia >= 10 ? `${d.lluvia}%` : ''}
                </AppText>
                <AppText variant="callout" tone="tertiary" tabular style={{ width: 30, textAlign: 'right' }}>{d.min}°</AppText>
                <View style={[styles.barra, { backgroundColor: colors.surfaceRaised }]}>
                  <View style={{ position: 'absolute', left: `${izq}%`, width: `${ancho}%`, top: 0, bottom: 0, borderRadius: 3, backgroundColor: colors.accent }} />
                </View>
                <AppText variant="callout" tabular style={{ width: 30 }}>{d.max}°</AppText>
              </View>
            );
          })}
        </Card>

        {hoy ? (
          <View style={styles.extras}>
            <Extra icono="sunny-outline" label="Amanecer" valor={hoy.amanecer} />
            <Extra icono="moon-outline" label="Atardecer" valor={hoy.atardecer} />
            <Extra icono="flash-outline" label="Índice UV" valor={String(hoy.uv)} />
          </View>
        ) : null}

        <AppText variant="caption" tone="tertiary" style={{ textAlign: 'center', marginTop: space.xl }}>
          Actualizado {String(actualizado.getHours()).padStart(2, '0')}:{String(actualizado.getMinutes()).padStart(2, '0')} · Datos de Open-Meteo · Desliza hacia abajo para actualizar
        </AppText>
      </ScrollView>
    </>
  );
}

function Extra({ icono, label, valor }: { icono: string; label: string; valor: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.extra, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={icono as keyof typeof Ionicons.glyphMap} size={18} color={colors.textSecondary} />
      <AppText variant="caption" tone="tertiary">{label}</AppText>
      <AppText variant="headline" tabular>{valor}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  ahora: { alignItems: 'center', gap: 2, marginBottom: space.xxl },
  hora: { alignItems: 'center', gap: 6, width: 52, paddingVertical: space.xs },
  dia: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  barra: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  extras: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  extra: { flex: 1, alignItems: 'center', gap: 4, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
});

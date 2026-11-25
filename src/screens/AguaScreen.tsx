/**
 * Tomar agua: vaso que se va llenando, botón rápido para anotar un vaso, historial de la semana
 * y recordatorios configurables (cada cuánto, horario activo y pausa).
 * El vaso se llena con translateY (solo transform, 300 ms ease-out; sin movimiento si "reducir movimiento").
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { FieldLabel } from '@/components/Field';
import { Stepper } from '@/components/Stepper';
import { AGUA_POR_DEFECTO, formatoMl, progresoAgua, vasosParaMeta, type AjustesAgua } from '@/agua/logica';
import { aguaDelDia, aguaSemana, ajustesAgua, deshacerUltimoVaso, guardarAjusteAgua, tomarAgua } from '@/database/agua';
import { prepararNotificaciones, reprogramarTodo } from '@/notifications/programar';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fromISODate, toISODate, weekdayMonFirst } from '@/utils/fechas';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const VASOS = [150, 200, 250, 300, 350, 500];
const CADA = [30, 45, 60, 90, 120, 180];
const INICIAL = ['', 'L', 'M', 'M', 'J', 'V', 'S', 'D'];
const VASO_ALTO = 180;

const textoCada = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60}`);

export function AguaScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [ajustes, setAjustes] = useState<AjustesAgua>(AGUA_POR_DEFECTO);
  const [hoyMl, setHoyMl] = useState(0);
  const [semana, setSemana] = useState<{ fecha: string; ml: number }[]>([]);
  // Hora de la última carga (para saber si la pausa sigue vigente sin leer el reloj al dibujar).
  const [ahoraMs, setAhoraMs] = useState(0);

  const cargar = useCallback(async () => {
    const [a, h, s] = await Promise.all([ajustesAgua(db), aguaDelDia(db), aguaSemana(db)]);
    setAjustes(a);
    setHoyMl(h);
    setSemana(s);
    setAhoraMs(Date.now());
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  const p = progresoAgua(hoyMl, ajustes.metaMl);

  // El agua sube con transform (no se anima la altura).
  const nivel = useSharedValue(0);
  useEffect(() => {
    nivel.set(withTiming(Math.min(1, p.ratio), { duration: 300, easing: EASE_OUT, reduceMotion: ReduceMotion.System }));
  }, [p.ratio, nivel]);
  const aguaStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - nivel.get()) * VASO_ALTO }] }));

  const vaso = async () => {
    const antes = hoyMl;
    try {
      await tomarAgua(db, ajustes.vasoMl);
      if (antes < ajustes.metaMl && antes + ajustes.vasoMl >= ajustes.metaMl) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await cargar();
      reprogramarTodo(db).catch(() => {}); // si ya cumpliste, se quitan los avisos de hoy
    } catch (e) {
      console.warn(e);
      Alert.alert('No se pudo guardar', 'Inténtalo de nuevo.');
    }
  };

  const deshacer = async () => {
    if (await deshacerUltimoVaso(db)) {
      Haptics.selectionAsync().catch(() => {});
      await cargar();
      reprogramarTodo(db).catch(() => {});
    }
  };

  const cambiar = async <K extends keyof AjustesAgua>(k: K, v: AjustesAgua[K]) => {
    setAjustes((a) => ({ ...a, [k]: v }));
    setAhoraMs(Date.now());
    await guardarAjusteAgua(db, k, v);
    reprogramarTodo(db).catch(() => {});
  };

  const activarAvisos = async (on: boolean) => {
    if (on && !(await prepararNotificaciones(true))) {
      Alert.alert('Sin permiso', 'Para recordarte, activa las notificaciones de Tinzit0 en los ajustes del celular.');
      return;
    }
    await cambiar('avisos', on);
  };

  const elegirHora = (k: 'desde' | 'hasta') => {
    if (Platform.OS !== 'android') return;
    const [h, m] = ajustes[k].split(':').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(2000, 0, 1, h, m),
      mode: 'time',
      is24Hour: true,
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        cambiar(k, `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`).catch(console.warn);
      },
    });
  };

  const pausar = (horas: number | 'manana') => {
    const ahora = new Date();
    const hasta = horas === 'manana' ? new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0) : new Date(ahora.getTime() + horas * 3600_000);
    cambiar('pausaHasta', hasta.toISOString()).catch(console.warn);
  };
  const pausado = ajustes.pausaHasta && new Date(ajustes.pausaHasta).getTime() > ahoraMs ? new Date(ajustes.pausaHasta) : null;

  const maxSemana = Math.max(ajustes.metaMl, ...semana.map((d) => d.ml));
  const diasCumplidos = semana.filter((d) => d.ml >= ajustes.metaMl).length;
  const mensaje = p.cumplida
    ? '¡Meta cumplida! Bien ahí 💧'
    : hoyMl === 0
      ? 'Parte con un vaso, sin apuro.'
      : `Te faltan ${formatoMl(p.faltan)} (unos ${vasosParaMeta(p.faltan, ajustes.vasoMl)} vasos).`;

  return (
    <>
      <Stack.Screen options={{ title: 'Agua' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {/* Vaso + progreso */}
        <View style={styles.hero}>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Agua de hoy"
            accessibilityValue={{ min: 0, max: 100, now: p.porcentaje, text: `${formatoMl(hoyMl)} de ${formatoMl(ajustes.metaMl)}` }}
            style={[styles.vaso, { borderColor: colors.text, backgroundColor: colors.surface }]}
          >
            <Animated.View style={[styles.agua, { backgroundColor: colors.accentSoft, borderTopColor: colors.accent }, aguaStyle]} />
            <View style={styles.vasoTexto}>
              <AppText variant="number" tabular>{p.porcentaje}%</AppText>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="overline" tone="tertiary">Hoy</AppText>
            <AppText variant="title" tabular style={{ marginTop: space.xs }}>{formatoMl(hoyMl)}</AppText>
            <AppText variant="caption" tone="tertiary" tabular>de {formatoMl(ajustes.metaMl)}</AppText>
            <AppText variant="callout" tone={p.cumplida ? 'accent' : 'secondary'} style={{ marginTop: space.md }}>{mensaje}</AppText>
          </View>
        </View>

        <Button label={`+ 1 vaso (${formatoMl(ajustes.vasoMl)})`} onPress={vaso} style={{ marginTop: space.xl }} />
        {hoyMl > 0 ? (
          <Pressable onPress={deshacer} accessibilityRole="button" hitSlop={8} style={styles.deshacer}>
            <AppText variant="caption" tone="tertiary">Deshacer el último vaso</AppText>
          </Pressable>
        ) : null}

        {/* Semana */}
        <View style={styles.seccion}>
          <View style={styles.entre}>
            <FieldLabel>Esta semana</FieldLabel>
            <AppText variant="caption" tone="tertiary">{diasCumplidos} de 7 días con la meta</AppText>
          </View>
          <Card style={styles.semana}>
            {semana.map((d) => {
              const alto = maxSemana > 0 ? Math.max(4, (d.ml / maxSemana) * 90) : 4;
              const fecha = fromISODate(d.fecha);
              const esHoy = d.fecha === toISODate();
              return (
                <View key={d.fecha} style={styles.barraCol} accessible accessibilityLabel={`${esHoy ? 'Hoy' : INICIAL[weekdayMonFirst(fecha)]}: ${formatoMl(d.ml)}`}>
                  <View style={{ height: 90, justifyContent: 'flex-end' }}>
                    <View style={{ height: alto, width: 18, borderRadius: 5, backgroundColor: d.ml >= ajustes.metaMl ? colors.accent : colors.surfaceRaised }} />
                  </View>
                  <AppText variant="caption" tone={esHoy ? 'accent' : 'tertiary'} style={{ marginTop: space.xs }}>{INICIAL[weekdayMonFirst(fecha)]}</AppText>
                </View>
              );
            })}
          </Card>
        </View>

        {/* Meta y vaso */}
        <View style={styles.seccion}>
          <Stepper
            label="Meta diaria"
            value={ajustes.metaMl / 1000}
            onChange={(v) => cambiar('metaMl', Math.round(Math.min(8, Math.max(0.5, v)) * 1000))}
            step={0.25}
            min={0.5}
            decimals
            fijo={2}
            suffix=" L"
          />
          <View style={{ marginTop: space.lg }}>
            <FieldLabel>Tamaño del vaso</FieldLabel>
            <View style={styles.wrap}>
              {VASOS.map((v) => (
                <Chip key={v} compact label={`${v} ml`} selected={ajustes.vasoMl === v} onPress={() => cambiar('vasoMl', v)} />
              ))}
            </View>
          </View>
        </View>

        {/* Recordatorios */}
        <View style={styles.seccion}>
          <FieldLabel>Recordatorios</FieldLabel>
          <Card>
            <View style={styles.entre}>
              <View style={{ flex: 1 }}>
                <AppText variant="callout">Recordarme tomar agua</AppText>
                <AppText variant="caption" tone="tertiary">
                  {ajustes.avisos ? `Cada ${textoCada(ajustes.cadaMin)}, de ${ajustes.desde} a ${ajustes.hasta}` : 'Apagados'}
                </AppText>
              </View>
              <Switch
                value={ajustes.avisos}
                onValueChange={(v) => {
                  activarAvisos(v).catch(console.warn);
                }}
                trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
                thumbColor={ajustes.avisos ? colors.onAccent : '#f4f4f4'}
                accessibilityLabel="Recordarme tomar agua"
              />
            </View>

            {ajustes.avisos ? (
              <>
                <View style={{ marginTop: space.lg }}>
                  <FieldLabel>Cada cuánto</FieldLabel>
                  <View style={styles.wrap}>
                    {CADA.map((m) => (
                      <Chip key={m} compact label={textoCada(m)} selected={ajustes.cadaMin === m} onPress={() => cambiar('cadaMin', m)} />
                    ))}
                  </View>
                </View>
                <View style={{ marginTop: space.lg }}>
                  <FieldLabel>Horario activo</FieldLabel>
                  <View style={styles.fila}>
                    <Pressable onPress={() => elegirHora('desde')} accessibilityRole="button" accessibilityLabel={`Desde las ${ajustes.desde}`} style={[styles.hora, { backgroundColor: colors.surfaceRaised }]}>
                      <AppText variant="caption" tone="tertiary">Desde</AppText>
                      <AppText variant="headline" tabular>{ajustes.desde}</AppText>
                    </Pressable>
                    <Pressable onPress={() => elegirHora('hasta')} accessibilityRole="button" accessibilityLabel={`Hasta las ${ajustes.hasta}`} style={[styles.hora, { backgroundColor: colors.surfaceRaised }]}>
                      <AppText variant="caption" tone="tertiary">Hasta</AppText>
                      <AppText variant="headline" tabular>{ajustes.hasta}</AppText>
                    </Pressable>
                  </View>
                </View>
                <View style={{ marginTop: space.lg }}>
                  {pausado ? (
                    <View style={[styles.pausa, { backgroundColor: colors.warningSoft }]}>
                      <Ionicons name="pause-circle-outline" size={18} color={colors.warning} />
                      <AppText variant="caption" style={{ flex: 1 }}>
                        En pausa hasta {pausado.toDateString() === new Date().toDateString() ? `las ${String(pausado.getHours()).padStart(2, '0')}:${String(pausado.getMinutes()).padStart(2, '0')}` : 'mañana'}
                      </AppText>
                      <Chip compact label="Reanudar" onPress={() => cambiar('pausaHasta', null)} />
                    </View>
                  ) : (
                    <>
                      <FieldLabel>Pausar</FieldLabel>
                      <View style={styles.wrap}>
                        <Chip compact label="1 hora" onPress={() => pausar(1)} />
                        <Chip compact label="3 horas" onPress={() => pausar(3)} />
                        <Chip compact label="Por hoy" onPress={() => pausar('manana')} />
                      </View>
                    </>
                  )}
                </View>
              </>
            ) : null}
          </Card>
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
            Cuando cumples la meta del día, dejo de recordarte hasta mañana.
          </AppText>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.xl },
  vaso: { width: 120, height: VASO_ALTO, borderWidth: 3, borderTopWidth: 0, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  agua: { position: 'absolute', left: 0, right: 0, top: 0, height: VASO_ALTO, borderTopWidth: 3 },
  vasoTexto: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  deshacer: { alignSelf: 'center', marginTop: space.md, minHeight: 32, justifyContent: 'center' },
  seccion: { marginTop: space.xxl },
  entre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  semana: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.lg },
  barraCol: { alignItems: 'center', flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fila: { flexDirection: 'row', gap: space.md },
  hora: { flex: 1, padding: space.md, borderRadius: radius.md, minHeight: 56, justifyContent: 'center' },
  pausa: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md },
});

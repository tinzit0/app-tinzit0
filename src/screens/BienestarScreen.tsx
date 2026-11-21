/**
 * Bienestar: tu espacio para la salud mental. Botón "Estoy a mil", ánimo de hoy,
 * herramientas basadas en DBT (impulsos, tarjeta diaria, patrones, plan de crisis, habilidades)
 * y el resumen para llevar a terapia. Todo queda solo en tu celular.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, Share, StyleSheet, Switch, View } from 'react-native';

import { Cerrado } from '@/bienestar/Cerrado';
import { resumenParaTerapia, tendenciaAnimo, textoAnimo } from '@/bienestar/logica';
import { useCandadoBienestar } from '@/bienestar/privacidad';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Escala } from '@/components/Escala';
import { PressableScale } from '@/components/PressableScale';
import { contarImpulsos, datosBienestar, listarTarjetas, obtenerTarjeta, registrarAnimo } from '@/database/bienestar';
import { getSetting, setSetting } from '@/database/queries';
import { reprogramarTodo } from '@/notifications/programar';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { toISODate } from '@/utils/fechas';

type Icono = keyof typeof Ionicons.glyphMap;

const HERRAMIENTAS: { icon: Icono; label: string; ruta: string }[] = [
  { icon: 'water-outline', label: 'Impulso', ruta: '/impulso' },
  { icon: 'journal-outline', label: 'Tarjeta diaria', ruta: '/tarjeta-diaria' },
  { icon: 'analytics-outline', label: 'Tus patrones', ruta: '/patrones' },
  { icon: 'shield-checkmark-outline', label: 'Plan de crisis', ruta: '/plan-crisis' },
  { icon: 'leaf-outline', label: 'Habilidades', ruta: '/habilidades' },
  { icon: 'ellipse-outline', label: 'Respirar', ruta: '/calma?modo=respirar' },
];

const uno = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-CL');

export function BienestarScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { estado, abrir } = useCandadoBienestar();
  const [animo, setAnimo] = useState<number | null>(null);
  const [completa, setCompleta] = useState(false);
  const [tend, setTend] = useState<{ promedio: number | null; cambio: number | null }>({ promedio: null, cambio: null });
  const [impulsos, setImpulsos] = useState({ total: 0, logrados: 0 });
  const [huella, setHuella] = useState(false);
  const [recordar, setRecordar] = useState(true);

  const cargar = useCallback(async () => {
    const [t, d, i, h, r] = await Promise.all([
      obtenerTarjeta(db),
      datosBienestar(db, 14),
      contarImpulsos(db),
      getSetting(db, 'bienestar_bloqueo'),
      getSetting(db, 'notif_tarjeta'),
    ]);
    setAnimo(t?.animo ?? null);
    setCompleta(!!t && (t.impulso != null || Object.keys(t.emociones).length > 0));
    setTend(tendenciaAnimo(d));
    setImpulsos(i);
    setHuella(h === '1');
    setRecordar(r !== '0');
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      if (estado === 'abierto') cargar().catch(console.warn);
    }, [cargar, estado]),
  );

  if (estado !== 'abierto') {
    return (
      <>
        <Stack.Screen options={{ title: 'Bienestar' }} />
        <Cerrado onAbrir={abrir} revisando={estado === 'revisando'} />
      </>
    );
  }

  const marcarAnimo = async (v: number) => {
    setAnimo(v);
    await registrarAnimo(db, v);
    cargar().catch(() => {});
  };

  const compartir = async () => {
    const hasta = toISODate();
    const h = new Date();
    const desde = toISODate(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 13));
    const [t, i] = await Promise.all([listarTarjetas(db, desde, hasta), contarImpulsos(db, desde, hasta)]);
    await Share.share({ message: resumenParaTerapia(t, i, desde, hasta) });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Bienestar' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {/* Botón de emergencia emocional */}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Estoy a mil: ejercicios para bajar la intensidad"
          onPress={() => router.push('/calma')}
          style={[styles.mil, { backgroundColor: colors.accent }]}
        >
          <Ionicons name="pulse" size={28} color={colors.onAccent} />
          <View style={{ flex: 1 }}>
            <AppText variant="title" tone="onAccent">Estoy a mil</AppText>
            <AppText variant="callout" tone="onAccent" style={{ opacity: 0.8 }}>2 minutos para bajar la intensidad</AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onAccent} />
        </PressableScale>

        {/* Ánimo de hoy */}
        <View style={styles.seccion}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>¿Cómo estás hoy?</AppText>
          <Escala value={animo} onChange={marcarAnimo} etiquetas={['Muy mal', 'Muy bien']} accessibilityLabel="Ánimo de hoy de 0 a 10" />
          <Card onPress={() => router.push('/tarjeta-diaria')} accessibilityLabel="Completar tarjeta diaria" style={[styles.fila, { marginTop: space.md }]}>
            <Ionicons name={completa ? 'checkmark-circle' : 'journal-outline'} size={20} color={colors.accent} />
            <AppText variant="callout" style={{ flex: 1 }}>
              {completa ? 'Tarjeta de hoy lista ✓' : 'Llenar tarjeta de hoy · 30 s'}
            </AppText>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Card>
        </View>

        {/* Números */}
        <View style={[styles.fila, { marginTop: space.xxl, alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <AppText variant="overline" tone="tertiary">Ánimo 7 días</AppText>
            <AppText variant="display" tabular style={{ marginTop: space.xs }}>{tend.promedio != null ? uno(tend.promedio) : '–'}</AppText>
            <AppText variant="caption" tone={tend.cambio != null && tend.cambio < -0.5 ? 'warning' : 'secondary'}>
              {tend.cambio != null
                ? tend.cambio >= 0.5
                  ? `▲ ${uno(tend.cambio)} vs semana pasada`
                  : tend.cambio <= -0.5
                    ? `▼ ${uno(-tend.cambio)} vs semana pasada`
                    : 'Parecido a la semana pasada'
                : tend.promedio != null
                  ? textoAnimo(tend.promedio)
                  : 'Marca tu ánimo arriba'}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="overline" tone="tertiary">Impulsos surfeados</AppText>
            <AppText variant="display" tabular style={{ marginTop: space.xs }}>{impulsos.logrados}</AppText>
            <AppText variant="caption" tone="secondary">
              {impulsos.total ? `de ${impulsos.total} ${impulsos.total === 1 ? 'intento' : 'intentos'}` : 'Cada ola cuenta'}
            </AppText>
          </View>
        </View>

        {/* Herramientas */}
        <View style={styles.grid}>
          {HERRAMIENTAS.map((h) => (
            <PressableScale
              accessibilityRole="button"
              key={h.ruta}
              onPress={() => router.push(h.ruta as never)}
              accessibilityLabel={h.label}
              style={[styles.tool, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name={h.icon} size={22} color={colors.accent} />
              <AppText variant="caption" numberOfLines={1}>{h.label}</AppText>
            </PressableScale>
          ))}
        </View>

        <Card onPress={compartir} accessibilityLabel="Compartir resumen para tu psicólogo o psicóloga" style={[styles.fila, { marginTop: space.md }]}>
          <Ionicons name="share-outline" size={20} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <AppText variant="callout">Resumen para tu psicólogo/a</AppText>
            <AppText variant="caption" tone="tertiary">Tus últimas 2 semanas, listo para mandar</AppText>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Card>

        {/* Ajustes de privacidad */}
        <View style={styles.seccion}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Privacidad y avisos</AppText>
          <Card style={{ paddingVertical: space.xs }}>
            <View style={styles.ajuste}>
              <View style={{ flex: 1 }}>
                <AppText variant="callout">Pedir huella para entrar</AppText>
                <AppText variant="caption" tone="tertiary">“Estoy a mil” y el plan de crisis siempre abren sin huella</AppText>
              </View>
              <Switch
                value={huella}
                onValueChange={async (v) => {
                  setHuella(v);
                  await setSetting(db, 'bienestar_bloqueo', v ? '1' : '0');
                }}
                trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Pedir huella para entrar a Bienestar"
              />
            </View>
            <View style={[styles.ajuste, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <AppText variant="callout">Recordatorio de la noche</AppText>
                <AppText variant="caption" tone="tertiary">Para llenar tu tarjeta (el aviso no dice nada privado)</AppText>
              </View>
              <Switch
                value={recordar}
                onValueChange={async (v) => {
                  setRecordar(v);
                  await setSetting(db, 'notif_tarjeta', v ? '1' : '0');
                  reprogramarTodo(db).catch(() => {});
                }}
                trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Recordatorio de la noche para la tarjeta diaria"
              />
            </View>
          </Card>
        </View>

        <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xxl, textAlign: 'center' }}>
          Tinzit0 te acompaña entre sesiones, no reemplaza a tu psicólogo/a.{'\n'}Si estás en peligro, llama gratis al *4141.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  seccion: { marginTop: space.xxl },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mil: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.xl, borderRadius: radius.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xxl },
  tool: {
    width: '31.5%',
    flexGrow: 1,
    aspectRatio: 1.15,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xs,
  },
  ajuste: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});

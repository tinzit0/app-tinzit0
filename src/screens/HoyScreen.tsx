/**
 * Pantalla "Hoy": lo primero que ves al abrir la app.
 * Saludo según la hora, clima, tareas del día, si toca gym, el gasto de la semana,
 * tus hábitos y tus apps favoritas.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Fab } from '@/components/Fab';
import { IconButton } from '@/components/IconButton';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { obtenerClima, type Pronostico } from '@/clima/clima';
import { ClimaCard } from '@/components/ClimaCard';
import { HabitosHoy } from '@/components/HabitosHoy';
import { useLogros } from '@/components/LogrosProvider';
import { QuickApps } from '@/components/QuickApps';
import { alternarHabito, listarHabitos, type HabitoConEstado } from '@/database/habitos';
import { appsIniciales, listarApps, type AppFavorita } from '@/database/apps';
import { proximasEvaluaciones, todosLosBloques, type BloqueConRamo, type EvaluacionConRamo } from '@/database/estudio';
import { claseAhora } from '@/estudio/logica';
import { debeMostrarBienvenida, getResumenHoy, getSetting, type ResumenHoy } from '@/database/queries';
import { obtenerProyeccion } from '@/database/finanzas';
import { obtenerTarjeta } from '@/database/bienestar';
import { textoAnimo } from '@/bienestar/logica';
import { leerModulos, type IdModulo, type ModuloInicio } from '@/inicio/modulos';
import { aguaDelDia, ajustesAgua, tomarAgua } from '@/database/agua';
import { formatoMl } from '@/agua/logica';
import { PressableScale } from '@/components/PressableScale';
import { necesitaRespaldo } from '@/database/respaldo';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { fechaLarga, fromISODate, nombreDiaMonFirst, saludo, toISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';
import { vozDisponible } from '@/voice/reconocedor';

type Icono = keyof typeof Ionicons.glyphMap;
const ACCESOS: { icon: Icono; label: string; ruta: string }[] = [
  { icon: 'checkbox-outline', label: 'Tarea', ruta: '/tarea' },
  { icon: 'card-outline', label: 'Gasto', ruta: '/gasto' },
  { icon: 'create-outline', label: 'Nota', ruta: '/nota' },
];

let bienvenidaRevisada = false;

const mayusDia = (n: number) => { const d = nombreDiaMonFirst(n); return d.charAt(0).toUpperCase() + d.slice(1); };

export function HoyScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [data, setData] = useState<ResumenHoy | null>(null);
  const [pedirRespaldo, setPedirRespaldo] = useState(false);
  const [apps, setApps] = useState<AppFavorita[]>([]);
  const [habitos, setHabitos] = useState<HabitoConEstado[]>([]);
  const [clima, setClima] = useState<Pronostico | null>(null);
  const [climaCargado, setClimaCargado] = useState(false);
  const [bloques, setBloques] = useState<BloqueConRamo[]>([]);
  const [prueba, setPrueba] = useState<EvaluacionConRamo | null>(null);
  const [quedaHoy, setQuedaHoy] = useState<number | null>(null);
  const [animoHoy, setAnimoHoy] = useState<number | null>(null);
  const [modulos, setModulos] = useState<ModuloInicio[]>(() => leerModulos(null));
  const [agua, setAgua] = useState<{ ml: number; meta: number; vaso: number } | null>(null);
  const { revisar } = useLogros();

  // Primera vez con la app vacía: configuración inicial breve (opcional).
  useEffect(() => {
    if (bienvenidaRevisada) return; // una sola vez por sesión (el efecto puede repetirse)
    bienvenidaRevisada = true;
    debeMostrarBienvenida(db)
      .then((si) => si && router.push('/bienvenida'))
      .catch(() => {});
  }, [db, router]);

  // Cada vez que vuelves a esta pestaña, recargamos los datos.
  useFocusEffect(
    useCallback(() => {
      getResumenHoy(db).then(setData).catch(console.warn);
      necesitaRespaldo(db).then(setPedirRespaldo).catch(() => {});
      listarHabitos(db).then(setHabitos).catch(console.warn);
      obtenerClima(db)
        .then((c) => {
          setClima(c);
          setClimaCargado(true);
        })
        .catch(() => setClimaCargado(true));
      todosLosBloques(db).then(setBloques).catch(console.warn);
      Promise.all([aguaDelDia(db), ajustesAgua(db)])
        .then(([ml, a]) => setAgua({ ml, meta: a.metaMl, vaso: a.vasoMl }))
        .catch(() => {});
      getSetting(db, 'inicio_modulos')
        .then((v) => setModulos(leerModulos(v)))
        .catch(() => {});
      // Si Bienestar está protegido con huella, el ánimo no se muestra en Inicio.
      getSetting(db, 'bienestar_bloqueo')
        .then((v) => (v === '1' ? null : obtenerTarjeta(db)))
        .then((t) => setAnimoHoy(t?.animo ?? null))
        .catch(() => setAnimoHoy(null));
      obtenerProyeccion(db)
        .then((p) => setQuedaHoy(p.quedaHoy))
        .catch(() => {});
      proximasEvaluaciones(db, 14)
        .then((p) => setPrueba(p.find((e) => e.grade == null) ?? null))
        .catch(console.warn);
      appsIniciales(db)
        .then(() => listarApps(db))
        .then(setApps)
        .catch(console.warn);
    }, [db]),
  );

  const ahora = new Date();
  const titulo = data?.nombre ? `${saludo(ahora)},\n${data.nombre}` : saludo(ahora);
  const totalTareas = (data?.tareasPendientes ?? 0) + (data?.tareasHechas ?? 0);
  const clase = claseAhora(bloques);
  const claseTexto = clase.actual
    ? `Ahora: ${clase.actual.name}${clase.actual.sala ? ` · Sala ${clase.actual.sala}` : ''}`
    : clase.siguiente
      ? `${clase.siguiente.enDias === 0 ? 'Hoy' : clase.siguiente.enDias === 1 ? 'Mañana' : mayusDia(clase.siguiente.weekday)} ${clase.siguiente.start_time}: ${clase.siguiente.name}${clase.siguiente.sala ? ` · ${clase.siguiente.sala}` : ''}`
      : null;
  const diasPrueba = prueba?.date ? Math.round((fromISODate(prueba.date).getTime() - fromISODate(toISODate()).getTime()) / 86400000) : null;

  // Cada módulo de Inicio (se muestran según tu orden y lo que tengas visible).
  const vistas: Record<IdModulo, ReactNode> = {
    rapido: (
      <>
        {/* Acceso rápido: crear sin buscar la pestaña */}
        <View style={[styles.row, { marginTop: 0, marginBottom: space.md }]}>
          {ACCESOS.map((a) => (
            <PressableScale
              key={a.ruta}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => router.push(a.ruta as never)}
              style={[styles.rapido, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name={a.icon} size={20} color={colors.accent} />
              <AppText variant="caption" numberOfLines={1}>{a.label}</AppText>
            </PressableScale>
          ))}
        </View>
      </>
    ),
    clima: (
      <>
        {/* Clima */}
        {climaCargado ? (
          <View style={{ marginBottom: space.md }}>
            <ClimaCard p={clima} />
          </View>
        ) : null}
      </>
    ),
    tareas: (
      <>
        {/* Tareas de hoy: la tarjeta principal */}
        <Card onPress={() => router.navigate('/tareas')} accessibilityLabel="Ver tareas de hoy">
          <View style={styles.cardTop}>
            <AppText variant="overline" tone="tertiary">Tareas de hoy</AppText>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </View>
          <View style={styles.bigRow}>
            <AppText variant="display" tabular>{data?.tareasPendientes ?? 0}</AppText>
            <AppText variant="callout" tone="secondary" style={styles.bigSuffix}>
              {totalTareas === 0 ? 'nada pendiente' : `pendientes de ${totalTareas}`}
            </AppText>
          </View>
          <AppText variant="callout" tone="secondary" style={{ marginTop: space.sm }}>
            {totalTareas === 0
              ? 'Agrega tu primera tarea en la pestaña Tareas.'
              : data?.tareasPendientes === 0
                ? 'Todo listo por hoy. Bien ahí 🙌'
                : 'Vamos de a una, que se puede.'}
          </AppText>
        </Card>
      </>
    ),
    gymGastos: (
      <>
        {/* Fila de dos tarjetas: Gym y Gastos */}
        <View style={styles.row}>
          <Card style={styles.half} onPress={() => router.navigate('/gym')} accessibilityLabel="Ver gym">
            <AppText variant="overline" tone="tertiary">Gym</AppText>
            <AppText variant="title" style={{ marginTop: space.md }} numberOfLines={1}>
              {data?.gymHoy ?? 'Descanso'}
            </AppText>
            <AppText variant="caption" tone="secondary" style={{ marginTop: space.xs }}>
              {data?.gymHoy ? 'Te toca hoy' : 'Recupera energía'}
            </AppText>
          </Card>
  
          <Card style={styles.half} onPress={() => router.navigate('/gastos')} accessibilityLabel="Ver gastos">
            <AppText variant="overline" tone="tertiary">Semana</AppText>
            <AppText variant="title" tabular style={{ marginTop: space.md }} numberOfLines={1} adjustsFontSizeToFit>
              {formatCLP(data?.gastoSemana ?? 0)}
            </AppText>
            <View style={{ marginTop: space.md }}>
              <ProgressBar value={data?.gastoSemana ?? 0} max={data?.presupuestoSemana ?? 0} />
            </View>
            <AppText variant="caption" tone={quedaHoy != null && quedaHoy < 0 ? 'danger' : 'secondary'} style={{ marginTop: space.sm }} numberOfLines={1}>
              {quedaHoy != null ? (quedaHoy < 0 ? `Hoy: ${formatCLP(quedaHoy)}` : `Hoy: ${formatCLP(quedaHoy)} libres`) : `de ${formatCLP(data?.presupuestoSemana ?? 0)}`}
            </AppText>
          </Card>
        </View>
      </>
    ),
    estadisticas: (
      <>
        {/* Acceso a estadísticas del mes */}
        <Card
          onPress={() => router.push('/estadisticas')}
          accessibilityLabel="Ver estadísticas del mes"
          style={[styles.banner, { marginTop: space.md, marginBottom: 0 }]}
        >
          <Ionicons name="stats-chart-outline" size={20} color={colors.accent} />
          <AppText variant="callout" style={{ flex: 1 }}>Tu mes en números</AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Card>
      </>
    ),
    estudio: (
      <>
        {/* Estudio */}
        <Card onPress={() => router.push('/estudio')} accessibilityLabel="Abrir Estudio" style={{ marginTop: space.md }}>
          <View style={styles.cardTop}>
            <AppText variant="overline" tone={clase.actual ? 'accent' : 'tertiary'}>Estudio</AppText>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </View>
          <AppText variant="headline" style={{ marginTop: space.md }} numberOfLines={1}>
            {claseTexto ?? 'Ramos, notas, horario y modo enfoque'}
          </AppText>
          <AppText variant="caption" tone={diasPrueba != null && diasPrueba <= 2 ? 'warning' : 'secondary'} style={{ marginTop: space.xs }} numberOfLines={1}>
            {prueba
              ? `${prueba.name} de ${prueba.ramo} ${diasPrueba === 0 ? 'hoy' : diasPrueba === 1 ? 'mañana' : `en ${diasPrueba} días`}`
              : bloques.length
                ? 'Sin pruebas en las próximas 2 semanas'
                : 'Agrega tus ramos para ver tu horario aquí'}
          </AppText>
        </Card>
      </>
    ),
    bienestar: (
      <>
        {/* Bienestar */}
        {/* Dos botones lado a lado (no uno dentro de otro: así TalkBack los lee bien). */}
        <Card style={[styles.banner, { marginTop: space.md, marginBottom: 0, paddingVertical: space.sm }]}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Abrir Bienestar"
            onPress={() => router.push('/bienestar')}
            style={styles.bienestarAbrir}
          >
            <Ionicons name="leaf-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <AppText variant="callout">{animoHoy != null ? `Hoy: ${textoAnimo(animoHoy).toLowerCase()} (${animoHoy}/10)` : '¿Cómo estás hoy?'}</AppText>
              <AppText variant="caption" tone="tertiary">Bienestar</AppText>
            </View>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Estoy a mil"
            onPress={() => router.push('/calma')}
            hitSlop={6}
            style={[styles.pildora, { backgroundColor: colors.accentSoft }]}
          >
            <AppText variant="caption" tone="accent">Estoy a mil</AppText>
          </PressableScale>
        </Card>
      </>
    ),
    musica: (
      <>
        {/* Música (Spotify) */}
        <Card onPress={() => router.push('/musica')} accessibilityLabel="Música" style={[styles.banner, { marginTop: space.sm, marginBottom: 0 }]}>
          <Ionicons name="musical-notes-outline" size={20} color={colors.accent} />
          <AppText variant="callout" style={{ flex: 1 }}>Música</AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Card>
      </>
    ),
    habitos: (
      <>
        {/* Hábitos del día */}
        <View style={{ marginTop: space.xxl }}>
          <HabitosHoy
            habitos={habitos}
            onToggle={async (h) => {
              setHabitos((hs) => hs.map((x) => (x.id === h.id ? { ...x, hechoHoy: !x.hechoHoy } : x)));
              try {
                await alternarHabito(db, h.id, !h.hechoHoy);
                revisar(true);
              } catch (e) {
                console.warn(e); // se revierte abajo al recargar lo que de verdad quedó guardado
              }
              setHabitos(await listarHabitos(db).catch(() => habitos));
            }}
          />
        </View>
      </>
    ),
    agua: (
      <>
        {/* Agua: lo de hoy + un vaso con un toque */}
        <Card style={[styles.banner, { marginTop: space.md, marginBottom: 0, paddingVertical: space.sm }]}>
          <PressableScale accessibilityRole="button" accessibilityLabel="Abrir Agua" onPress={() => router.push('/agua')} style={styles.bienestarAbrir}>
            <Ionicons name="water-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <AppText variant="callout" tabular>{agua ? `${formatoMl(agua.ml)} de ${formatoMl(agua.meta)}` : 'Agua'}</AppText>
              <View style={{ marginTop: space.xs }}>
                <ProgressBar value={Math.min(agua?.ml ?? 0, agua?.meta ?? 0)} max={(agua?.meta ?? 0) * 1.25} />
              </View>
            </View>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Anotar un vaso de agua${agua ? ` de ${formatoMl(agua.vaso)}` : ''}`}
            onPress={async () => {
              if (!agua) return;
              await tomarAgua(db, agua.vaso).catch(console.warn);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setAgua({ ...agua, ml: await aguaDelDia(db) });
            }}
            hitSlop={6}
            style={[styles.pildora, { backgroundColor: colors.accentSoft }]}
          >
            <AppText variant="caption" tone="accent">+ vaso</AppText>
          </PressableScale>
        </Card>
      </>
    ),
    apps: (
      <>
        {/* Accesos directos a tus apps */}
        {Platform.OS === 'android' && apps.length > 0 ? (
          <View style={{ marginTop: space.xxl }}>
            <QuickApps apps={apps} />
          </View>
        ) : null}
      </>
    ),
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen
        eyebrow={fechaLarga(ahora)}
        title={titulo}
        right={
          <View style={styles.headerBtns}>
            <IconButton icon="search-outline" accessibilityLabel="Buscar una función" onPress={() => router.push('/buscar')} />
            <IconButton icon="trophy-outline" accessibilityLabel="Ver medallas" onPress={() => router.push('/logros')} />
            <IconButton icon="settings-outline" accessibilityLabel="Abrir ajustes" onPress={() => router.push('/ajustes')} />
          </View>
        }
      >
        {/* Recordatorio semanal de respaldo */}
        {pedirRespaldo ? (
          <Card
            onPress={() => router.push('/ajustes')}
            accessibilityLabel="Hacer respaldo"
            style={[styles.banner, { backgroundColor: colors.warningSoft, borderColor: 'transparent' }]}
          >
            <Ionicons name="cloud-upload-outline" size={20} color={colors.warning} />
            <AppText variant="callout" style={{ flex: 1 }}>
              Hace rato que no respaldas tus datos. Tócame y lo hacemos en 10 segundos.
            </AppText>
          </Card>
        ) : null}
  
        {/* Módulos en el orden que elegiste (Ajustes → Inicio) */}
        {modulos.filter((m) => m.visible).map((m) => (
          <Fragment key={m.id}>{vistas[m.id]}</Fragment>
        ))}
      </Screen>
      {/* Micrófono: habla con el asistente */}
      <Fab icon="mic" accessibilityLabel="Hablar con Tinzit0" onPress={() => router.push({ pathname: '/asistente', params: { auto: vozDisponible ? '1' : '0' } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: space.md, gap: space.sm },
  bigSuffix: { flexShrink: 1 },
  row: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  half: { flex: 1 },
  headerBtns: { flexDirection: 'row', gap: space.sm },
  bienestarAbrir: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  rapido: { flex: 1, minHeight: 56, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: space.sm },
  pildora: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 999, minHeight: 36, justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, marginBottom: space.md },
});

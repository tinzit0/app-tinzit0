/**
 * Malla interactiva: tus ramos por semestre, con prerrequisitos.
 * - Tocar un ramo: lo marca como aprobado (o lo desmarca).
 * - Mantener presionado: cursando / editar / quitar.
 * - Los ramos que todavía no puedes tomar se ven apagados, con un candado.
 * Si aún no tienes malla: Ing. Civil Informática UBB (incluida), un link de mallapp.cl o armarla a mano.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { IconButton } from '@/components/IconButton';
import { PressableScale } from '@/components/PressableScale';
import { ProgressBar } from '@/components/ProgressBar';
import { borrarMalla, cambiarEstadoMalla, cargarMalla, eliminarRamoMalla, empezarMallaVacia, listarMalla, nombreMalla } from '@/database/malla';
import { abre, disponibilidad, faltantes, leerMallapp, mallaIcinfUbb, nombreSemestre, porSemestre, progreso, urlDatosMallapp, type RamoMalla } from '@/malla/logica';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fetchConLimite } from '@/utils/red';

export function MallaScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [ramos, setRamos] = useState<RamoMalla[]>([]);
  const [nombre, setNombre] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const [link, setLink] = useState('');
  const [carrera, setCarrera] = useState('');
  const [bajando, setBajando] = useState(false);

  const cargar = useCallback(async () => {
    const [r, n] = await Promise.all([listarMalla(db), nombreMalla(db)]);
    setRamos(r);
    setNombre(n);
    setCargado(true);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  const usarIcinf = async () => {
    await cargarMalla(db, 'Ing. Civil Informática · UBB', mallaIcinfUbb());
    await cargar();
  };

  const bajarDeMallapp = async () => {
    const url = urlDatosMallapp(link);
    if (!url) {
      Alert.alert('Ese link no me sirve', 'Copia el link de tu carrera en mallapp.cl. Se ve así: mallapp.cl/ues/ubiobio/ICINF');
      return;
    }
    setBajando(true);
    try {
      const r = await fetchConLimite(url, {}, 12_000);
      if (!r.ok) throw new Error('No encontré esa carrera en mallapp.cl.');
      const datos = leerMallapp(await r.json());
      const partes = link.trim().replace(/\/+$/, '').split('/');
      await cargarMalla(db, carrera.trim() || `${partes[partes.length - 1]} · ${partes[partes.length - 2]}`, datos);
      setLink('');
      await cargar();
    } catch (e) {
      Alert.alert('No se pudo bajar la malla', e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBajando(false);
    }
  };

  const armarAMano = async () => {
    await empezarMallaVacia(db, carrera.trim() || 'Mi carrera');
    await cargar();
    router.push('/malla-ramo');
  };

  const aprobados = new Set(ramos.filter((r) => r.status === 'aprobado').map((r) => r.id));

  const tocar = async (r: RamoMalla) => {
    const d = disponibilidad(r, aprobados);
    if (d === 'bloqueado') {
      const faltan = faltantes(r, ramos);
      Alert.alert(`Para ${r.name} te falta`, faltan.map((f) => `• ${f.name}`).join('\n'), [
        { text: 'Entendido', style: 'cancel' },
        { text: 'Marcar aprobado igual', onPress: () => cambiar(r, 'aprobado') },
      ]);
      return;
    }
    await cambiar(r, r.status === 'aprobado' ? 'pendiente' : 'aprobado');
  };

  const cambiar = async (r: RamoMalla, estado: RamoMalla['status']) => {
    setRamos((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: estado } : x)));
    if (estado === 'aprobado') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else Haptics.selectionAsync().catch(() => {});
    await cambiarEstadoMalla(db, r.id, estado);
  };

  const opciones = (r: RamoMalla) =>
    Alert.alert(r.name, `${nombreSemestre(r.semester)}${r.credits ? ` · ${r.credits} créditos` : ''}`, [
      r.status === 'cursando' ? { text: 'Ya no lo estoy cursando', onPress: () => cambiar(r, 'pendiente') } : { text: 'Lo estoy cursando', onPress: () => cambiar(r, 'cursando') },
      { text: 'Editar', onPress: () => router.push({ pathname: '/malla-ramo', params: { id: String(r.id) } }) },
      {
        text: 'Quitar de la malla',
        style: 'destructive',
        onPress: async () => {
          await eliminarRamoMalla(db, r.id);
          await cargar();
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);

  const menu = () =>
    Alert.alert('Tu malla', 'Si cambias de malla, se borra tu avance actual.', [
      { text: 'Agregar un ramo', onPress: () => router.push('/malla-ramo') },
      {
        text: 'Cambiar de malla',
        style: 'destructive',
        onPress: () =>
          Alert.alert('¿Cambiar de malla?', 'Se borran los ramos y lo que marcaste como aprobado.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Cambiar',
              style: 'destructive',
              onPress: async () => {
                await borrarMalla(db);
                await cargar();
              },
            },
          ]),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);

  if (!cargado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  // ---------- Sin malla: elegir de dónde sacarla ----------
  if (nombre == null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Malla' }} />
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppText variant="title">Arma tu malla</AppText>
          <AppText variant="callout" tone="secondary" style={{ marginTop: space.sm }}>
            Marca los ramos que vas aprobando y mira qué se te abre. Tu malla queda guardada solo en este teléfono.
          </AppText>

          <Card style={styles.opcion}>
            <AppText variant="overline" tone="accent">Viene incluida</AppText>
            <AppText variant="headline" style={{ marginTop: space.xs }}>Ing. Civil Informática · UBB</AppText>
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xs }}>60 ramos con prerrequisitos y créditos (de mallapp.cl). Funciona sin internet.</AppText>
            <Button label="Usar esta malla" onPress={usarIcinf} style={{ marginTop: space.md }} />
          </Card>

          <Card style={styles.opcion}>
            <AppText variant="overline" tone="tertiary">Otra carrera de mallapp.cl</AppText>
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xs, marginBottom: space.md }}>
              Busca tu carrera en mallapp.cl, copia el link y pégalo aquí.
            </AppText>
            <Field value={link} onChangeText={setLink} placeholder="mallapp.cl/ues/ubiobio/ICIN" autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="Link de mallapp.cl" />
            <Button label="Bajar malla" variant="secondary" onPress={bajarDeMallapp} disabled={!link.trim()} loading={bajando} style={{ marginTop: space.md }} />
          </Card>

          <Card style={styles.opcion}>
            <AppText variant="overline" tone="tertiary">¿Tu carrera no está?</AppText>
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xs, marginBottom: space.md }}>
              Ármala tú: agregas cada ramo con su semestre, créditos y prerrequisitos.
            </AppText>
            <Field value={carrera} onChangeText={setCarrera} placeholder="Ej: Ingeniería Civil" maxLength={60} accessibilityLabel="Nombre de la carrera" />
            <Button label="Armar mi malla" variant="secondary" onPress={armarAMano} style={{ marginTop: space.md }} />
          </Card>
          {bajando ? <ActivityIndicator color={colors.accent} style={{ marginTop: space.lg }} /> : null}
        </ScrollView>
      </>
    );
  }

  // ---------- Con malla ----------
  const p = progreso(ramos);
  const grupos = porSemestre(ramos);

  return (
    <>
      <Stack.Screen options={{ title: 'Malla', headerRight: () => <IconButton icon="ellipsis-horizontal" accessibilityLabel="Opciones de la malla" onPress={menu} /> }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <AppText variant="overline" tone="tertiary">{nombre}</AppText>
        <View style={[styles.fila, { marginTop: space.sm }]}>
          <AppText variant="display" tabular>{p.porcentaje}%</AppText>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <AppText variant="callout" tabular>{p.aprobados} de {p.total} ramos</AppText>
            {p.creditos > 0 ? <AppText variant="caption" tone="tertiary" tabular>{p.creditosAprobados} de {p.creditos} créditos</AppText> : null}
          </View>
        </View>
        <View style={{ marginTop: space.md }}>
          <ProgressBar value={p.porcentaje} max={100} />
        </View>
        <View style={[styles.leyenda, { marginTop: space.lg }]}>
          <Leyenda color={colors.accent} texto="Aprobado" />
          <Leyenda color={colors.warning} texto="Cursando" />
          <Leyenda color={colors.textTertiary} texto="Bloqueado" icono="lock-closed" />
        </View>
        <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
          Toca para marcar aprobado. Mantén presionado para más opciones.
        </AppText>

        {!ramos.length ? (
          <Card style={{ marginTop: space.xxl }}>
            <AppText variant="callout">Tu malla está vacía. Agrega tus ramos semestre por semestre.</AppText>
          </Card>
        ) : null}

        {grupos.map((g) => (
          <View key={g.semestre} style={{ marginTop: space.xxl }}>
            <View style={styles.cabecera}>
              <AppText variant="overline" tone="tertiary">{nombreSemestre(g.semestre)}</AppText>
              <AppText variant="caption" tone="tertiary" tabular>
                {g.ramos.filter((r) => r.status === 'aprobado').length}/{g.ramos.length}
              </AppText>
            </View>
            <View style={styles.grilla}>
              {g.ramos.map((r) => {
                const d = disponibilidad(r, aprobados);
                const bordes = { aprobado: colors.accent, cursando: colors.warning, disponible: colors.border, bloqueado: colors.border }[d];
                const fondo = d === 'aprobado' ? colors.accentSoft : d === 'cursando' ? colors.warningSoft : colors.surface;
                const nAbre = d === 'disponible' ? abre(r.id, ramos).length : 0;
                return (
                  <PressableScale
                    key={r.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: r.status === 'aprobado', disabled: d === 'bloqueado' }}
                    accessibilityLabel={`${r.name}. ${{ aprobado: 'Aprobado', cursando: 'Cursando', disponible: 'Disponible', bloqueado: 'Bloqueado, te faltan prerrequisitos' }[d]}`}
                    accessibilityHint="Toca para marcar aprobado. Mantén presionado para más opciones."
                    onPress={() => tocar(r)}
                    onLongPress={() => opciones(r)}
                    style={[styles.ramo, { backgroundColor: fondo, borderColor: bordes, opacity: d === 'bloqueado' ? 0.5 : 1 }]}
                  >
                    <View style={styles.ramoTop}>
                      <AppText variant="caption" numberOfLines={3} style={{ flex: 1, fontFamily: 'Inter_600SemiBold' }}>
                        {r.name}
                      </AppText>
                      {d === 'aprobado' ? <Ionicons name="checkmark-circle" size={16} color={colors.accent} /> : null}
                      {d === 'bloqueado' ? <Ionicons name="lock-closed" size={13} color={colors.textTertiary} /> : null}
                    </View>
                    <AppText variant="caption" tone={d === 'cursando' ? 'warning' : 'tertiary'} numberOfLines={1} style={{ marginTop: space.xs, fontSize: 11 }}>
                      {[d === 'cursando' ? 'Cursando' : null, r.credits ? `${r.credits} SCT` : null, nAbre ? `abre ${nAbre}` : null].filter(Boolean).join(' · ') || ' '}
                    </AppText>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ))}

        <Button label="Agregar ramo" variant="secondary" onPress={() => router.push('/malla-ramo')} style={{ marginTop: space.xxl }} />
        {nombre.includes('UBB') ? (
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.lg }}>Datos de la malla: mallapp.cl</AppText>
        ) : null}
      </ScrollView>
    </>
  );
}

function Leyenda({ color, texto, icono }: { color: string; texto: string; icono?: 'lock-closed' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      {icono ? <Ionicons name={icono} size={11} color={color} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />}
      <AppText variant="caption" tone="secondary">{texto}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  opcion: { marginTop: space.xl, padding: space.lg },
  fila: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  leyenda: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.md },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  ramo: { width: '48.5%', minHeight: 76, padding: space.md, borderRadius: radius.md, borderWidth: 1, justifyContent: 'space-between' },
  ramoTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
});

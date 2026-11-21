/**
 * Tus patrones: gráfico de ánimo, lo que Tinzit0 descubrió cruzando tu ánimo con tu sueño,
 * gym, estudio y gastos, las habilidades que más usas y cuánto te ayuda "Estoy a mil".
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';

import { Cerrado } from '@/bienestar/Cerrado';
import { descubrirPatrones, nombreHabilidad, resumenParaTerapia, type Descubrimiento, type DiaBienestar } from '@/bienestar/logica';
import { useCandadoBienestar } from '@/bienestar/privacidad';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { LineChart } from '@/components/LineChart';
import { contarImpulsos, datosBienestar, efectoCalma, listarTarjetas, type Tarjeta } from '@/database/bienestar';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { toISODate } from '@/utils/fechas';

const RANGOS = [14, 30, 90];
const uno = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-CL');

export function PatronesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { estado, abrir } = useCandadoBienestar();
  const [rango, setRango] = useState(30);
  const [dias, setDias] = useState<DiaBienestar[]>([]);
  const [hallazgos, setHallazgos] = useState<Descubrimiento[]>([]);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [calma, setCalma] = useState<{ veces: number; bajaPromedio: number | null }>({ veces: 0, bajaPromedio: null });

  const cargar = useCallback(async () => {
    const hoy = new Date();
    const desde = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (rango - 1)));
    const [d, largo, t, c] = await Promise.all([datosBienestar(db, rango), datosBienestar(db, 120), listarTarjetas(db, desde, toISODate()), efectoCalma(db)]);
    setDias(d);
    setHallazgos(descubrirPatrones(largo)); // los patrones usan más días para ser confiables
    setTarjetas(t);
    setCalma(c);
  }, [db, rango]);

  useFocusEffect(
    useCallback(() => {
      if (estado === 'abierto') cargar().catch(console.warn);
    }, [cargar, estado]),
  );

  if (estado !== 'abierto') {
    return (
      <>
        <Stack.Screen options={{ title: 'Tus patrones' }} />
        <Cerrado onAbrir={abrir} revisando={estado === 'revisando'} />
      </>
    );
  }

  const conAnimo = dias.filter((d) => d.animo != null);
  const puntos = conAnimo.map((d) => ({ label: d.fecha.slice(8, 10) + '/' + d.fecha.slice(5, 7), value: d.animo! }));
  const conteo = new Map<string, number>();
  for (const t of tarjetas) for (const h of t.habilidades) conteo.set(h, (conteo.get(h) ?? 0) + 1);
  const top = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const compartir = async () => {
    const desde = dias[0]?.fecha ?? toISODate();
    const i = await contarImpulsos(db, desde, toISODate());
    await Share.share({ message: resumenParaTerapia(tarjetas, i, desde, toISODate()) });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Tus patrones' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <View style={styles.wrap}>
          {RANGOS.map((r) => (
            <Chip key={r} compact label={`${r} días`} selected={rango === r} onPress={() => setRango(r)} />
          ))}
        </View>

        {conAnimo.length < 2 ? (
          <View style={{ marginTop: space.xxl, gap: space.lg }}>
            <EmptyState
              icon="analytics-outline"
              title="Tus patrones aparecen aquí"
              description="Marca tu ánimo unos días seguidos. Con una semana empiezo a mostrarte qué te ayuda y qué te cuesta."
            />
            <Button label="Llenar la tarjeta de hoy" onPress={() => router.push('/tarjeta-diaria')} />
          </View>
        ) : (
          <>
            <AppText variant="overline" tone="tertiary" style={styles.titulo}>Ánimo</AppText>
            <Card>
              <AppText variant="display" tabular>{uno(conAnimo.reduce((s, d) => s + d.animo!, 0) / conAnimo.length)}</AppText>
              <AppText variant="caption" tone="tertiary">promedio de {conAnimo.length} días registrados (0 a 10)</AppText>
              <View style={{ marginTop: space.lg }}>
                <LineChart data={puntos} format={(v) => uno(v)} />
              </View>
            </Card>
          </>
        )}

        {hallazgos.length ? (
          <>
            <AppText variant="overline" tone="tertiary" style={styles.titulo}>Lo que descubrí</AppText>
            <View style={{ gap: space.sm }}>
              {hallazgos.map((h, k) => (
                <Card key={k} style={styles.fila}>
                  <Ionicons
                    name={h.icono as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={h.tono === 'alerta' ? colors.warning : colors.accent}
                  />
                  <AppText variant="callout" style={{ flex: 1 }}>{h.texto}</AppText>
                </Card>
              ))}
            </View>
          </>
        ) : conAnimo.length >= 2 ? (
          <AppText variant="callout" tone="secondary" style={{ marginTop: space.xxl }}>
            Sigue registrando tu ánimo: cuando haya suficientes días te muestro qué cosas lo suben o lo bajan.
          </AppText>
        ) : null}

        {top.length || calma.veces ? (
          <>
            <AppText variant="overline" tone="tertiary" style={styles.titulo}>Lo que te ayuda</AppText>
            <Card style={{ gap: space.md }}>
              {calma.veces ? (
                <AppText variant="callout">
                  Usaste "Estoy a mil" {calma.veces} {calma.veces === 1 ? 'vez' : 'veces'}
                  {calma.bajaPromedio != null && calma.bajaPromedio > 0 ? `: en promedio la intensidad bajó ${uno(calma.bajaPromedio)} puntos.` : '.'}
                </AppText>
              ) : null}
              {top.map(([h, n]) => (
                <View key={h} style={styles.fila}>
                  <AppText variant="callout" style={{ flex: 1 }}>{nombreHabilidad(h)}</AppText>
                  <AppText variant="callout" tone="secondary" tabular>{n} {n === 1 ? 'vez' : 'veces'}</AppText>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <Button label="Compartir con mi psicólogo/a" variant="secondary" onPress={compartir} style={{ marginTop: space.xxl }} />
        <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm, textAlign: 'center' }}>
          Crea un resumen de estos {rango} días que puedes mandar por WhatsApp o correo.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  titulo: { marginTop: space.xxl, marginBottom: space.md },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

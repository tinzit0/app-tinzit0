/**
 * Ajustes del cerebro de IA dentro del celular:
 * descargar el modelo (una vez), ver el progreso, activarlo/desactivarlo y borrarlo.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { cambiarIaActiva, cancelarDescarga, descargarIA, eliminarIA, iaActivada, iaDescargada, iaSoportada, TAM_DESCARGA } from '@/ia/modelo';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { ProgressBar } from './ProgressBar';

export function IaSettings() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const soportada = iaSoportada();
  const [descargada, setDescargada] = useState(false);
  const [activa, setActiva] = useState(false);
  const [progreso, setProgreso] = useState<number | null>(null);

  const cargar = async () => {
    setDescargada(await iaDescargada(db));
    setActiva(await iaActivada(db));
  };

  useEffect(() => {
    if (!soportada) return;
    let vivo = true;
    Promise.all([iaDescargada(db), iaActivada(db)])
      .then(([d, a]) => {
        if (!vivo) return;
        setDescargada(d);
        setActiva(a);
      })
      .catch(console.warn);
    return () => {
      vivo = false;
    };
  }, [db, soportada]);

  const descargar = () =>
    Alert.alert(
      'Descargar cerebro de IA',
      `Son ${TAM_DESCARGA}. Te recomiendo hacerlo con WiFi. Es gratis, se descarga una sola vez y después funciona sin internet. Si se corta, puedes retomarla.`,
      [
        { text: 'Ahora no', style: 'cancel' },
        {
          text: 'Descargar',
          onPress: async () => {
            setProgreso(0);
            try {
              await descargarIA(db, setProgreso);
              await cargar();
              Alert.alert('Listo', 'Tinzit0 ya tiene su cerebro de IA. Pregúntale lo que quieras.');
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (!/abort/i.test(msg)) Alert.alert('No se pudo descargar', 'Revisa tu conexión e inténtalo de nuevo; la descarga continúa donde quedó.');
            } finally {
              setProgreso(null);
            }
          },
        },
      ],
    );

  const borrar = () =>
    Alert.alert('¿Borrar el cerebro de IA?', `Liberas ${TAM_DESCARGA}. Tinzit0 seguirá funcionando con sus reglas y lo que aprendió.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await eliminarIA(db);
          await cargar();
        },
      },
    ]);

  if (!soportada) {
    return (
      <AppText variant="caption" tone="tertiary">
        La IA dentro del celular funciona en la app instalada (no en Expo Go ni en el navegador).
      </AppText>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      <AppText variant="caption" tone="secondary">
        Con IA, Tinzit0 entiende preguntas dichas de cualquier forma y te da consejos con tus datos. Funciona dentro del celular: gratis, sin
        internet y sin cuentas. Los comandos comunes siguen siendo instantáneos; la IA tarda unos segundos y gasta algo más de batería.
      </AppText>

      {progreso !== null ? (
        <View style={{ gap: space.sm }}>
          <ProgressBar value={progreso} max={1} />
          <View style={styles.fila}>
            <AppText variant="caption" tone="secondary" tabular>Descargando… {Math.round(progreso * 100)}%</AppText>
            <Button label="Pausar" variant="secondary" onPress={cancelarDescarga} style={{ minHeight: 36, paddingHorizontal: space.md }} />
          </View>
        </View>
      ) : descargada ? (
        <>
          <View style={styles.fila}>
            <View style={{ flex: 1 }}>
              <AppText variant="callout">Usar IA</AppText>
              <AppText variant="caption" tone="tertiary">Modelo Qwen 3 · {TAM_DESCARGA} · en tu celular</AppText>
            </View>
            <Switch
              value={activa}
              onValueChange={(v) => {
                setActiva(v);
                cambiarIaActiva(db, v).catch(console.warn);
              }}
              trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
              thumbColor={activa ? colors.onAccent : '#f4f4f4'}
              accessibilityLabel="Usar IA"
            />
          </View>
          <Button label="Borrar cerebro de IA" variant="danger" onPress={borrar} />
        </>
      ) : (
        <Button label={`Descargar cerebro de IA (${TAM_DESCARGA})`} onPress={descargar} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
});

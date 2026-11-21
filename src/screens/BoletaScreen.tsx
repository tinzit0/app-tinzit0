/**
 * Escanear una boleta: foto → el celular lee el texto (sin internet) → total, local y fecha
 * → abre el formulario de gasto ya lleno para que solo confirmes.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { leerBoleta } from '@/finanzas/boleta';
import { leerTextoDeImagen, liberarOCR, ocrSoportado } from '@/ia/ocr';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export function BoletaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [foto, setFoto] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<number | null>(null);

  useEffect(() => () => liberarOCR(), []);

  const elegir = async (camara: boolean) => {
    try {
      if (camara && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        Alert.alert('Sin cámara', 'Activa el permiso de cámara para Tinzit0 en Ajustes del celular.');
        return;
      }
      const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: true };
      const r = camara ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
      if (r.canceled || !r.assets[0]) return;
      setFoto(r.assets[0].uri);
      await leer(r.assets[0].uri);
    } catch (e) {
      Alert.alert('No se pudo abrir', e instanceof Error ? e.message : String(e));
    }
  };

  const leer = async (uri: string) => {
    if (!ocrSoportado()) {
      Alert.alert('No disponible', 'El lector de boletas funciona en la app instalada (APK).');
      return;
    }
    setLeyendo(true);
    setProgreso(null);
    try {
      const texto = await leerTextoDeImagen(uri, (p) => setProgreso(p < 1 ? p : null));
      const b = leerBoleta(texto);
      if (!b.monto) {
        Alert.alert('No encontré el total', 'Prueba con más luz y la boleta estirada, o anota el monto a mano.', [
          { text: 'Reintentar', style: 'cancel' },
          { text: 'Anotar a mano', onPress: () => router.replace({ pathname: '/gasto', params: { cat: b.categoria, nota: b.comercio ?? '', fecha: b.fecha } }) },
        ]);
        return;
      }
      router.replace({
        pathname: '/gasto',
        params: { monto: String(b.monto), cat: b.categoria, nota: b.comercio ? `${b.comercio} (boleta)` : 'Boleta', fecha: b.fecha },
      });
    } catch (e) {
      Alert.alert('No pude leer la boleta', `${e instanceof Error ? e.message : String(e)}\n\nSi es la primera vez, revisa tu conexión: necesito descargar el lector una vez.`);
    } finally {
      setLeyendo(false);
      setProgreso(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Escanear boleta' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <View style={[styles.foto, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {foto ? (
            <Image source={{ uri: foto }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel="Foto de la boleta" />
          ) : (
            <View style={styles.vacia}>
              <Ionicons name="receipt-outline" size={44} color={colors.textTertiary} />
              <AppText variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
                Saca una foto a la boleta, derecha y con buena luz. Leo el total, el local y la fecha, y te dejo el gasto listo para confirmar.
              </AppText>
            </View>
          )}
        </View>

        {leyendo ? (
          <View style={{ marginTop: space.lg, gap: space.sm }}>
            <AppText variant="callout">{progreso != null ? `Descargando el lector (solo la primera vez)… ${Math.round(progreso * 100)}%` : 'Leyendo la boleta…'}</AppText>
            {progreso != null ? <ProgressBar value={progreso} max={1} /> : null}
          </View>
        ) : null}

        <View style={{ gap: space.md, marginTop: space.xl }}>
          <Button label="Sacar foto" onPress={() => elegir(true)} loading={leyendo} />
          <Button label="Elegir de la galería" variant="secondary" onPress={() => elegir(false)} disabled={leyendo} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  foto: { height: 340, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  vacia: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
});

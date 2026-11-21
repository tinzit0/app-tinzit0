/**
 * Escanear apuntes: sacas una foto (o eliges una) y el celular lee el texto,
 * sin internet (el lector se descarga una vez, ~45 MB). Después lo corriges,
 * lo guardas como nota o creas tarjetas.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ProgressBar } from '@/components/ProgressBar';
import { crearTarjetas, listarRamosSimple, type Ramo } from '@/database/estudio';
import { guardarNota } from '@/database/notas';
import { tarjetasConIA } from '@/estudio/conIA';
import { leerTextoDeImagen, liberarOCR, ocrSoportado } from '@/ia/ocr';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { fechaLarga } from '@/utils/fechas';

export function EscanearScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [ramo, setRamo] = useState<number | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    listarRamosSimple(db).then(setRamos).catch(console.warn);
    return () => liberarOCR(); // libera la memoria del lector al salir
  }, [db]);

  const elegir = async (camara: boolean) => {
    try {
      if (camara) {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) {
          Alert.alert('Sin cámara', 'Activa el permiso de cámara para Tinzit0 en Ajustes del celular.');
          return;
        }
      }
      const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: true };
      const r = camara ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
      if (r.canceled || !r.assets[0]) return;
      const uri = r.assets[0].uri;
      setFoto(uri);
      await leer(uri);
    } catch (e) {
      Alert.alert('No se pudo abrir', e instanceof Error ? e.message : String(e));
    }
  };

  const leer = async (uri: string) => {
    if (!ocrSoportado()) {
      Alert.alert('No disponible', 'El lector de texto funciona en la app instalada (APK).');
      return;
    }
    setLeyendo(true);
    setProgreso(null);
    try {
      const t = await leerTextoDeImagen(uri, (p) => setProgreso(p < 1 ? p : null));
      if (!t.trim()) {
        Alert.alert('No encontré texto', 'Prueba con más luz, la hoja derecha y más cerca. Funciona mejor con letra clara o impresa.');
        return;
      }
      setTexto((anterior) => (anterior.trim() ? `${anterior.trim()}\n\n${t}` : t));
    } catch (e) {
      Alert.alert('No pude leer la foto', `${e instanceof Error ? e.message : String(e)}\n\nSi es la primera vez, revisa tu conexión: necesito descargar el lector una vez.`);
    } finally {
      setLeyendo(false);
      setProgreso(null);
    }
  };

  const nombreRamo = ramos.find((r) => r.id === ramo)?.name;

  const guardar = async () => {
    await guardarNota(db, null, `📷 Apuntes${nombreRamo ? ` de ${nombreRamo}` : ''} · ${fechaLarga()}\n\n${texto.trim()}`);
    Alert.alert('Guardado en Notas ✓', 'Lo encuentras en la pestaña Notas.', [
      { text: 'Escanear otra', style: 'cancel', onPress: () => { setFoto(null); setTexto(''); } },
      { text: 'Ver notas', onPress: () => router.navigate('/notas') },
    ]);
  };

  const tarjetas = async () => {
    setOcupado(true);
    try {
      const { tarjetas: t, conIA } = await tarjetasConIA(db, texto);
      if (!t.length) {
        Alert.alert('Sin tarjetas', 'No encontré definiciones tipo "término: definición". Descarga la IA en Ajustes para que las arme sola.');
        return;
      }
      await crearTarjetas(db, ramo, t);
      Alert.alert(`${t.length} tarjetas creadas`, conIA ? 'La IA armó las preguntas.' : 'Las armé con las definiciones de tus apuntes.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Repasar', onPress: () => router.push('/tarjetas') },
      ]);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Escanear apuntes' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <Button label="Sacar foto" onPress={() => elegir(true)} disabled={leyendo} style={{ flex: 1 }} />
          <Button label="Galería" variant="secondary" onPress={() => elegir(false)} disabled={leyendo} style={{ flex: 1 }} />
        </View>

        {foto ? (
          <View style={[styles.foto, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Image source={{ uri: foto }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel="Foto de tus apuntes" />
          </View>
        ) : (
          <View style={[styles.foto, styles.vacia, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="scan-outline" size={40} color={colors.textTertiary} />
            <AppText variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
              Saca una foto a tu cuaderno, una guía o la pizarra. Leo el texto sin internet.
            </AppText>
          </View>
        )}

        {leyendo ? (
          <View style={{ marginTop: space.lg, gap: space.sm }}>
            <AppText variant="callout">{progreso != null ? `Descargando el lector (solo la primera vez)… ${Math.round(progreso * 100)}%` : 'Leyendo el texto…'}</AppText>
            {progreso != null ? <ProgressBar value={progreso} max={1} /> : null}
          </View>
        ) : null}

        {texto ? (
          <>
            <AppText variant="overline" tone="tertiary" style={{ marginTop: space.xxl, marginBottom: space.sm }}>Texto (puedes corregirlo)</AppText>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              multiline
              accessibilityLabel="Texto leído de la foto"
              style={[type.body, styles.texto, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            />
            {ramos.length ? (
              <View style={[styles.wrap, { marginTop: space.lg }]}>
                {ramos.map((r) => (
                  <Chip key={r.id} compact label={r.name} selected={ramo === r.id} onPress={() => setRamo(ramo === r.id ? null : r.id)} leading={<View style={[styles.punto, { backgroundColor: r.color }]} />} />
                ))}
              </View>
            ) : null}
            <View style={{ gap: space.md, marginTop: space.xl }}>
              <Button label="Guardar como nota" onPress={guardar} disabled={ocupado} />
              <Button label="Crear tarjetas de estudio" variant="secondary" onPress={tarjetas} loading={ocupado} />
              <Button label="Agregar otra página" variant="secondary" onPress={() => elegir(true)} disabled={leyendo || ocupado} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  row: { flexDirection: 'row', gap: space.md },
  foto: { marginTop: space.lg, height: 260, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  vacia: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  texto: { minHeight: 200, borderRadius: radius.md, borderWidth: 1, padding: space.lg, textAlignVertical: 'top' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  punto: { width: 10, height: 10, borderRadius: 5 },
});

/**
 * Pantalla de rescate: si la app no puede abrir (base de datos dañada, una migración falló o una
 * pantalla se cayó), en vez de quedar en blanco muestra qué pasó y deja reintentar.
 * Tus datos NO se borran: la base queda tal cual y la próxima versión puede repararla.
 * No usa el tema (puede fallar antes de cargarlo): colores fijos grafito + lima.
 */
import { reloadAppAsync } from 'expo';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = { error: Error; reintentar?: () => void };

export function ErrorInicio({ error, reintentar }: Props) {
  const reiniciar = () => {
    if (reintentar) reintentar();
    else reloadAppAsync('Reintentar tras error').catch(() => {});
  };
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.titulo}>Algo falló al abrir Tinzit0</Text>
        <Text style={styles.texto}>
          Tus datos siguen guardados en el celular: no se borró nada. Prueba reintentar. Si se repite, reinicia el celular o
          instala la última versión de la app.
        </Text>
        <Pressable onPress={reiniciar} style={styles.boton} accessibilityRole="button" accessibilityLabel="Reintentar">
          <Text style={styles.botonTxt}>Reintentar</Text>
        </Pressable>
        <Text style={styles.detalle} selectable>
          Detalle: {error?.message ?? String(error)}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0B0B0C' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 16 },
  titulo: { color: '#F4F4F2', fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  texto: { color: '#A1A1A6', fontSize: 16, lineHeight: 22 },
  boton: { backgroundColor: '#CFF56B', borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  botonTxt: { color: '#0B0B0C', fontSize: 16, fontWeight: '600' },
  detalle: { color: '#6B6B70', fontSize: 12, marginTop: 12 },
});

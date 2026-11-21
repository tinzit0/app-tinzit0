/**
 * Ajustes del clima: buscar una ciudad o usar la ubicación del celular.
 * La ubicación se guarda redondeada (~1 km), solo para pedir el pronóstico.
 */
import * as Location from 'expo-location';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { buscarCiudades, guardarUbicacion, obtenerUbicacion, UBICACION_DEFECTO, type Ubicacion } from '@/clima/clima';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

export function ClimaSettings() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [actual, setActual] = useState<Ubicacion>(UBICACION_DEFECTO);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Ubicacion[]>([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    obtenerUbicacion(db).then(setActual);
  }, [db]);

  const elegir = async (u: Ubicacion) => {
    await guardarUbicacion(db, u);
    setActual(u);
    setResultados([]);
    setBusqueda('');
  };

  const pedido = useRef(0);
  const buscar = async () => {
    if (busqueda.trim().length < 2) return;
    const mio = ++pedido.current; // solo vale la última búsqueda
    setOcupado(true);
    try {
      const r = await buscarCiudades(busqueda.trim());
      if (mio !== pedido.current) return;
      setResultados(r);
      if (!r.length) Alert.alert('Sin resultados', 'No encontré esa ciudad. Prueba con otro nombre.');
    } catch {
      Alert.alert('Sin conexión', 'No pude buscar la ciudad. Revisa tu internet.');
    } finally {
      setOcupado(false);
    }
  };

  const usarGPS = async () => {
    setOcupado(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        Alert.alert('Sin permiso', 'Para usar tu ubicación, permite el acceso a ubicación en Ajustes del celular.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      let nombre = 'Mi ubicación';
      try {
        const [lugar] = await Location.reverseGeocodeAsync(pos.coords);
        if (lugar?.city || lugar?.subregion) nombre = (lugar.city ?? lugar.subregion)!;
      } catch {
        // sin nombre, no importa
      }
      await elegir({ nombre, lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch {
      Alert.alert('No se pudo', 'No pude obtener tu ubicación. Intenta de nuevo al aire libre o busca tu ciudad.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <View>
      <AppText variant="callout" tone="secondary" style={{ marginBottom: space.sm }}>
        Ciudad del clima: <AppText variant="callout">{actual.nombre}</AppText>
      </AppText>
      <View style={[styles.search, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          onSubmitEditing={buscar}
          placeholder="Buscar ciudad…"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
          accessibilityLabel="Buscar ciudad"
          style={[type.body, { flex: 1, color: colors.text, paddingVertical: space.sm }]}
        />
        {ocupado ? <ActivityIndicator color={colors.accent} /> : null}
      </View>
      {resultados.map((r) => (
        <Pressable key={`${r.lat},${r.lon}`} onPress={() => elegir(r)} style={styles.resultado} accessibilityRole="button">
          <AppText variant="callout">{r.nombre}</AppText>
        </Pressable>
      ))}
      <Button label="Usar mi ubicación" variant="secondary" onPress={usarGPS} style={{ marginTop: space.md }} />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, minHeight: 46 },
  resultado: { paddingVertical: space.md, paddingHorizontal: space.xs, minHeight: 44, justifyContent: 'center' },
});

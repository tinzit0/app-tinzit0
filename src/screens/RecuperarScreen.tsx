/**
 * Poner una contraseña nueva. Se abre desde el enlace del correo "¿Olvidaste tu contraseña?"
 * (tinzit0://recuperar#access_token=…), que trae una sesión temporal.
 */
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { errorAmable } from '@/nube/cliente';
import { cambiarContrasena, sesionDesdeEnlace } from '@/nube/cuenta';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export function RecuperarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const url = Linking.useLinkingURL();
  const [listo, setListo] = useState<boolean | null>(null);
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!url) return;
    sesionDesdeEnlace(url)
      .then(setListo)
      .catch(() => setListo(false));
  }, [url]);

  const guardar = async () => {
    if (clave.length < 8) return Alert.alert('Contraseña muy corta', 'Usa al menos 8 caracteres.');
    if (clave !== clave2) return Alert.alert('No coinciden', 'Escribe la misma contraseña dos veces.');
    setOcupado(true);
    try {
      await cambiarContrasena(clave);
      Alert.alert('Contraseña cambiada ✓', 'Ya puedes usar tu nueva contraseña.');
      router.replace('/cuenta');
    } catch (e) {
      Alert.alert('No se pudo cambiar', errorAmable(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Nueva contraseña' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {listo === false ? (
          <>
            <AppText variant="headline">Este enlace ya no sirve</AppText>
            <AppText variant="callout" tone="secondary" style={{ marginTop: space.sm }}>
              Los enlaces duran poco. Pide uno nuevo en Cuenta → Iniciar sesión → ¿Olvidaste tu contraseña?
            </AppText>
            <Button label="Ir a Cuenta" onPress={() => router.replace('/cuenta')} style={{ marginTop: space.xl }} />
          </>
        ) : (
          <>
            <AppText variant="title">Elige una contraseña nueva</AppText>
            <Field label="Contraseña nueva" value={clave} onChangeText={setClave} secureTextEntry autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
            <Field label="Repítela" value={clave2} onChangeText={setClave2} secureTextEntry autoComplete="new-password" />
            <Button label="Guardar contraseña" onPress={guardar} loading={ocupado} disabled={!listo || !clave} style={{ marginTop: space.xl }} />
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xxxl * 2 },
});

/**
 * Ajustes del asistente:
 * - Escuchar "ey Tinzit0" mientras la app está abierta.
 * - Responder también con voz (o solo texto).
 * - Inteligencia artificial (Claude) con tu propia API key.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { getSetting, setSetting } from '@/database/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { borrarApiKey, cambiarIaActivada, guardarApiKey, iaActivada, tieneApiKey } from '@/voice/iaConfig';
import { useVoz } from '@/voice/VozProvider';
import { AppText } from './AppText';
import { Button } from './Button';

export function AsistenteSettings() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { vozDisponible, escuchaActiva, cambiarEscuchaActiva } = useVoz();
  const [hablarOn, setHablarOn] = useState(true);
  const [hayKey, setHayKey] = useState(false);
  const [iaOn, setIaOn] = useState(false);
  const [key, setKey] = useState('');

  useEffect(() => {
    getSetting(db, 'voz_respuesta').then((v) => setHablarOn(v !== '0'));
    tieneApiKey().then(setHayKey);
    iaActivada(db).then(setIaOn);
  }, [db]);

  const fila = (titulo: string, detalle: string, valor: boolean, cambiar: (v: boolean) => void, deshabilitado = false, borde = false) => (
    <View style={[styles.row, borde && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <AppText variant="callout">{titulo}</AppText>
        <AppText variant="caption" tone="tertiary">{detalle}</AppText>
      </View>
      <Switch
        value={valor}
        disabled={deshabilitado}
        onValueChange={cambiar}
        trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
        thumbColor={valor ? colors.onAccent : '#f4f4f4'}
        accessibilityLabel={titulo}
      />
    </View>
  );

  const guardar = async () => {
    const k = key.trim();
    if (!k.startsWith('sk-ant-')) {
      Alert.alert('Revisa la key', 'Las API keys de Anthropic empiezan con "sk-ant-".');
      return;
    }
    await guardarApiKey(k);
    await cambiarIaActivada(db, true);
    setKey('');
    setHayKey(true);
    setIaOn(true);
    Alert.alert('Listo ✨', 'Tu API key quedó guardada cifrada en el celular. El asistente ahora usa la IA.');
  };

  const quitar = () =>
    Alert.alert('¿Borrar la API key?', 'El asistente volverá a funcionar solo sin internet.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await borrarApiKey();
          await cambiarIaActivada(db, false);
          setHayKey(false);
          setIaOn(false);
        },
      },
    ]);

  return (
    <View>
      {fila(
        'Escuchar "ey Tinzit0"',
        vozDisponible
          ? 'Solo con la app abierta. Gasta algo más de batería y Android puede sonar un "bip" al reactivar el micrófono.'
          : 'Disponible en la app instalada (no en Expo Go).',
        escuchaActiva,
        (v) => {
          cambiarEscuchaActiva(v).catch(console.warn);
        },
        !vozDisponible,
      )}
      {fila(
        'Responder con voz',
        'Además del texto, Tinzit0 te contesta hablando.',
        hablarOn,
        (v) => {
          setHablarOn(v);
          setSetting(db, 'voz_respuesta', v ? '1' : '0').catch(console.warn);
        },
        false,
        true,
      )}

      {/* Inteligencia artificial */}
      <View style={[styles.ia, { borderTopColor: colors.border }]}>
        <AppText variant="headline">Inteligencia artificial ✨</AppText>
        <AppText variant="caption" tone="secondary" style={{ marginTop: 4 }}>
          Con Claude, el asistente entiende cualquier frase, puede hacer varias cosas en un mensaje y te da consejos con tus datos. Usa
          internet y se cobra a tu cuenta de Anthropic (cada mensaje cuesta muy poco). Para responder, envía un resumen de tus datos a
          Anthropic. Sin internet, sigue funcionando el modo normal.
        </AppText>

        {hayKey ? (
          <>
            {fila('Usar IA (Claude)', 'Puedes apagarla cuando quieras sin borrar la key.', iaOn, (v) => {
              setIaOn(v);
              cambiarIaActivada(db, v).catch(console.warn);
            })}
            <Button label="Borrar API key" variant="danger" onPress={quitar} />
          </>
        ) : (
          <>
            <TextInput
              value={key}
              onChangeText={setKey}
              placeholder="Pega aquí tu API key (sk-ant-…)"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="API key de Anthropic"
              style={[type.body, styles.input, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            />
            <Button label="Guardar y activar IA" onPress={guardar} disabled={key.trim().length < 20} style={{ marginTop: space.sm }} />
            <Pressable onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')} hitSlop={8} style={{ marginTop: space.md }}>
              <AppText variant="caption" tone="accent">¿No tienes una? Créala en console.anthropic.com →</AppText>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  ia: { borderTopWidth: 1, paddingTop: space.lg, marginTop: space.xs, gap: space.sm },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg, marginTop: space.sm },
});

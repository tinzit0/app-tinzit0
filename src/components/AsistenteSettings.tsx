/**
 * Ajustes del asistente de voz:
 * - Escuchar "ey Tinzit0" mientras la app está abierta.
 * - Responder también con voz (o solo texto).
 */
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { getSetting, setSetting } from '@/database/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { useVoz } from '@/voice/VozProvider';
import { AppText } from './AppText';

export function AsistenteSettings() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { vozDisponible, escuchaActiva, cambiarEscuchaActiva } = useVoz();
  const [hablarOn, setHablarOn] = useState(true);

  useEffect(() => {
    getSetting(db, 'voz_respuesta').then((v) => setHablarOn(v !== '0'));
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

  return (
    <View>
      {fila(
        'Escuchar "ey Tinzit0"',
        vozDisponible
          ? 'Solo con la app abierta. Gasta algo más de batería y Android puede sonar un "bip" al reactivar el micrófono.'
          : 'Disponible en el development build (no en Expo Go).',
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});

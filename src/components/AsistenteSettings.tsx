/**
 * Ajustes del asistente (todo gratis y sin internet):
 * - Personalidad: Jarvis (mayordomo elegante) o Cercano (chileno).
 * - Cómo te llama ("señor", tu nombre…).
 * - Voz: elegir entre las voces en español del celular y probarla.
 * - Escuchar "Jarvis" / "ey Tinzit0" mientras la app está abierta.
 * - Responder también con voz.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { getSetting, setSetting } from '@/database/queries';
import type { Estilo } from '@/jarvis/persona';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { configurarVoz, hablar, vocesEspanol, type VozEs } from '@/voice/hablar';
import { revisarCapacidadesVoz, textoPrivacidadVoz } from '@/voice/reconocedor';
import { useVoz } from '@/voice/VozProvider';
import { AppText } from './AppText';
import { SegmentedControl } from './SegmentedControl';

export function AsistenteSettings() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { vozDisponible, escuchaActiva, cambiarEscuchaActiva } = useVoz();
  const [hablarOn, setHablarOn] = useState(true);
  const [estilo, setEstilo] = useState<Estilo>('jarvis');
  const [trato, setTrato] = useState('');
  const [voces, setVoces] = useState<VozEs[]>([]);
  const [vozId, setVozId] = useState<string | null>(null);
  const [verVoces, setVerVoces] = useState(false);
  const [privacidadVoz, setPrivacidadVoz] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setHablarOn((await getSetting(db, 'voz_respuesta')) !== '0');
      setEstilo((await getSetting(db, 'asistente_estilo')) === 'cercano' ? 'cercano' : 'jarvis');
      setTrato((await getSetting(db, 'asistente_trato')) ?? '');
      setVozId(await getSetting(db, 'voz_id'));
      if (Platform.OS !== 'web') setVoces(await vocesEspanol());
      // Se revisa de verdad si el español está descargado para reconocer sin internet.
      setPrivacidadVoz(textoPrivacidadVoz(await revisarCapacidadesVoz(true)));
    })().catch(console.warn);
  }, [db]);

  const fila = (titulo: string, detalle: string, valor: boolean, cambiar: (v: boolean) => void, deshabilitado = false) => (
    <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
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

  const elegirVoz = (v: VozEs) => {
    setVozId(v.id);
    setSetting(db, 'voz_id', v.id).catch(console.warn);
    configurarVoz({ vozId: v.id, estilo });
    hablar(estilo === 'jarvis' ? `A tu servicio, ${trato || 'señor'}.` : '¡Hola! Así sueno yo.').catch(() => {});
  };

  const vozActual = voces.find((v) => v.id === vozId) ?? voces[0];

  return (
    <View>
      {privacidadVoz ? (
        <AppText variant="caption" tone="tertiary" style={{ marginBottom: space.lg }}>
          {privacidadVoz}
        </AppText>
      ) : null}
      <AppText variant="callout" tone="secondary" style={{ marginBottom: space.sm }}>Personalidad</AppText>
      <SegmentedControl<Estilo>
        value={estilo}
        onChange={(v) => {
          setEstilo(v);
          setSetting(db, 'asistente_estilo', v).catch(console.warn);
          configurarVoz({ estilo: v });
        }}
        options={[
          { value: 'jarvis', label: 'Estilo Jarvis' },
          { value: 'cercano', label: 'Cercano' },
        ]}
      />
      <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xs, marginBottom: space.md }}>
        {estilo === 'jarvis' ? 'Elegante y sereno, estilo mayordomo. "Enseguida, señor."' : 'Chileno y con buena onda. "¡Listo, anotado!"'}
      </AppText>

      {estilo === 'jarvis' ? (
        <>
          <AppText variant="callout" tone="secondary" style={{ marginBottom: space.sm }}>Cómo te llama</AppText>
          <TextInput
            value={trato}
            onChangeText={setTrato}
            onBlur={() => setSetting(db, 'asistente_trato', trato.trim()).catch(console.warn)}
            placeholder="señor (o tu nombre)"
            placeholderTextColor={colors.textTertiary}
            maxLength={20}
            accessibilityLabel="Cómo te llama el asistente"
            style={[type.body, styles.input, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          />
        </>
      ) : null}

      {voces.length > 0 ? (
        <View style={{ marginTop: space.lg }}>
          <Pressable onPress={() => setVerVoces((v) => !v)} style={styles.vozHeader} accessibilityRole="button" accessibilityState={{ expanded: verVoces }}>
            <View style={{ flex: 1 }}>
              <AppText variant="callout">Voz</AppText>
              <AppText variant="caption" tone="tertiary" numberOfLines={1}>{vozActual ? `${vozActual.nombre} · ${vozActual.idioma}` : 'Automática'}</AppText>
            </View>
            <Ionicons name={verVoces ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
          </Pressable>
          {verVoces
            ? voces.slice(0, 20).map((v) => (
                <Pressable key={v.id} onPress={() => elegirVoz(v)} style={styles.voz} accessibilityRole="radio" accessibilityState={{ selected: v.id === vozActual?.id }}>
                  <Ionicons name={v.id === vozActual?.id ? 'radio-button-on' : 'radio-button-off'} size={18} color={v.id === vozActual?.id ? colors.accent : colors.textTertiary} />
                  <AppText variant="callout" style={{ flex: 1 }} numberOfLines={1}>{v.nombre}</AppText>
                  <AppText variant="caption" tone="tertiary">{v.idioma}</AppText>
                </Pressable>
              ))
            : null}
          {verVoces ? (
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xs }}>
              Toca una voz para escucharla. ¿Quieres más voces? Instálalas gratis en Ajustes del celular → Texto a voz.
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: space.md }}>
        {fila(
          'Escuchar "Tinzit0" o "Jarvis"',
          vozDisponible
            ? 'Solo con la app abierta. Gasta algo más de batería y Android puede sonar un "bip" al reactivar el micrófono.'
            : 'Disponible en la app instalada (no en Expo Go).',
          escuchaActiva,
          (v) => {
            cambiarEscuchaActiva(v).catch(console.warn);
          },
          !vozDisponible,
        )}
        {fila('Responder con voz', 'Además del texto, el asistente te contesta hablando.', hablarOn, (v) => {
          setHablarOn(v);
          setSetting(db, 'voz_respuesta', v ? '1' : '0').catch(console.warn);
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  input: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg },
  vozHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  voz: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40 },
});

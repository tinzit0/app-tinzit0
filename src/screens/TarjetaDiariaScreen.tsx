/**
 * Tarjeta diaria (como la que usan en terapia DBT), en 30 segundos:
 * ánimo, emociones 0–5, impulsos y si actuaste, habilidades que usaste, sueño y una nota.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Cerrado } from '@/bienestar/Cerrado';
import { EMOCIONES, HABILIDADES, type ClaveEmocion } from '@/bienestar/logica';
import { useCandadoBienestar } from '@/bienestar/privacidad';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Escala } from '@/components/Escala';
import { Field } from '@/components/Field';
import { Stepper } from '@/components/Stepper';
import { guardarTarjeta, obtenerTarjeta } from '@/database/bienestar';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { fechaCorta, fromISODate, toISODate } from '@/utils/fechas';

export function TarjetaDiariaScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { estado, abrir } = useCandadoBienestar();
  const { fecha: fParam } = useLocalSearchParams<{ fecha?: string }>();
  const fecha = fParam ?? toISODate();
  const [animo, setAnimo] = useState<number | null>(null);
  const [emociones, setEmociones] = useState<Partial<Record<ClaveEmocion, number>>>({});
  const [impulso, setImpulso] = useState<number | null>(null);
  const [actue, setActue] = useState(false);
  const [habilidades, setHabilidades] = useState<string[]>([]);
  const [sueno, setSueno] = useState(7);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    obtenerTarjeta(db, fecha)
      .then((t) => {
        if (!t) return;
        setAnimo(t.animo);
        setEmociones(t.emociones);
        setImpulso(t.impulso);
        setActue(t.actue);
        setHabilidades(t.habilidades);
        if (t.sueno != null) setSueno(t.sueno);
        setNota(t.nota ?? '');
      })
      .catch(console.warn);
  }, [db, fecha]);

  if (estado !== 'abierto') {
    return (
      <>
        <Stack.Screen options={{ title: 'Tarjeta diaria' }} />
        <Cerrado onAbrir={abrir} revisando={estado === 'revisando'} />
      </>
    );
  }

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarTarjeta(db, { date: fecha, animo, emociones, impulso, actue: (impulso ?? 0) > 0 && actue, habilidades, sueno, nota });
      router.back();
    } finally {
      setGuardando(false);
    }
  };

  const esHoy = fecha === toISODate();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: esHoy ? 'Tarjeta de hoy' : `Tarjeta ${fechaCorta(fromISODate(fecha))}` }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="overline" tone="tertiary" style={styles.titulo}>Ánimo general</AppText>
        <Escala value={animo} onChange={setAnimo} etiquetas={['Muy mal', 'Muy bien']} accessibilityLabel="Ánimo de 0 a 10" />

        <AppText variant="overline" tone="tertiary" style={[styles.titulo, { marginTop: space.xxl }]}>Emociones (0 = nada, 5 = muchísimo)</AppText>
        <View style={{ gap: space.lg }}>
          {EMOCIONES.map((e) => (
            <View key={e.clave}>
              <AppText variant="callout" style={{ marginBottom: space.sm }}>{e.label}</AppText>
              <Escala max={5} value={emociones[e.clave] ?? null} onChange={(v) => setEmociones((x) => ({ ...x, [e.clave]: v }))} accessibilityLabel={`${e.label} de 0 a 5`} />
            </View>
          ))}
        </View>

        <AppText variant="overline" tone="tertiary" style={[styles.titulo, { marginTop: space.xxl }]}>Ganas de hacer algo impulsivo</AppText>
        <Escala max={5} value={impulso} onChange={setImpulso} etiquetas={['Nada', 'Muy fuertes']} accessibilityLabel="Impulsos de 0 a 5" />
        {(impulso ?? 0) > 0 ? (
          <View style={[styles.wrap, { marginTop: space.md }]}>
            <Chip label="No actué" selected={!actue} onPress={() => setActue(false)} />
            <Chip label="Actué por impulso" selected={actue} onPress={() => setActue(true)} />
          </View>
        ) : null}

        <AppText variant="overline" tone="tertiary" style={[styles.titulo, { marginTop: space.xxl }]}>Habilidades que usé</AppText>
        <View style={styles.wrap}>
          {HABILIDADES.map((h) => {
            const sel = habilidades.includes(h.clave);
            return (
              <Chip
                key={h.clave}
                compact
                label={h.nombre}
                selected={sel}
                onPress={() => setHabilidades((xs) => (sel ? xs.filter((x) => x !== h.clave) : [...xs, h.clave]))}
              />
            );
          })}
        </View>

        <View style={{ marginTop: space.xxl, flexDirection: 'row' }}>
          <Stepper label="Horas de sueño" value={sueno} onChange={setSueno} step={0.5} min={0} decimals fijo={1} suffix="h" />
        </View>

        <View style={{ marginTop: space.xxl }}>
          <Field
            label="¿Qué pasó hoy? (opcional)"
            value={nota}
            onChangeText={setNota}
            multiline
            placeholder="Lo que te activó, lo que te ayudó, algo para hablar en terapia…"
            style={{ minHeight: 96, textAlignVertical: 'top' }}
          />
        </View>

        <Button label="Guardar" onPress={guardar} loading={guardando} disabled={animo == null} style={{ marginTop: space.xxl }} />
        {animo == null ? (
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm, textAlign: 'center' }}>Marca al menos tu ánimo para guardar.</AppText>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  titulo: { marginBottom: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

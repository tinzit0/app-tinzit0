/**
 * Surfear un impulso (DBT): las ganas de hacer algo que después lamentas suben,
 * llegan a una cima y bajan solas si les das tiempo. Aquí las acompañas con un temporizador
 * y, al final, anotas si lo lograste. Ver tu cuenta de "olas surfeadas" motiva.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { faseImpulso } from '@/bienestar/logica';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { contarImpulsos, registrarCalma } from '@/database/bienestar';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const MINUTOS = [5, 10, 15, 20];
const MIENTRAS = [
  'Respira lento: 4 segundos adentro, 6 afuera.',
  'Moja tu cara con agua fría.',
  'Sal a caminar, aunque sea a la esquina.',
  'Escríbele a alguien de confianza (no a quien te activa).',
  'Pon una canción que te guste y cántala.',
  'Aprieta un hielo en la mano.',
  'Dúchate con agua tibia y fíjate en la sensación.',
  'Piensa: ¿cómo me voy a sentir mañana si no lo hago?',
];

function Temporizador({ total, onFin }: { total: number; onFin: () => void }) {
  const { colors } = useTheme();
  const [inicio] = useState(Date.now);
  const [ahora, setAhora] = useState(Date.now());
  useKeepAwake();

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const pasado = Math.min(total, (ahora - inicio) / 1000);
  const progreso = pasado / total;
  const fase = faseImpulso(progreso);
  const queda = Math.max(0, Math.ceil(total - pasado));
  const consejo = MIENTRAS[Math.floor(pasado / 60) % MIENTRAS.length];

  useEffect(() => {
    if (progreso >= 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onFin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progreso >= 1]);

  const R = 104;
  const C = 2 * Math.PI * R;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 240, height: 240, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={240} height={240} style={StyleSheet.absoluteFill}>
          <Circle cx={120} cy={120} r={R} stroke={colors.surfaceRaised} strokeWidth={8} fill="none" />
          <Circle
            cx={120}
            cy={120}
            r={R}
            stroke={colors.accent}
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${C} ${C}`}
            strokeDashoffset={C * (1 - progreso)}
            transform="rotate(-90 120 120)"
          />
        </Svg>
        <AppText variant="display" tabular>
          {Math.floor(queda / 60)}:{String(queda % 60).padStart(2, '0')}
        </AppText>
      </View>
      <AppText variant="title" style={{ marginTop: space.xl, textAlign: 'center' }}>{fase.titulo}</AppText>
      <AppText variant="body" tone="secondary" style={{ marginTop: space.sm, textAlign: 'center' }}>{fase.texto}</AppText>
      <Card style={[styles.fila, { marginTop: space.xl, alignSelf: 'stretch' }]}>
        <Ionicons name="bulb-outline" size={20} color={colors.accent} />
        <AppText variant="callout" style={{ flex: 1 }}>Mientras tanto: {consejo}</AppText>
      </Card>
    </View>
  );
}

export function ImpulsoScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [min, setMin] = useState(10);
  const [paso, setPaso] = useState<'elegir' | 'surfeando' | 'pregunta' | 'logrado' | 'no'>('elegir');
  const [cuenta, setCuenta] = useState({ total: 0, logrados: 0 });

  useFocusEffect(
    useCallback(() => {
      contarImpulsos(db).then(setCuenta).catch(() => {});
    }, [db]),
  );

  const responder = async (logrado: boolean) => {
    await registrarCalma(db, { tipo: 'impulso', logrado });
    setCuenta(await contarImpulsos(db));
    if (logrado) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setPaso(logrado ? 'logrado' : 'no');
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Surfear impulso' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {paso === 'elegir' ? (
          <>
            <AppText variant="title">Las ganas son como una ola</AppText>
            <AppText variant="body" tone="secondary" style={{ marginTop: space.sm }}>
              Suben, llegan a la cima y bajan. No tienes que pelear con ellas ni hacerles caso: solo dejar que pasen.
              Te acompaño mientras tanto.
            </AppText>
            <AppText variant="overline" tone="tertiary" style={{ marginTop: space.xxl, marginBottom: space.md }}>¿Cuánto rato?</AppText>
            <View style={styles.wrap}>
              {MINUTOS.map((m) => (
                <Chip key={m} label={`${m} min`} selected={min === m} onPress={() => setMin(m)} />
              ))}
            </View>
            <Button label="Empezar a surfear" onPress={() => setPaso('surfeando')} style={{ marginTop: space.xxl }} />
            {cuenta.total ? (
              <AppText variant="caption" tone="tertiary" style={{ marginTop: space.lg, textAlign: 'center' }}>
                Llevas {cuenta.logrados} {cuenta.logrados === 1 ? 'ola surfeada' : 'olas surfeadas'} de {cuenta.total}.
              </AppText>
            ) : null}
          </>
        ) : null}

        {paso === 'surfeando' ? (
          <>
            <Temporizador total={min * 60} onFin={() => setPaso('pregunta')} />
            <Button label="Ya pasó la ola" variant="secondary" onPress={() => setPaso('pregunta')} style={{ marginTop: space.xxl }} />
          </>
        ) : null}

        {paso === 'pregunta' ? (
          <>
            <AppText variant="title">¿Lograste no actuar por impulso?</AppText>
            <AppText variant="body" tone="secondary" style={{ marginTop: space.sm }}>Responde con honestidad, nadie más lo ve.</AppText>
            <Button label="Sí, lo logré" onPress={() => responder(true)} style={{ marginTop: space.xxl }} />
            <Button label="Esta vez no" variant="secondary" onPress={() => responder(false)} style={{ marginTop: space.sm }} />
          </>
        ) : null}

        {paso === 'logrado' ? (
          <>
            <Ionicons name="water" size={36} color={colors.accent} />
            <AppText variant="title" style={{ marginTop: space.md }}>¡Surfeaste la ola!</AppText>
            <AppText variant="body" tone="secondary" style={{ marginTop: space.sm }}>
              Llevas {cuenta.logrados} {cuenta.logrados === 1 ? 'vez' : 'veces'}. Cada vez que lo logras, a tu cerebro le cuesta menos la próxima.
            </AppText>
            <Button label="Anotarlo en mi tarjeta" onPress={() => router.replace('/tarjeta-diaria')} style={{ marginTop: space.xxl }} />
            <Button label="Listo" variant="secondary" onPress={() => router.back()} style={{ marginTop: space.sm }} />
          </>
        ) : null}

        {paso === 'no' ? (
          <>
            <Ionicons name="heart-outline" size={36} color={colors.accent} />
            <AppText variant="title" style={{ marginTop: space.md }}>No pasa nada.</AppText>
            <AppText variant="body" tone="secondary" style={{ marginTop: space.sm }}>
              Que lo hayas intentado ya cuenta. Sé amable contigo: mañana es otro intento. Si quieres, anota qué pasó antes del impulso,
              así lo puedes ver con tu psicólogo/a.
            </AppText>
            <Button label="Anotar en mi tarjeta" onPress={() => router.replace('/tarjeta-diaria')} style={{ marginTop: space.xxl }} />
            <Button label="Bajar la intensidad" variant="secondary" onPress={() => router.replace('/calma')} style={{ marginTop: space.sm }} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

/**
 * Plan de crisis (plan de seguridad): lo armas con calma un día bueno, para tenerlo a mano un día malo.
 * Señales de alerta, cosas que te calman, razones para seguir, personas a quien llamar
 * y las líneas de ayuda gratis de Chile (*4141). Nunca pide huella: tiene que abrir al tiro.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { IconButton } from '@/components/IconButton';
import { useLock } from '@/components/LockGate';
import { PressableScale } from '@/components/PressableScale';
import { guardarPlan, LINEAS_AYUDA, obtenerPlan, PLAN_VACIO, type Contacto, type PlanCrisis } from '@/database/bienestar';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const SECCIONES: { clave: 'senales' | 'calma' | 'razones'; titulo: string; ayuda: string; ejemplo: string }[] = [
  { clave: 'senales', titulo: 'Mis señales de alerta', ayuda: 'Cómo me doy cuenta de que se viene una crisis', ejemplo: 'Ej: no puedo dormir, me aíslo, pienso que todos me odian' },
  { clave: 'calma', titulo: 'Lo que me calma', ayuda: 'Cosas que puedo hacer por mi cuenta', ejemplo: 'Ej: ducharme, salir a caminar, mi playlist, abrazar a mi perro' },
  { clave: 'razones', titulo: 'Mis razones para seguir', ayuda: 'Lo que me importa y me espera', ejemplo: 'Ej: mi familia, terminar la carrera, el viaje que quiero hacer' },
];

const llamar = (tel: string) => Linking.openURL(`tel:${tel}`).catch(() => {});

export function PlanCrisisScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { bloqueada } = useLock();
  const [plan, setPlan] = useState<PlanCrisis>(PLAN_VACIO);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<{ senales: string; calma: string; razones: string; contactos: Contacto[] }>({ senales: '', calma: '', razones: '', contactos: [] });

  useFocusEffect(
    useCallback(() => {
      obtenerPlan(db).then(setPlan).catch(console.warn);
    }, [db]),
  );

  const vacio = !plan.senales.length && !plan.calma.length && !plan.razones.length && !plan.contactos.length;

  const empezarEdicion = () => {
    setBorrador({
      senales: plan.senales.join('\n'),
      calma: plan.calma.join('\n'),
      razones: plan.razones.join('\n'),
      contactos: plan.contactos.length ? plan.contactos : [{ nombre: '', telefono: '' }],
    });
    setEditando(true);
  };

  const guardar = async () => {
    const p: PlanCrisis = {
      senales: borrador.senales.split('\n'),
      calma: borrador.calma.split('\n'),
      razones: borrador.razones.split('\n'),
      contactos: borrador.contactos,
    };
    await guardarPlan(db, p);
    setPlan(await obtenerPlan(db));
    setEditando(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Plan de crisis' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Líneas de ayuda: siempre arriba */}
        <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Si estás en peligro</AppText>
        <View style={{ gap: space.sm }}>
          {LINEAS_AYUDA.map((l, k) => (
            <PressableScale
              key={l.telefono}
              accessibilityRole="button"
              accessibilityLabel={`Llamar a ${l.nombre}`}
              onPress={() => llamar(l.telefono)}
              style={[
                styles.linea,
                k === 0 ? { backgroundColor: colors.accent } : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Ionicons name="call" size={20} color={k === 0 ? colors.onAccent : colors.accent} />
              <View style={{ flex: 1 }}>
                <AppText variant="headline" tone={k === 0 ? 'onAccent' : 'primary'}>{l.nombre}</AppText>
                <AppText variant="caption" tone={k === 0 ? 'onAccent' : 'secondary'} style={k === 0 ? { opacity: 0.8 } : undefined}>{l.detalle}</AppText>
              </View>
            </PressableScale>
          ))}
        </View>

        {bloqueada ? (
          <AppText variant="callout" tone="secondary" style={{ marginTop: space.xxl }}>
            Tu plan personal (contactos y razones) se ve al desbloquear Tinzit0.
          </AppText>
        ) : editando ? (
          <>
            {SECCIONES.map((s) => (
              <View key={s.clave} style={styles.seccion}>
                <Field
                  label={s.titulo}
                  value={borrador[s.clave]}
                  onChangeText={(v) => setBorrador((b) => ({ ...b, [s.clave]: v }))}
                  multiline
                  placeholder={`${s.ejemplo}\n(una por línea)`}
                  style={{ minHeight: 110, textAlignVertical: 'top' }}
                />
              </View>
            ))}
            <View style={styles.seccion}>
              <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.sm, marginLeft: space.xs }}>Personas a quien llamar</AppText>
              <View style={{ gap: space.md }}>
                {borrador.contactos.map((c, k) => (
                  <View key={k} style={styles.fila}>
                    <View style={{ flex: 1, gap: space.sm }}>
                      <Field
                        value={c.nombre}
                        placeholder="Nombre"
                        onChangeText={(v) => setBorrador((b) => ({ ...b, contactos: b.contactos.map((x, j) => (j === k ? { ...x, nombre: v } : x)) }))}
                      />
                      <Field
                        value={c.telefono}
                        placeholder="Teléfono"
                        keyboardType="phone-pad"
                        onChangeText={(v) => setBorrador((b) => ({ ...b, contactos: b.contactos.map((x, j) => (j === k ? { ...x, telefono: v } : x)) }))}
                      />
                    </View>
                    <IconButton
                      icon="trash-outline"
                      accessibilityLabel="Quitar contacto"
                      onPress={() => setBorrador((b) => ({ ...b, contactos: b.contactos.filter((_, j) => j !== k) }))}
                    />
                  </View>
                ))}
              </View>
              <Button
                label="Agregar persona"
                variant="secondary"
                onPress={() => setBorrador((b) => ({ ...b, contactos: [...b.contactos, { nombre: '', telefono: '' }] }))}
                style={{ marginTop: space.md }}
              />
            </View>
            <Button label="Guardar mi plan" onPress={guardar} style={{ marginTop: space.xxl }} />
            <Button label="Cancelar" variant="secondary" onPress={() => setEditando(false)} style={{ marginTop: space.sm }} />
          </>
        ) : vacio ? (
          <Card style={{ marginTop: space.xxl, gap: space.sm }}>
            <AppText variant="headline">Arma tu plan en un día tranquilo</AppText>
            <AppText variant="callout" tone="secondary">
              En una crisis cuesta pensar. Por eso se prepara antes: tus señales de alerta, lo que te calma, tus razones para seguir y a quién llamar.
              Si tienes psicólogo/a, pueden armarlo juntos.
            </AppText>
            <Button label="Armar mi plan" onPress={empezarEdicion} style={{ marginTop: space.md }} />
          </Card>
        ) : (
          <>
            {plan.contactos.length ? (
              <View style={styles.seccion}>
                <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Personas a quien llamar</AppText>
                <View style={{ gap: space.sm }}>
                  {plan.contactos.map((c) => (
                    <Card key={c.nombre + c.telefono} onPress={() => llamar(c.telefono)} accessibilityLabel={`Llamar a ${c.nombre}`} style={styles.fila}>
                      <Ionicons name="person-circle-outline" size={24} color={colors.accent} />
                      <AppText variant="headline" style={{ flex: 1 }}>{c.nombre}</AppText>
                      <Ionicons name="call-outline" size={20} color={colors.textSecondary} />
                    </Card>
                  ))}
                </View>
              </View>
            ) : null}
            {SECCIONES.map((s) =>
              plan[s.clave].length ? (
                <View key={s.clave} style={styles.seccion}>
                  <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>{s.titulo}</AppText>
                  <Card style={{ gap: space.sm }}>
                    {plan[s.clave].map((x, k) => (
                      <View key={k} style={[styles.fila, { alignItems: 'flex-start' }]}>
                        <View style={[styles.punto, { backgroundColor: colors.accent }]} />
                        <AppText variant="body" style={{ flex: 1 }}>{x}</AppText>
                      </View>
                    ))}
                  </Card>
                </View>
              ) : null,
            )}
            <Button label="Editar mi plan" variant="secondary" onPress={empezarEdicion} style={{ marginTop: space.xxl }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  seccion: { marginTop: space.xxl },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  linea: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md },
  punto: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
});

/**
 * Ajustes: perfil, notificaciones, asistente de voz, presupuesto, seguridad (huella), respaldo y apariencia.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useLock } from '@/components/LockGate';
import { NotifSettings } from '@/components/NotifSettings';
import { AsistenteSettings } from '@/components/AsistenteSettings';
import { ClimaSettings } from '@/components/ClimaSettings';
import { SegmentedControl } from '@/components/SegmentedControl';
import { getSetting, setSetting } from '@/database/queries';
import { elegirRespaldo, exportarRespaldo, restaurarRespaldo } from '@/database/respaldo';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { fechaLarga, fromISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';
import { soloDigitos } from '@/utils/montos';

export function AjustesScreen() {
  const db = useSQLiteContext();
  const { colors, preference, setPreference } = useTheme();
  const lock = useLock();
  const [nombre, setNombre] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [ultimoRespaldo, setUltimoRespaldo] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);

  const cargar = useCallback(async () => {
    setNombre((await getSetting(db, 'nombre')) ?? '');
    setPresupuesto((await getSetting(db, 'presupuesto_semanal')) ?? '');
    setUltimoRespaldo(await getSetting(db, 'ultimo_respaldo'));
  }, [db]);

  useEffect(() => {
    cargar().catch(console.warn);
  }, [cargar]);

  const inputStyle = [
    type.body,
    styles.input,
    { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  ];

  const exportar = async () => {
    setExportando(true);
    try {
      await exportarRespaldo(db);
      await cargar();
    } catch (e) {
      Alert.alert('No se pudo exportar', e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
  };

  const importar = async () => {
    try {
      const elegido = await elegirRespaldo();
      if (!elegido) return;
      const { data, resumen } = elegido;
      Alert.alert(
        '¿Restaurar este respaldo?',
        `Es del ${resumen.fecha} y tiene ${resumen.filas} registros.\n\nSe van a REEMPLAZAR todos tus datos actuales.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Restaurar',
            style: 'destructive',
            onPress: async () => {
              setImportando(true);
              try {
                await restaurarRespaldo(db, data);
                await cargar();
                Alert.alert('Listo 🙌', 'Tus datos quedaron restaurados.');
              } catch (e) {
                Alert.alert('No se pudo restaurar', e instanceof Error ? e.message : String(e));
              } finally {
                setImportando(false);
              }
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('Archivo no válido', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Section title="Perfil">
        <AppText variant="callout" tone="secondary" style={styles.help}>¿Cómo te saludo?</AppText>
        <TextInput
          value={nombre}
          onChangeText={setNombre}
          onBlur={() => setSetting(db, 'nombre', nombre.trim())}
          placeholder="Tu nombre"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
          autoCapitalize="words"
          maxLength={24}
          accessibilityLabel="Tu nombre"
          style={inputStyle}
        />
      </Section>

      <Section title="Notificaciones">
        <NotifSettings />
      </Section>

      <Section title="Asistente · Jarvis">
        <AsistenteSettings />
      </Section>

      <Section title="Clima">
        <ClimaSettings />
      </Section>

      <Section title="Gastos">
        <AppText variant="callout" tone="secondary" style={styles.help}>
          Presupuesto semanal (te aviso al 80% y al 100%)
        </AppText>
        <TextInput
          value={presupuesto ? formatCLP(Number(presupuesto)) : ''}
          onChangeText={(t) => setPresupuesto(soloDigitos(t).slice(0, 9))}
          onBlur={() => setSetting(db, 'presupuesto_semanal', presupuesto || '0')}
          placeholder="$100.000"
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          returnKeyType="done"
          accessibilityLabel="Presupuesto semanal"
          style={inputStyle}
        />
      </Section>

      <Section title="Seguridad">
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="headline">Bloqueo con huella</AppText>
            <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
              {lock.disponible
                ? 'Pide tu huella (o PIN) al abrir la app y al volver después de 1 minuto.'
                : 'Tu celular no tiene huella ni PIN configurado.'}
            </AppText>
          </View>
          <Switch
            value={lock.activado}
            disabled={!lock.disponible}
            onValueChange={(v) => {
              lock.cambiarBloqueo(v).catch(console.warn);
            }}
            trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
            thumbColor={lock.activado ? colors.onAccent : '#f4f4f4'}
            accessibilityLabel="Bloqueo con huella"
          />
        </View>
      </Section>

      <Section title="Respaldo">
        <AppText variant="callout" tone="secondary" style={styles.help}>
          {ultimoRespaldo
            ? `Último respaldo: ${fechaLarga(fromISODate(ultimoRespaldo))}`
            : 'Aún no haces ningún respaldo.'}
        </AppText>
        <AppText variant="caption" tone="tertiary" style={{ marginBottom: space.lg }}>
          Guarda el archivo en Drive o mándatelo por correo. Si cambias de celular, lo importas y listo.
        </AppText>
        <View style={{ gap: space.sm }}>
          <Button label="Exportar respaldo" onPress={exportar} loading={exportando} />
          <Button label="Importar respaldo" variant="secondary" onPress={importar} loading={importando} />
        </View>
      </Section>

      <Section title="Apariencia">
        <SegmentedControl<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
          ]}
        />
      </Section>

      <AppText variant="caption" tone="tertiary" style={styles.footer}>
        Tinzit0 · Tus datos viven solo en este celular
      </AppText>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: space.xxl }}>
      <AppText variant="overline" tone="tertiary" style={styles.label}>{title}</AppText>
      <Card>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  label: { marginBottom: space.sm, marginLeft: space.xs },
  help: { marginBottom: space.sm },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  footer: { textAlign: 'center', marginTop: space.lg },
});

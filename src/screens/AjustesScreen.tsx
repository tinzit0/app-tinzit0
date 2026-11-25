/**
 * Ajustes: perfil, notificaciones, asistente de voz, presupuesto, seguridad (huella), respaldo y apariencia.
 */
import { reloadAppAsync } from 'expo';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useLock } from '@/components/LockGate';
import { NotifSettings } from '@/components/NotifSettings';
import { AsistenteSettings } from '@/components/AsistenteSettings';
import { ClimaSettings } from '@/components/ClimaSettings';
import { IaSettings } from '@/components/IaSettings';
import { SpotifySettings } from '@/components/SpotifySettings';
import { SegmentedControl } from '@/components/SegmentedControl';
import { getSetting, setSetting } from '@/database/queries';
import {
  compartirRespaldo,
  copiaPreviaDisponible,
  elegirRespaldo,
  guardarRespaldoEnCarpeta,
  marcarRespaldoHecho,
  recuperarCopiaPrevia,
  restaurarRespaldo,
} from '@/database/respaldo';
import { reprogramarTodo } from '@/notifications/programar';
import { actualizarWidget } from '@/widget';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { fechaLarga, fromISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';
import { soloDigitos } from '@/utils/montos';

export function AjustesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, preference, setPreference } = useTheme();
  const lock = useLock();
  const [nombre, setNombre] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [ultimoRespaldo, setUltimoRespaldo] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [copiaPrevia, setCopiaPrevia] = useState<string | null>(null);

  const leer = useCallback(
    () => Promise.all([getSetting(db, 'nombre'), getSetting(db, 'presupuesto_semanal'), getSetting(db, 'ultimo_respaldo')]),
    [db],
  );
  const aplicar = ([n, p, u]: (string | null)[]) => {
    setNombre(n ?? '');
    setPresupuesto(p ?? '');
    setUltimoRespaldo(u);
    setCopiaPrevia(copiaPreviaDisponible());
  };
  const cargar = useCallback(() => leer().then(aplicar), [leer]);

  useEffect(() => {
    let vivo = true;
    leer()
      .then((d) => vivo && aplicar(d))
      .catch(console.warn);
    return () => {
      vivo = false;
    };
  }, [leer]);

  const inputStyle = [
    type.body,
    styles.input,
    { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  ];

  const exportarCarpeta = async () => {
    setExportando(true);
    try {
      const nombre = await guardarRespaldoEnCarpeta(db);
      if (nombre) {
        await cargar();
        Alert.alert('Respaldo guardado ✓', `Quedó como "${nombre}" en la carpeta que elegiste.`);
      }
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
  };

  const exportarCompartir = async () => {
    setExportando(true);
    try {
      await compartirRespaldo(db);
      // Android no avisa si de verdad se guardó: preguntamos antes de anotar la fecha.
      Alert.alert('¿Se guardó bien?', 'Confírmalo solo si viste que el archivo quedó en Drive, el correo u otro lugar seguro.', [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, quedó guardado',
          onPress: () => {
            marcarRespaldoHecho(db).then(cargar).catch(console.warn);
          },
        },
      ]);
    } catch (e) {
      Alert.alert('No se pudo exportar', e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
  };

  const exportar = () => {
    if (Platform.OS !== 'android') {
      exportarCompartir();
      return;
    }
    Alert.alert('Exportar respaldo', '¿Dónde lo quieres guardar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Compartir (Drive, correo…)', onPress: exportarCompartir },
      { text: 'En una carpeta', onPress: exportarCarpeta },
    ]);
  };

  /** Después de cambiar todos los datos: avisos, widget y reiniciar la app para que todo se lea de nuevo. */
  const despuesDeRestaurar = async (titulo: string, detalle: string) => {
    await reprogramarTodo(db).catch(console.warn);
    await actualizarWidget(db).catch(console.warn);
    Alert.alert(titulo, detalle, [{ text: 'OK', onPress: () => reloadAppAsync('Datos restaurados').catch(() => cargar()) }]);
  };

  const importar = async () => {
    try {
      const elegido = await elegirRespaldo(db);
      if (!elegido) return;
      const { data, resumen } = elegido;
      const avisoAntiguo = resumen.tablasNuevasVacias.length
        ? `\n\nEs de una versión anterior de la app: ${resumen.tablasNuevasVacias.length} secciones nuevas quedarán vacías.`
        : '';
      Alert.alert(
        '¿Restaurar este respaldo?',
        `Es del ${resumen.fecha} y tiene ${resumen.filas} registros.\n\nSe van a REEMPLAZAR todos tus datos actuales. Antes guardo una copia, por si quieres volver atrás.${avisoAntiguo}`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Restaurar',
            style: 'destructive',
            onPress: async () => {
              setImportando(true);
              try {
                const r = await restaurarRespaldo(db, data);
                await despuesDeRestaurar(
                  'Listo 🙌',
                  `Tus datos quedaron restaurados${r.omitidas ? ` (se omitieron ${r.omitidas} registros sueltos que no calzaban)` : ''}. La app se va a reiniciar.`,
                );
              } catch (e) {
                Alert.alert('No se pudo restaurar', `${e instanceof Error ? e.message : String(e)}\n\nTus datos actuales no cambiaron.`);
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

  const recuperar = () => {
    Alert.alert(
      '¿Volver a tus datos de antes?',
      `Se recuperan los datos que tenías antes de la última importación (${copiaPrevia}). Lo de ahora queda guardado como copia.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Recuperar',
          style: 'destructive',
          onPress: async () => {
            setImportando(true);
            try {
              await recuperarCopiaPrevia(db);
              await despuesDeRestaurar('Listo', 'Volviste a tus datos de antes. La app se va a reiniciar.');
            } catch (e) {
              Alert.alert('No se pudo recuperar', `${e instanceof Error ? e.message : String(e)}\n\nTus datos actuales no cambiaron.`);
            } finally {
              setImportando(false);
            }
          },
        },
      ],
    );
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

      <Section title="Cuenta y amigos">
        <AppText variant="callout" tone="secondary" style={styles.help}>Opcional: para rachas con amigos y respaldo en la nube.</AppText>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button label="Mi cuenta" variant="secondary" onPress={() => router.push('/cuenta')} style={{ flex: 1 }} />
          <Button label="Amigos" variant="secondary" onPress={() => router.push('/amigos')} style={{ flex: 1 }} />
        </View>
      </Section>

      <Section title="Notificaciones">
        <NotifSettings />
      </Section>

      <Section title="Asistente · Tinzit0">
        <AsistenteSettings />
      </Section>

      <Section title="Cerebro de IA (gratis)">
        <IaSettings />
      </Section>

      <Section title="Música (Spotify)">
        <SpotifySettings />
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
          {copiaPrevia ? (
            <Button label="Recuperar datos de antes de importar" variant="secondary" onPress={recuperar} disabled={importando} />
          ) : null}
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

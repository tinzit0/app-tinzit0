/**
 * Cuenta: crear cuenta / iniciar sesión con correo y contraseña, recuperar contraseña,
 * tu código de amigo y el respaldo en la nube. Sin cuenta, la app funciona igual que siempre.
 * Al crear la cuenta, tus datos de este teléfono se suben a la nube (no se pierde nada).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { SegmentedControl } from '@/components/SegmentedControl';
import { volcarDatos } from '@/database/respaldoDatos';
import { errorAmable, nubeConfigurada } from '@/nube/cliente';
import { cerrarSesion, iniciarSesion, miPerfil, recuperarContrasena, registrarse, usuarioDisponible, type Perfil } from '@/nube/cuenta';
import { limpiarUsuario, telefonoVacio, usuarioValido } from '@/nube/logica';
import { infoRespaldoNube, restaurarDesdeNube, subirRespaldo } from '@/nube/sincronizar';
import { useSesion } from '@/nube/useSesion';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

type Modo = 'entrar' | 'crear';

export function CuentaScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { sesion, cargando } = useSesion();
  const [modo, setModo] = useState<Modo>('crear');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [usuario, setUsuario] = useState('');
  const [nombre, setNombre] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [respaldo, setRespaldo] = useState<{ fecha: string; device: string | null } | null>(null);

  const cargarPerfil = useCallback(async () => {
    if (!sesion) {
      setPerfil(null);
      setRespaldo(null);
      return;
    }
    const [p, r] = await Promise.all([miPerfil(), infoRespaldoNube().catch(() => null)]);
    setPerfil(p);
    setRespaldo(r);
  }, [sesion]);

  useFocusEffect(
    useCallback(() => {
      cargarPerfil().catch(console.warn);
    }, [cargarPerfil]),
  );


  const usuarioLimpio = limpiarUsuario(usuario);

  const crear = async () => {
    if (!usuarioValido(usuarioLimpio)) {
      Alert.alert('Usuario no válido', 'Usa de 3 a 20 letras, números, punto o guion bajo (ej: marti_23).');
      return;
    }
    if (clave.length < 8) {
      Alert.alert('Contraseña muy corta', 'Usa al menos 8 caracteres.');
      return;
    }
    setOcupado(true);
    try {
      if (!(await usuarioDisponible(usuarioLimpio))) {
        Alert.alert('Ese usuario ya existe', 'Prueba con otro.');
        return;
      }
      const conSesion = await registrarse(correo, clave, usuarioLimpio, nombre);
      setClave('');
      if (!conSesion) {
        Alert.alert('¡Revisa tu correo! 📬', 'Te mandé un enlace para confirmar la cuenta. Después vuelve aquí e inicia sesión. Tus datos siguen en este teléfono.');
        setModo('entrar');
      }
    } catch (e) {
      Alert.alert('No se pudo crear la cuenta', errorAmable(e));
    } finally {
      setOcupado(false);
    }
  };

  const entrar = async () => {
    setOcupado(true);
    try {
      await iniciarSesion(correo, clave);
      setClave('');
    } catch (e) {
      Alert.alert('No se pudo entrar', errorAmable(e));
    } finally {
      setOcupado(false);
    }
  };

  const olvide = async () => {
    if (!correo.includes('@')) {
      Alert.alert('Escribe tu correo', 'Pon el correo de tu cuenta arriba y vuelve a tocar "¿Olvidaste tu contraseña?".');
      return;
    }
    try {
      await recuperarContrasena(correo);
      Alert.alert('Correo enviado 📬', 'Abre el enlace desde este teléfono para poner una contraseña nueva.');
    } catch (e) {
      Alert.alert('No se pudo enviar', errorAmable(e));
    }
  };

  const salir = () =>
    Alert.alert('¿Cerrar sesión?', 'Tus datos se quedan en este teléfono. Las rachas siguen en tu cuenta.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        onPress: async () => {
          await subirRespaldo(db, true).catch(() => false);
          await cerrarSesion().catch((e) => Alert.alert('No se pudo', errorAmable(e)));
        },
      },
    ]);

  const subirAhora = async () => {
    setOcupado(true);
    try {
      if (await subirRespaldo(db, true)) {
        setRespaldo(await infoRespaldoNube());
        Alert.alert('Listo ✓', 'Tus datos quedaron respaldados en la nube.');
      } else Alert.alert('No se pudo subir', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setOcupado(false);
    }
  };

  const traer = (preguntar = true) => {
    const hacer = async () => {
      setOcupado(true);
      try {
        const r = await restaurarDesdeNube(db);
        Alert.alert('Datos recuperados ✓', `Traje ${r.filas} registros. Lo de Bienestar de este teléfono se mantuvo.`);
      } catch (e) {
        Alert.alert('No se pudo traer el respaldo', e instanceof Error ? e.message : errorAmable(e));
      } finally {
        setOcupado(false);
      }
    };
    if (!preguntar) return void hacer();
    Alert.alert('¿Traer los datos de la nube?', 'Reemplaza lo de este teléfono por tu respaldo. Antes guardo una copia de lo actual por si acaso.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Traer', style: 'destructive', onPress: hacer },
    ]);
  };

  // Al entrar con una cuenta: si en la nube hay un respaldo y este teléfono está vacío, ofrecer traerlo;
  // si no hay respaldo en la nube, subir lo de este teléfono (así no se pierde nada).
  useEffect(() => {
    if (!sesion) return;
    let vivo = true;
    (async () => {
      const info = await infoRespaldoNube().catch(() => null);
      if (!vivo) return;
      if (!info) {
        await subirRespaldo(db, true);
        if (vivo) setRespaldo(await infoRespaldoNube().catch(() => null));
        return;
      }
      if (telefonoVacio(await volcarDatos(db))) {
        Alert.alert('Encontré tus datos en la nube', `Respaldo del ${new Date(info.fecha).toLocaleString('es-CL')}. ¿Lo traigo a este teléfono?`, [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Traer mis datos', onPress: () => traer(false) },
        ]);
      }
    })().catch(console.warn);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.user.id]);

  if (!nubeConfigurada) {
    return (
      <>
        <Stack.Screen options={{ title: 'Cuenta' }} />
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
          <Card>
            <AppText variant="headline">La cuenta todavía no está conectada</AppText>
            <AppText variant="callout" tone="secondary" style={{ marginTop: space.sm }}>
              Falta configurar Supabase en el archivo .env (ver README). Mientras tanto, todo funciona igual en tu teléfono.
            </AppText>
          </Card>
        </ScrollView>
      </>
    );
  }

  if (cargando) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  // ---------- Con sesión ----------
  if (sesion) {
    return (
      <>
        <Stack.Screen options={{ title: 'Cuenta' }} />
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
          <AppText variant="overline" tone="tertiary">Tu cuenta</AppText>
          <AppText variant="title" style={{ marginTop: space.xs }}>{perfil?.display_name || (perfil ? `@${perfil.username}` : '…')}</AppText>
          <AppText variant="callout" tone="secondary">{perfil ? `@${perfil.username} · ` : ''}{sesion.user.email}</AppText>

          {perfil ? (
            <Card style={{ marginTop: space.xl }}>
              <AppText variant="overline" tone="tertiary">Tu código de amigo</AppText>
              <AppText variant="display" tabular style={{ letterSpacing: 4, marginTop: space.xs }} selectable>{perfil.friend_code}</AppText>
              <AppText variant="caption" tone="tertiary">Compártelo para que te agreguen (o busca a tu amigo por su usuario).</AppText>
              <View style={[styles.fila, { marginTop: space.md }]}>
                <Button
                  label="Compartir"
                  variant="secondary"
                  onPress={() => Share.share({ message: `¡Agrégame en Tinzit0! Mi usuario es @${perfil.username} y mi código ${perfil.friend_code} 🔥` }).catch(() => {})}
                  style={{ flex: 1 }}
                />
                <Button label="Amigos" onPress={() => router.push('/amigos')} style={{ flex: 1 }} />
              </View>
            </Card>
          ) : null}

          <Card style={{ marginTop: space.md }}>
            <View style={styles.fila}>
              <Ionicons name="cloud-done-outline" size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <AppText variant="callout">Respaldo en la nube</AppText>
                <AppText variant="caption" tone="tertiary">
                  {respaldo ? `Último: ${new Date(respaldo.fecha).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Todavía no hay respaldo'}
                </AppText>
              </View>
            </View>
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
              Se respalda solo al abrir y cerrar la app. Bienestar, el historial del asistente y tus ubicaciones se quedan solo en este teléfono.
            </AppText>
            <View style={[styles.fila, { marginTop: space.md }]}>
              <Button label="Respaldar ahora" variant="secondary" onPress={subirAhora} loading={ocupado} style={{ flex: 1 }} />
              <Button label="Traer de la nube" variant="secondary" onPress={() => traer()} disabled={!respaldo || ocupado} style={{ flex: 1 }} />
            </View>
          </Card>

          <Button label="Cerrar sesión" variant="danger" onPress={salir} style={{ marginTop: space.xxl }} />
        </ScrollView>
      </>
    );
  }

  // ---------- Sin sesión ----------
  return (
    <>
      <Stack.Screen options={{ title: 'Cuenta' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="title">{modo === 'crear' ? 'Crea tu cuenta' : 'Hola de nuevo 👋'}</AppText>
        <AppText variant="callout" tone="secondary" style={{ marginTop: space.sm }}>
          Para tener rachas con tus amigos y respaldar tus datos en la nube. Es gratis y opcional.
        </AppText>

        <View style={{ marginTop: space.xl }}>
          <SegmentedControl<Modo>
            options={[
              { value: 'crear', label: 'Crear cuenta' },
              { value: 'entrar', label: 'Iniciar sesión' },
            ]}
            value={modo}
            onChange={setModo}
          />
        </View>

        <View style={{ gap: space.md, marginTop: space.xl }}>
          {modo === 'crear' ? (
            <>
              <Field label="Usuario" value={usuario} onChangeText={(t) => setUsuario(limpiarUsuario(t))} placeholder="ej: marti_23" autoCapitalize="none" autoCorrect={false} maxLength={20} />
              <Field label="Tu nombre (opcional)" value={nombre} onChangeText={setNombre} placeholder="Como te verán tus amigos" maxLength={40} />
            </>
          ) : null}
          <Field label="Correo" value={correo} onChangeText={setCorreo} placeholder="tucorreo@ejemplo.cl" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Field
            label="Contraseña"
            value={clave}
            onChangeText={setClave}
            placeholder={modo === 'crear' ? 'Mínimo 8 caracteres' : 'Tu contraseña'}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
            textContentType={modo === 'crear' ? 'newPassword' : 'password'}
          />
        </View>

        <Button
          label={modo === 'crear' ? 'Crear cuenta' : 'Entrar'}
          onPress={modo === 'crear' ? crear : entrar}
          loading={ocupado}
          disabled={!correo.includes('@') || !clave || (modo === 'crear' && !usuarioLimpio)}
          style={{ marginTop: space.xl }}
        />
        {modo === 'entrar' ? <Button label="¿Olvidaste tu contraseña?" variant="secondary" onPress={olvide} style={{ marginTop: space.md }} /> : null}
        <AppText variant="caption" tone="tertiary" style={{ marginTop: space.lg }}>
          {modo === 'crear'
            ? 'Al crear la cuenta subo una copia de tus datos de este teléfono a tu respaldo privado (solo tú lo puedes ver). Tus amigos solo ven tus rachas.'
            : 'Si en la nube tienes un respaldo y este teléfono está vacío, te ofrezco traerlo.'}
        </AppText>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});

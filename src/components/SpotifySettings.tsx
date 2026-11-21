/**
 * Conectar Spotify (gratis). Pasos para el usuario:
 * 1. Entrar a developer.spotify.com/dashboard con su cuenta de Spotify.
 * 2. "Create app", marcar "Web API", y en "Redirect URIs" poner la dirección que mostramos.
 * 3. Copiar el "Client ID", pegarlo aquí y tocar "Conectar".
 */
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import * as sp from '@/spotify/spotify';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

export function SpotifySettings() {
  const { colors } = useTheme();
  const [conectado, setConectado] = useState(false);
  const [clientId, setClientId] = useState('');
  const [premium, setPremium] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    const c = await sp.conectado();
    setConectado(c);
    setClientId((await sp.obtenerClientId()) ?? '');
    if (c) sp.esPremium().then(setPremium).catch(() => setPremium(null));
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let vivo = true;
    Promise.all([sp.conectado(), sp.obtenerClientId()])
      .then(([c, id]) => {
        if (!vivo) return;
        setConectado(c);
        setClientId(id ?? '');
        if (c)
          sp.esPremium()
            .then((x) => vivo && setPremium(x))
            .catch(() => vivo && setPremium(null));
      })
      .catch(console.warn);
    return () => {
      vivo = false;
    };
  }, []);

  const conectar = async () => {
    if (clientId.trim().length < 20) {
      Alert.alert('Falta el Client ID', 'Pega el Client ID de tu app de Spotify (son 32 letras y números).');
      return;
    }
    setOcupado(true);
    try {
      await sp.guardarClientId(clientId);
      const ok = await sp.conectar();
      if (ok) {
        await cargar();
        Alert.alert('Spotify conectado', 'Ya puedes ver y controlar tu música desde Tinzit0.');
      }
    } catch (e) {
      Alert.alert('No se pudo conectar', e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  if (conectado) {
    return (
      <View style={{ gap: space.md }}>
        <AppText variant="callout">Cuenta conectada ✓</AppText>
        <AppText variant="caption" tone="tertiary">
          {premium === true
            ? 'Cuenta Premium: puedes reproducir y controlar todo desde Tinzit0.'
            : premium === false
              ? 'Cuenta gratis: ves lo que suena y buscas desde aquí; para reproducir, Spotify abre su app (el control remoto es solo para Premium).'
              : 'Revisando tu cuenta…'}
        </AppText>
        <Button
          label="Desconectar Spotify"
          variant="danger"
          onPress={async () => {
            await sp.desconectar();
            await cargar();
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="caption" tone="secondary">
        Sin conectar nada ya puedes decir “pon Bad Bunny” y Spotify lo reproduce. Conecta tu cuenta (gratis) para ver lo que suena, buscar y
        controlar desde Tinzit0:
      </AppText>
      <AppText variant="caption" tone="tertiary">1. Entra a developer.spotify.com con tu cuenta de Spotify y toca “Create app”.</AppText>
      <AppText variant="caption" tone="tertiary">2. Marca “Web API” y en “Redirect URIs” agrega exactamente:</AppText>
      <AppText variant="callout" selectable style={[styles.uri, { backgroundColor: colors.surfaceRaised }]}>{sp.REDIRECT_URI}</AppText>
      <AppText variant="caption" tone="tertiary">3. Guarda, copia el “Client ID” y pégalo aquí:</AppText>
      <TextInput
        value={clientId}
        onChangeText={setClientId}
        placeholder="Client ID de Spotify"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Client ID de Spotify"
        style={[type.body, styles.input, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      />
      <Button label="Conectar Spotify" onPress={conectar} loading={ocupado} />
      <Pressable onPress={() => Linking.openURL('https://developer.spotify.com/dashboard')} hitSlop={8}>
        <AppText variant="caption" tone="accent">Abrir developer.spotify.com →</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  uri: { padding: space.md, borderRadius: radius.sm, fontVariant: ['tabular-nums'] },
  input: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg },
});

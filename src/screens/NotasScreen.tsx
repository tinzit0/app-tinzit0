/**
 * Lista de notas: fijadas arriba, luego por fecha. Con buscador.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { Screen } from '@/components/Screen';
import { listarNotas, type Nota } from '@/database/notas';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { fechaCorta, toISODate } from '@/utils/fechas';

/** "Hoy 14:32", "Ayer", "20 nov" */
function cuando(sqlDate: string): string {
  const [d, t] = sqlDate.split(' ');
  if (d === toISODate()) return `Hoy ${t?.slice(0, 5) ?? ''}`;
  if (d === toISODate(new Date(Date.now() - 86400000))) return 'Ayer';
  const [y, m, day] = d.split('-').map(Number);
  return fechaCorta(new Date(y, m - 1, day));
}

export function NotasScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargado, setCargado] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listarNotas(db, busqueda)
        .then((n) => {
          setNotas(n);
          setCargado(true);
        })
        .catch(console.warn);
    }, [db, busqueda]),
  );

  return (
    <View style={styles.flex}>
      <Screen eyebrow={notas.length > 0 ? `${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}` : 'Ideas'} title="Notas">
        {notas.length > 4 || busqueda ? (
          <View style={[styles.search, { backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="search" size={17} color={colors.textTertiary} />
            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar"
              placeholderTextColor={colors.textTertiary}
              style={[type.body, { flex: 1, color: colors.text, paddingVertical: space.sm }]}
              accessibilityLabel="Buscar notas"
              returnKeyType="search"
            />
          </View>
        ) : null}

        {cargado && notas.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title={busqueda ? 'Nada con eso' : 'Sin notas todavía'}
            description={busqueda ? 'Prueba con otra palabra.' : 'Toca el + y anota lo que se te ocurra. Se guarda solo.'}
          />
        ) : (
          <View style={{ gap: space.sm }}>
            {notas.map((n) => {
              const [primera, ...resto] = n.body.split('\n');
              return (
                <Card
                  key={n.id}
                  onPress={() => router.push({ pathname: '/nota', params: { id: String(n.id) } })}
                  accessibilityLabel={`Nota: ${primera}`}
                  style={{ padding: space.lg }}
                >
                  <View style={styles.noteTop}>
                    <AppText variant="headline" numberOfLines={1} style={{ flex: 1 }}>{primera}</AppText>
                    {n.pinned ? <Ionicons name="pin" size={14} color={colors.accent} /> : null}
                  </View>
                  {resto.join(' ').trim() ? (
                    <AppText variant="callout" tone="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                      {resto.join(' ').trim()}
                    </AppText>
                  ) : null}
                  <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
                    {cuando(n.updated_at)}
                  </AppText>
                </Card>
              );
            })}
          </View>
        )}
      </Screen>
      <Fab accessibilityLabel="Nueva nota" onPress={() => router.push('/nota')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    marginBottom: space.lg,
    minHeight: 44,
  },
  noteTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

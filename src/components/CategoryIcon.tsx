/**
 * Ícono de categoría dentro de un cuadradito con su color suave de fondo.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { categoria } from '@/utils/categorias';

export function CategoryIcon({ cat, size = 40 }: { cat: string; size?: number }) {
  const c = categoria(cat);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${c.color}22`, // mismo color con transparencia
      }}
    >
      <Ionicons name={c.icon} size={size * 0.48} color={c.color} />
    </View>
  );
}

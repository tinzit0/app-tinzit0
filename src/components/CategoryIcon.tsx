/**
 * Ícono de categoría dentro de un cuadradito con su color suave de fondo.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { categoria, colorCategoria } from '@/utils/categorias';

export function CategoryIcon({ cat, size = 40 }: { cat: string; size?: number }) {
  const { isDark } = useTheme();
  const c = categoria(cat);
  const color = colorCategoria(c, isDark);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${color}22`, // mismo color con transparencia
      }}
    >
      <Ionicons name={c.icon} size={size * 0.48} color={color} />
    </View>
  );
}

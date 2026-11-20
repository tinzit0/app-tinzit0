/**
 * Ícono de una app: intenta mostrar el ícono REAL instalado en tu celular;
 * si no puede, muestra el logo de la marca sobre su color.
 */
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { iconoReal } from '@/database/apps';
import { ICONOS_SOLIDOS, type AppCatalogo } from '@/utils/apps';

// El tipo de FontAwesome6 no expone las props "brand"/"solid", por eso lo tipamos suelto.
const FA6 = FontAwesome6 as unknown as React.ComponentType<Record<string, unknown>>;

export function AppIcon({ app, size = 56 }: { app: AppCatalogo; size?: number }) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    iconoReal(app.pkg).then((u) => vivo && setUri(u));
    return () => {
      vivo = false;
    };
  }, [app.pkg]);

  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
  }
  const solido = ICONOS_SOLIDOS.has(app.icon);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: app.color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <FA6 name={app.icon} size={size * 0.46} color="#fff" brand={!solido} solid={solido} />
    </View>
  );
}

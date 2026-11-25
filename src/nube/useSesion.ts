/**
 * Sesión actual de Supabase (o null). Se actualiza sola al iniciar o cerrar sesión.
 */
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from './cliente';

export function useSesion(): { sesion: Session | null; cargando: boolean } {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) return;
    let vivo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!vivo) return;
        setSesion(data.session);
        setCargando(false);
      })
      .catch(() => vivo && setCargando(false));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => {
      vivo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { sesion, cargando };
}

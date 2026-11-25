-- =====================================================================
-- Tinzit0 · Cerrar funciones internas (aviso del revisor de seguridad de Supabase)
-- =====================================================================
-- Postgres deja que CUALQUIERA ejecute una función nueva (rol "public").
-- Aquí dejamos solo lo que la app realmente usa:
--  * crear_perfil y actualizar_rachas son triggers: solo los dispara la base de datos, nadie los llama.
--  * son_amigos la usan las reglas de seguridad (RLS) → la necesitan los usuarios con sesión, no los anónimos.
--  * buscar_usuario (con sesión) y usuario_disponible (antes de registrarse) se quedan como están, a propósito.
-- =====================================================================

revoke execute on function public.crear_perfil() from public, anon, authenticated;
revoke execute on function public.actualizar_rachas() from public, anon, authenticated;
revoke execute on function public.nuevo_codigo_amigo() from public, anon, authenticated;

revoke execute on function public.son_amigos(uuid, uuid) from public, anon;
grant execute on function public.son_amigos(uuid, uuid) to authenticated;

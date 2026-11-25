-- =====================================================================
-- Tinzit0 · Cuentas, amigos, rachas compartidas y respaldo en la nube
-- =====================================================================
-- Seguridad:
--  * RLS activado en TODAS las tablas.
--  * Cada usuario lee y edita solo lo suyo.
--  * Los amigos solo ven: tu perfil (usuario, nombre, código), las rachas que comparten
--    y tus "check-ins" del día (ej: "cumplió el agua hoy"). Nunca notas, gastos ni ahorros.
--  * El respaldo (tus datos de la app) solo lo puedes leer tú.
--  * Los contadores de racha NO se pueden editar desde la app: los calcula la base de datos.
-- =====================================================================

-- ---------- Perfiles ----------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  friend_code  text not null unique check (friend_code ~ '^[A-Z2-9]{6}$'),
  created_at   timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));
alter table public.profiles enable row level security;

-- Código de amigo de 6 letras/números sin caracteres que se confunden (sin 0/O, 1/I).
create or replace function public.nuevo_codigo_amigo() returns text
language plpgsql volatile set search_path = public as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = c);
  end loop;
  return c;
end $$;

-- Al registrarse se crea el perfil con el usuario elegido en la app.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name, friend_code)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', 'user' || substr(new.id::text, 1, 8))),
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    public.nuevo_codigo_amigo()
  );
  return new;
end $$;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

-- ---------- Amistades ----------
create table public.friendships (
  id           bigint generated always as identity primary key,
  requester    uuid not null references public.profiles (id) on delete cascade,
  addressee    uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  check (requester <> addressee)
);
-- Una sola amistad por par, sin importar quién la pidió.
create unique index friendships_par_key on public.friendships (least(requester, addressee), greatest(requester, addressee));
alter table public.friendships enable row level security;

create or replace function public.son_amigos(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

-- Perfiles: ves el tuyo, el de tus amigos y el de quien te mandó (o a quien mandaste) solicitud.
create policy "perfil propio o relacionado" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where (f.requester = (select auth.uid()) and f.addressee = profiles.id)
         or (f.addressee = (select auth.uid()) and f.requester = profiles.id)
    )
  );
create policy "editar mi perfil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Desde la app solo se puede cambiar el usuario y el nombre (el código de amigo no).
revoke update on public.profiles from authenticated;
grant update (username, display_name) on public.profiles to authenticated;

-- Buscar a alguien por usuario o código EXACTO (no se puede listar a todos los usuarios).
create or replace function public.buscar_usuario(q text)
returns table (id uuid, username text, display_name text, friend_code text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.friend_code
  from public.profiles p
  where (lower(p.username) = lower(trim(q)) or p.friend_code = upper(trim(q)))
    and p.id <> auth.uid()
  limit 1;
$$;
revoke execute on function public.buscar_usuario(text) from anon, public;
grant execute on function public.buscar_usuario(text) to authenticated;

-- ¿Está libre este nombre de usuario? (antes de registrarse)
create or replace function public.usuario_disponible(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(trim(u)));
$$;
grant execute on function public.usuario_disponible(text) to anon, authenticated;

create policy "ver mis amistades" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));
create policy "pedir amistad" on public.friendships for insert to authenticated
  with check (requester = (select auth.uid()) and status = 'pending' and accepted_at is null);
-- Solo quien recibió la solicitud la puede aceptar.
create policy "aceptar amistad" on public.friendships for update to authenticated
  using (addressee = (select auth.uid()) and status = 'pending')
  with check (addressee = (select auth.uid()) and status = 'accepted');
-- Rechazar, cancelar o dejar de ser amigos: cualquiera de los dos.
create policy "borrar amistad" on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));
-- Al aceptar solo cambia el estado (no se puede cambiar quién es quién).
revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

create or replace function public.marcar_aceptada() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then new.accepted_at := now(); end if;
  return new;
end $$;
create trigger al_aceptar before update on public.friendships
  for each row execute function public.marcar_aceptada();

-- ---------- Check-ins del día (lo único de tus hábitos que ven tus amigos) ----------
create table public.checkins (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day        date not null,
  activity   text not null check (activity in ('tareas', 'gym', 'agua')),
  created_at timestamptz not null default now(),
  primary key (user_id, day, activity)
);
alter table public.checkins enable row level security;

create policy "ver mis check-ins y los de mis amigos" on public.checkins for select to authenticated
  using (user_id = (select auth.uid()) or public.son_amigos(user_id, (select auth.uid())));
-- Solo el tuyo, y solo de ayer, hoy o mañana (por la diferencia horaria con el servidor; sin rellenar días pasados).
create policy "registrar mi check-in" on public.checkins for insert to authenticated
  with check (user_id = (select auth.uid()) and day between current_date - 1 and current_date + 1);

-- ---------- Rachas compartidas ----------
create table public.streaks (
  id         bigint generated always as identity primary key,
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  activity   text not null check (activity in ('tareas', 'gym', 'agua')),
  count      int not null default 0,
  best       int not null default 0,
  last_day   date,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b, activity)
);
alter table public.streaks enable row level security;

create policy "ver mis rachas" on public.streaks for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
-- Crear una racha solo con un amigo aceptado, y siempre partiendo de cero.
create policy "crear racha con un amigo" on public.streaks for insert to authenticated
  with check (
    (select auth.uid()) in (user_a, user_b)
    and created_by = (select auth.uid())
    and public.son_amigos(user_a, user_b)
    and count = 0 and best = 0 and last_day is null
  );
create policy "quitar racha" on public.streaks for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));
-- Sin política de UPDATE: los números de la racha solo los cambia la función de abajo.
revoke update on public.streaks from authenticated;

-- Cuando alguien registra su check-in y su amigo ya cumplió ese mismo día, la racha sube.
create or replace function public.actualizar_rachas() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s record;
  otro uuid;
begin
  for s in
    select * from public.streaks
    where activity = new.activity and new.user_id in (user_a, user_b)
    for update
  loop
    otro := case when s.user_a = new.user_id then s.user_b else s.user_a end;
    if exists (select 1 from public.checkins c where c.user_id = otro and c.day = new.day and c.activity = new.activity) then
      if s.last_day is not null and s.last_day >= new.day then
        continue; -- ese día ya contó
      elsif s.last_day = new.day - 1 then
        update public.streaks set count = s.count + 1, best = greatest(s.best, s.count + 1), last_day = new.day where id = s.id;
      else
        update public.streaks set count = 1, best = greatest(s.best, 1), last_day = new.day where id = s.id;
      end if;
    end if;
  end loop;
  return new;
end $$;
create trigger al_registrar_checkin after insert on public.checkins
  for each row execute function public.actualizar_rachas();

-- ---------- Respaldo en la nube (solo tú lo puedes leer) ----------
create table public.backups (
  user_id        uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  data           jsonb not null,
  schema_version int not null,
  device         text check (char_length(device) <= 60),
  updated_at     timestamptz not null default now()
);
alter table public.backups enable row level security;
create policy "mi respaldo: ver" on public.backups for select to authenticated using (user_id = (select auth.uid()));
create policy "mi respaldo: crear" on public.backups for insert to authenticated with check (user_id = (select auth.uid()));
create policy "mi respaldo: actualizar" on public.backups for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "mi respaldo: borrar" on public.backups for delete to authenticated using (user_id = (select auth.uid()));

-- Nadie sin sesión puede leer nada.
revoke all on public.profiles, public.friendships, public.checkins, public.streaks, public.backups from anon;

-- ---------- Tiempo real (la racha se actualiza al instante en ambos teléfonos) ----------
alter publication supabase_realtime add table public.streaks, public.checkins, public.friendships;

-- =====================================================================
-- Nuestro Rincón — esquema de Supabase
-- Cómo usarlo: en tu proyecto de Supabase → SQL Editor → pega todo esto
-- y pulsa «Run». Se ejecuta UNA sola vez (ver README.md).
--
-- Seguridad: sin registro público. Todas las tablas llevan RLS y solo
-- aceptan usuarios AUTENTICADOS (los 3 miembros de la familia que tú
-- creas a mano en el panel de Supabase). En el cliente solo viaja la
-- clave «anon», nunca la de servicio.
-- =====================================================================

-- Perfiles: nombre, avatar divertido y puntos de campeón acumulado.
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  emoji text not null default '🦊',
  puntos integer not null default 0,
  creado_en timestamptz not null default now()
);

-- Chat familiar. `reacciones` guarda las reacciones por mensaje en JSON:
-- { "😂": [ { "id": <uuid>, "nombre": "Papá" }, … ], … } (ver fun.js).
-- Las NOTAS DE VOZ llevan texto '' y apuntan al audio guardado en el
-- bucket privado `audios` (abajo): audio_path = ruta en el bucket y
-- audio_seg = duración en segundos.
create table if not exists public.mensajes (
  id bigint generated always as identity primary key,
  autor uuid references auth.users (id) on delete set null,
  nombre text not null,
  texto text not null check (char_length(texto) <= 500),
  reacciones jsonb not null default '{}'::jsonb,
  audio_path text,
  audio_seg integer,
  creado_en timestamptz not null default now()
);

-- Partidas de juegos: el estado completo vive en JSON (ver logic.js).
create table if not exists public.partidas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('gato', 'trivia', 'memoria', 'conecta', 'serpientes', 'ahorcado', 'dibujo', 'parchis', 'domino', 'naval', 'sopa', 'basta', 'simon', 'calculo', 'ppt', 'adivina', 'numeros', 'orden', 'quef', 'versiculo', 'damas', 'loteria', 'guerra', 'tesoro', 'verdad', 'carrera', 'encadenada', 'puzzle', 'quien', 'vf', 'encuentra', 'ordenab', 'misterio')),
  estado jsonb not null default '{}'::jsonb,
  creada_por uuid references auth.users (id) on delete set null,
  activa boolean not null default true,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

-- Cola compartida de videos/música.
create table if not exists public.cola_videos (
  id bigint generated always as identity primary key,
  video_id text not null,
  titulo text not null,
  miniatura text,
  agregado_por text,
  creado_en timestamptz not null default now()
);

-- Estado global de reproducción (una sola fila, id = 1).
-- posicion/actualizado_en permiten corregir la deriva entre pantallas.
create table if not exists public.estado_reproduccion (
  id int primary key,
  video_id text,
  titulo text,
  reproduciendo boolean not null default false,
  posicion double precision not null default 0,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  nonce text
);
insert into public.estado_reproduccion (id) values (1) on conflict (id) do nothing;

-- Suscripciones Web Push por aparato (avisos de llamada, v2).
-- Cada fila es UN navegador/aparato de UN miembro: el endpoint es único
-- por aparato. Las claves p256dh/auth son las de la suscripción del
-- navegador (no son secretos de la app: sin la clave privada VAPID,
-- que vive solo en la Edge Function, nadie puede enviar nada).
-- RLS distinta a las demás tablas: cada quien ve y toca SOLO las suyas.
-- (La Edge Function «avisar-llamada» lee las de todos con la llave de
-- servicio, que salta el RLS por diseño de Supabase.)
create table if not exists public.suscripciones_push (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  creada_en timestamptz not null default now()
);

-- =====================================================================
-- RLS: solo usuarios autenticados (la familia). Sin acceso anónimo.
-- =====================================================================
alter table public.perfiles enable row level security;
alter table public.mensajes enable row level security;
alter table public.partidas enable row level security;
alter table public.cola_videos enable row level security;
alter table public.estado_reproduccion enable row level security;
alter table public.suscripciones_push enable row level security;

drop policy if exists "familia autenticada" on public.perfiles;
drop policy if exists "familia autenticada" on public.mensajes;
drop policy if exists "familia autenticada" on public.partidas;
drop policy if exists "familia autenticada" on public.cola_videos;
drop policy if exists "familia autenticada" on public.estado_reproduccion;
drop policy if exists "solo las mias" on public.suscripciones_push;

create policy "familia autenticada" on public.perfiles
  for all to authenticated using (true) with check (true);
create policy "familia autenticada" on public.mensajes
  for all to authenticated using (true) with check (true);
create policy "familia autenticada" on public.partidas
  for all to authenticated using (true) with check (true);
create policy "familia autenticada" on public.cola_videos
  for all to authenticated using (true) with check (true);
create policy "familia autenticada" on public.estado_reproduccion
  for all to authenticated using (true) with check (true);
-- Push: cada miembro SOLO sus propias suscripciones (ni leer las ajenas).
create policy "solo las mias" on public.suscripciones_push
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- Storage: bucket privado `audios` para las notas de voz del chat.
-- Privado (public = false): la app reproduce con URLs firmadas
-- temporales. Convención de ruta: <user_id>/<timestamp>.<ext> —
-- cada quien sube SOLO dentro de su carpeta; leer y borrar vale para
-- cualquier miembro autenticado (es el chat de la familia).
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('audios', 'audios', false)
on conflict (id) do nothing;

drop policy if exists "audios familia leer" on storage.objects;
drop policy if exists "audios familia subir" on storage.objects;
drop policy if exists "audios familia borrar" on storage.objects;

create policy "audios familia leer" on storage.objects
  for select to authenticated
  using (bucket_id = 'audios');
create policy "audios familia subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audios' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "audios familia borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audios' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- Realtime: cambios en vivo para chat, partidas, cola y reproducción.
-- (La presencia, las reacciones flotantes, la señalización de voz WebRTC
--  y los eventos instantáneos de play/pausa usan canales broadcast/
--  presence, que no necesitan tablas. Las REACCIONES del chat viajan
--  como UPDATE de `mensajes`, que ya está en la publicación.
--  `suscripciones_push` NO entra: es registro por aparato, sin vivo.)
-- Si vuelves a ejecutar este archivo, esta parte puede avisar de que las
-- tablas ya están en la publicación: es inofensivo, ignora ese aviso.
-- =====================================================================
alter publication supabase_realtime add table public.perfiles;
alter publication supabase_realtime add table public.mensajes;
alter publication supabase_realtime add table public.partidas;
alter publication supabase_realtime add table public.cola_videos;
alter publication supabase_realtime add table public.estado_reproduccion;

-- ============================================================================
-- NUESTRO RINCÓN · MIGRACIÓN v3 — tipos de partida de los 13 juegos nuevos
-- Ejecutar UNA vez en Supabase → SQL Editor (después de subir el código v3).
-- Suelta la restricción CHECK de partidas.tipo y la recrea con los 33 tipos:
-- los 20 de siempre + damas, loteria, guerra, tesoro, verdad, carrera,
-- encadenada, puzzle, quien, vf, encuentra, ordenab y misterio.
-- (Los juegos bíblicos que reusan tipos viejos —trivia y memoria bíblicas—
-- no necesitan nada: siguen siendo tipo 'trivia'/'memoria' con su banco.)
-- ============================================================================

alter table public.partidas
  drop constraint if exists partidas_tipo_check;

alter table public.partidas
  add constraint partidas_tipo_check
  check (tipo in (
    'gato', 'trivia', 'memoria', 'conecta', 'serpientes', 'ahorcado', 'dibujo',
    'parchis', 'domino', 'naval', 'sopa', 'basta', 'simon', 'calculo', 'ppt',
    'adivina', 'numeros', 'orden', 'quef', 'versiculo',
    'damas', 'loteria', 'guerra', 'tesoro', 'verdad', 'carrera', 'encadenada',
    'puzzle', 'quien', 'vf', 'encuentra', 'ordenab', 'misterio'
  ));

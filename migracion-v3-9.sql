-- ============================================================================
-- NUESTRO RINCÓN · MIGRACIÓN v3.9 — tipo de partida del juego nuevo de la
-- v3.9: 'ajedrez' (♟️ Ajedrez, reglas completas, 2 jugadores). Sin esta
-- migración, crear partida en Ajedrez devuelve el error 23514 «violates
-- check constraint partidas_tipo_check» y la app muestra «la partida no se
-- pudo confirmar» (la lección de la v3.7: toda lista cerrada se migra en la
-- MISMA entrega que el código que agrega valores).
-- Ejecutar UNA vez en Supabase → SQL Editor. Idempotente: repetir no daña.
-- Suelta la restricción CHECK de partidas.tipo y la recrea con los 47
-- tipos: los 46 de la migración v3.8 + ajedrez.
-- Tras correrla, verificar con una sonda real: crear una partida de tipo
-- 'ajedrez' y comprobar que entra (201), no solo que la migración corrió.
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
    'puzzle', 'quien', 'vf', 'encuentra', 'ordenab', 'misterio',
    'obby', 'tycoon', 'mascotas', 'torre', 'impostor',
    'jonas', 'arca', 'goliat', 'cohete', 'blanco', 'granja',
    'arena', 'pista',
    'ajedrez'
  ));

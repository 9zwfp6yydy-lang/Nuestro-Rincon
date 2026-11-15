-- ============================================================================
-- NUESTRO RINCÓN · MIGRACIÓN v3.8 — tipos de partida de los 2 juegos EN
-- TIEMPO REAL de la v3.8: 'arena' (🥊 Arena de Pelea) y 'pista'
-- (🏎️ Gran Premio). Sin esta migración, crear partida en esos juegos
-- devuelve el error 23514 «violates check constraint
-- partidas_tipo_check» y la app muestra «la partida no se pudo confirmar»
-- (la lección de la v3.7: toda lista cerrada se migra en la MISMA entrega
-- que el código que agrega valores).
-- Ejecutar UNA vez en Supabase → SQL Editor. Idempotente: repetir no daña.
-- Suelta la restricción CHECK de partidas.tipo y la recrea con los 46
-- tipos: los 44 de la migración v3.7 + arena y pista.
-- Tras correrla, verificar con una sonda real: crear una partida de cada
-- tipo nuevo ('arena' y 'pista') y comprobar que entra (201), no solo
-- que la migración corrió.
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
    'arena', 'pista'
  ));

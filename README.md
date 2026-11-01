# 🏡 Nuestro Rincón

El rincón privado de la familia: **jugar en línea, ver videos y escuchar música juntos con reproducción sincronizada, hablar por voz y video dentro de la app, leer la Biblia juntos y chatear** — pensado para Rafiel (iPhone/PC), Maryelin (Santo Domingo) y su hijo en un **iPad** (Safari). Interfaz en español, cálida, divertida y con botones grandes táctiles: primero tablet, adaptable a teléfono y PC.

> App **aparte** de Entre Nosotros (la de pareja no se toca). Esto es la **v2 local** (v1 + biblioteca de juegos y Biblia + avisos de llamada, chat con emojis y notas de voz): todavía no está publicada. Para publicarla sigue los pasos de abajo.

## Qué trae

| Módulo | Qué hace |
|---|---|
| 🚪 Entrada y Sala | Login con correo+contraseña (sin registro público). Presencia en vivo: quién está conectado, con avatar divertido y nombre. |
| 🎮 Juegos | **Biblioteca completa de 33 juegos** en línea (2–3 jugadores + espectadores), con partidas abiertas: cualquier miembro conectado se une con un toque, y **el tablero se abre ENCIMA de la pantalla, en una capa a pantalla completa** al crear o abrir una partida (v3.2: nada de desplazarse a buscarlo; se cierra con su ✖ grande y se vuelve al mismo punto). Catálogo y reglas abajo. |
| 📖 Biblia | Versículo del día compartible con un toque (banco de 60), **36 historias ilustradas** para leer juntos —toda la Biblia en orden, agrupadas en Antiguo y Nuevo Testamento, cada una con su dibujo en acuarela y su cita— sincronizadas entre pantallas, y 8 juegos bíblicos. |
| 🎬 Ver y escuchar juntos | **Buscador de YouTube dentro de la app** (nada de pegar enlaces): resultados con miniatura, botón «Reproducir para todos» que sincroniza video + play/pausa entre pantallas con corrección de deriva (>1,5 s), **cola compartida** con siguiente automático y aviso elegante si un video no permite inserción. |
| 🎙️📹 Voz y video | Sala de **voz WebRTC en malla** (hasta 4) con señalización por Supabase Realtime y STUN público de Google — y ahora también **video**: tras unirte a la voz, «📹 Activar cámara», mosaicos flotantes plegables con vista previa en espejo y botón para cambiar de cámara (frontal/trasera). La voz funciona sin cámara. Si alguien entra a la voz y no estás, la app te muestra la **tarjeta de llamada entrante con tono** (ver Avisos). **Compartir pantalla (v3):** en computadora y Android, el botón «🖥️ Compartir pantalla» envía tu pantalla como una pista más de la misma malla (mosaico «Pantalla de …»); en iPhone/iPad el botón no aparece (ver Límites honestos). |
| 🔔 Avisos de llamada | **Web Push por aparato**: en la Sala, «Activar avisos de llamada» suscribe ese navegador; cuando alguien se une a la voz, la Edge Function `avisar-llamada` despierta a los demás con la notificación «📹 {nombre} te está llamando en Nuestro Rincón», aunque la app esté cerrada. Service worker (`sw.js`) con caché de la app: PWA instalable de verdad. Límites honestos abajo. |
| 💬 Chat | Mensajes en vivo entre los tres, con **selector de emojis** (botón 😀, 100+ en 6 grupos), **emojis grandes** sin bocadillo cuando el mensaje es solo 1–3 emojis, **reacciones por mensaje** (toca un mensaje: 😂 ❤️ 👍 🎉 😮, quedan guardadas con quién las puso) y **notas de voz** estilo WhatsApp (🎤 grabar hasta 3 min, reproducir con progreso; el audio vive en el bucket privado `audios`). |
| 🎉 Capa de diversión | Confeti animado y pantalla «¡Ganaste!» al ganar/acertar · sonidos alegres generados con WebAudio (acierto, victoria, turno, error simpático) con botón de silencio 🔊 · **reacciones flotantes** (😂 ❤️ 👏 🎉 😮 🔥) visibles para todos en vivo · avatares emoji a elegir · **tabla de campeones** acumulada con títulos juguetones («👑 Campeón/a de la semana»…). |

## 🎮 Catálogo de juegos (20)

Los de siempre: **🐱 Gato** (el clásico 3 en línea, 2 jugadores) · **🧠 Trivia** (32 preguntas en español aptas para niños, con temporizador y puntos por rapidez) · **🃏 Memoria de parejas** (por turnos; acertar pareja repite turno — y ahora con **mazos temáticos** a elegir al crear: Animales 🦁, Comida 🍕, Vehículos 🚗, Espacio 🚀).

Los nuevos:

| # | Juego | Regla en una línea |
|---|---|---|
| 1 | 🔴 Conecta 4 | Suelta tu ficha en una columna; gana quien junte 4 en línea. |
| 2 | 🐍 Serpientes y Escaleras | Tira el dado y avanza al 100: las escaleras te suben, ¡las serpientes te bajan! |
| 3 | 🔤 Ahorcado | El sistema elige una palabra con pista; por turnos se dicen letras y hay 6 vidas (corazones). |
| 4 | 🎨 Dibujo y Adivina | El dibujante elige 1 de 3 palabras y dibuja en vivo en el lienzo táctil; los demás escriben su intento (60 s por ronda). |
| 5 | 🎲 Parchís | 2 fichas por jugador en un circuito de 40: con un 5 sales de casa, capturas al caer en la casilla de un rival (⭐ = segura), y la meta pide cuenta exacta o rebota. |
| 6 | 🁢 Dominó | Mano de 7 fichas (0–6), se coloca por los extremos; sin ficha se roba del pozo y al bloquear gana la mano más ligera. |
| 7 | 🚢 Batalla Naval | 2 jugadores, tablero 8×8 y 3 barcos (3,2,2) colocados al azar (🔀 recolocar antes de empezar); acierto repite turno. |
| 8 | 🔎 Sopa de Letras | Rejilla 10×10 con 6 palabras escondidas; todos buscan a la vez tocando la primera y la última letra. |
| 9 | ✋ ¡Basta! (Stop) | Letra al azar y 5 categorías (Nombre, Animal, Comida, Ciudad o país, Cosa); 60 s o el primer «¡Basta!»: única = 10, repetida = 5, vacía = 0. |
| 10 | 🔴 Simón Dice | Una secuencia de colores con sonido que crece cada ronda; por turnos se repite y quien falla queda fuera. |
| 11 | ➕ Cálculo Rápido | La misma operación (+, −, ×) para todos; el primero en acertar se lleva la ronda (10 rondas). |
| 12 | ✊ Piedra, Papel o Tijera | Elección simultánea y secreta que se revela cuando todos eligieron; gana quien llegue a 3 rondas. |
| 13 | 🔢 Adivina el Número | El sistema piensa un número del 1 al 100 y da pistas (mayor/menor); acertar con menos intentos da más puntos (3 rondas). |

Paquete de memoria 🧠: **🤔 ¿Qué falta?** (se miran unos objetos, uno se esconde y hay que decir cuál falta; cada ronda hay más) · **🔢 Recuerda el Orden** (una fila de emojis se voltea y cada quien la reproduce tocando en orden: 5 pts por posición y +10 por la fila entera) · **🧮 Memoria de Números** (un número aparece unos segundos y crece cada ronda: empieza en 4 dígitos).

Juegos bíblicos 📖 (desde la pestaña Biblia o desde Juegos): **📖 Trivia Bíblica** (el motor de trivia con banco propio de 32 preguntas para niños) · **🕊️ Memoria Bíblica** (8 parejas: paloma, arca, estrella, cordero, pez, pan, león y corona, con su nombre al voltear) · **✍️ Completa el Versículo** (22 versículos con una palabra faltante y 4 opciones; rápido = más puntos).

**Puntos de campeones:** cada partida suma una sola vez a la tabla — ganar una partida de tablero/duelo = 50 · Memoria 10 por pareja · Sopa 10 por palabra · Simón: rondas ×10 + 20 al ganador · el resto suma su propio puntaje (y Cálculo agrega +20 al campeón).

## 📖 Pestaña Biblia

- **Versículo del día:** banco de 60 versículos cortos en español para la familia, con su cita; rota solo según la fecha. **Al tocarlo se lee en grande en una capa sobrepuesta** (v3.2), y el botón **«Compartir con todos»** lo muestra igual de grande en la pantalla de los demás (viaja por *broadcast* de Supabase Realtime en el canal de la sala — sin tablas nuevas; es un aviso en vivo, no queda guardado).
- **Historias para leer juntos (v3):** **36 historias ilustradas** que recorren toda la Biblia en orden — 22 del Antiguo Testamento y 14 del Nuevo —, cada una recontada en palabras sencillas para un niño de 9 años (4–6 párrafos), con su **ilustración en acuarela** (carpeta `biblia-img/`, una por historia), su cita y una pregunta final para conversar. Al tocar una, **se abre en la misma capa sobrepuesta** (v3.2). **«Leer para todos»** sincroniza la historia abierta **con su ilustración** en las demás pantallas, igual que el versículo: por *broadcast*, sin tablas nuevas.

## 🤝 Notas de honor (sistema familiar)

- **Batalla Naval:** los barcos de cada jugador viajan en el mismo JSON de la partida (así funciona la sincronización simple de la app), así que **no hay ocultamiento técnico real**: es un juego de honor familiar — prometido no espiar la pantalla ni los datos del rival. Se eligió así a propósito para mantener la app simple y sin servidor propio.
- **¡Basta!:** cada quien marca con honestidad si sus propias respuestas valen; la app solo aplica la regla de puntaje (única/repetida/vacía) sobre lo marcado.
- **Dibujo y Adivina:** la palabra secreta también vive en el estado compartido; vale lo mismo: no espiar, ¡a adivinar de verdad!

## 🔔 Avisos de llamada (v2)

Cómo funciona, sin magia:

1. Cada persona activa los avisos **una vez por aparato** (Sala → «🔔 Activar avisos de llamada»): el navegador pide permiso y la suscripción queda guardada en la tabla `suscripciones_push` (cada quien solo ve las suyas; la clave pública VAPID va en `config.js` y la **privada jamás sale de la Edge Function**).
2. Cuando alguien toca «Unirse a la voz», la app invoca la función `avisar-llamada` (una sola vez por sesión de llamada), que valida su JWT, busca las suscripciones de los **demás** y envía el push. Las suscripciones muertas (404/410) se limpian solas.
3. El service worker (`sw.js`) muestra la notificación y al tocarla enfoca la app (o la abre) en la Sala. Si la app está abierta — o se abre desde la notificación — y la llamada sigue viva, aparece la **tarjeta grande «{nombre} te está llamando… 📹»** con el **tono de llamada en bucle** (WebAudio, sin archivos) y botones **Contestar** (te une a la voz) / **Ahora no**.

**Límites honestos del timbre:**

- Con la app **totalmente cerrada**, lo que suena es el **sonido de notificación del sistema** (el del aparato), no el tono de llamada de la app: el tono en bucle suena cuando la app está abierta o al abrirla desde la notificación.
- En **iPhone/iPad**, Web Push exige la PWA **instalada en la pantalla de inicio** y **iOS/iPadOS 16.4 o más nuevo**; desde la pestaña de Safari no llegan. En Android/PC basta Chrome/Edge con la app instalada o abierta.
- El **timbre de llamada «de verdad» con la pantalla bloqueada** (como WhatsApp) llegará con la **versión nativa de tiendas**: será esta misma app envuelta (sin reconstruir), con push nativo.
- **Compartir pantalla en iPhone/iPad (v3):** Safari **no ofrece** `getDisplayMedia` en iOS/iPadOS, así que en el iPhone y el iPad el botón «🖥️ Compartir pantalla» **simplemente no aparece** (en PC y Android sí, dentro de la llamada de voz). La salida: en la **app nativa de tienda** (esta misma app envuelta con Capacitor) iOS sí permite capturar la pantalla mediante su **extensión de transmisión del sistema (ReplayKit)**, y ahí el compartir pantalla llegará con la misma malla WebRTC.

## 🎙️ Notas de voz (v2)

- Botón **🎤** junto al campo del chat: tocar para grabar; mientras graba se ve el **tiempo corriendo** y se puede **❌ Descartar** o **✅ Enviar**. Límite de **3 minutos**: al llegar, la grabación se detiene sola y queda lista para enviar o descartar.
- El audio se sube al bucket **privado** `audios` de Supabase Storage (cada quien sube en su carpeta `<user_id>/…`; la familia autenticada puede escuchar) y el mensaje guarda `audio_path` + `audio_seg`. La reproducción pide una **URL firmada temporal (1 h)** al tocar ▶️, con botón play/pausa y barra de progreso. Las reacciones funcionan igual en los audios.
- **El formato depende del navegador que graba** (MediaRecorder): **Safari graba MP4/AAC, que suena en todos**; **Chrome graba WebM/Opus, que puede NO sonar en Safari/iPad**. En la práctica: las notas grabadas desde el iPad/iPhone se escuchan en todas partes; las grabadas en Chrome se escuchan en Chrome/Android, y en el iPad podrían fallar (la app lo avisa si pasa). Convertir formatos en el servidor queda fuera de esta versión.
- Sin permiso de micrófono o sin MediaRecorder, la app lo dice claro y el botón de grabar se esconde; el resto del chat no se afecta.

## Archivos

```
index.html            La página única (todas las pantallas, 5 pestañas)
styles.css            Estilos: tablet primero, táctil, colores cálidos
app.js                Cliente: auth, presencia, juegos, cine, voz+video, chat, biblia, push
logic.js              Lógica pura de gato/trivia/memoria + sincronización (Node)
games.js              Lógica pura de los 17 juegos nuevos + bancos bíblicos (Node)
fun.js                Confeti, sonidos WebAudio, tono de llamada, reacciones y estado de video puro
config.js             ← RELLENAR AQUÍ las claves (ver pasos; la VAPID pública ya viene puesta)
sw.js                 Service worker: caché de la app (PWA) + notificaciones push
supabase-schema.sql   Tablas + RLS (solo autenticados) + Realtime + bucket `audios`
supabase/functions/avisar-llamada/index.ts   Edge Function del aviso de llamada (Deno + Web Push)
manifest.json         PWA: «Nuestro Rincón»
push-keys.local.txt   ⚠️ LOCAL Y SECRETO: el par VAPID. NUNCA subir (está en .gitignore)
tests/run-tests.js    Batería de pruebas (node tests/run-tests.js → 83/83)
```

## Pasos para publicar

### 1. Crear el proyecto de Supabase *(cuenta de Rafiel)*
1. Entra a [supabase.com](https://supabase.com) y crea un proyecto nuevo (plan gratuito basta; región cercana a EE. UU.).
2. En **SQL Editor**, pega todo el contenido de `supabase-schema.sql` y pulsa **Run** (una sola vez).
3. En **Authentication → Users → Add user**, crea **a mano los 3 usuarios** de la familia (correo + contraseña de cada uno). No hay registro público: nadie más puede entrar.
4. En **Settings → API**, copia el **Project URL** y la clave **anon public**.

### 2. Conseguir la clave de YouTube *(cuenta de Google de Rafiel, gratuita)*
1. Entra a [Google Cloud Console](https://console.cloud.google.com), crea un proyecto.
2. En **APIs y servicios → Biblioteca**, activa **YouTube Data API v3**.
3. En **Credenciales → Crear credenciales → Clave de API**, copia la clave.
   (Opcional pero recomendado: restringe la clave al dominio donde publiques la app.)

### 3. Rellenar `config.js`
Pega los valores en los huecos marcados:
```js
SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
SUPABASE_ANON_KEY: 'eyJ…(la anon public)',
YOUTUBE_API_KEY: 'AIza…'
```
La `VAPID_PUBLIC_KEY` **ya viene puesta** (se generó el par el 2026-10-31; no hay que tocarla). Solo va la clave **anon** de Supabase en el cliente — jamás la `service_role`. La seguridad real la da el RLS: sin login de familia, no se lee ni se escribe nada.

### 4. Subir a GitHub Pages *(cuenta de GitHub de Rafiel)*
1. Crea un repositorio y sube los archivos de esta carpeta, tal cual, con `index.html` en la raíz — **EXCEPTO `push-keys.local.txt`** (es secreto; si usas git, `.gitignore` ya lo excluye, igual que `previews/`). La carpeta `supabase/` (esquema y función) puede subirse: no contiene secretos, pero tampoco la necesita GitHub Pages.
2. En **Settings → Pages**, publica desde la rama principal.
3. Abre la URL que dé GitHub Pages: cada miembro entra con su correo y contraseña, elige nombre y avatar la primera vez… ¡y a jugar! 🎉
4. Para los avisos en iPhone/iPad: cada quien abre esa URL en Safari → Compartir → **«Agregar a pantalla de inicio»**, abre la app desde el icono y activa los avisos en la Sala.

### 5. Avisos de llamada: secreto VAPID + desplegar la función *(una sola vez)*
Sin este paso la app funciona igual, pero los aparatos con la app cerrada no reciben el aviso de llamada.
1. Instala la [CLI de Supabase](https://supabase.com/docs/guides/cli) y enlaza el proyecto (`supabase link --project-ref TU-PROYECTO`).
2. Pega los secretos (los valores están en `push-keys.local.txt`, que NO se sube a ningún lado):
   ```
   supabase secrets set VAPID_PUBLIC_KEY=<la pública> VAPID_PRIVATE_KEY=<la privada>
   ```
   (Opcional: `VAPID_SUBJECT=mailto:tu@correo` como contacto ante los servicios de push.)
3. Despliega la función:
   ```
   supabase functions deploy avisar-llamada
   ```
   La función usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, que Supabase inyecta solo: no hay que pegarlos.
4. Prueba real: en un aparato activa los avisos (Sala), cierra la app en ese aparato y, desde otro, entra a la voz: debe llegar la notificación «📹 {nombre} te está llamando en Nuestro Rincón».

## Notas honestas

- **La voz y el video comparten micrófono/cámara del navegador**: funcionan con la **app abierta en Safari/Chrome** y los **permisos de micrófono y cámara aceptados**. La cámara es opcional siempre: sin permiso o sin cámara, el botón se esconde con un mensaje claro y **la voz sigue funcionando**; quien apaga su cámara vuelve a mostrar su avatar en los mosaicos.
- **Los avisos de llamada (v2) ya despiertan la app cerrada**, pero con matices: con la app cerrada suena el **sonido de notificación del sistema**, no el tono de llamada; en iOS hace falta la PWA instalada y iOS 16.4+ (detalle en «Avisos de llamada»). El timbre tipo WhatsApp con pantalla bloqueada llega con la versión nativa de tiendas — esta misma app envuelta, sin reconstruir. Si la función `avisar-llamada` no está desplegada (paso 5), no llegan avisos con la app cerrada y todo lo demás sigue igual.
- Algunos videos de YouTube no permiten verse fuera de YouTube (decisión de sus dueños): la app lo avisa sin romperse.
- La sincronización de video de YouTube es de «sala familiar» (precisión ~1 s con corrección de deriva), no de cine profesional.
- En redes móviles muy restrictivas, la voz/video P2P podría necesitar un servidor TURN (no incluido en la v1; el STUN de Google resuelve la mayoría de los casos en casa).
- Los cierres por tiempo de varios juegos (rondas de Dibujo/¡Basta!, ocultar los retos de memoria, revelar Trivia/Versículo) los ejecuta el anfitrión de la partida: conviene que el anfitrión tenga la partida abierta en su pantalla.

## Pruebas

```
node tests/run-tests.js
```
83 pruebas: las 69 anteriores (juegos, bancos, Biblia, sincronización, campeones, estado de video, sintaxis/carga) + 14 de la v2 — detección de mensaje solo-emojis (1–3, con ZWJ/banderas/tonos de piel), aplicar/quitar reacciones sin mutar y su resumen ordenado, forma de la suscripción Web Push (acepta la de `toJSON()`, rechaza incompletas), formato de duración y límite de grabación de 3:00, tono de llamada sin navegador, presencia de los IDs nuevos en `index.html`, service worker con `push`/`notificationclick`, Edge Function que valida el JWT y lee la privada del entorno, esquema v2 (reacciones, audios, push, bucket) y **higiene de secretos: la clave VAPID privada no aparece en ningún archivo publicable**. **Resultado: 83 pasadas, 0 fallos.** Además, la v2 se verificó en un navegador real (Chromium local con Supabase simulado): service worker registrado, panel de emojis con 102 emojis en 6 grupos, mensajes solo-emoji grandes, burbuja de audio con duración y progreso, y reacciones optimistas al tocar un mensaje — sin errores de JS.

/* =====================================================================
   fun.js — La capa de diversión de Nuestro Rincón 🎉
   Confeti en canvas (sin librerías), sonidos alegres con WebAudio
   (sin archivos) y reacciones flotantes. Todo tolerante a fallos:
   si algo no se puede, la app sigue como si nada.
   ===================================================================== */
(function (global) {
  'use strict';

  var SILENCIO_KEY = 'nr_silencio';
  var silenciado = false;
  try { silenciado = global.localStorage && global.localStorage.getItem(SILENCIO_KEY) === '1'; } catch (e) { /* sin almacenamiento */ }

  /* ------------------------- SONIDOS (WebAudio) ------------------------- */
  var ctxAudio = null;
  function audio() {
    if (typeof window === 'undefined') return null;
    if (!ctxAudio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctxAudio = new AC(); } catch (e) { return null; }
    }
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
    return ctxAudio;
  }

  function tono(freq, inicio, duracion, tipo, volumen) {
    var ac = audio();
    if (!ac || silenciado) return;
    var osc = ac.createOscillator();
    var gan = ac.createGain();
    var t0 = ac.currentTime + inicio;
    osc.type = tipo || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gan.gain.setValueAtTime(0.0001, t0);
    gan.gain.exponentialRampToValueAtTime(volumen || 0.15, t0 + 0.02);
    gan.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
    osc.connect(gan); gan.connect(ac.destination);
    osc.start(t0); osc.stop(t0 + duracion + 0.05);
  }

  var MELODIAS = {
    acierto:  [[523, 0, 0.12], [659, 0.09, 0.12], [784, 0.18, 0.2]],                    // do-mi-sol alegre
    victoria: [[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.32], [784, 0.52, 0.1], [1047, 0.6, 0.4]],
    turno:    [[440, 0, 0.09, 'triangle', 0.1]],
    error:    [[330, 0, 0.14, 'triangle', 0.1], [262, 0.13, 0.2, 'triangle', 0.1]],     // bajada simpática, sin castigo
    pop:      [[880, 0, 0.07, 'square', 0.05]],
    mensaje:  [[659, 0, 0.1], [880, 0.08, 0.14]],
    // v3.4.3: el toque suave de CADA interacción (botones y piezas). Una
    // sola nota senoidal, cortísima y bajita: acompaña, nunca estorba.
    toque:    [[740, 0, 0.05, 'sine', 0.05]],
    // v3.4.3: el cierre suave cuando la partida la ganó OTRO (o nadie):
    // dos notas tranquilas que bajan, la mitad de volumen que la
    // victoria — se distingue sin castigar.
    cierre:   [[392, 0, 0.14, 'triangle', 0.08], [330, 0.13, 0.24, 'triangle', 0.08]]
  };

  // v3.4.3: última vez que sonó algo. El manejador global de toques de
  // app.js lo consulta para NO duplicar: si el propio juego ya sonó
  // (acierto, error, la nota de un color de Simón…), el toque genérico
  // se calla y manda el sonido con significado.
  var ultimaEmision = 0;
  function huboSonidoReciente(ms) {
    return (Date.now() - ultimaEmision) < (ms || 150);
  }

  function sonido(nombre) {
    if (silenciado) return;
    var notas = MELODIAS[nombre];
    if (!notas) return;
    ultimaEmision = Date.now();
    notas.forEach(function (n) { tono(n[0], n[1], n[2], n[3], n[4]); });
  }

  function alternarSilencio() {
    silenciado = !silenciado;
    try { global.localStorage.setItem(SILENCIO_KEY, silenciado ? '1' : '0'); } catch (e) { /* nada */ }
    return silenciado;
  }

  // Nota suelta con retardo: la usa Simón Dice para sonar sus colores.
  function nota(freq, duracionSeg, retardoSeg) {
    if (!silenciado) ultimaEmision = Date.now();
    tono(freq, retardoSeg || 0, duracionSeg || 0.28, 'triangle', 0.16);
  }

  /* ------------- TONO DE LLAMADA (WebAudio, en bucle, sin archivos) ------------- */
  // Una melodía suave de dos notas que se repite mientras la tarjeta de
  // llamada entrante está visible. Respeta el silencio global de la app:
  // si la familia silenció los sonidos, no suena (pero el bucle sigue
  // «corriendo» en vacío hasta que se detiene).
  var tonoLlamadaTimer = null;
  function patronLlamada() {
    tono(1047, 0, 0.22, 'triangle', 0.1);
    tono(1319, 0.16, 0.34, 'triangle', 0.1);
  }
  function iniciarTonoLlamada() {
    if (tonoLlamadaTimer) return; // ya está sonando
    patronLlamada();
    tonoLlamadaTimer = setInterval(patronLlamada, 2400);
  }
  function detenerTonoLlamada() {
    if (tonoLlamadaTimer) { clearInterval(tonoLlamadaTimer); tonoLlamadaTimer = null; }
  }
  function tonoLlamadaActivo() { return !!tonoLlamadaTimer; }

  /* ------------------------- CONFETI (canvas) ------------------------- */
  var COLORES_CONFETI = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#f368e0', '#ff9f43', '#54a0ff'];
  var confetiActivo = null;

  function confeti(opciones) {
    if (typeof document === 'undefined') return;
    opciones = opciones || {};
    var cantidad = opciones.cantidad || 120;
    var duracionMs = opciones.duracionMs || 2600;
    var canvas = document.getElementById('confeti-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confeti-canvas';
      document.body.appendChild(canvas);
    }
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    var piezas = [];
    for (var i = 0; i < cantidad; i++) {
      piezas.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.3,
        w: 6 + Math.random() * 7,
        h: 8 + Math.random() * 8,
        color: COLORES_CONFETI[i % COLORES_CONFETI.length],
        vy: 2 + Math.random() * 3.5,
        vx: -1.5 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: -0.1 + Math.random() * 0.2
      });
    }
    if (confetiActivo) cancelAnimationFrame(confetiActivo);
    var inicio = performance.now();
    (function pintar(ahora) {
      var avance = ahora - inicio;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      piezas.forEach(function (p) {
        p.y += p.vy; p.x += p.vx + Math.sin((avance + p.y) / 200); p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (avance < duracionMs) {
        confetiActivo = requestAnimationFrame(pintar);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
        confetiActivo = null;
      }
    })(inicio);
  }

  /* ------------------- PANTALLA JUGUETONA DE VICTORIA ------------------- */
  function pantallaGanador(textoPrincipal, textoSecundario) {
    if (typeof document === 'undefined') return;
    var capa = document.getElementById('capa-ganador');
    if (!capa) return;
    var titulo = capa.querySelector('.ganador-titulo');
    var sub = capa.querySelector('.ganador-sub');
    if (titulo) titulo.textContent = textoPrincipal || '¡Ganaste! 🎉';
    if (sub) sub.textContent = textoSecundario || '';
    capa.classList.add('visible');
    confeti({});
    sonido('victoria');
    setTimeout(function () { capa.classList.remove('visible'); }, 3400);
    capa.onclick = function () { capa.classList.remove('visible'); };
  }

  /* ---------------------- REACCIONES FLOTANTES ---------------------- */
  var EMOJIS_REACCION = ['😂', '❤️', '👏', '🎉', '😮', '🔥'];
  function reaccionFlotante(emoji) {
    if (typeof document === 'undefined') return;
    var zona = document.getElementById('zona-reacciones');
    if (!zona) return;
    var el = document.createElement('div');
    el.className = 'reaccion-flotante';
    el.textContent = emoji;
    el.style.left = (8 + Math.random() * 84) + '%';
    zona.appendChild(el);
    sonido('pop');
    setTimeout(function () { el.remove(); }, 3100);
  }

  /* ------------- ESTADO DE VIDEO (puro, sin DOM: probado en Node) ------------- */
  // Mapa idParticipante -> 'camara' cuando tiene la cámara encendida.
  // Sin entrada = se muestra su avatar. Nunca muta el mapa original.
  function registrarVideo(mapa, id, activo) {
    var nuevo = {};
    Object.keys(mapa || {}).forEach(function (k) { nuevo[k] = mapa[k]; });
    if (activo) nuevo[id] = 'camara';
    else delete nuevo[id];
    return nuevo;
  }
  function tieneVideo(mapa, id) {
    return !!(mapa && mapa[id] === 'camara');
  }
  function participantesConVideo(mapa) {
    return Object.keys(mapa || {}).filter(function (id) { return mapa[id] === 'camara'; });
  }

  /* ------------- COMPARTIR PANTALLA (puro, sin DOM: probado en Node) ------------- */
  // ¿Este navegador puede capturar la pantalla? getDisplayMedia existe en
  // computadora y Android; en iPhone/iPad (Safari) NO existe, así que el botón
  // ni aparece. (En la app nativa de tienda sí se podrá, vía ReplayKit.)
  function pantallaSoportada(nav) {
    var n = nav || (typeof navigator !== 'undefined' ? navigator : null);
    return !!(n && n.mediaDevices && typeof n.mediaDevices.getDisplayMedia === 'function');
  }
  // Mapa idParticipante -> 'pantalla' cuando está compartiendo. Nunca muta.
  function registrarPantalla(mapa, id, activa) {
    var nuevo = {};
    Object.keys(mapa || {}).forEach(function (k) { nuevo[k] = mapa[k]; });
    if (activa) nuevo[id] = 'pantalla';
    else delete nuevo[id];
    return nuevo;
  }
  function tienePantalla(mapa, id) {
    return !!(mapa && mapa[id] === 'pantalla');
  }
  function participantesConPantalla(mapa) {
    return Object.keys(mapa || {}).filter(function (id) { return mapa[id] === 'pantalla'; });
  }

  /* ------------- CHAT: EMOJIS Y REACCIONES (puro, probado en Node) ------------- */
  // Las 5 reacciones que se pueden poner a un mensaje (fila rápida).
  var EMOJIS_REACCION_MENSAJE = ['😂', '❤️', '👍', '🎉', '😮'];

  // Un «emoji» para contar = pictograma (con su tono de piel y su ️),
  // secuencias unidas con ZWJ (👨‍👩‍👧 cuenta 1), banderas (pareja de
  // indicadores regionales) y teclas numéricas (1️⃣).
  // SAFARI: la regex se construye con new RegExp dentro de try/catch. Como
  // literal, \p{…} es un SyntaxError en Safari < 11.1 y tumbaría TODO fun.js
  // (y con él la app entera). Si falta \p{}, se cae a rangos por pares
  // subrogados, que cubren la inmensa mayoría de los emojis.
  var RE_EMOJI = null;
  try {
    RE_EMOJI = new RegExp('(\\p{Extended_Pictographic}[\\u{1F3FB}-\\u{1F3FF}]?[\\uFE0F\\u20E3]?(?:\\u200D\\p{Extended_Pictographic}[\\u{1F3FB}-\\u{1F3FF}]?[\\uFE0F\\u20E3]?)*|[\\u{1F1E6}-\\u{1F1FF}]{2}|[0-9#*]\\uFE0F?\\u20E3)', 'gu');
  } catch (eSinP) {
    try {
      RE_EMOJI = new RegExp('([\\uD83C-\\uD83E][\\uDC00-\\uDFFF](?:\\u200D[\\uD83C-\\uD83E][\\uDC00-\\uDFFF])?|[\\u2600-\\u27BF][\\uFE0F\\u20E3]?|[0-9#*]\\uFE0F?\\u20E3)', 'g');
    } catch (eSinU) { RE_EMOJI = null; }
  }

  function analizarEmojis(texto) {
    var t = String(texto == null ? '' : texto);
    if (!RE_EMOJI) return { emojis: [], resto: t.replace(/\s+/g, '') };
    var emojis = t.match(RE_EMOJI) || [];
    var resto = t.replace(RE_EMOJI, '').replace(/\s+/g, '');
    return { emojis: emojis, resto: resto };
  }
  function contarEmojis(texto) { return analizarEmojis(texto).emojis.length; }

  // ¿El mensaje es SOLO emojis (entre 1 y «maximo», 3 por defecto)?
  // Así el chat lo pinta grande y sin bocadillo, como en WhatsApp.
  function esSoloEmojis(texto, maximo) {
    var a = analizarEmojis(texto);
    return a.resto === '' && a.emojis.length >= 1 && a.emojis.length <= (maximo || 3);
  }

  // Reacciones de un mensaje: { "😂": [{ id, nombre }, …], … }.
  // Alternar = si esa persona ya reaccionó con ese emoji, se lo quita;
  // si no, se lo añade. Nunca muta el objeto original.
  function alternarReaccion(reacciones, emoji, id, nombre) {
    var nuevo = {};
    Object.keys(reacciones || {}).forEach(function (k) {
      nuevo[k] = (reacciones[k] || []).map(function (r) { return { id: r.id, nombre: r.nombre }; });
    });
    var lista = nuevo[emoji] || [];
    var idx = -1;
    lista.forEach(function (r, i) { if (r.id === id) idx = i; });
    if (idx >= 0) lista.splice(idx, 1);
    else lista.push({ id: id, nombre: nombre });
    if (lista.length) nuevo[emoji] = lista;
    else delete nuevo[emoji];
    return nuevo;
  }

  // Para pintar las pastillitas bajo el mensaje: [{ emoji, total, nombres }]
  // en el orden de la fila rápida (y después cualquier otro emoji guardado).
  function resumenReacciones(reacciones) {
    var claves = Object.keys(reacciones || {});
    var ordenadas = EMOJIS_REACCION_MENSAJE.filter(function (e) { return claves.indexOf(e) !== -1; })
      .concat(claves.filter(function (e) { return EMOJIS_REACCION_MENSAJE.indexOf(e) === -1; }));
    return ordenadas.map(function (emoji) {
      var lista = reacciones[emoji] || [];
      return { emoji: emoji, total: lista.length, nombres: lista.map(function (r) { return r.nombre; }) };
    }).filter(function (r) { return r.total > 0; });
  }

  // Forma de una suscripción Web Push (la que da subscription.toJSON()):
  // devuelve { endpoint, p256dh, auth } lista para guardar, o null si
  // le falta algo. Así la app nunca guarda una suscripción a medias.
  function formaSuscripcion(suscripcion) {
    if (!suscripcion || typeof suscripcion !== 'object') return null;
    var endpoint = suscripcion.endpoint;
    var claves = suscripcion.keys || {};
    var p256dh = claves.p256dh;
    var auth = claves.auth;
    if (typeof endpoint !== 'string' || endpoint.indexOf('https://') !== 0) return null;
    if (typeof p256dh !== 'string' || !p256dh) return null;
    if (typeof auth !== 'string' || !auth) return null;
    return { endpoint: endpoint, p256dh: p256dh, auth: auth };
  }

  /* ------------- NOTAS DE VOZ: duración (puro, probado en Node) ------------- */
  var GRABACION_MAX_SEG = 180; // 3 minutos, como en WhatsApp

  // 0 → «0:00» · 65 → «1:05» · 180 → «3:00». Basura o negativos → «0:00».
  function formatoDuracion(segundos) {
    var s = Math.floor(Number(segundos) || 0);
    if (s < 0) s = 0;
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  /* ------------- MÁS APPS: ENLACES DE OTRAS PLATAFORMAS (puro, probado en Node) -------------
     v3.4 · Pedido del dueño: «solo aparece YouTube y quiero las demás apps».
     La verdad de cada casa, sin inventar:
     · YouTube: busca Y suena aquí dentro (es el módulo de siempre).
     · Spotify, Apple Music y SoundCloud: SÍ suenan aquí dentro, pero solo
       pegando su ENLACE y con el reproductor OFICIAL incrustado de cada
       plataforma (su buscador interno exige credenciales de desarrollador
       de cada una: por eso no hay búsqueda para estas).
     · Netflix, Disney+, Prime Video, Max, TikTok, Twitch…: NO dejan
       sonar dentro de otras apps (lo bloquea la plataforma, no nosotros).
       Con esos, el enlace se ABRE en la app de cada aparato.
     Estas funciones solo CLASIFICAN texto: sin red y sin DOM. Nada de lo
     que devuelven lleva HTML del usuario: la URL incrustada se CONSTRUYE
     aquí, pieza a pieza, desde el enlace pegado. */

  // Deja el texto como URL http(s) o devuelve null. Sin esquema pero con
  // pinta de dominio («open.spotify.com/…») se le pone https:// delante.
  // Con espacios o comillas no vale: jamás se inyecta tal cual en un src.
  function normalizarEnlace(texto) {
    var t = String(texto == null ? '' : texto).trim();
    if (!t) return null;
    if (!/^https?:\/\//i.test(t)) {
      if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(t)) t = 'https://' + t;
      else return null;
    }
    if (/[\s<>"']/.test(t)) return null;
    return t;
  }
  function partesEnlace(url) {
    var m = /^https?:\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#[\s\S]*)?$/i.exec(url || '');
    if (!m) return null;
    return { host: m[1].toLowerCase().replace(/^www\./, ''), ruta: m[2] || '/', query: m[3] || '' };
  }

  // ¿Este enlace suena AQUÍ DENTRO con el reproductor oficial incrustado?
  // → { plataforma, nombre, icono, embed, altura } o null si no.
  function enlaceIncrustable(texto) {
    var crudo = String(texto == null ? '' : texto).trim();
    // Spotify también copia como URI («spotify:track:…») desde su app de escritorio.
    var uri = /^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]+)$/.exec(crudo);
    if (uri) {
      return { plataforma: 'spotify', nombre: 'Spotify', icono: '🎵',
        altura: (uri[1] === 'track' || uri[1] === 'episode') ? 152 : 352,
        embed: 'https://open.spotify.com/embed/' + uri[1] + '/' + uri[2] + '?utm_source=generator' };
    }
    var url = normalizarEnlace(crudo);
    if (!url) return null;
    var p = partesEnlace(url);
    if (!p) return null;
    if (p.host === 'open.spotify.com' || p.host === 'play.spotify.com') {
      var seg = p.ruta.split('/').filter(function (s) { return !!s; });
      if (seg[0] && /^intl-[a-z]{2}(-[a-z]{2})?$/i.test(seg[0])) seg.shift(); // «/intl-es/track/…»
      var TIPOS = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];
      if (TIPOS.indexOf(seg[0]) !== -1 && /^[A-Za-z0-9]+$/.test(seg[1] || '')) {
        return { plataforma: 'spotify', nombre: 'Spotify', icono: '🎵',
          altura: (seg[0] === 'track' || seg[0] === 'episode') ? 152 : 352,
          embed: 'https://open.spotify.com/embed/' + seg[0] + '/' + seg[1] + '?utm_source=generator' };
      }
      return null;
    }
    if (p.host === 'music.apple.com') {
      var segs = p.ruta.split('/').filter(function (s) { return !!s; });
      if (segs.length >= 2) {
        // El reproductor incrustado oficial es el MISMO camino en
        // embed.music.apple.com (álbum, canción, lista, emisora…).
        var esCancion = p.ruta.indexOf('/song/') !== -1 || /(^|&)i=\d+/.test(p.query);
        return { plataforma: 'apple', nombre: 'Apple Music', icono: '🍎',
          altura: esCancion ? 150 : 450,
          embed: 'https://embed.music.apple.com' + p.ruta + (p.query ? '?' + p.query : '') };
      }
      return null;
    }
    if (p.host === 'soundcloud.com' || p.host === 'm.soundcloud.com') {
      var ss = p.ruta.split('/').filter(function (s) { return !!s; });
      var RESERVADAS = ['discover', 'stream', 'search', 'upload', 'settings', 'messages', 'notifications', 'charts', 'popular', 'you', 'terms', 'pages'];
      if (ss.length >= 2 && RESERVADAS.indexOf(ss[0]) === -1) {
        var limpia = 'https://soundcloud.com/' + ss.join('/');
        return { plataforma: 'soundcloud', nombre: 'SoundCloud', icono: '🧡', altura: 166,
          embed: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(limpia) +
            '&color=%23ff8a5c&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false' };
      }
      return null;
    }
    return null;
  }

  // El id de un enlace de YouTube (para mandarlo al reproductor de la
  // casa si alguien lo pega en «Más apps» en vez de buscarlo).
  function idVideoYouTube(texto) {
    var url = normalizarEnlace(texto);
    if (!url) return null;
    var p = partesEnlace(url);
    if (!p) return null;
    function idOk(s) { return /^[A-Za-z0-9_-]{6,}$/.test(s || '') ? s : null; }
    if (p.host === 'youtu.be') return idOk(p.ruta.split('/').filter(function (s) { return !!s; })[0]);
    if (p.host === 'youtube.com' || p.host === 'm.youtube.com' || p.host === 'music.youtube.com') {
      var mv = /(^|&)v=([A-Za-z0-9_-]{6,})/.exec(p.query);
      if (mv) return mv[2];
      var seg = p.ruta.split('/').filter(function (s) { return !!s; });
      if (['shorts', 'live', 'embed', 'v'].indexOf(seg[0]) !== -1) return idOk(seg[1]);
    }
    return null;
  }

  // Los que NO suenan aquí dentro: ¿de qué servicio es el enlace?
  // → { nombre, icono, url } (url ya normalizada) o null si ni es enlace.
  var SERVICIOS_EXTERNOS = [
    [/netflix\.com$/, 'Netflix', '🎬'],
    [/disneyplus\.com$/, 'Disney+', '🏰'],
    [/primevideo\.com$/, 'Prime Video', '📦'],
    [/max\.com$/, 'Max', '🎬'],
    [/hbomax\.com$/, 'Max', '🎬'],
    [/tiktok\.com$/, 'TikTok', '🎵'],
    [/twitch\.tv$/, 'Twitch', '🎮'],
    [/hulu\.com$/, 'Hulu', '📺'],
    [/paramountplus\.com$/, 'Paramount+', '⛰️'],
    [/peacocktv\.com$/, 'Peacock', '🦚'],
    [/vimeo\.com$/, 'Vimeo', '📹'],
    [/facebook\.com$/, 'Facebook', '📘'],
    [/instagram\.com$/, 'Instagram', '📸']
  ];
  function servicioExterno(texto) {
    var url = normalizarEnlace(texto);
    if (!url) return null;
    var p = partesEnlace(url);
    if (!p) return null;
    if (/^amazon\./.test(p.host) && (p.ruta.indexOf('/video') !== -1)) {
      return { nombre: 'Prime Video', icono: '📦', url: url };
    }
    for (var i = 0; i < SERVICIOS_EXTERNOS.length; i++) {
      if (SERVICIOS_EXTERNOS[i][0].test(p.host)) {
        return { nombre: SERVICIOS_EXTERNOS[i][1], icono: SERVICIOS_EXTERNOS[i][2], url: url };
      }
    }
    return { nombre: p.host, icono: '🌐', url: url };
  }

  // Segundos que faltan para un instante (la cuenta regresiva de
  // «Abrir para todos»): nunca negativo; a mitad de segundo ya cuenta
  // el segundo entero que se está viviendo (como las cuentas de verdad).
  function restanteRegresiva(abrirEn, ahora) {
    var ms = (Number(abrirEn) || 0) - (Number(ahora) || 0);
    if (ms <= 0) return 0;
    return Math.ceil(ms / 1000);
  }

  var API = {
    sonido: sonido,
    nota: nota,
    huboSonidoReciente: huboSonidoReciente,
    alternarSilencio: alternarSilencio,
    estaSilenciado: function () { return silenciado; },
    iniciarTonoLlamada: iniciarTonoLlamada,
    detenerTonoLlamada: detenerTonoLlamada,
    tonoLlamadaActivo: tonoLlamadaActivo,
    confeti: confeti,
    pantallaGanador: pantallaGanador,
    reaccionFlotante: reaccionFlotante,
    EMOJIS_REACCION: EMOJIS_REACCION,
    EMOJIS_REACCION_MENSAJE: EMOJIS_REACCION_MENSAJE,
    analizarEmojis: analizarEmojis,
    contarEmojis: contarEmojis,
    esSoloEmojis: esSoloEmojis,
    alternarReaccion: alternarReaccion,
    resumenReacciones: resumenReacciones,
    formaSuscripcion: formaSuscripcion,
    GRABACION_MAX_SEG: GRABACION_MAX_SEG,
    formatoDuracion: formatoDuracion,
    MELODIAS: MELODIAS,
    registrarVideo: registrarVideo,
    tieneVideo: tieneVideo,
    participantesConVideo: participantesConVideo,
    pantallaSoportada: pantallaSoportada,
    registrarPantalla: registrarPantalla,
    tienePantalla: tienePantalla,
    participantesConPantalla: participantesConPantalla,
    normalizarEnlace: normalizarEnlace,
    enlaceIncrustable: enlaceIncrustable,
    idVideoYouTube: idVideoYouTube,
    servicioExterno: servicioExterno,
    restanteRegresiva: restanteRegresiva
  };

  global.Fun = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

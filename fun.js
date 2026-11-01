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
    mensaje:  [[659, 0, 0.1], [880, 0.08, 0.14]]
  };

  function sonido(nombre) {
    if (silenciado) return;
    var notas = MELODIAS[nombre];
    if (!notas) return;
    notas.forEach(function (n) { tono(n[0], n[1], n[2], n[3], n[4]); });
  }

  function alternarSilencio() {
    silenciado = !silenciado;
    try { global.localStorage.setItem(SILENCIO_KEY, silenciado ? '1' : '0'); } catch (e) { /* nada */ }
    return silenciado;
  }

  // Nota suelta con retardo: la usa Simón Dice para sonar sus colores.
  function nota(freq, duracionSeg, retardoSeg) {
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

  /* ------------- CHAT: EMOJIS Y REACCIONES (puro, probado en Node) ------------- */
  // Las 5 reacciones que se pueden poner a un mensaje (fila rápida).
  var EMOJIS_REACCION_MENSAJE = ['😂', '❤️', '👍', '🎉', '😮'];

  // Un «emoji» para contar = pictograma (con su tono de piel y su ️),
  // secuencias unidas con ZWJ (👨‍👩‍👧 cuenta 1), banderas (pareja de
  // indicadores regionales) y teclas numéricas (1️⃣).
  var RE_EMOJI = /(\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}]?[\uFE0F\u20E3]?(?:\u200D\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}]?[\uFE0F\u20E3]?)*|[\u{1F1E6}-\u{1F1FF}]{2}|[0-9#*]\uFE0F?\u20E3)/gu;

  function analizarEmojis(texto) {
    var t = String(texto == null ? '' : texto);
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

  var API = {
    sonido: sonido,
    nota: nota,
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
    participantesConVideo: participantesConVideo
  };

  global.Fun = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

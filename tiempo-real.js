/* =====================================================================
   tiempo-real.js — Juegos EN VIVO de Nuestro Rincón ⚡ (v3.8)
   🥊 Arena de Pelea y 🏎️ Gran Premio: acción en canvas, 1–3 jugadores.

   Cómo funciona (diseño de la casa):
   · La fila de `partidas` solo crea la partida, une jugadores, coordina
     el inicio (estado.inicioEn + estado.semilla) y guarda el RESULTADO
     final una sola vez. La acción NO pasa por la base de datos.
   · La acción viaja por un canal Supabase Realtime BROADCAST por
     partida ('rt-<id>'): cada aparato simula SOLO a su jugador y
     transmite su estado ~12 veces por segundo.
   · En la Arena, quien golpea avisa con un evento «golpe»; la VÍCTIMA
     aplica el daño a su propia vida (con su bloqueo) y retransmite.
   · Los huecos sin familiar los llenan bots 🤖. Los simula el anfitrión
     (el primer jugador de la lista) y los retransmite igual que a un
     jugador más; si el anfitrión eres tú en solitario, todo es local.
   · Si el canal falla, el juego sigue local contra bots y se avisa en
     pantalla con un texto corto (nunca se queda colgado).
   La lógica pura (daño, tráfico por semilla, ganadores, cierre con
   puntos) vive en games.js (FamilyGames) y está probada en Node.
   ===================================================================== */
(function (global) {
  'use strict';

  var COLORES = ['#ff5a5a', '#3fa9ff', '#ffb52e'];
  var NOMBRES_BOT = ['🤖 Máquina 1', '🤖 Máquina 2'];
  var activo = null; // la única sesión en vivo abierta (una capa = un juego)

  function G() { return global.FamilyGames || {}; }
  function escapar(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* ============================ sesión ============================ */
  function iniciar(tipo, partida, ctx) {
    if (!partida || !partida.estado || !ctx || !ctx.zona) return;
    if (activo && activo.partidaId === partida.id && activo.tipo === tipo) {
      actualizarDesdePartida(partida);
      return;
    }
    detener();
    var e = partida.estado;
    var sesion = {
      tipo: tipo, partidaId: partida.id, partida: partida, ctx: ctx,
      zona: ctx.zona, yoId: ctx.yoId,
      jugadoresReales: (e.jugadores || []).slice(0, 3),
      semilla: e.semilla != null ? e.semilla : 12345,
      inicioEn: e.inicioEn || null,
      terminado: !!e.terminado, ganador: e.ganador || null,
      finGuardado: false, redOk: false, avisoRedDado: false,
      canal: null, raf: 0, ultimoEnvio: 0, ultimoTick: 0,
      teclas: {}, toques: {}, golpesAplicados: {}, efectos: [],
      participantes: [], porId: {}, inicioLocalEn: 0, finParcialEn: 0,
      teclasHandler: null, teclasUpHandler: null
    };
    sesion.esHost = sesion.jugadoresReales[0] === sesion.yoId;
    sesion.soyParticipante = sesion.jugadoresReales.indexOf(sesion.yoId) !== -1;
    activo = sesion;
    armarRoster(sesion);
    pintarEsqueleto(sesion);
    conectarCanal(sesion);
    sesion.ultimoTick = performance.now();
    var paso = function (t) {
      if (activo !== sesion) return;
      var dt = Math.min(0.05, (t - sesion.ultimoTick) / 1000 || 0.016);
      sesion.ultimoTick = t;
      tick(sesion, dt, t);
      sesion.raf = requestAnimationFrame(paso);
    };
    sesion.raf = requestAnimationFrame(paso);
  }

  function detener() {
    if (!activo) return;
    var sesion = activo;
    activo = null;
    if (sesion.raf) cancelAnimationFrame(sesion.raf);
    if (sesion.teclasHandler) window.removeEventListener('keydown', sesion.teclasHandler);
    if (sesion.teclasUpHandler) window.removeEventListener('keyup', sesion.teclasUpHandler);
    if (sesion.canal && sesion.ctx && sesion.ctx.supa) {
      try { sesion.ctx.supa.removeChannel(sesion.canal); } catch (e) { /* ya no estaba */ }
    }
    sesion.canal = null;
  }

  // La fila cambió en la base (llegó alguien, se fijó el inicio o el
  // anfitrión ya guardó el final): se adopta sin reiniciar la sesión.
  function actualizarDesdePartida(partida) {
    var sesion = activo;
    if (!sesion) return;
    sesion.partida = partida;
    var e = partida.estado || {};
    var antes = sesion.jugadoresReales.join(',');
    sesion.jugadoresReales = (e.jugadores || []).slice(0, 3);
    sesion.esHost = sesion.jugadoresReales[0] === sesion.yoId;
    sesion.soyParticipante = sesion.jugadoresReales.indexOf(sesion.yoId) !== -1;
    if (e.semilla != null) sesion.semilla = e.semilla;
    if (!sesion.inicioEn && e.inicioEn) {
      sesion.inicioEn = e.inicioEn;
      armarRoster(sesion);
      if (sesion.tipo === 'pista') prepararTrafico(sesion);
    } else if (!sesion.inicioEn && antes !== sesion.jugadoresReales.join(',')) {
      armarRoster(sesion);
      pintarLobby(sesion);
    }
    if (e.terminado && !sesion.terminado) terminarLocal(sesion, e.ganador || null);
  }

  function armarRoster(sesion) {
    sesion.participantes = [];
    sesion.porId = {};
    for (var i = 0; i < 3; i++) {
      var real = sesion.jugadoresReales[i];
      var p;
      if (real) {
        p = { id: real, esBot: false, nombre: sesion.ctx.nombreDe(real), emoji: sesion.ctx.emojiDe(real) };
      } else {
        p = { id: 'bot' + (i + 1), esBot: true, nombre: NOMBRES_BOT[i - sesion.jugadoresReales.length] || ('🤖 Máquina ' + (i + 1)), emoji: '🤖' };
      }
      p.color = COLORES[i];
      p.indice = i;
      // Arena
      p.x = 180 + i * 260; p.y = 0; p.vy = 0; p.mirando = i === 1 ? -1 : 1;
      p.vida = G().ARENA_VIDA || 100; p.accion = 'idle'; p.accionHasta = 0;
      p.enfriamientoHasta = 0; p.caminaHasta = 0; p.golpeN = 0;
      p.dest = null; // destino de red para interpolar (remotos y bots ajenos)
      // Gran Premio
      p.distancia = 0; p.carril = i; p.carrilSuave = i; p.velocidad = 0;
      p.chocadoHasta = 0; p.cruzoEn = 0;
      p.bot = { metaVel: 36 + i * 4, siguiente: 0, carrilQuiere: i };
      sesion.participantes.push(p);
      sesion.porId[p.id] = p;
    }
  }
  function miEntidad(sesion) { return sesion.porId[sesion.yoId] || null; }
  function esMioOBotMio(sesion, p) {
    return p && (p.id === sesion.yoId || (p.esBot && sesion.esHost));
  }

  /* ============================ canal ============================ */
  function conectarCanal(sesion) {
    if (!sesion.ctx.supa) { avisarSinRed(sesion); return; }
    try {
      var canal = sesion.ctx.supa.channel('rt-' + sesion.partidaId, {
        config: { broadcast: { self: false } }
      });
      canal
        .on('broadcast', { event: 'estado' }, function (msg) { recibirEstado(sesion, msg.payload); })
        .on('broadcast', { event: 'bots' }, function (msg) { recibirBots(sesion, msg.payload); })
        .on('broadcast', { event: 'golpe' }, function (msg) { recibirGolpe(sesion, msg.payload); })
        .on('broadcast', { event: 'fin' }, function (msg) {
          if (msg.payload && !sesion.terminado) terminarLocal(sesion, msg.payload.ganador || null);
        })
        .subscribe(function (estado) {
          if (estado === 'SUBSCRIBED') sesion.redOk = true;
          else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') avisarSinRed(sesion);
        });
      sesion.canal = canal;
    } catch (e) { avisarSinRed(sesion); }
  }
  function enviar(sesion, evento, payload) {
    if (!sesion.canal || !sesion.redOk) return;
    try {
      var r = sesion.canal.send({ type: 'broadcast', event: evento, payload: payload });
      if (r && typeof r.catch === 'function') r.catch(function () { avisarSinRed(sesion); });
    } catch (e) { avisarSinRed(sesion); }
  }
  function avisarSinRed(sesion) {
    sesion.redOk = false;
    if (sesion.avisoRedDado) return;
    sesion.avisoRedDado = true;
    if (sesion.refAviso) {
      sesion.refAviso.textContent = '📶 Sin conexión en vivo: sigues jugando contra la máquina 🤖';
      sesion.refAviso.classList.remove('oculto');
    }
  }

  function recibirEstado(sesion, datos) {
    if (!datos || !datos.id) return;
    var p = sesion.porId[datos.id];
    if (!p || p.esBot || p.id === sesion.yoId) return;
    p.dest = datos;
    if (typeof datos.vida === 'number') p.vida = datos.vida;
    if (typeof datos.distancia === 'number' && sesion.tipo === 'pista') {
      // En carrera el destino se adopta con suavizado en el tick.
      p.destDistancia = datos.distancia;
      p.destCarril = datos.carril;
      p.velocidad = datos.velocidad || p.velocidad;
    }
    if (datos.accion) p.accionRemota = datos.accion;
    if (datos.terminado && !sesion.terminado) terminarLocal(sesion, datos.ganador || null);
  }
  function recibirBots(sesion, datos) {
    if (sesion.esHost || !datos || !datos.bots) return;
    datos.bots.forEach(function (b) {
      var p = sesion.porId[b.id];
      if (!p || !p.esBot) return;
      p.dest = b;
      if (typeof b.vida === 'number') p.vida = b.vida;
      if (typeof b.distancia === 'number') { p.destDistancia = b.distancia; p.destCarril = b.carril; p.velocidad = b.velocidad || p.velocidad; }
      if (b.accion) p.accionRemota = b.accion;
    });
  }

  /* ============================ esqueleto ============================ */
  function pintarEsqueleto(sesion) {
    var esArena = sesion.tipo === 'arena';
    var controles = esArena
      ? '<button type="button" class="rt-btn" data-rt="izq">◀</button>' +
        '<button type="button" class="rt-btn" data-rt="der">▶</button>' +
        '<button type="button" class="rt-btn" data-rt="salto">⬆<small>Salto</small></button>' +
        '<button type="button" class="rt-btn rt-golpe" data-rt="puno">👊<small>Puño</small></button>' +
        '<button type="button" class="rt-btn rt-golpe" data-rt="patada">🦵<small>Patada</small></button>' +
        '<button type="button" class="rt-btn" data-rt="bloqueo">🛡️<small>Bloqueo</small></button>'
      : '<button type="button" class="rt-btn" data-rt="arriba">▲<small>Carril</small></button>' +
        '<button type="button" class="rt-btn" data-rt="abajo">▼<small>Carril</small></button>' +
        '<button type="button" class="rt-btn rt-golpe" data-rt="acelerar">🚀<small>¡ACELERAR!</small></button>' +
        '<button type="button" class="rt-btn" data-rt="freno">🛑<small>Freno</small></button>';
    sesion.zona.innerHTML =
      '<div class="rt-caja">' +
      '<h3>' + (esArena ? '🥊 Arena de Pelea' : '🏎️ Gran Premio') + '</h3>' +
      '<p class="subtitulo">' + (esArena
        ? 'Pelea en vivo para 3: puño rápido 👊, patada fuerte 🦵 y bloqueo 🛡️. ¡Sin sangre, solo estrellas! 💥'
        : 'Carrera en vivo para 3: mantén pulsado 🚀 ACELERAR, cambia de carril para esquivar el tráfico y llega a los ' + (G().PISTA_META || 1200) + ' m.') + '</p>' +
      '<div class="rt-lobby"></div>' +
      '<div class="rt-hud"></div>' +
      '<canvas class="rt-canvas" width="900" height="' + (esArena ? 420 : 360) + '"></canvas>' +
      '<div class="rt-aviso aviso oculto"></div>' +
      '<div class="rt-controles">' + controles + '</div>' +
      '<p class="subtitulo rt-ayuda">' + (esArena
        ? 'En computadora: flechas o A/D para moverte, W/↑ saltar, J puño, K patada, L bloquear.'
        : 'En computadora: ↑/↓ (o W/S) cambian de carril, mantén ESPACIO para acelerar y B para frenar.') + '</p>' +
      '</div>';
    sesion.canvas = sesion.zona.querySelector('.rt-canvas');
    sesion.g2d = sesion.canvas.getContext('2d');
    sesion.refLobby = sesion.zona.querySelector('.rt-lobby');
    sesion.refHud = sesion.zona.querySelector('.rt-hud');
    sesion.refAviso = sesion.zona.querySelector('.rt-aviso');
    cablearControles(sesion);
    cablearTeclado(sesion);
    pintarLobby(sesion);
    if (sesion.tipo === 'pista') prepararTrafico(sesion);
  }

  function pintarLobby(sesion) {
    if (!sesion.refLobby) return;
    if (sesion.terminado) { sesion.refLobby.innerHTML = ''; return; }
    if (sesion.inicioEn) {
      var faltan = Math.max(0, Math.ceil((sesion.inicioEn - Date.now()) / 1000));
      sesion.refLobby.innerHTML = '<p><strong>' + (faltan > 0 ? '⏳ ¡Prepárense… ' + faltan + '!' : '🚦 ¡YA!') + '</strong></p>';
      return;
    }
    var lista = sesion.participantes.map(function (p) {
      return '<span class="chip-presencia"><span class="avatar">' + p.emoji + '</span>' + escapar(p.nombre) + (p.esBot ? '' : p.id === sesion.yoId ? ' (tú)' : '') + '</span>';
    }).join('');
    var html = '<div class="marcador">' + lista + '</div>';
    if (sesion.jugadoresReales.length < 3) {
      html += '<p class="subtitulo">Los huecos libres los juega la máquina 🤖, así siempre hay partida.</p>';
    }
    var soyCreador = sesion.partida.creada_por === sesion.yoId;
    if (soyCreador) {
      html += '<button type="button" class="btn-principal" id="rt-iniciar">' + (sesion.tipo === 'arena' ? '🥊 ¡A pelear!' : '🏁 ¡A correr!') + '</button>';
    } else {
      html += '<p class="subtitulo">Esperando a que ' + escapar(sesion.ctx.nombreDe(sesion.partida.creada_por)) + ' dé la salida… 🏁</p>';
    }
    sesion.refLobby.innerHTML = html;
    var btn = sesion.refLobby.querySelector('#rt-iniciar');
    if (btn) btn.addEventListener('click', function () {
      sesion.inicioEn = Date.now() + 3000;
      if (sesion.tipo === 'pista') prepararTrafico(sesion);
      pintarLobby(sesion);
      if (sesion.ctx.iniciarPartida) {
        sesion.ctx.iniciarPartida(sesion.partida, sesion.inicioEn, sesion.semilla);
      }
    });
  }

  function cablearControles(sesion) {
    var botones = sesion.zona.querySelectorAll('[data-rt]');
    Array.prototype.forEach.call(botones, function (b) {
      var accion = b.getAttribute('data-rt');
      var bajar = function (ev) {
        ev.preventDefault();
        sesion.toques[accion] = true;
        if (accion === 'arriba') moverCarril(sesion, -1);
        if (accion === 'abajo') moverCarril(sesion, 1);
        if (accion === 'salto') saltar(sesion);
        if (accion === 'puno') atacar(sesion, 'puno');
        if (accion === 'patada') atacar(sesion, 'patada');
      };
      var subir = function () { sesion.toques[accion] = false; };
      b.addEventListener('pointerdown', bajar);
      b.addEventListener('pointerup', subir);
      b.addEventListener('pointerleave', subir);
      b.addEventListener('pointercancel', subir);
      b.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    });
  }
  function cablearTeclado(sesion) {
    sesion.teclasHandler = function (ev) {
      var k = (ev.key || '').toLowerCase();
      sesion.teclas[k] = true;
      if (sesion.tipo === 'pista') {
        if (k === 'arrowup' || k === 'w') moverCarril(sesion, -1);
        if (k === 'arrowdown' || k === 's') moverCarril(sesion, 1);
      } else {
        if (k === 'arrowup' || k === 'w' || k === ' ') saltar(sesion);
        if (k === 'j') atacar(sesion, 'puno');
        if (k === 'k') atacar(sesion, 'patada');
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) !== -1) ev.preventDefault();
    };
    sesion.teclasUpHandler = function (ev) { sesion.teclas[(ev.key || '').toLowerCase()] = false; };
    window.addEventListener('keydown', sesion.teclasHandler);
    window.addEventListener('keyup', sesion.teclasUpHandler);
  }
  function pulsado(sesion, nombres) {
    for (var i = 0; i < nombres.length; i++) if (sesion.toques[nombres[i]] || sesion.teclas[nombres[i]]) return true;
    return false;
  }

  /* ============================ bucle ============================ */
  function enJuego(sesion) {
    return !!sesion.inicioEn && !sesion.terminado && Date.now() >= sesion.inicioEn;
  }
  function tick(sesion, dt, ahoraMs) {
    if (sesion.inicioEn && !sesion.inicioLocalEn) sesion.inicioLocalEn = sesion.inicioEn;
    if (sesion.tipo === 'arena') tickArena(sesion, dt, ahoraMs);
    else tickPista(sesion, dt, ahoraMs);
    dibujar(sesion, ahoraMs);
    pintarHud(sesion);
    // Transmisión ~12 veces por segundo.
    if (ahoraMs - sesion.ultimoEnvio >= 80 && sesion.inicioEn) {
      sesion.ultimoEnvio = ahoraMs;
      transmitir(sesion);
    }
    if (sesion.inicioEn && !sesion.terminado && Date.now() < sesion.inicioEn) pintarLobby(sesion);
  }
  function transmitir(sesion) {
    var yo = miEntidad(sesion);
    if (yo && sesion.soyParticipante) {
      enviar(sesion, 'estado', sesion.tipo === 'arena'
        ? { id: yo.id, x: Math.round(yo.x), y: Math.round(yo.y), mirando: yo.mirando, accion: yo.accion, vida: yo.vida }
        : { id: yo.id, distancia: Math.round(yo.distancia * 10) / 10, carril: yo.carril, velocidad: Math.round(yo.velocidad) });
    }
    if (sesion.esHost) {
      var bots = sesion.participantes.filter(function (p) { return p.esBot; }).map(function (p) {
        return sesion.tipo === 'arena'
          ? { id: p.id, x: Math.round(p.x), y: Math.round(p.y), mirando: p.mirando, accion: p.accion, vida: p.vida }
          : { id: p.id, distancia: Math.round(p.distancia * 10) / 10, carril: p.carril, velocidad: Math.round(p.velocidad) };
      });
      if (bots.length) enviar(sesion, 'bots', { bots: bots });
    }
  }

  /* ============================ ARENA ============================ */
  var ARENA_ANCHO = 900, ARENA_SUELO = 352, ALCANCE = { puno: 82, patada: 108 };

  function saltar(sesion) {
    if (sesion.tipo !== 'arena' || !enJuego(sesion)) return;
    var yo = miEntidad(sesion);
    if (yo && yo.vida > 0 && yo.y <= 0.01) yo.vy = 620;
  }
  function atacar(sesion, golpe) {
    if (sesion.tipo !== 'arena' || !enJuego(sesion)) return;
    var yo = miEntidad(sesion);
    if (yo) intentarGolpe(sesion, yo, golpe, performance.now());
  }
  function intentarGolpe(sesion, atacante, golpe, ahora) {
    if (!atacante || atacante.vida <= 0 || ahora < (atacante.enfriamientoHasta || 0)) return;
    atacante.accion = golpe;
    atacante.accionHasta = ahora + (golpe === 'puno' ? 180 : 300);
    atacante.enfriamientoHasta = ahora + (golpe === 'puno' ? 280 : 500);
    atacante.golpeN = (atacante.golpeN || 0) + 1;
    var golpeId = atacante.id + '-' + atacante.golpeN;
    sesion.participantes.forEach(function (victima) {
      if (victima === atacante || victima.vida <= 0) return;
      var dx = (victima.x - atacante.x) * atacante.mirando;
      if (dx < -8 || dx > ALCANCE[golpe]) return;
      if (Math.abs(victima.y - atacante.y) > 78) return;
      var empuje = atacante.mirando * (golpe === 'puno' ? 26 : 42);
      if (esMioOBotMio(sesion, victima)) {
        aplicarDanio(sesion, victima, golpe, empuje, golpeId);
      } else if (!victima.esBot) {
        enviar(sesion, 'golpe', { de: atacante.id, a: victima.id, golpe: golpe, empuje: empuje, golpeId: golpeId });
      } else {
        // Bot de otro anfitrión: el aviso va «a la sala» y lo aplica su anfitrión.
        enviar(sesion, 'golpe', { de: atacante.id, a: victima.id, golpe: golpe, empuje: empuje, golpeId: golpeId });
      }
    });
  }
  function recibirGolpe(sesion, datos) {
    if (!datos || sesion.tipo !== 'arena' || sesion.terminado) return;
    var victima = sesion.porId[datos.a];
    if (!victima || !esMioOBotMio(sesion, victima)) return;
    aplicarDanio(sesion, victima, datos.golpe, datos.empuje || 0, datos.golpeId);
  }
  function aplicarDanio(sesion, victima, golpe, empuje, golpeId) {
    if (golpeId) {
      if (sesion.golpesAplicados[golpeId]) return;
      sesion.golpesAplicados[golpeId] = true;
    }
    if (victima.vida <= 0) return;
    var bloqueando = victima.accion === 'bloqueo';
    var danio = G().danioArena ? G().danioArena(golpe, bloqueando) : (golpe === 'patada' ? 9 : 6);
    victima.vida = Math.max(0, victima.vida - danio);
    victima.x = clamp(victima.x + empuje * (bloqueando ? 0.3 : 1), 36, ARENA_ANCHO - 36);
    victima.accion = victima.vida <= 0 ? 'ko' : 'danio';
    victima.accionHasta = performance.now() + (victima.vida <= 0 ? 999999 : 170);
    sesion.efectos.push({ x: victima.x, y: victima.y + 118, hasta: performance.now() + 420, texto: bloqueando ? '🛡️' : '💥' });
  }

  function tickArena(sesion, dt, ahora) {
    var jugando = enJuego(sesion);
    sesion.participantes.forEach(function (p) {
      if (esMioOBotMio(sesion, p)) {
        if (jugando && p.vida > 0) {
          if (p.esBot) moverBotArena(sesion, p, dt, ahora);
          else moverMioArena(sesion, p, dt, ahora);
        }
        // Física propia: gravedad y suelo para mí y mis bots.
        p.vy -= 1750 * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) { p.y = 0; p.vy = 0; }
        if (p.accion !== 'ko' && ahora > (p.accionHasta || 0) && p.accion !== 'bloqueo') p.accion = p.caminaHasta > ahora ? 'caminar' : 'idle';
        if (p.accion === 'bloqueo' && p.id !== sesion.yoId && ahora > (p.accionHasta || 0)) p.accion = 'idle';
      } else if (p.dest) {
        // Remoto (o bot ajeno): interpolar hacia su último estado.
        var d = p.dest, f = Math.min(1, dt * 11);
        p.x += (d.x - p.x) * f;
        p.y += ((d.y || 0) - p.y) * f;
        p.mirando = d.mirando || p.mirando;
        p.accion = p.accionRemota || d.accion || 'idle';
      }
    });
    if (!jugando || sesion.terminado) return;
    // Fin: queda uno en pie, o a los 90 s gana el de más vida.
    var vidas = {}, ids = [];
    sesion.participantes.forEach(function (p) { vidas[p.id] = p.vida; ids.push(p.id); });
    var tiempoAgotado = Date.now() - sesion.inicioEn >= (G().ARENA_DURACION_SEG || 90) * 1000;
    var ganador = G().ganadorArena ? G().ganadorArena(vidas, ids, tiempoAgotado) : null;
    if (ganador || tiempoAgotado) finalizar(sesion, ganador);
  }
  function moverMioArena(sesion, yo, dt, ahora) {
    var izq = pulsado(sesion, ['izq', 'arrowleft', 'a']);
    var der = pulsado(sesion, ['der', 'arrowright', 'd']);
    if (pulsado(sesion, ['bloqueo', 'l'])) { yo.accion = 'bloqueo'; yo.accionHasta = ahora + 120; return; }
    if (yo.accion === 'bloqueo') yo.accion = 'idle';
    if (izq) { yo.x = clamp(yo.x - 265 * dt, 36, ARENA_ANCHO - 36); yo.mirando = -1; yo.caminaHasta = ahora + 130; }
    if (der) { yo.x = clamp(yo.x + 265 * dt, 36, ARENA_ANCHO - 36); yo.mirando = 1; yo.caminaHasta = ahora + 130; }
  }
  function moverBotArena(sesion, bot, dt, ahora) {
    if (ahora < (bot.bot.siguiente || 0)) return;
    bot.bot.siguiente = ahora + 190;
    // Rival vivo más cercano.
    var rival = null, mejor = 1e9;
    sesion.participantes.forEach(function (p) {
      if (p === bot || p.vida <= 0) return;
      var d = Math.abs(p.x - bot.x);
      if (d < mejor) { mejor = d; rival = p; }
    });
    if (!rival) return;
    bot.mirando = rival.x >= bot.x ? 1 : -1;
    var r = Math.random();
    if (mejor > 92) {
      bot.x = clamp(bot.x + bot.mirando * 265 * 0.19, 36, ARENA_ANCHO - 36);
      bot.caminaHasta = ahora + 200;
      if (r < 0.12 && bot.y <= 0.01) bot.vy = 560;
    } else if (r < 0.42) {
      intentarGolpe(sesion, bot, r < 0.24 ? 'puno' : 'patada', ahora);
    } else if (r < 0.58) {
      bot.accion = 'bloqueo'; bot.accionHasta = ahora + 420;
    } else if (r < 0.68 && bot.y <= 0.01) {
      bot.vy = 600;
    }
  }

  /* ============================ GRAN PREMIO ============================ */
  function prepararTrafico(sesion) {
    sesion.trafico = G().generarTraficoPista ? G().generarTraficoPista(sesion.semilla, 26) : [];
    sesion.chocados = {};
  }
  function moverCarril(sesion, delta) {
    if (sesion.tipo !== 'pista' || !enJuego(sesion)) return;
    var yo = miEntidad(sesion);
    if (yo && yo.cruzoEn === 0) yo.carril = clamp(yo.carril + delta, 0, 2);
  }
  function tickPista(sesion, dt, ahora) {
    var jugando = enJuego(sesion);
    var meta = (sesion.partida.estado && sesion.partida.estado.meta) || G().PISTA_META || 1200;
    var tSeg = sesion.inicioEn ? Math.max(0, (Date.now() - sesion.inicioEn) / 1000) : 0;
    sesion.participantes.forEach(function (p) {
      p.carrilSuave += (p.carril - p.carrilSuave) * Math.min(1, dt * 7);
      if (!jugando || sesion.terminado) return;
      if (esMioOBotMio(sesion, p)) {
        if (p.esBot) moverBotPista(sesion, p, dt, ahora);
        else moverMioPista(sesion, p, dt);
        p.distancia += p.velocidad * dt;
        if (p.distancia >= meta && !p.cruzoEn) p.cruzoEn = Date.now();
        // Choque con el tráfico (solo sobre mi propio auto / mis bots).
        if (!p.esBot || sesion.esHost) revisarChoque(sesion, p, tSeg, ahora);
      } else if (typeof p.destDistancia === 'number') {
        p.distancia += (p.destDistancia - p.distancia) * Math.min(1, dt * 6);
        if (typeof p.destCarril === 'number') p.carril = p.destCarril;
        if (p.distancia >= meta && !p.cruzoEn) p.cruzoEn = Date.now();
      }
    });
    if (!jugando || sesion.terminado) return;
    // Fin: el primero que cruza gana; los demás tienen 20 s para llegar.
    var distancias = {}, ids = [];
    sesion.participantes.forEach(function (p) { distancias[p.id] = p.distancia; ids.push(p.id); });
    var primero = G().ganadorPista ? G().ganadorPista(distancias, ids, meta) : null;
    if (primero && !sesion.ganadorParcial) {
      sesion.ganadorParcial = primero;
      sesion.finParcialEn = Date.now() + 20000;
      sesion.efectos.push({ x: 450, y: 200, hasta: ahora + 2500, texto: '🏁' });
    }
    var todosCruzaron = sesion.participantes.every(function (p) { return p.distancia >= meta; });
    if (sesion.ganadorParcial && (todosCruzaron || Date.now() >= sesion.finParcialEn)) {
      finalizar(sesion, sesion.ganadorParcial);
    } else if (!sesion.ganadorParcial && tSeg > 240) {
      var mejorId = null, mejorD = -1;
      ids.forEach(function (id) { if (distancias[id] > mejorD) { mejorD = distancias[id]; mejorId = id; } });
      finalizar(sesion, mejorId);
    }
  }
  function moverMioPista(sesion, yo, dt) {
    if (yo.cruzoEn) { yo.velocidad = Math.max(0, yo.velocidad - 20 * dt); return; }
    var ahora = performance.now();
    if (ahora < yo.chocadoHasta) { yo.velocidad = Math.max(0, yo.velocidad - 30 * dt); return; }
    if (pulsado(sesion, ['acelerar', ' '])) yo.velocidad = Math.min(58, yo.velocidad + 26 * dt);
    else if (pulsado(sesion, ['freno', 'b'])) yo.velocidad = Math.max(0, yo.velocidad - 42 * dt);
    else yo.velocidad = Math.max(0, yo.velocidad - 7 * dt);
  }
  function moverBotPista(sesion, bot, dt, ahora) {
    if (bot.cruzoEn) { bot.velocidad = Math.max(0, bot.velocidad - 20 * dt); return; }
    if (ahora < bot.chocadoHasta) { bot.velocidad = Math.max(0, bot.velocidad - 30 * dt); return; }
    if (ahora >= (bot.bot.siguiente || 0)) {
      bot.bot.siguiente = ahora + 700 + Math.random() * 900;
      bot.bot.metaVel = 34 + Math.random() * 15; // comete «errores»: sube y baja
      if (Math.random() < 0.4) bot.carril = clamp(bot.carril + (Math.random() < 0.5 ? -1 : 1), 0, 2);
    }
    var meta = bot.bot.metaVel;
    bot.velocidad += clamp(meta - bot.velocidad, -18 * dt, 14 * dt);
  }
  function revisarChoque(sesion, p, tSeg, ahora) {
    if (ahora < p.chocadoHasta || p.cruzoEn) return;
    (sesion.trafico || []).forEach(function (auto, i) {
      if (sesion.chocados[p.id + ':' + i]) return;
      var distAuto = auto.distancia + auto.velocidad * tSeg;
      if (auto.carril === Math.round(p.carrilSuave) && Math.abs(distAuto - p.distancia) < 13) {
        sesion.chocados[p.id + ':' + i] = true;
        p.velocidad *= 0.25; // frenazo fuerte
        p.chocadoHasta = ahora + 900;
        if (p.id === sesion.yoId) sesion.efectos.push({ x: 450, y: 150, hasta: ahora + 700, texto: '💥' });
      }
    });
  }

  /* ============================ fin de partida ============================ */
  function finalizar(sesion, ganadorId) {
    if (sesion.terminado) return;
    var ganadorReal = ganadorId && sesion.porId[ganadorId] && !sesion.porId[ganadorId].esBot ? ganadorId : null;
    terminarLocal(sesion, ganadorReal, ganadorId);
    enviar(sesion, 'fin', { ganador: ganadorReal });
    // Guarda UNA vez: solo el anfitrión (en solitario, él mismo).
    if (sesion.esHost && sesion.ctx.guardarFinal) {
      sesion.finGuardado = true;
      var base = JSON.parse(JSON.stringify(sesion.partida.estado || {}));
      var final = G().cerrarRT ? G().cerrarRT(base, ganadorReal) : Object.assign(base, { terminado: true, ganador: ganadorReal });
      final.inicioEn = sesion.inicioEn;
      sesion.ctx.guardarFinal(sesion.partida, final);
    }
  }
  function terminarLocal(sesion, ganadorReal, ganadorCualquiera) {
    sesion.terminado = true;
    sesion.ganador = ganadorReal || null;
    sesion.ganadorTexto = ganadorCualquiera && sesion.porId[ganadorCualquiera]
      ? sesion.porId[ganadorCualquiera].nombre
      : (ganadorReal && sesion.porId[ganadorReal] ? sesion.porId[ganadorReal].nombre : null);
    pintarLobby(sesion);
  }

  /* ============================ dibujo ============================ */
  function pintarHud(sesion) {
    if (!sesion.refHud) return;
    var html = '';
    if (sesion.tipo === 'arena') {
      var restan = sesion.inicioEn ? Math.max(0, (G().ARENA_DURACION_SEG || 90) - Math.floor((Date.now() - sesion.inicioEn) / 1000)) : (G().ARENA_DURACION_SEG || 90);
      html = sesion.participantes.map(function (p) {
        return '<span class="chip-presencia"><span class="avatar">' + p.emoji + '</span>' + escapar(p.nombre) + ': <strong>' + Math.round(p.vida) + ' ❤️</strong></span>';
      }).join('') + '<span class="chip-presencia">⏱️ <strong>' + (sesion.terminado ? 0 : restan) + ' s</strong></span>';
    } else {
      var meta = G().PISTA_META || 1200;
      html = sesion.participantes.map(function (p) {
        var pct = clamp(Math.round(p.distancia / meta * 100), 0, 100);
        return '<span class="chip-presencia"><span class="avatar">' + p.emoji + '</span>' + escapar(p.nombre) +
          ' <span class="rt-barra"><span style="width:' + pct + '%;background:' + p.color + '"></span></span> <strong>' + Math.floor(p.distancia) + ' m</strong></span>';
      }).join('');
    }
    if (sesion.terminado) {
      html += '<p class="rt-final">🏆 ' + (sesion.ganadorTexto
        ? '¡Ganó ' + escapar(sesion.ganadorTexto) + '!' + (sesion.ganador ? ' Suma 10 puntos de campeón ⭐' : '')
        : '¡Se acabó! Esta vez no ganó ningún familiar.') + '</p>';
    } else if (sesion.ganadorParcial && sesion.porId[sesion.ganadorParcial]) {
      html += '<p class="rt-final">🏁 ¡' + escapar(sesion.porId[sesion.ganadorParcial].nombre) + ' cruzó la meta! Quedan 20 s para llegar…</p>';
    }
    if (sesion.refHud._ultimo !== html) { sesion.refHud.innerHTML = html; sesion.refHud._ultimo = html; }
  }

  function dibujar(sesion, ahora) {
    var c = sesion.g2d;
    if (!c) return;
    if (sesion.tipo === 'arena') dibujarArena(sesion, c, ahora);
    else dibujarPista(sesion, c, ahora);
    // Cuenta atrás sincronizada (3-2-1) sobre el canvas.
    if (sesion.inicioEn && Date.now() < sesion.inicioEn) {
      var n = Math.ceil((sesion.inicioEn - Date.now()) / 1000);
      c.fillStyle = 'rgba(20,16,40,.45)';
      c.fillRect(0, 0, sesion.canvas.width, sesion.canvas.height);
      c.fillStyle = '#fff';
      c.font = 'bold 92px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(String(n), sesion.canvas.width / 2, sesion.canvas.height / 2 + 30);
    }
    if (sesion.terminado) {
      c.fillStyle = 'rgba(20,16,40,.35)';
      c.fillRect(0, 0, sesion.canvas.width, 64);
      c.fillStyle = '#fff';
      c.font = 'bold 30px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText('🏆 ' + (sesion.ganadorTexto ? '¡Ganó ' + sesion.ganadorTexto + '!' : '¡Se acabó la partida!'), sesion.canvas.width / 2, 42);
    }
  }

  function dibujarArena(sesion, c, ahora) {
    var W = 900, H = 420;
    var cielo = c.createLinearGradient(0, 0, 0, H);
    cielo.addColorStop(0, '#8ed8ff'); cielo.addColorStop(1, '#e8f9ff');
    c.fillStyle = cielo; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffd98a'; c.beginPath(); c.arc(812, 58, 30, 0, 7); c.fill();
    c.fillStyle = '#8a6d4b'; c.fillRect(0, ARENA_SUELO, W, H - ARENA_SUELO);
    c.fillStyle = '#6f5638'; c.fillRect(0, ARENA_SUELO, W, 6);
    // Primero los caídos (quedan en el suelo, detrás).
    var ordenados = sesion.participantes.slice().sort(function (a, b) {
      return (a.vida <= 0 ? 0 : 1) - (b.vida <= 0 ? 0 : 1);
    });
    ordenados.forEach(function (p) { dibujarLuchador(sesion, c, p, ahora); });
    sesion.efectos = sesion.efectos.filter(function (ef) { return ef.hasta > ahora; });
    sesion.efectos.forEach(function (ef) {
      c.font = '34px system-ui'; c.textAlign = 'center';
      c.fillText(ef.texto, ef.x, ARENA_SUELO - ef.y - 40);
    });
  }
  function dibujarLuchador(sesion, c, p, ahora) {
    var sueloY = ARENA_SUELO - p.y;
    var ko = p.vida <= 0;
    var caminando = p.accion === 'caminar' || (p.caminaHasta || 0) > ahora;
    var fase = Math.floor(ahora / 130) % 2 === 0 ? 1 : -1;
    var rebote = (!ko && p.y <= 0 && !caminando) ? Math.sin(ahora / 280 + p.indice) * 2.5 : 0;
    var danado = p.accion === 'danio';
    c.save();
    c.translate(p.x, sueloY);
    // Sombra
    c.fillStyle = 'rgba(0,0,0,.18)';
    c.beginPath(); c.ellipse(0, 4, 30, 7, 0, 0, 7); c.fill();
    if (ko) {
      // Caído: cuerpo tumbado y 💫 dando vueltas (nada gráfico).
      c.fillStyle = p.color;
      redondeado(c, -38, -22, 62, 20, 9); c.fill();
      c.font = '26px system-ui'; c.textAlign = 'center';
      c.fillText(p.emoji, 34, -8);
      c.font = '18px system-ui';
      c.fillText('💫', 0, -34);
      c.restore();
      dibujarNombreVida(c, p, -64);
      return;
    }
    var baseY = rebote;
    // Piernas (la de la patada se estira hacia delante)
    c.strokeStyle = '#37415c'; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath();
    if (p.accion === 'patada') {
      c.moveTo(0, -52 + baseY); c.lineTo(6, -6);
      c.moveTo(0, -52 + baseY); c.lineTo(p.mirando * 44, -34 + baseY);
    } else if (caminando || p.y > 0) {
      c.moveTo(0, -52 + baseY); c.lineTo(-11 * fase, -4);
      c.moveTo(0, -52 + baseY); c.lineTo(11 * fase, -4);
    } else {
      c.moveTo(0, -52 + baseY); c.lineTo(-10, -4);
      c.moveTo(0, -52 + baseY); c.lineTo(10, -4);
    }
    c.stroke();
    // Cuerpo
    c.fillStyle = danado ? '#ff2e2e' : p.color;
    redondeado(c, -17, -96 + baseY, 34, 48, 11); c.fill();
    // Brazo de atrás
    c.strokeStyle = danado ? '#ff2e2e' : p.color; c.lineWidth = 8;
    c.beginPath(); c.moveTo(-p.mirando * 12, -88 + baseY); c.lineTo(-p.mirando * 22, -64 + baseY); c.stroke();
    // Brazo delantero: el puño se extiende al golpear
    c.beginPath();
    c.moveTo(p.mirando * 12, -88 + baseY);
    if (p.accion === 'puno') c.lineTo(p.mirando * 46, -84 + baseY);
    else c.lineTo(p.mirando * 22, -64 + baseY);
    c.stroke();
    if (p.accion === 'puno') { c.font = '17px system-ui'; c.textAlign = 'center'; c.fillText('🥊', p.mirando * 52, -78 + baseY); }
    // Cabeza: el emoji del perfil
    c.font = '30px system-ui'; c.textAlign = 'center';
    c.fillText(p.emoji, 0, -102 + baseY);
    // Escudo al bloquear
    if (p.accion === 'bloqueo') {
      c.strokeStyle = '#39c2ff'; c.lineWidth = 4;
      c.beginPath(); c.arc(p.mirando * 26, -72 + baseY, 21, -1.2, 1.2, p.mirando < 0); c.stroke();
      c.font = '18px system-ui'; c.fillText('🛡️', p.mirando * 30, -66 + baseY);
    }
    c.restore();
    dibujarNombreVida(c, p, -140 + rebote);
  }
  function dibujarNombreVida(c, p, dy) {
    c.save();
    c.translate(p.x, ARENA_SUELO - p.y);
    c.font = 'bold 14px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillStyle = '#20304a';
    c.fillText(p.nombre.replace('🤖 ', ''), 0, dy);
    c.fillStyle = 'rgba(0,0,0,.25)'; redondeado(c, -30, dy + 6, 60, 8, 4); c.fill();
    c.fillStyle = p.vida > 50 ? '#37c978' : p.vida > 25 ? '#ffb52e' : '#ff5a5a';
    redondeado(c, -30, dy + 6, 60 * Math.max(0, p.vida) / 100, 8, 4); c.fill();
    c.restore();
  }
  function redondeado(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  var CARRILES_Y = [86, 178, 270];
  function dibujarPista(sesion, c, ahora) {
    var W = 900, H = 360;
    c.fillStyle = '#9adcff'; c.fillRect(0, 0, W, 44);
    c.fillStyle = '#57b96a'; c.fillRect(0, 44, W, 26);
    c.fillStyle = '#3c4658'; c.fillRect(0, 70, W, 262);
    c.fillStyle = '#57b96a'; c.fillRect(0, 332, W, 28);
    var yo = miEntidad(sesion);
    var miDist = yo ? yo.distancia : 0;
    // Líneas de carril que se mueven con MI avance.
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 4; c.setLineDash([26, 30]);
    c.lineDashOffset = -((miDist * 4) % 56);
    [132, 224].forEach(function (y) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); });
    c.setLineDash([]);
    // Meta
    var meta = G().PISTA_META || 1200;
    var metaX = 450 + (meta - miDist) * 3;
    if (metaX > -30 && metaX < W + 30) {
      c.fillStyle = '#fff';
      for (var f = 0; f < 10; f++) for (var col = 0; col < 2; col++) {
        if ((f + col) % 2 === 0) c.fillRect(metaX + col * 12, 70 + f * 26, 12, 26);
      }
      c.fillStyle = '#20304a'; c.font = 'bold 16px system-ui'; c.textAlign = 'center';
      c.fillText('🏁 META', metaX + 12, 60);
    }
    var tSeg = sesion.inicioEn ? Math.max(0, (Date.now() - sesion.inicioEn) / 1000) : 0;
    // Tráfico (posición relativa a mi auto)
    (sesion.trafico || []).forEach(function (auto) {
      var distAuto = auto.distancia + auto.velocidad * tSeg;
      var x = 450 + (distAuto - miDist) * 3;
      if (x < -70 || x > W + 70) return;
      dibujarAuto(c, x, CARRILES_Y[auto.carril], '#9aa5b1', '🚗', ahora, 0.85);
    });
    // Corredores: mi auto fijo en el centro; los demás, relativos a mí.
    sesion.participantes.forEach(function (p) {
      var x = p.id === sesion.yoId ? 450 : 450 + (p.distancia - miDist) * 3;
      if (x < -80 || x > W + 80) return;
      dibujarAuto(c, x, CARRILES_Y[Math.round(p.carrilSuave)], p.color, p.emoji, ahora, 1);
      c.font = 'bold 14px system-ui'; c.textAlign = 'center'; c.fillStyle = '#fff';
      c.fillText(p.nombre.replace('🤖 ', ''), x, CARRILES_Y[Math.round(p.carrilSuave)] - 40);
    });
    sesion.efectos = sesion.efectos.filter(function (ef) { return ef.hasta > ahora; });
    sesion.efectos.forEach(function (ef) {
      c.font = '40px system-ui'; c.textAlign = 'center'; c.fillText(ef.texto, ef.x, ef.y);
    });
  }
  function dibujarAuto(c, x, y, color, emoji, ahora, escala) {
    c.save();
    c.translate(x, y);
    c.scale(escala, escala);
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.beginPath(); c.ellipse(0, 20, 46, 7, 0, 0, 7); c.fill();
    c.fillStyle = color;
    redondeado(c, -46, -12, 92, 26, 10); c.fill(); // carrocería
    redondeado(c, -24, -30, 48, 22, 8); c.fill(); // cabina
    c.fillStyle = '#dff4ff';
    redondeado(c, -18, -27, 36, 15, 5); c.fill(); // cristal
    c.fillStyle = '#20304a';
    var giro = (ahora / 90) % (Math.PI * 2);
    [-28, 28].forEach(function (wx) {
      c.beginPath(); c.arc(wx, 15, 10, 0, 7); c.fill();
      c.strokeStyle = '#9aa5b1'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(wx - 7 * Math.cos(giro), 15 - 7 * Math.sin(giro)); c.lineTo(wx + 7 * Math.cos(giro), 15 + 7 * Math.sin(giro)); c.stroke();
    });
    c.font = '17px system-ui'; c.textAlign = 'center';
    c.fillText(emoji, 34, -16);
    c.restore();
  }

  global.JuegosRT = { iniciar: iniciar, detener: detener };
})(typeof window !== 'undefined' ? window : globalThis);

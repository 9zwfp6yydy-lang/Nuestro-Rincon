/* =====================================================================
   app.js — Nuestro Rincón 🏡
   App web estática de página única + Supabase (Auth, tablas, Realtime)
   y WebRTC para la voz. Sin claves en el código: todo sale de config.js.
   ===================================================================== */
(function () {
  'use strict';

  var APP_NAME = 'Nuestro Rincón'; // ← nombre de la app (elegido por la familia)
  var L = window.FamilyLogic;
  var G = window.FamilyGames;
  var Fun = window.Fun;
  var CFG = window.APP_CONFIG || {};

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var AVATARES = ['🦊', '🐼', '🦁', '🐸', '🦄', '🐶', '🐱', '🐵', '🦉', '🐙', '🦋', '🐢'];

  var supa = null;
  var yo = null;               // usuario de Supabase Auth
  var miPerfil = null;         // mi fila en perfiles
  var perfiles = {};           // id -> perfil (toda la familia)
  var enLinea = {};            // id -> { nombre, emoji } (presencia)
  var canalSala = null;
  var avatarElegido = AVATARES[0];

  /* ------------------------- arranque / configuración ------------------------- */
  function faltanClaves() {
    var faltan = [];
    if (!CFG.SUPABASE_URL) faltan.push('la dirección de Supabase');
    if (!CFG.SUPABASE_ANON_KEY) faltan.push('la clave pública de Supabase');
    return faltan;
  }

  function mostrarVista(id) {
    ['vista-config', 'vista-login', 'vista-perfil', 'vista-app'].forEach(function (v) {
      document.getElementById(v).classList.toggle('oculto', v !== id);
    });
    var dentro = id === 'vista-app';
    // v3.5 · La barra de voz ya NO vive fija abajo: solo aparece DURANTE
    // una llamada (la maneja unirseVoz/salirDeLaVoz). Se entra a la voz
    // con el botón 📞 de la barra de arriba.
    $('#barra-reacciones').classList.toggle('oculto', !dentro);
  }

  function iniciar() {
    document.title = APP_NAME;
    var faltan = faltanClaves();
    if (faltan.length) {
      $('#config-faltan').textContent = faltan.join(' y ') + '.';
      mostrarVista('vista-config');
      return; // la app espera tranquilita, sin romperse
    }
    supa = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    registrarServiceWorker(); // solo con la app configurada (hay claves)
    armarBarraReacciones();
    supa.auth.getSession().then(function (res) {
      if (res.data.session) entrarConSesion(res.data.session.user);
      else mostrarVista('vista-login');
    });
    supa.auth.onAuthStateChange(function (_evento, sesion) {
      if (sesion && !yo) entrarConSesion(sesion.user);
    });
  }

  /* ------------------------- entrada y perfil ------------------------- */
  $('#form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var error = $('#login-error');
    error.classList.add('oculto');
    supa.auth.signInWithPassword({
      email: $('#login-email').value.trim(),
      password: $('#login-pass').value
    }).then(function (res) {
      if (res.error) {
        error.textContent = 'Mmm… ese correo o contraseña no cuadran. Revisa y prueba otra vez. 🙂';
        error.classList.remove('oculto');
        Fun.sonido('error');
      } else {
        entrarConSesion(res.data.user);
      }
    });
  });

  function entrarConSesion(user) {
    yo = user;
    supa.from('perfiles').select('*').eq('id', yo.id).maybeSingle().then(function (res) {
      if (res.data) {
        miPerfil = res.data;
        entrar();
      } else {
        armarAvatares();
        mostrarVista('vista-perfil');
      }
    });
  }

  function armarAvatares() {
    var caja = $('#perfil-avatares');
    caja.innerHTML = '';
    AVATARES.forEach(function (emoji, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'avatar-opcion' + (i === 0 ? ' elegido' : '');
      b.textContent = emoji;
      b.addEventListener('click', function () {
        avatarElegido = emoji;
        $$('#perfil-avatares .avatar-opcion').forEach(function (x) { x.classList.remove('elegido'); });
        b.classList.add('elegido');
        Fun.sonido('pop');
      });
      caja.appendChild(b);
    });
  }

  $('#form-perfil').addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = $('#perfil-nombre').value.trim();
    if (!nombre) return;
    supa.from('perfiles').insert({ id: yo.id, nombre: nombre, emoji: avatarElegido }).then(function (res) {
      if (res.error) { alert('Uy, no se pudo guardar tu perfil. Prueba otra vez.'); return; }
      miPerfil = { id: yo.id, nombre: nombre, emoji: avatarElegido, puntos: 0 };
      Fun.confeti({ cantidad: 80 });
      entrar();
    });
  });

  $('#btn-salir').addEventListener('click', function () {
    salirDeLaVoz();
    supa.auth.signOut().then(function () { location.reload(); });
  });

  $('#btn-sonido').addEventListener('click', function () {
    var silencio = Fun.alternarSilencio();
    $('#btn-sonido').textContent = silencio ? '🔇' : '🔊';
  });

  /* v3.4.3 · SONIDO DE TOQUE EN EL CAMINO COMPARTIDO: cada toque en un
     botón o pieza de la app suena con un «toque» suave (fun.js), sin
     cablear juego por juego. Un solo oyente delegado en document, en
     fase de burbuja: corre DESPUÉS de los manejadores del propio
     elemento, así que si el juego ya sonó con significado (acierto,
     error, la nota de un color de Simón…) el toque genérico se calla
     (Fun.huboSonidoReciente) y nunca hay dos sonidos por un toque.
     El contexto de audio nace/se reanuda dentro de esta misma
     interacción (tono() lo reanuda), como manda la política de los
     navegadores; es reproducción local por WebAudio y jamás toca las
     pistas de la llamada en curso. */
  document.addEventListener('click', function (ev) {
    var t = (ev.target && ev.target.closest) ? ev.target.closest('button, .mosaico-video') : null;
    if (!t) return;
    if (t.closest && t.closest('[data-sin-toque]')) return;
    if (Fun.huboSonidoReciente(150)) return;
    Fun.sonido('toque');
  }, false);

  /* ------------------------- navegación por pestañas ------------------------- */
  function mostrarPestana(nombre) {
    $$('nav.pestanas button').forEach(function (b) {
      b.classList.toggle('activa', b.dataset.pestana === nombre);
    });
    ['sala', 'juegos', 'biblia', 'cine', 'chat'].forEach(function (s) {
      document.getElementById('sec-' + s).classList.toggle('oculto', s !== nombre);
    });
  }
  $$('nav.pestanas button').forEach(function (b) {
    b.addEventListener('click', function () { mostrarPestana(b.dataset.pestana); Fun.sonido('pop'); });
  });
  $$('[data-ir]').forEach(function (b) {
    b.addEventListener('click', function () { mostrarPestana(b.dataset.ir); });
  });

  /* ------------------------- presencia + sala ------------------------- */
  function nombreDe(id) {
    if (perfiles[id]) return perfiles[id].nombre;
    if (enLinea[id]) return enLinea[id].nombre;
    return 'Familiar';
  }
  function emojiDe(id) {
    if (perfiles[id]) return perfiles[id].emoji;
    if (enLinea[id]) return enLinea[id].emoji;
    return '🙂';
  }

  function entrar() {
    mostrarVista('vista-app');
    if (Fun.estaSilenciado()) $('#btn-sonido').textContent = '🔇';
    cargarPerfiles().then(function () {
      conectarSala();
      iniciarChat();
      iniciarCampeones();
      iniciarJuegos();
      iniciarBiblia();
      iniciarCine();
      pintarEstadoAvisos();
    });
  }

  function cargarPerfiles() {
    return supa.from('perfiles').select('*').then(function (res) {
      perfiles = {};
      (res.data || []).forEach(function (p) { perfiles[p.id] = p; });
      if (miPerfil) perfiles[miPerfil.id] = miPerfil;
      pintarSala();
      pintarCampeones();
    });
  }

  function conectarSala() {
    canalSala = supa.channel('sala', {
      config: { presence: { key: yo.id }, broadcast: { self: false } }
    });
    canalSala
      .on('presence', { event: 'sync' }, function () {
        var estado = canalSala.presenceState();
        enLinea = {};
        Object.keys(estado).forEach(function (id) {
          var d = estado[id][0] || {};
          enLinea[id] = { nombre: d.nombre || nombreDe(id), emoji: d.emoji || emojiDe(id) };
        });
        pintarSala();
      })
      .on('broadcast', { event: 'reaccion' }, function (msg) {
        if (msg.payload && msg.payload.emoji) Fun.reaccionFlotante(msg.payload.emoji);
      })
      .on('broadcast', { event: 'versiculo' }, function (msg) {
        if (msg.payload) mostrarVersiculoCompartido(msg.payload, false);
      })
      .on('broadcast', { event: 'historia' }, function (msg) {
        if (msg.payload && typeof msg.payload.idx === 'number') recibirHistoriaCompartida(msg.payload);
      })
      .subscribe(function (estado) {
        if (estado === 'SUBSCRIBED') {
          canalSala.track({ nombre: miPerfil.nombre, emoji: miPerfil.emoji });
        }
      });
    // Los perfiles (y sus puntos de campeón) llegan en vivo.
    supa.channel('perfiles-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, function () { cargarPerfiles(); })
      .subscribe();
  }

  function pintarSala() {
    // Chips del encabezado
    var chips = Object.keys(enLinea).map(function (id) {
      return '<span class="chip-presencia"><span class="avatar">' + emojiDe(id) + '</span>' +
        '<span class="punto en-linea"></span>' + escapar(nombreDe(id)) + '</span>';
    }).join('');
    $('#presencia').innerHTML = chips || '<span class="subtitulo">Conectando…</span>';
    // Lista de miembros de la Sala (toda la familia, con su estado)
    var ids = Object.keys(perfiles);
    if (!ids.length) { $('#lista-miembros').innerHTML = '<p class="subtitulo">Cargando la familia…</p>'; return; }
    $('#lista-miembros').innerHTML = ids.map(function (id) {
      var p = perfiles[id];
      var online = !!enLinea[id];
      return '<div class="miembro"><span class="avatar-grande">' + p.emoji + '</span>' +
        '<div><strong>' + escapar(p.nombre) + (id === yo.id ? ' (tú)' : '') + '</strong><br>' +
        '<span class="subtitulo">' + (online ? '🟢 Está en el rincón' : '⚪ No está ahora') + '</span></div></div>';
    }).join('');
  }

  function escapar(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------- reacciones en vivo ------------------------- */
  function armarBarraReacciones() {
    var barra = $('#barra-reacciones');
    barra.innerHTML = '';
    Fun.EMOJIS_REACCION.forEach(function (emoji) {
      var b = document.createElement('button');
      b.textContent = emoji;
      b.title = 'Lanzar ' + emoji;
      b.addEventListener('click', function () {
        Fun.reaccionFlotante(emoji); // la veo yo…
        if (canalSala) canalSala.send({ type: 'broadcast', event: 'reaccion', payload: { emoji: emoji, de: yo ? yo.id : null } }); // …y la ve todo el mundo
      });
      barra.appendChild(b);
    });
  }

  /* ------------------------- campeones ------------------------- */
  function iniciarCampeones() { pintarCampeones(); }

  function pintarCampeones() {
    var totales = {};
    Object.keys(perfiles).forEach(function (id) { totales[id] = perfiles[id].puntos || 0; });
    var ranking = L.rankingCampeones(totales);
    if (!ranking.length) { $('#tabla-campeones').innerHTML = '<tr><td>Todavía no hay puntos… ¡a jugar!</td></tr>'; return; }
    $('#tabla-campeones').innerHTML = ranking.map(function (r) {
      return '<tr class="' + (r.posicion === 1 ? 'primero' : '') + '">' +
        '<td>' + emojiDe(r.id) + ' <strong>' + escapar(nombreDe(r.id)) + '</strong></td>' +
        '<td>' + r.titulo + '</td>' +
        '<td><strong>' + r.puntos + '</strong> pts</td></tr>';
    }).join('');
  }

  // Suma los puntos de una partida terminada al acumulado (lo hace quien da el toque final).
  function aplicarPuntosDePartida(estado) {
    var suma = L.puntosDePartida(estado);
    Object.keys(suma).forEach(function (uid) {
      if (!suma[uid]) return;
      var actuales = (perfiles[uid] && perfiles[uid].puntos) || 0;
      supa.from('perfiles').update({ puntos: actuales + suma[uid] }).eq('id', uid).then(function () { cargarPerfiles(); });
    });
  }

  /* ------------------------- chat familiar ------------------------- */
  var chatIniciado = false;
  var mensajesChat = {}; // id -> mensaje (para reaccionar y repintar al vuelo)

  function iniciarChat() {
    if (chatIniciado) return;
    chatIniciado = true;
    armarPanelEmojis();
    prepararBotonGrabar();
    prepararBotonArchivo();
    supa.from('mensajes').select('*').order('creado_en', { ascending: true }).limit(80).then(function (res) {
      (res.data || []).forEach(function (m) { mensajesChat[m.id] = m; pintarMensaje(m); });
      bajarChat();
    });
    supa.channel('chat-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, function (payload) {
        mensajesChat[payload.new.id] = payload.new;
        pintarMensaje(payload.new);
        bajarChat();
        if (payload.new.autor !== yo.id) Fun.sonido('mensaje');
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes' }, function (payload) {
        // Las reacciones viajan como UPDATE de la fila del mensaje.
        mensajesChat[payload.new.id] = payload.new;
        repintarMensaje(payload.new);
      })
      .subscribe();
    // Tocar fuera cierra el selector de reacción y el panel de emojis.
    document.addEventListener('click', function (ev) {
      cerrarSelectoresReaccion();
      var panel = $('#panel-emojis');
      if (panel && !panel.classList.contains('oculto') && !panel.contains(ev.target)) {
        panel.classList.add('oculto');
      }
    });
  }

  function pintarMensaje(m) {
    var caja = $('#chat-caja');
    var div = document.createElement('div');
    div.dataset.msgId = m.id;
    rellenarMensaje(div, m);
    caja.appendChild(div);
  }

  function repintarMensaje(m) {
    var div = $('#chat-caja').querySelector('[data-msg-id="' + m.id + '"]');
    if (div) rellenarMensaje(div, m);
  }

  // Pinta (o repinta) un mensaje: nota de voz con su reproductor, o
  // bocadillo normal, o GRANDE y sin bocadillo si es solo emojis (1–3),
  // como en WhatsApp. Debajo, las pastillitas con sus reacciones.
  function rellenarMensaje(div, m) {
    var esArchivo = !!m.archivo_path;
    var esAudio = !!m.audio_path;
    var soloEmojis = !esAudio && !esArchivo && Fun.esSoloEmojis(m.texto);
    div.className = 'mensaje' + (m.autor === yo.id ? ' mio' : '') + (soloEmojis ? ' solo-emojis' : '');
    var hashAutor = 0;
    for (var hi = 0; hi < String(m.autor || '').length; hi++) hashAutor += String(m.autor).charCodeAt(hi);
    div.dataset.autor = String(hashAutor % 3);
    div.innerHTML = '<div class="quien">' + escapar(m.nombre) + '</div>';
    if (esArchivo) {
      var zonaA = document.createElement('div');
      div.appendChild(zonaA);
      pintarArchivo(zonaA, m);
      if (m.texto) {
        var textoA = document.createElement('div');
        textoA.className = 'texto-msg';
        textoA.textContent = m.texto;
        div.appendChild(textoA);
      }
    } else if (esAudio) {
      var zona = document.createElement('div');
      div.appendChild(zona);
      pintarAudio(zona, m);
    } else if (soloEmojis) {
      var grande = document.createElement('div');
      grande.className = 'emoji-grande';
      grande.textContent = m.texto;
      div.appendChild(grande);
    } else {
      var texto = document.createElement('div');
      texto.className = 'texto-msg';
      texto.textContent = m.texto;
      div.appendChild(texto);
    }
    var reac = document.createElement('div');
    reac.className = 'reacciones-msg';
    div.appendChild(reac);
    pintarReacciones(div, m);
    div.onclick = function (ev) {
      ev.stopPropagation();
      var actual = mensajesChat[m.id];
      if (actual) alternarSelectorReaccion(div, actual);
    };
  }

  function pintarReacciones(div, m) {
    var cont = div.querySelector('.reacciones-msg');
    if (!cont) return;
    var resumen = Fun.resumenReacciones(m.reacciones || {});
    cont.innerHTML = resumen.map(function (r) {
      return '<button type="button" class="chip-reaccion" data-emoji="' + r.emoji + '" title="' +
        escapar(r.nombres.join(', ')) + '">' + r.emoji + ' ' + r.total + '</button>';
    }).join('');
    Array.prototype.forEach.call(cont.querySelectorAll('.chip-reaccion'), function (chip) {
      chip.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var actual = mensajesChat[m.id];
        if (actual) reaccionarMensaje(actual, chip.dataset.emoji);
      });
    });
  }

  function cerrarSelectoresReaccion() {
    $$('.selector-reaccion').forEach(function (s) { s.remove(); });
  }

  // Tocar un mensaje abre (o cierra) su fila de reacciones rápidas.
  function alternarSelectorReaccion(div, m) {
    var ya = div.querySelector('.selector-reaccion');
    cerrarSelectoresReaccion();
    if (ya) return;
    var fila = document.createElement('div');
    fila.className = 'selector-reaccion';
    Fun.EMOJIS_REACCION_MENSAJE.forEach(function (emoji) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = emoji;
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        reaccionarMensaje(mensajesChat[m.id] || m, emoji);
      });
      fila.appendChild(b);
    });
    div.appendChild(fila);
  }

  function reaccionarMensaje(m, emoji) {
    if (!m) return;
    var nuevas = Fun.alternarReaccion(m.reacciones || {}, emoji, yo.id, miPerfil.nombre);
    m.reacciones = nuevas; // optimista: se ve al instante en mi pantalla
    repintarMensaje(m);
    Fun.sonido('pop');
    supa.from('mensajes').update({ reacciones: nuevas }).eq('id', m.id).then(function (res) {
      if (res.error) Fun.sonido('error'); // el UPDATE en vivo corregirá la vista
    });
  }

  function bajarChat() { var c = $('#chat-caja'); c.scrollTop = c.scrollHeight; }

  /* ------------------- archivos en el chat ------------------- */
  // Bucket privado `archivos` (mismo patrón que `audios`): la URL
  // firmada (1 h) se pide al pintar y se guarda en memoria.
  var archivoEstado = {};   // msgId -> url firmada
  var TOPE_ARCHIVO = 25 * 1024 * 1024; // 25 MB

  function iconoArchivo(tipo, nombre) {
    var t = (tipo || '').toLowerCase(), n = (nombre || '').toLowerCase();
    if (t.indexOf('image/') === 0) return '🖼️';
    if (t.indexOf('video/') === 0) return '🎬';
    if (t.indexOf('audio/') === 0) return '🎵';
    if (t.indexOf('pdf') !== -1 || /\.pdf$/.test(n)) return '📕';
    if (/\.(docx?|odt)$/.test(n)) return '📘';
    if (/\.(xlsx?|csv|ods)$/.test(n)) return '📗';
    if (/\.(zip|rar|7z)$/.test(n)) return '🗜️';
    return '📄';
  }

  function formatoBytes(b) {
    if (!b && b !== 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  }

  function pintarArchivo(zona, m) {
    var esImagen = (m.archivo_tipo || '').indexOf('image/') === 0;
    if (esImagen) {
      var img = document.createElement('img');
      img.className = 'archivo-img';
      img.alt = m.archivo_nombre || 'foto';
      zona.appendChild(img);
      var pie = document.createElement('div');
      pie.className = 'subtitulo';
      pie.textContent = '🖼️ ' + (m.archivo_nombre || 'foto');
      zona.appendChild(pie);
    } else {
      var tarjeta = document.createElement('div');
      tarjeta.className = 'archivo-tarjeta';
      tarjeta.innerHTML = '<span class="archivo-icono">' + iconoArchivo(m.archivo_tipo, m.archivo_nombre) + '</span>' +
        '<span class="archivo-datos"><span class="archivo-nombre">' + escapar(m.archivo_nombre || 'archivo') + '</span>' +
        '<br><span class="subtitulo">' + formatoBytes(m.archivo_bytes) + '</span></span>';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-principal btn-chico';
      btn.textContent = 'Abrir ⬇️';
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        abrirArchivo(m);
      });
      tarjeta.appendChild(btn);
      zona.appendChild(tarjeta);
    }
    if (archivoEstado[m.id]) {
      if (esImagen) zona.querySelector('img').src = archivoEstado[m.id];
    } else {
      supa.storage.from('archivos').createSignedUrl(m.archivo_path, 3600).then(function (res) {
        if (res.data && res.data.signedUrl) {
          archivoEstado[m.id] = res.data.signedUrl;
          if (esImagen) { var im = zona.querySelector('img'); if (im) im.src = res.data.signedUrl; }
        }
      });
    }
    if (esImagen) {
      zona.querySelector('img').addEventListener('click', function (ev) {
        ev.stopPropagation();
        abrirArchivo(m);
      });
    }
  }

  function abrirArchivo(m) {
    var abrir = function (url) { if (url) window.open(url, '_blank'); };
    if (archivoEstado[m.id]) { abrir(archivoEstado[m.id]); return; }
    supa.storage.from('archivos').createSignedUrl(m.archivo_path, 3600).then(function (res) {
      if (res.data && res.data.signedUrl) { archivoEstado[m.id] = res.data.signedUrl; abrir(res.data.signedUrl); }
      else avisarAudio('Uy, no se pudo abrir el archivo. 📶');
    });
  }

  function prepararBotonArchivo() {
    var boton = $('#btn-archivo'), entrada = $('#chat-archivo');
    if (!boton || !entrada) return;
    boton.addEventListener('click', function () { entrada.click(); });
    entrada.addEventListener('change', function () {
      var f = entrada.files && entrada.files[0];
      entrada.value = '';
      if (f) enviarArchivo(f);
    });
  }

  function enviarArchivo(f) {
    if (f.size > TOPE_ARCHIVO) {
      avisarAudio('Ese archivo pesa demasiado (máximo 25 MB) 🙈');
      return;
    }
    var nombreLimpio = (f.name || 'archivo').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'archivo';
    var ruta = yo.id + '/' + Date.now() + '-' + nombreLimpio;
    informarAudio('Subiendo «' + nombreLimpio + '»… 📎');
    supa.storage.from('archivos').upload(ruta, f, { contentType: f.type || 'application/octet-stream' }).then(function (res) {
      if (res.error) { avisarAudio('Uy, el archivo no subió. Revisa tu internet y prueba otra vez 📶'); return; }
      supa.from('mensajes').insert({
        autor: yo.id, nombre: miPerfil.nombre, texto: '',
        archivo_path: ruta, archivo_nombre: nombreLimpio,
        archivo_tipo: f.type || '', archivo_bytes: f.size
      }).then(function (res2) {
        informarAudio('');
        if (res2.error) avisarAudio('Uy, el archivo no se pudo enviar. 📶');
        else Fun.sonido('turno');
      });
    });
  }

  /* ------------------- notas de voz: avisos en el chat ------------------- */
  function informarAudio(texto) {
    var aviso = $('#audio-aviso');
    if (!aviso) return;
    if (!texto) { aviso.classList.add('oculto'); return; }
    aviso.textContent = texto;
    aviso.classList.remove('oculto');
  }
  function avisarAudio(texto) {
    informarAudio(texto);
    Fun.sonido('error');
    setTimeout(function () { informarAudio(''); }, 6000);
  }

  /* ------------------- notas de voz: reproducción ------------------- */
  // El bucket `audios` es privado: la URL firmada (1 h) se pide la
  // primera vez que se toca ▶️ y se guarda en memoria para no repetir.
  var audioEstado = {};    // msgId -> { url, tiempo, sonando, duracionReal }
  var audioSonando = null; // el <audio> que suena ahora (uno solo a la vez)

  function pintarAudio(zona, m) {
    zona.className = 'reproductor-audio';
    var est = audioEstado[m.id] || (audioEstado[m.id] = { url: null, tiempo: 0, sonando: false, duracionReal: 0 });

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-play-audio';
    btn.title = 'Escuchar la nota de voz';
    btn.textContent = est.sonando ? '⏸️' : '▶️';
    var barra = document.createElement('div');
    barra.className = 'barra-progreso';
    var relleno = document.createElement('div');
    barra.appendChild(relleno);
    var dur = document.createElement('span');
    dur.className = 'audio-duracion';
    var el = document.createElement('audio');
    el.preload = 'metadata';
    el.setAttribute('playsinline', '');
    if (est.url) el.src = est.url;

    function totalSeg() {
      if (el.duration && isFinite(el.duration)) return el.duration;
      return m.audio_seg || est.duracionReal || 0;
    }
    function refrescar() {
      var d = totalSeg();
      var t = el.currentTime || 0;
      est.tiempo = t;
      relleno.style.width = d ? Math.min(100, (t / d) * 100) + '%' : '0%';
      dur.textContent = Fun.formatoDuracion(t) + ' / ' + Fun.formatoDuracion(d);
    }
    el.addEventListener('timeupdate', refrescar);
    el.addEventListener('loadedmetadata', function () {
      if (el.duration && isFinite(el.duration)) est.duracionReal = el.duration;
      refrescar();
    });
    el.addEventListener('play', function () { est.sonando = true; btn.textContent = '⏸️'; });
    el.addEventListener('pause', function () { est.sonando = false; btn.textContent = '▶️'; });
    el.addEventListener('ended', function () {
      est.sonando = false; est.tiempo = 0; btn.textContent = '▶️';
      try { el.currentTime = 0; } catch (e) { /* nada */ }
      refrescar();
    });
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation(); // que no abra el selector de reacciones
      if (!el.paused) { el.pause(); return; }
      if (audioSonando && audioSonando !== el) audioSonando.pause();
      audioSonando = el;
      reproducirAudio(el, est, m);
    });
    if (est.sonando && est.url) {
      // Repintado en mitad de la escucha (llegó una reacción, p. ej.):
      // el elemento nuevo retoma donde iba el anterior.
      el.addEventListener('loadedmetadata', function retomar() {
        el.removeEventListener('loadedmetadata', retomar);
        try { el.currentTime = est.tiempo || 0; } catch (e) { /* nada */ }
        var p = el.play();
        if (p && p.catch) p.catch(function () { est.sonando = false; btn.textContent = '▶️'; });
      });
    }
    zona.appendChild(btn);
    zona.appendChild(barra);
    zona.appendChild(dur);
    zona.appendChild(el);
    refrescar();
  }

  function reproducirAudio(el, est, m) {
    function tocar() {
      var p = el.play();
      if (p && p.catch) p.catch(function () {
        avisarAudio('Ese audio no se pudo reproducir en este aparato 🙈 (los grabados en Chrome a veces no suenan en Safari).');
      });
    }
    if (est.url) { tocar(); return; }
    supa.storage.from('audios').createSignedUrl(m.audio_path, 3600).then(function (res) {
      if (res.error || !res.data) { avisarAudio('No se pudo cargar el audio 🙈 Prueba otra vez.'); return; }
      est.url = res.data.signedUrl;
      el.src = est.url;
      tocar();
    });
  }

  /* ------------------- notas de voz: grabación ------------------- */
  // MediaRecorder del navegador: en Safari graba audio/mp4 (suena en
  // todos); en Chrome, webm/opus (puede no sonar en Safari: ver README).
  var grabador = null;
  var flujoGrabacion = null;
  var trozosAudio = [];
  var grabandoDesde = 0;
  var grabTimer = null;
  var accionAlDetener = null; // 'enviar' | 'descartar' | 'limite'
  var audioListo = null;      // paquete detenido por el límite, en espera
  var mimeGrabacion = '';

  function grabacionSoportada() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  function prepararBotonGrabar() {
    var boton = $('#btn-grabar');
    if (!boton) return;
    if (!grabacionSoportada()) {
      // Sin MediaRecorder no hay notas de voz: mensaje claro y sin botón.
      boton.classList.add('oculto');
      informarAudio('Este navegador no puede grabar notas de voz 🎤 Prueba con Safari o Chrome actualizados.');
      return;
    }
    boton.addEventListener('click', function (ev) { ev.stopPropagation(); iniciarGrabacion(); });
    $('#grab-enviar').addEventListener('click', function () {
      if (grabador && grabador.state !== 'inactive') { accionAlDetener = 'enviar'; grabador.stop(); }
      else if (audioListo) { var a = audioListo; audioListo = null; cerrarBarraGrabacion(); subirAudio(a); }
    });
    $('#grab-cancelar').addEventListener('click', function () {
      if (grabador && grabador.state !== 'inactive') { accionAlDetener = 'descartar'; grabador.stop(); }
      else { audioListo = null; cerrarBarraGrabacion(); Fun.sonido('pop'); }
    });
  }

  function iniciarGrabacion() {
    if (grabador && grabador.state !== 'inactive') return;
    audioListo = null;
    $('#panel-emojis').classList.add('oculto');
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      flujoGrabacion = stream;
      trozosAudio = [];
      var opciones = {};
      if (window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/mp4')) {
        opciones.mimeType = 'audio/mp4'; // el de Safari: suena en todas partes
      }
      try { grabador = new MediaRecorder(stream, opciones); }
      catch (e) { grabador = new MediaRecorder(stream); }
      mimeGrabacion = grabador.mimeType || opciones.mimeType || 'audio/webm';
      grabador.addEventListener('dataavailable', function (ev) {
        if (ev.data && ev.data.size) trozosAudio.push(ev.data);
      });
      grabador.addEventListener('stop', alDetenerGrabacion);
      accionAlDetener = null;
      grabandoDesde = Date.now();
      grabador.start();
      $('#grab-tiempo').textContent = '0:00';
      $('#grab-texto').textContent = 'Grabando tu nota de voz…';
      $('#barra-grabacion').classList.remove('oculto');
      $('#form-chat').classList.add('oculto');
      Fun.sonido('turno');
      grabTimer = setInterval(function () {
        var seg = (Date.now() - grabandoDesde) / 1000;
        $('#grab-tiempo').textContent = Fun.formatoDuracion(seg);
        if (seg >= Fun.GRABACION_MAX_SEG && grabador && grabador.state !== 'inactive') {
          accionAlDetener = 'limite';
          grabador.stop();
        }
      }, 250);
    }).catch(function () {
      avisarAudio('No se pudo usar el micrófono 🎤 Revisa el permiso del navegador para este sitio y prueba otra vez.');
    });
  }

  function cerrarBarraGrabacion() {
    $('#barra-grabacion').classList.add('oculto');
    $('#form-chat').classList.remove('oculto');
  }

  function alDetenerGrabacion() {
    if (grabTimer) { clearInterval(grabTimer); grabTimer = null; }
    if (flujoGrabacion) { flujoGrabacion.getTracks().forEach(function (t) { t.stop(); }); flujoGrabacion = null; }
    var seg = Math.max(1, Math.round((Date.now() - grabandoDesde) / 1000));
    var accion = accionAlDetener;
    accionAlDetener = null;
    grabador = null;
    if (accion === 'descartar') {
      trozosAudio = [];
      cerrarBarraGrabacion();
      Fun.sonido('pop');
      return;
    }
    var blob = new Blob(trozosAudio, { type: mimeGrabacion });
    trozosAudio = [];
    var ext = mimeGrabacion.indexOf('mp4') !== -1 ? 'mp4'
      : (mimeGrabacion.indexOf('ogg') !== -1 ? 'ogg' : 'webm');
    var paquete = { blob: blob, seg: seg, ext: ext, mime: mimeGrabacion };
    if (accion === 'limite') {
      // Se detuvo sola a los 3 minutos: queda lista para enviar/descartar.
      audioListo = paquete;
      $('#grab-texto').textContent = '⏱️ Límite de ' + Fun.formatoDuracion(Fun.GRABACION_MAX_SEG) + ' alcanzado. ¿La enviamos?';
      Fun.sonido('acierto');
      return;
    }
    cerrarBarraGrabacion();
    subirAudio(paquete);
  }

  function subirAudio(paquete) {
    var ruta = yo.id + '/' + Date.now() + '.' + paquete.ext; // mi carpeta
    informarAudio('Subiendo tu nota de voz… 🎙️');
    supa.storage.from('audios').upload(ruta, paquete.blob, { contentType: paquete.mime }).then(function (res) {
      if (res.error) { avisarAudio('No se pudo subir el audio 🙈 Prueba otra vez.'); return; }
      supa.from('mensajes').insert({
        autor: yo.id, nombre: miPerfil.nombre, texto: '',
        audio_path: ruta, audio_seg: paquete.seg
      }).then(function (res2) {
        if (res2.error) { avisarAudio('El audio subió pero el mensaje no se pudo crear 🙈'); return; }
        informarAudio('');
        Fun.sonido('mensaje');
      });
    });
  }

  $('#form-chat').addEventListener('submit', function (e) {
    e.preventDefault();
    var texto = $('#chat-texto').value.trim();
    if (!texto) return;
    $('#chat-texto').value = '';
    $('#panel-emojis').classList.add('oculto'); // el panel se cierra al enviar
    supa.from('mensajes').insert({ autor: yo.id, nombre: miPerfil.nombre, texto: texto }).then(function (res) {
      if (res.error) Fun.sonido('error');
    });
  });

  /* ------------------- selector de emojis del chat ------------------- */
  var EMOJIS_CHAT = {
    '😀 Caritas': ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤩', '🥳', '😴', '😋', '🤗', '🤔', '😮', '😢', '😭', '👍', '👎', '👏', '🙏', '💪', '🙌', '👋', '🤞'],
    '❤️ Corazones y fiesta': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💕', '💯', '🔥', '⭐', '🌟', '✨', '🎉', '🎊', '🎁'],
    '🐶 Animales': ['🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵', '🐔', '🐧', '🐦', '🦄', '🐴', '🐢', '🦋', '🐙'],
    '🍕 Comida': ['🍎', '🍌', '🍇', '🍓', '🍕', '🍔', '🌮', '🍦', '🍰', '🍩', '🍿', '🍫', '☕', '🥤'],
    '⚽ Cosas y lugares': ['⚽', '🏀', '🎸', '🎮', '📚', '⚾', '🚗', '✈️', '🏠', '📱', '💡', '🎈', '🌈', '☀️', '🌙', '🌸', '🌴', '🎄'],
    '🏳️ Banderas': ['🇩🇴', '🇺🇸', '🇵🇷', '🇲🇽', '🇪🇸', '🇨🇴', '🇻🇪']
  };

  function armarPanelEmojis() {
    var panel = $('#panel-emojis');
    if (!panel || panel.dataset.armado) return;
    panel.dataset.armado = '1';
    Object.keys(EMOJIS_CHAT).forEach(function (grupo) {
      var titulo = document.createElement('div');
      titulo.className = 'panel-emojis-titulo';
      titulo.textContent = grupo;
      panel.appendChild(titulo);
      var rejilla = document.createElement('div');
      rejilla.className = 'rejilla-emojis';
      EMOJIS_CHAT[grupo].forEach(function (emoji) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'emoji-opcion';
        b.textContent = emoji;
        b.addEventListener('click', function (ev) { ev.stopPropagation(); insertarEnChat(emoji); });
        rejilla.appendChild(b);
      });
      panel.appendChild(rejilla);
    });
  }

  function insertarEnChat(emoji) {
    var input = $('#chat-texto');
    var ini = input.selectionStart != null ? input.selectionStart : input.value.length;
    var fin = input.selectionEnd != null ? input.selectionEnd : ini;
    var nuevo = input.value.slice(0, ini) + emoji + input.value.slice(fin);
    if (nuevo.length > 500) return; // el límite del chat manda
    input.value = nuevo;
    var pos = ini + emoji.length;
    input.focus();
    try { input.setSelectionRange(pos, pos); } catch (e) { /* da igual */ }
    Fun.sonido('pop');
  }

  $('#btn-emojis').addEventListener('click', function (ev) {
    ev.stopPropagation(); // que el cierre «al tocar fuera» no lo cierre al abrir
    armarPanelEmojis();
    $('#panel-emojis').classList.toggle('oculto');
    Fun.sonido('pop');
  });

  /* ==================== CAPAS SOBREPUESTAS (v3.2) ====================
     Pedido del dueño: nada de que tocar algo «envíe abajo» — el juego, la
     historia y el versículo se SOBREPOBEN sobre la pantalla. La capa es
     fija y cubre todo; la página de debajo NO se mueve ni se desplaza
     jamás en la apertura (cero desplazamiento programático de la ventana).
     El fondo se bloquea fijando el <body> en su punto exacto (técnica
     segura en iOS: overflow:hidden solo no basta en Safari) y al cerrar
     la última capa se restaura ESE MISMO punto: la lista queda donde
     estaba, sin saltos. Cada capa se cierra SOLO con su ✖ (nada de
     cerrar tocando fuera: el niño no pierde la partida sin querer). */
  var capasAbiertas = {};        // id de capa -> true
  var fondoBloqueado = false;
  var scrollFondoGuardado = 0;

  function bloquearFondo() {
    if (fondoBloqueado) return;  // ya guardado por la primera capa
    fondoBloqueado = true;
    try {
      scrollFondoGuardado = window.pageYOffset ||
        (document.documentElement ? document.documentElement.scrollTop : 0) || 0;
      document.body.style.top = (-scrollFondoGuardado) + 'px';
      document.body.classList.add('con-capa');
    } catch (e) { /* si algo falla, la capa se abre igual */ }
  }
  function desbloquearFondo() {
    if (!fondoBloqueado) return;
    fondoBloqueado = false;
    try {
      document.body.classList.remove('con-capa');
      document.body.style.top = '';
      // Restaurar el punto EXACTO: esto es la ruta de CIERRE, no de apertura.
      window.scrollTo(0, scrollFondoGuardado);
    } catch (e) { /* nada: cerrar nunca se cae */ }
  }
  function abrirCapa(id) {
    var capa = document.getElementById(id);
    if (!capa) return;
    if (!capasAbiertas[id]) { capasAbiertas[id] = true; bloquearFondo(); }
    capa.classList.remove('oculto');
    var cuerpo = capa.querySelector('.capa-cuerpo');
    if (cuerpo) { try { cuerpo.scrollTop = 0; } catch (e) { /* la capa nace arriba (su scroll INTERNO) */ } }
  }
  function cerrarCapa(id) {
    var capa = document.getElementById(id);
    if (capa) capa.classList.add('oculto');
    if (!capasAbiertas[id]) return;
    delete capasAbiertas[id];
    var quedaAlguna = false;
    for (var k in capasAbiertas) { if (capasAbiertas[k]) { quedaAlguna = true; break; } }
    if (!quedaAlguna) desbloquearFondo();
  }

  /* ============================ JUEGOS EN LÍNEA ============================ */
  var partidasPorId = {};
  var partidaActualId = null;
  var intencionRevisada = false; // v3.3: la intención de abrir tras crear se revisa una sola vez
  var celebraciones = {};
  var eraMiTurno = {};
  var resolviendoMemoria = {};
  var revelandoPregunta = -1;

  function iniciarJuegos() {
    cargarPartidas();
    supa.channel('partidas-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partidas' }, function () { cargarPartidas(); })
      .subscribe();
    $('#btn-cerrar-juego').addEventListener('click', cerrarJuegoVista);
    // v3.4: las tarjetas se generan desde CATEGORIAS_JUEGOS (barras por
    // categoría) y se pintan ANTES de cablear [data-crear], para que el
    // cableado de siempre las recoja a ellas también.
    pintarCategoriasJuegos();
    $$('[data-crear]').forEach(function (b) {
      b.addEventListener('click', function () { crearPartida(b.dataset.crear); });
    });
    setInterval(relojDeJuegos, 1000);
  }

  function cargarPartidas() {
    supa.from('partidas').select('*').eq('activa', true).order('creada_en', { ascending: false }).then(function (res) {
      partidasPorId = {};
      (res.data || []).forEach(function (p) { partidasPorId[p.id] = p; });
      pintarListaPartidas(res.data || []);
      if (partidaActualId && partidasPorId[partidaActualId]) renderJuego(partidasPorId[partidaActualId]);
      // v3.3: si una creación quedó a medias por una recarga de la página
      // (la única del service worker al actualizarse), su intención de
      // abrir se cumple ahora, con la lista ya cargada.
      if (!intencionRevisada) { intencionRevisada = true; reabrirSiQuedoIntencion(); }
    });
  }

  function ordenAleatorio(nBanco, cuantas) {
    var idx = [];
    for (var k = 0; k < nBanco; k++) idx.push(k);
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return idx.slice(0, cuantas || 10); // 10 preguntas por partida
  }
  function ordenTriviaAleatorio() { return ordenAleatorio(L.BANCO_PREGUNTAS.length, 10); }

  // Catálogo completo de juegos: icono, nombre y tope de jugadores.
  var CATALOGO = {
    gato: { icono: '❌⭕', nombre: 'Gato', tope: 2 },
    trivia: { icono: '🧠', nombre: 'Trivia', tope: 3 },
    memoria: { icono: '🃏', nombre: 'Memoria', tope: 3 },
    conecta: { icono: '🔴', nombre: 'Conecta 4', tope: 3 },
    serpientes: { icono: '🐍', nombre: 'Serpientes y Escaleras', tope: 3 },
    ahorcado: { icono: '🔤', nombre: 'Ahorcado', tope: 3 },
    dibujo: { icono: '🎨', nombre: 'Dibujo y Adivina', tope: 3 },
    parchis: { icono: '🎲', nombre: 'Parchís', tope: 3 },
    domino: { icono: '🁢', nombre: 'Dominó', tope: 3 },
    naval: { icono: '🚢', nombre: 'Batalla Naval', tope: 2 },
    sopa: { icono: '🔎', nombre: 'Sopa de Letras', tope: 3 },
    basta: { icono: '✋', nombre: '¡Basta!', tope: 3 },
    simon: { icono: '🔴', nombre: 'Simón Dice', tope: 3 },
    calculo: { icono: '➕', nombre: 'Cálculo Rápido', tope: 3 },
    ppt: { icono: '✊', nombre: 'Piedra, Papel o Tijera', tope: 3 },
    adivina: { icono: '🔢', nombre: 'Adivina el Número', tope: 3 },
    versiculo: { icono: '✍️', nombre: 'Completa el Versículo', tope: 3 },
    quef: { icono: '🤔', nombre: '¿Qué falta?', tope: 3 },
    orden: { icono: '🔢', nombre: 'Recuerda el Orden', tope: 3 },
    numeros: { icono: '🧮', nombre: 'Memoria de Números', tope: 3 },
    damas: { icono: '🔴', nombre: 'Damas', tope: 2 },
    loteria: { icono: '🎴', nombre: 'Lotería', tope: 3 },
    guerra: { icono: '⚔️', nombre: 'Guerra de Cartas', tope: 3 },
    tesoro: { icono: '🗺️', nombre: 'El Tesoro Escondido', tope: 3 },
    verdad: { icono: '💬', nombre: 'Verdad o Reto', tope: 3 },
    carrera: { icono: '🎲', nombre: 'Carrera de Dados', tope: 3 },
    encadenada: { icono: '🔤', nombre: 'Palabra Encadenada', tope: 3 },
    puzzle: { icono: '🧩', nombre: 'Rompecabezas Deslizante', tope: 3 },
    quien: { icono: '🗣️', nombre: '¿Quién lo Dijo?', tope: 3 },
    vf: { icono: '✅', nombre: 'Verdadero o Falso Bíblico', tope: 3 },
    encuentra: { icono: '🔍', nombre: 'Encuentra el Versículo', tope: 3 },
    ordenab: { icono: '📜', nombre: 'Ordena la Historia', tope: 3 },
    misterio: { icono: '🕵️', nombre: 'Personaje Misterioso', tope: 3 },
    obby: { icono: '🏃', nombre: 'Obby ¡Salta y Gana!', tope: 3 },
    tycoon: { icono: '🏗️', nombre: 'Mi Tycoon', tope: 3 },
    mascotas: { icono: '🐾', nombre: 'Mascotas Monederas', tope: 3 },
    torre: { icono: '🎈', nombre: 'Defiende la Torre', tope: 3 },
    impostor: { icono: '🕵️', nombre: 'El Impostor', tope: 3 },
    jonas: { icono: '🐳', nombre: 'Jonás y la Ballena', tope: 3 },
    arca: { icono: '🦁', nombre: 'El Arca de Noé', tope: 3 },
    goliat: { icono: '🪨', nombre: 'David y Goliat', tope: 3 },
    cohete: { icono: '🚀', nombre: 'Carrera Espacial', tope: 3 },
    blanco: { icono: '🎯', nombre: 'Tiro al Blanco', tope: 3 },
    granja: { icono: '🌻', nombre: 'Granja de Monedas', tope: 3 }
  };

  /* ----- v3.4: los juegos POR CATEGORÍAS, en barras que se deslizan -----
     Pedido del dueño: «los juegos, ponlos por categoría y deslizamiento
     en sus categorías». La pestaña Juegos deja de ser una lista larga de
     botones apilados: cada categoría es una BARRA horizontal deslizable
     (el mismo patrón visual que las historias de Biblia) de tarjetas
     compactas (icono + nombre) que se pinta desde estos datos.
     Reglas de la casa:
     · Cada clave de creación vive en UNA sola categoría.
     · Los 33 del CATALOGO están todos (las variantes de creación —
       memoria-tema, trivia-biblica, memoria-biblica — son el mismo juego
       con otro banco/mazo; ver BASE_CREAR).
     · Los 8 bíblicos viven también en la pestaña Biblia (su rejilla de
       la v3.3 no cambia): aquí tienen su propia barra, como ya vivían
       en ambas pestañas con su grupo propio.
     Asignación (documentada): los de tablero y fichas de siempre a
     «Mesa clásica»; lo que se juega con cartas, cartones o dados a
     «Cartas y dados»; lo de pensar y lo de letras a «Mente y palabras»;
     lo de acordarse y reaccionar a «Memoria y reflejos»; los de fiesta
     y risa a «Para reírse»; y los de la Biblia a «Bíblicos». */
  var EXTRA_CREAR = {
    'memoria-tema': { icono: '🎨', nombre: 'Memoria con temas' },
    'trivia-biblica': { icono: '📖', nombre: 'Trivia Bíblica' },
    'memoria-biblica': { icono: '🕊️', nombre: 'Memoria Bíblica' }
  };
  var BASE_CREAR = { 'memoria-tema': 'memoria', 'trivia-biblica': 'trivia', 'memoria-biblica': 'memoria' };
  var CATEGORIAS_JUEGOS = [
    { id: 'mesa', icono: '🎲', nombre: 'Mesa clásica', juegos: ['gato', 'conecta', 'serpientes', 'domino', 'naval', 'damas', 'tesoro'] },
    { id: 'cartas', icono: '🃏', nombre: 'Cartas y dados', juegos: ['parchis', 'loteria', 'guerra', 'carrera'] },
    { id: 'mente', icono: '🔤', nombre: 'Mente y palabras', juegos: ['trivia', 'ahorcado', 'sopa', 'basta', 'calculo', 'adivina', 'encadenada'] },
    { id: 'memoria', icono: '🧠', nombre: 'Memoria y reflejos', juegos: ['memoria', 'memoria-tema', 'simon', 'quef', 'orden', 'numeros'] },
    { id: 'risas', icono: '😂', nombre: 'Para reírse', juegos: ['dibujo', 'verdad', 'puzzle', 'ppt', 'impostor', 'blanco'] },
    { id: 'roblox', icono: '🕹️', nombre: 'Mundo Roblox', juegos: ['obby', 'tycoon', 'mascotas', 'torre', 'cohete', 'granja'] },
    { id: 'biblicos', icono: '📖', nombre: 'Bíblicos', juegos: ['trivia-biblica', 'memoria-biblica', 'versiculo', 'quien', 'vf', 'encuentra', 'ordenab', 'misterio', 'jonas', 'arca', 'goliat'] }
  ];
  function infoCrear(clave) { return CATALOGO[clave] || EXTRA_CREAR[clave] || { icono: '🎮', nombre: clave }; }

  // Pinta las barras por categoría en #categorias-juegos. Las tarjetas
  // usan data-crear, así que el cableado de siempre ([data-crear] →
  // crearPartida) las recoge: tocar una tarjeta CREA la partida y abre
  // su capa al instante (la conducta de la v3.3, intacta).
  function pintarCategoriasJuegos() {
    var caja = $('#categorias-juegos');
    if (!caja) return;
    caja.innerHTML = '';
    CATEGORIAS_JUEGOS.forEach(function (cat) {
      var titulo = document.createElement('h3');
      titulo.className = 'categoria-titulo';
      titulo.textContent = cat.icono + ' ' + cat.nombre;
      caja.appendChild(titulo);
      var barra = document.createElement('div');
      barra.className = 'barra-juegos';
      barra.dataset.categoria = cat.id;
      cat.juegos.forEach(function (clave) {
        var info = infoCrear(clave);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'juego-tarjeta';
        b.dataset.crear = clave;
        b.innerHTML = '<span class="juego-tarjeta-icono">' + info.icono + '</span>' +
          '<span class="juego-tarjeta-nombre">' + escapar(info.nombre) + '</span>';
        barra.appendChild(b);
      });
      caja.appendChild(barra);
    });
  }

  // v3.2: el tablero se abre en la CAPA sobrepuesta (#capa-juego), encima
  // de todo y sin mover la página de debajo (ni cambio de pestaña, ni
  // scroll de ningún tipo). El mecanismo de scroll de la v3/v3.1 quedó
  // RETIRADO: la capa lo sustituye. Al cerrar con ✖ se vuelve exactamente
  // a donde se estaba (ver cerrarCapa/desbloquearFondo).
  function abrirYMostrar(p) {
    var titulo = $('#capa-juego-titulo');
    if (titulo) titulo.textContent = iconoJuego(p.tipo) + ' ' + nombreJuego(p);
    renderJuego(p); // dibuja el tablero dentro de la capa
    abrirCapa('capa-juego');
  }
  function cerrarJuegoVista() {
    partidaActualId = null;
    if (typeof soltarSimon === 'function') soltarSimon(); // v3.4.3: ninguna reproducción queda colgada al salir
    var zona = $('#zona-juego');
    if (zona) zona.innerHTML = '';
    var zonaOV = $('#zona-otra-vez'); // v3.4.2: el «otra vez» se apaga con la vista
    if (zonaOV) zonaOV.classList.add('oculto');
    cerrarCapa('capa-juego');
    Fun.sonido('pop');
  }

  /* ----- v3.3: crear abre AL TOQUE (apertura optimista + red de seguridad) -----
     Diagnóstico en vivo (v3.2): al tocar «❌⭕ Gato» la partida se creaba y
     aparecía en «Partidas abiertas», pero la capa NO se abría sola: había
     que tocar «Abrir». La apertura dependía por entero del viaje asíncrono
     del insert (insert → select → abrir), y en vivo ese viaje se puede
     cortar a mitad: la recarga única de la propia app cuando un service
     worker nuevo toma el control (controllerchange → location.reload)
     mata la página con el insert en vuelo — la fila queda creada, la
     promesa jamás vuelve —; y si el RETURNING del insert diera error con
     la fila ya creada, el camino de error también volvía sin abrir nada.
     En local no se veía: el Supabase simulado no tiene service worker ni
     Realtime de verdad y su insert siempre resuelve al instante.
     La corrección tiene tres capas:
     1) OPTIMISTA: la capa se abre en el mismo toque, con una partida
        provisional (id «creando-…») cuyo tablero ya es el de verdad; la
        fila devuelta solo CONFIRMA: adopta el id real y repinta con él.
     2) INTENCIÓN: al tocar se anota la intención de abrir; si la página
        muere antes de confirmar (la recarga del SW), al volver a cargar
        la app encuentra la partida recién creada y la abre sola.
     3) GUARDA: guardarEstado ignora las provisionales (aún no hay fila
        que actualizar; los movimientos se guardan al adoptar la real). */
  var INTENCION_ABRIR_KEY = 'nr_abrir_tras_crear';
  function anotarIntencionAbrir(tipo) {
    try { localStorage.setItem(INTENCION_ABRIR_KEY, JSON.stringify({ tipo: tipo, en: Date.now() })); } catch (e) { /* sin storage manda la apertura optimista */ }
  }
  function borrarIntencionAbrir() {
    try { localStorage.removeItem(INTENCION_ABRIR_KEY); } catch (e) { /* nada */ }
  }
  function reabrirSiQuedoIntencion() {
    var cruda = null;
    try { cruda = localStorage.getItem(INTENCION_ABRIR_KEY); } catch (e) { return; }
    if (!cruda) return;
    borrarIntencionAbrir(); // se consume siempre: una sola oportunidad
    var datos = null;
    try { datos = JSON.parse(cruda); } catch (e) { return; }
    if (!datos || !datos.tipo || !yo || (Date.now() - (datos.en || 0)) > 90000) return;
    var mejor = null;
    for (var id in partidasPorId) {
      var p = partidasPorId[id];
      if (!p || p.tipo !== datos.tipo || p.creada_por !== yo.id) continue;
      if (p.creada_en && Math.abs(new Date(p.creada_en).getTime() - datos.en) > 120000) continue;
      if (!mejor || (p.creada_en || '') >= (mejor.creada_en || '')) mejor = p;
    }
    if (mejor) abrirPartida(mejor, true);
  }

  function crearPartida(tipo) {
    var estado, tipoReal = tipo;
    switch (tipo) {
      case 'gato': estado = L.crearGato([yo.id]); break;
      case 'trivia': estado = L.crearTrivia([yo.id], ordenTriviaAleatorio()); break;
      case 'trivia-biblica':
        tipoReal = 'trivia';
        estado = L.crearTrivia([yo.id], ordenAleatorio(G.BANCO_TRIVIA_BIBLICA.length, 10), 'biblica');
        break;
      case 'memoria': estado = L.crearMemoria(8); estado.jugadores = [yo.id]; break;
      case 'memoria-tema': {
        tipoReal = 'memoria';
        var claveMazo = ($('#mazo-memoria') || {}).value || 'animales';
        estado = L.crearMemoria(8, Math.random, G.MAZOS_MEMORIA[claveMazo]);
        estado.jugadores = [yo.id];
        estado.mazo = claveMazo;
        break;
      }
      case 'memoria-biblica':
        tipoReal = 'memoria';
        estado = L.crearMemoria(8, Math.random, G.PAREJAS_BIBLICAS);
        estado.jugadores = [yo.id];
        estado.mazo = 'biblia';
        break;
      case 'versiculo': estado = G.crearVersiculo([yo.id], ordenAleatorio(G.BANCO_COMPLETA.length, 10)); break;
      case 'conecta': estado = G.crearConecta([yo.id]); break;
      case 'serpientes': estado = G.crearSerpientes([yo.id]); break;
      case 'ahorcado': estado = G.crearAhorcado([yo.id]); break;
      case 'dibujo': estado = G.crearDibujo([yo.id]); break;
      case 'parchis': estado = G.crearParchis([yo.id]); break;
      case 'domino': estado = G.crearDomino([yo.id]); break;
      case 'naval': estado = G.crearNaval([yo.id]); break;
      case 'sopa': estado = G.crearSopa([yo.id]); break;
      case 'basta': estado = G.crearBasta([yo.id]); estado.inicioRonda = Date.now(); break;
      case 'simon': estado = G.crearSimon([yo.id]); break;
      case 'calculo': estado = G.crearCalculo([yo.id]); break;
      case 'ppt': estado = G.crearPPT([yo.id]); break;
      case 'adivina': estado = G.crearAdivina([yo.id]); break;
      case 'quef': estado = G.crearQueFalta([yo.id]); estado.vistaInicio = Date.now(); break;
      case 'orden': estado = G.crearOrden([yo.id]); estado.vistaInicio = Date.now(); break;
      case 'numeros': estado = G.crearNumeros([yo.id]); estado.vistaInicio = Date.now(); break;
      case 'damas': estado = G.crearDamas([yo.id]); break;
      case 'loteria': estado = G.crearLoteria([yo.id]); break;
      case 'guerra': estado = G.crearGuerra([yo.id]); break;
      case 'tesoro': estado = G.crearTesoro([yo.id]); break;
      case 'verdad': estado = G.crearVerdad([yo.id]); break;
      case 'carrera': estado = G.crearCarrera([yo.id]); break;
      case 'encadenada': estado = G.crearEncadenada([yo.id]); break;
      case 'puzzle': estado = G.crearPuzzle([yo.id]); estado.inicioEn = Date.now(); break;
      case 'quien': estado = G.crearQuizBiblico('quien', [yo.id], ordenAleatorio(G.BANCO_QUIEN.length, 10)); break;
      case 'vf': estado = G.crearQuizBiblico('vf', [yo.id], ordenAleatorio(G.BANCO_VF.length, 10)); break;
      case 'encuentra': estado = G.crearQuizBiblico('encuentra', [yo.id], ordenAleatorio(G.BANCO_ENCUENTRA.length, 10)); break;
      case 'ordenab': estado = G.crearOrdena([yo.id]); break;
      case 'misterio': estado = G.crearMisterio([yo.id]); break;
      case 'obby': estado = G.crearObby([yo.id]); break;
      case 'tycoon': estado = G.crearTycoon([yo.id]); break;
      case 'mascotas': estado = G.crearMascotas([yo.id]); break;
      case 'torre': estado = G.crearTorre([yo.id]); break;
      case 'impostor': estado = G.crearImpostor([yo.id]); break;
      case 'jonas': estado = G.crearJonas([yo.id]); break;
      case 'arca': estado = G.crearArca([yo.id]); break;
      case 'goliat': estado = G.crearGoliat([yo.id]); break;
      case 'cohete': estado = G.crearCohete([yo.id]); break;
      case 'blanco': estado = G.crearBlanco([yo.id]); break;
      case 'granja': estado = G.crearGranja([yo.id]); break;
      default: return;
    }
    // v3.3: la capa se abre AL TOQUE con la partida provisional; el insert
    // viaja detrás y su fila solo confirma (ver la nota de diagnóstico).
    var provisional = { id: 'creando-' + Date.now(), tipo: tipoReal, estado: estado, creada_por: yo.id, provisional: true };
    partidasPorId[provisional.id] = provisional;
    anotarIntencionAbrir(tipoReal);
    try { abrirYMostrar(provisional); } catch (eAbrir) { abrirCapa('capa-juego'); }
    Fun.sonido('turno');
    supa.from('partidas').insert({ tipo: tipoReal, estado: estado, creada_por: yo.id })
      .select().single().then(function (res) {
        if (res.error || !res.data) {
          // La confirmación falló: la capa ya abierta avisa sin cerrarse;
          // si la fila sí se creó, estará en la lista para tocar «Abrir»
          // (y la intención la reabrirá sola si la página se recarga).
          Fun.sonido('error');
          if (partidaActualId === provisional.id) {
            var zonaE = $('#zona-juego');
            if (zonaE) zonaE.innerHTML = '<p>Uy, la partida no se pudo confirmar 🙈 Revisa tu conexión y cierra con la ✖: si aparece en «Partidas abiertas», tócala con «Abrir».</p>';
          }
          return;
        }
        borrarIntencionAbrir();
        delete partidasPorId[provisional.id];
        partidasPorId[res.data.id] = res.data;
        if (partidaActualId === provisional.id) {
          // La capa sigue abierta con el provisional: se adopta la fila
          // real y se repinta con ella (desde aquí todo guarda bien).
          partidaActualId = res.data.id;
          renderJuego(res.data);
        }
        cargarPartidas();
      });
  }

  function guardarEstado(partida, nuevoEstado) {
    if (!partida || !partida.id || String(partida.id).indexOf('creando-') === 0) {
      // Partida provisional (creándose): aún no hay fila que actualizar;
      // el estado real se adopta al confirmar y desde ahí todo guarda.
      return Promise.resolve();
    }
    return supa.from('partidas')
      .update({ estado: nuevoEstado, actualizada_en: new Date().toISOString() })
      .eq('id', partida.id)
      .then(function () { cargarPartidas(); });
  }

  function iconoJuego(tipo) { return (CATALOGO[tipo] || {}).icono || '🎮'; }
  function nombreJuego(p) {
    var tipo = typeof p === 'string' ? p : p.tipo;
    var e = typeof p === 'string' ? {} : (p.estado || {});
    if (tipo === 'trivia' && e.banco === 'biblica') return 'Trivia Bíblica 📖';
    if (tipo === 'memoria' && e.mazo === 'biblia') return 'Memoria Bíblica 📖';
    if (tipo === 'memoria' && e.mazo) return 'Memoria · ' + e.mazo;
    return (CATALOGO[tipo] || {}).nombre || tipo;
  }
  function topeJugadores(tipo) { return (CATALOGO[tipo] || {}).tope || 3; }

  function pintarListaPartidas(lista) {
    var caja = $('#lista-partidas');
    if (!lista.length) { caja.innerHTML = '<p class="subtitulo">No hay partidas todavía. ¡Crea la primera!</p>'; return; }
    caja.innerHTML = '';
    lista.forEach(function (p) {
      var dentro = (p.estado.jugadores || []).indexOf(yo.id) !== -1;
      var lleno = (p.estado.jugadores || []).length >= topeJugadores(p.tipo);
      var div = document.createElement('div');
      div.className = 'partida-item';
      div.innerHTML = '<span style="font-size:1.6rem">' + iconoJuego(p.tipo) + '</span>' +
        '<span class="crece">' + escapar(nombreJuego(p)) + ' de ' + escapar(nombreDe(p.creada_por)) +
        ' · ' + (p.estado.jugadores || []).length + '/' + topeJugadores(p.tipo) + ' jugadores</span>';
      var btn = document.createElement('button');
      btn.className = 'btn-principal btn-chico';
      btn.textContent = dentro ? 'Abrir' : lleno ? 'Llena 👀' : '¡Unirme!';
      btn.disabled = !dentro && lleno;
      btn.addEventListener('click', function () { abrirPartida(p, dentro); });
      div.appendChild(btn);
      if (p.creada_por === yo.id) {
        var cerrar = document.createElement('button');
        cerrar.className = 'btn-suave btn-chico';
        cerrar.textContent = 'Cerrar';
        cerrar.addEventListener('click', function () {
          supa.from('partidas').update({ activa: false }).eq('id', p.id).then(function () {
            if (partidaActualId === p.id) cerrarJuegoVista();
            cargarPartidas();
          });
        });
        div.appendChild(cerrar);
      }
      caja.appendChild(div);
    });
  }

  function abrirPartida(p, dentro) {
    partidaActualId = p.id;
    if (dentro) { abrirYMostrar(p); return; }
    var estado = JSON.parse(JSON.stringify(p.estado));
    estado.jugadores = (estado.jugadores || []).concat([yo.id]);
    // Se muestra al instante (optimista) en la capa sobrepuesta; el guardado confirma la unión.
    try { abrirYMostrar({ id: p.id, tipo: p.tipo, estado: estado, creada_por: p.creada_por }); }
    catch (eAbrir) { abrirCapa('capa-juego'); }
    guardarEstado(p, estado).then(function () { Fun.sonido('turno'); });
  }

  function renderJuego(p) {
    // v3.2: pinta dentro de #zona-juego, que vive en la capa sobrepuesta;
    // la visibilidad la manda la capa (abrirCapa/cerrarCapa), no la tarjeta.
    partidaActualId = p.id;
    try {
    switch (p.tipo) {
      case 'gato': renderGato(p); break;
      case 'trivia': renderTrivia(p); break;
      case 'memoria': renderMemoria(p); break;
      case 'conecta': renderConecta(p); break;
      case 'serpientes': renderSerpientes(p); break;
      case 'ahorcado': renderAhorcado(p); break;
      case 'dibujo': renderDibujo(p); break;
      case 'parchis': renderParchis(p); break;
      case 'domino': renderDomino(p); break;
      case 'naval': renderNaval(p); break;
      case 'sopa': renderSopa(p); break;
      case 'basta': renderBasta(p); break;
      case 'simon': renderSimon(p); break;
      case 'calculo': renderCalculo(p); break;
      case 'ppt': renderPPT(p); break;
      case 'adivina': renderAdivina(p); break;
      case 'versiculo': renderVersiculo(p); break;
      case 'quef': renderQueFalta(p); break;
      case 'orden': renderOrden(p); break;
      case 'numeros': renderNumeros(p); break;
      case 'damas': renderDamas(p); break;
      case 'loteria': renderLoteria(p); break;
      case 'guerra': renderGuerra(p); break;
      case 'tesoro': renderTesoro(p); break;
      case 'verdad': renderVerdad(p); break;
      case 'carrera': renderCarrera(p); break;
      case 'encadenada': renderEncadenada(p); break;
      case 'puzzle': renderPuzzle(p); break;
      case 'quien': case 'vf': case 'encuentra': renderQuizBiblico(p); break;
      case 'ordenab': renderOrdena(p); break;
      case 'misterio': renderMisterio(p); break;
      case 'obby': renderObby(p); break;
      case 'tycoon': renderTycoon(p); break;
      case 'mascotas': renderMascotas(p); break;
      case 'torre': renderTorre(p); break;
      case 'impostor': renderImpostor(p); break;
      case 'jonas': renderJonas(p); break;
      case 'arca': renderArca(p); break;
      case 'goliat': renderGoliat(p); break;
      case 'cohete': renderCohete(p); break;
      case 'blanco': renderBlanco(p); break;
      case 'granja': renderGranja(p); break;
      default: $('#zona-juego').innerHTML = '<p>Este juego todavía no tiene pantalla. 🙈</p>';
    }
    } catch (eRender) {
      // Que un juego se trabe al pintarse NUNCA deje la capa vacía ni
      // rompa la cadena de abrir: se pinta el aviso y la capa se abre igual.
      var zonaR = $('#zona-juego');
      if (zonaR) zonaR.innerHTML = '<p>Uy, este juego se trabó al abrirse 🙈 Ciérralo con la ✖ de arriba y vuelve a tocar «Abrir».</p>';
    }
    // v3.4.2: el botón «🔁 Jugar otra vez» se decide AQUÍ, en el camino
    // compartido de pintado — ningún juego se lo puede olvidar.
    pintarBotonOtraVez(p);
    // v3.4.3: y AQUÍ MISMO suena el fin de la partida, una sola vez por
    // partida y sesión: melodía de VICTORIA si gané yo; el «cierre»
    // suave y distinto si ganó otro (o nadie). Va coordinado con la
    // celebración visual (pantallaGanador/confeti) que cada juego
    // dispara en su propio render: el sonido acompaña a esa misma
    // pantalla, no la sustituye.
    sonarFinDePartida(p);
  }

  /* ----- v3.4.3: sonido de fin de partida (camino compartido) ----- */
  var finSonado = {}; // partidaId -> true (ya sonó su fin en esta sesión)
  function ganadorDePartida(p) {
    var e = (p && p.estado) || {};
    if (e.ganador) {
      // El ganador puede venir como id de jugador o como marca ('X'/'O'
      // en el gato: la marca mapea a la posición en jugadores).
      if (e.jugadores && e.jugadores.indexOf(e.ganador) !== -1) return e.ganador;
      if (e.ganador === 'X' && e.jugadores) return e.jugadores[0] || null;
      if (e.ganador === 'O' && e.jugadores) return e.jugadores[1] || null;
      return null;
    }
    // Ahorcado en grupo: «ganado» = la palabra se salvó entre todos.
    if (e.ganado === true && e.jugadores && e.jugadores.indexOf(yo.id) !== -1) return yo.id;
    if (e.puntajes) {
      // Sin ganador declarado manda el marcador: el mayor puntaje; en
      // empate arriba, si estoy entre los empatados cuenta como mío.
      var mejor = null, mejorPts = -Infinity, empateConmigo = false;
      Object.keys(e.puntajes).forEach(function (id) {
        var pts = e.puntajes[id] || 0;
        if (pts > mejorPts) { mejorPts = pts; mejor = id; empateConmigo = (id === yo.id); }
        else if (pts === mejorPts && id === yo.id) empateConmigo = true;
      });
      if (mejor !== null && mejorPts > 0) return empateConmigo ? yo.id : mejor;
    }
    return null;
  }
  function sonarFinDePartida(p) {
    if (!p || !p.id || finSonado[p.id]) return;
    if (!partidaTerminada(p)) return;
    finSonado[p.id] = true;
    Fun.sonido(ganadorDePartida(p) === yo.id ? 'victoria' : 'cierre');
  }

  /* ----- v3.4.2: «🔁 Jugar otra vez» al terminar, sin salir de la capa -----
     Pedido del dueño (su captura del 2026-10-31, un Personaje Misterioso
     ya terminado): «No me da la opción de seguir jugando ahí mismo luego
     de terminar esa partida». Al llegar una partida a su FIN, la MISMA
     capa muestra bajo el tablero un botón grande «🔁 Jugar otra vez»;
     al tocarlo se crea al instante otra partida del MISMO tipo (y del
     mismo banco/mazo cuando aplica) reutilizando crearPartida — la
     apertura optimista de la v3.3 — y la capa NUNCA se cierra: pasa a
     mostrar la partida nueva, lista para jugar.
     Semántica que se respeta:
     · La terminada NO se toca: queda en «Partidas abiertas» como hasta
       ahora (activa, con su tabla final), y sus puntos ya se aplicaron
       una sola vez al terminar (la bandera puntosAplicados del estado).
       Repetir NO la cierra, NO la reactiva y NO duplica sus puntos.
     · La nueva nace como partida viva aparte, con su creador como
       primer jugador y la puerta abierta a que los demás se unan desde
       la lista, exactamente igual que si se creara desde su tarjeta.
       (Si los dos finalistas tocan «otra vez» a la vez, cada uno crea
       la suya: la misma conducta que crear desde las categorías.) */
  function partidaTerminada(p) {
    var e = (p && p.estado) || {};
    // Cada juego marca su fin a su manera y hay que aceptarlas todas:
    // la mayoría pone estado.terminado = true; los de preguntas ponen
    // estado.fase = 'final' (la trivia usa SOLO la fase; varios
    // bíblicos marcan las dos cosas a la vez).
    return e.terminado === true || e.fase === 'final';
  }
  function claveCreacionDe(p) {
    // La inversa de crearPartida: de la partida terminada a la clave de
    // creación que la repite TAL CUAL (mismo banco / mismo mazo).
    var e = (p && p.estado) || {};
    if (p.tipo === 'trivia' && e.banco === 'biblica') return { clave: 'trivia-biblica' };
    if (p.tipo === 'memoria' && e.mazo === 'biblia') return { clave: 'memoria-biblica' };
    if (p.tipo === 'memoria' && e.mazo) return { clave: 'memoria-tema', mazo: e.mazo };
    return { clave: p.tipo };
  }
  function jugarOtraVez(p) {
    var datos = claveCreacionDe(p);
    if (datos.mazo) {
      // «Memoria con temas» lee el mazo del selector: se deja elegido el
      // de la partida terminada para que la nueva salga del mismo tema.
      var sel = $('#mazo-memoria');
      if (sel && G.MAZOS_MEMORIA[datos.mazo]) sel.value = datos.mazo;
    }
    crearPartida(datos.clave);
  }
  function pintarBotonOtraVez(p) {
    var zona = $('#zona-otra-vez');
    var btn = $('#btn-otra-vez');
    if (!zona || !btn) return;
    if (partidaTerminada(p)) {
      zona.classList.remove('oculto');
      btn.onclick = function () { jugarOtraVez(p); };
    } else {
      zona.classList.add('oculto');
      btn.onclick = null;
    }
  }

  function avisoTurno(p, esMio) {
    if (esMio && !eraMiTurno[p.id]) Fun.sonido('turno');
    eraMiTurno[p.id] = !!esMio;
  }

  function celebrarSiGane(p, ganeYo, titulo, sub) {
    if (ganeYo && !celebraciones[p.id]) {
      celebraciones[p.id] = true;
      Fun.pantallaGanador(titulo, sub);
    }
  }

  /* ----- Gato ----- */
  function renderGato(p) {
    var e = p.estado;
    var miIdx = e.jugadores.indexOf(yo.id);
    var zona = $('#zona-juego');
    var turnoTxt = e.terminado
      ? (e.empate ? '¡Empate! Nadie se rinde en esta familia 🤝' : '🏆 Ganó ' + escapar(nombreDe(e.jugadores[e.ganador === 'X' ? 0 : 1])))
      : (miIdx === -1 ? 'Estás mirando la partida 👀' : e.turno === miIdx ? '¡Tu turno, ' + (miIdx === 0 ? '❌' : '⭕') + '!' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…');
    avisoTurno(p, !e.terminado && miIdx !== -1 && e.turno === miIdx);
    var ganadora = lineaGanadora(e.tablero);
    var html = '<h3>❌⭕ Gato</h3><p>' +
      e.jugadores.map(function (id, i) { return (i === 0 ? '❌ ' : '⭕ ') + escapar(nombreDe(id)); }).join('  ·  ') +
      '</p><p><strong>' + turnoTxt + '</strong></p><div class="tablero-gato">';
    e.tablero.forEach(function (celda, i) {
      var clase = 'casilla-gato' + (celda === 'X' ? ' x' : celda === 'O' ? ' o' : '') + (ganadora && ganadora.indexOf(i) !== -1 ? ' ganadora' : '');
      html += '<button class="' + clase + '" data-casilla="' + i + '">' + (celda || '') + '</button>';
    });
    html += '</div>';
    zona.innerHTML = html;
    $$('#zona-juego .casilla-gato').forEach(function (b) {
      b.addEventListener('click', function () {
        if (miIdx === -1) return;
        try {
          var nuevo = L.jugadaGato(e, miIdx, Number(b.dataset.casilla));
          if (nuevo.terminado && !e.puntosAplicados) {
            nuevo.puntosAplicados = true;
            guardarEstado(p, nuevo).then(function () { aplicarPuntosDePartida(nuevo); });
          } else guardarEstado(p, nuevo);
        } catch (err) { Fun.sonido('error'); }
      });
    });
    if (e.terminado && e.ganador) {
      celebrarSiGane(p, e.jugadores[e.ganador === 'X' ? 0 : 1] === yo.id, '¡Ganaste al gato! 🎉', 'Las ❌ y ⭕ tiemblan ante ti');
    }
  }

  function lineaGanadora(tablero) {
    var lineas = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (var i = 0; i < lineas.length; i++) {
      var l = lineas[i];
      if (tablero[l[0]] && tablero[l[0]] === tablero[l[1]] && tablero[l[0]] === tablero[l[2]]) return l;
    }
    return null;
  }

  /* ----- Trivia ----- */
  function renderTrivia(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var soyAnfitrion = p.creada_por === yo.id;
    var marcador = '<div class="marcador">' + e.jugadores.map(function (id) {
      return '<span class="chip-presencia"><span class="avatar">' + emojiDe(id) + '</span>' + escapar(nombreDe(id)) + ': <strong>' + (e.puntajes[id] || 0) + '</strong></span>';
    }).join('') + '</div>';
    var html = '<h3>' + (e.banco === 'biblica' ? '📖 Trivia Bíblica' : '🧠 Trivia familiar') + '</h3>' + marcador;

    if (e.fase === 'esperando') {
      html += '<p>El anfitrión reparte las preguntas cuando estén todos. ¡Que se unan!</p>';
      if (soyAnfitrion) html += '<button class="btn-principal" id="trivia-iniciar">🚀 ¡Empezar la trivia!</button>';
      else html += '<p class="subtitulo">Esperando a que ' + escapar(nombreDe(p.creada_por)) + ' dé la salida… 🏁</p>';
    } else if (e.fase === 'pregunta') {
      var preg = L.preguntaActual(e);
      var ya = !!e.respuestas[yo.id];
      html += '<p class="subtitulo">Pregunta ' + (e.preguntaIdx + 1) + ' de ' + e.orden.length + ' · ' + escapar(preg.categoria) + ' · ⏱️ <span id="trivia-seg">' + L.TIEMPO_PREGUNTA_SEG + '</span>s</p>' +
        '<div class="barra-tiempo"><div id="trivia-tiempo" style="width:100%"></div></div>' +
        '<h3>' + escapar(preg.pregunta) + '</h3><div class="opciones-trivia">';
      preg.opciones.forEach(function (op, i) {
        html += '<button class="opcion-trivia" data-op="' + i + '" ' + (ya ? 'disabled' : '') + '>' + escapar(op) + '</button>';
      });
      html += '</div>' + (ya ? '<p>✅ Respuesta guardada. Esperando a los demás…</p>' : '<p class="subtitulo">Responde rápido: ¡la velocidad da puntos extra! ⚡</p>');
    } else if (e.fase === 'revelado') {
      var preg2 = L.preguntaActual(e);
      html += '<h3>' + escapar(preg2.pregunta) + '</h3><div class="opciones-trivia">';
      preg2.opciones.forEach(function (op, i) {
        html += '<button class="opcion-trivia ' + (i === e.correctaRevelada ? 'correcta' : '') + '" disabled>' + escapar(op) + (i === e.correctaRevelada ? ' ✅' : '') + '</button>';
      });
      html += '</div>';
      if (soyAnfitrion) html += '<button class="btn-principal" id="trivia-siguiente" style="margin-top:12px">Siguiente pregunta ➡️</button>';
      else html += '<p class="subtitulo">El anfitrión pasa a la siguiente cuando quiera…</p>';
    } else if (e.fase === 'final') {
      var ranking = L.rankingCampeones(e.puntajes);
      html += '<h3>🏁 ¡Se acabó la trivia!</h3>' + ranking.map(function (r) {
        return '<p>' + r.posicion + '. ' + emojiDe(r.id) + ' <strong>' + escapar(nombreDe(r.id)) + '</strong> — ' + r.puntos + ' pts · ' + r.titulo + '</p>';
      }).join('');
      celebrarSiGane(p, ranking.length && ranking[0].id === yo.id && ranking[0].puntos > 0, '¡Campeón/a de la trivia! 🧠🏆', 'Ese cerebro vale oro');
    }
    zona.innerHTML = html;

    var btnIniciar = $('#trivia-iniciar');
    if (btnIniciar) btnIniciar.addEventListener('click', function () {
      var nuevo = L.iniciarTrivia(e);
      nuevo.preguntaInicio = Date.now();
      guardarEstado(p, nuevo);
    });
    var btnSig = $('#trivia-siguiente');
    if (btnSig) btnSig.addEventListener('click', function () {
      var nuevo = L.siguientePregunta(e);
      nuevo.preguntaInicio = Date.now();
      guardarEstado(p, nuevo);
    });
    $$('#zona-juego .opcion-trivia').forEach(function (b) {
      b.addEventListener('click', function () {
        var restante = Math.max(0, L.TIEMPO_PREGUNTA_SEG - (Date.now() - (e.preguntaInicio || Date.now())) / 1000);
        try {
          var nuevo = L.responderTrivia(e, yo.id, Number(b.dataset.op), restante);
          var preg3 = L.preguntaActual(e);
          if (Number(b.dataset.op) === preg3.correcta) { Fun.sonido('acierto'); Fun.confeti({ cantidad: 35, duracionMs: 1400 }); }
          else Fun.sonido('error');
          guardarEstado(p, nuevo);
        } catch (err) { Fun.sonido('error'); }
      });
    });
  }

  // El reloj de la partida abierta: barras de tiempo y cierres del anfitrión.
  var revelandoVersiculo = -1;
  var revelandoQuiz = {}; // clave partida:preguntaIdx ya revelada por este aparato
  var accionesReloj = {}; // clave -> true (acciones automáticas ya disparadas)
  function accionRelojUnaVez(clave, fn) {
    if (accionesReloj[clave]) return;
    accionesReloj[clave] = true;
    fn();
  }
  function relojDeJuegos() {
    if (!partidaActualId) return;
    var p = partidasPorId[partidaActualId];
    if (!p) return;
    var e = p.estado;
    var soyAnfitrion = p.creada_por === yo.id;

    if (p.tipo === 'trivia' && e.fase === 'pregunta') {
      var restanteT = Math.max(0, L.TIEMPO_PREGUNTA_SEG - (Date.now() - (e.preguntaInicio || Date.now())) / 1000);
      var barraT = document.getElementById('trivia-tiempo');
      if (barraT) barraT.style.width = (restanteT / L.TIEMPO_PREGUNTA_SEG * 100) + '%';
      var segT = document.getElementById('trivia-seg');
      if (segT) segT.textContent = Math.ceil(restanteT);
      if (!soyAnfitrion || revelandoPregunta === e.preguntaIdx) return;
      var todosT = e.jugadores.every(function (id) { return !!e.respuestas[id]; });
      if (todosT || restanteT <= 0) {
        revelandoPregunta = e.preguntaIdx;
        try {
          var nuevoT = L.revelarTrivia(e);
          if (nuevoT.fase === 'final' && !e.puntosAplicados) {
            nuevoT.puntosAplicados = true;
            guardarEstado(p, nuevoT).then(function () { aplicarPuntosDePartida(nuevoT); });
          } else guardarEstado(p, nuevoT);
        } catch (err) { /* otra ventana ya lo reveló */ }
      }
      return;
    }

    if (p.tipo === 'versiculo' && e.fase === 'pregunta') {
      var restanteV = Math.max(0, G.TIEMPO_VERSICULO_SEG - (Date.now() - (e.preguntaInicio || Date.now())) / 1000);
      var barraV = document.getElementById('versiculo-tiempo');
      if (barraV) barraV.style.width = (restanteV / G.TIEMPO_VERSICULO_SEG * 100) + '%';
      var segV = document.getElementById('versiculo-seg');
      if (segV) segV.textContent = Math.ceil(restanteV);
      if (!soyAnfitrion || revelandoVersiculo === e.preguntaIdx) return;
      var todosV = e.jugadores.every(function (id) { return !!e.respuestas[id]; });
      if (todosV || restanteV <= 0) {
        revelandoVersiculo = e.preguntaIdx;
        try {
          var nuevoV = G.revelarVersiculo(e);
          if (nuevoV.fase === 'final' && !e.puntosAplicados) {
            nuevoV.puntosAplicados = true;
            guardarEstado(p, nuevoV).then(function () { aplicarPuntosDePartida(nuevoV); });
          } else guardarEstado(p, nuevoV);
        } catch (err) { /* otra ventana ya lo reveló */ }
      }
      return;
    }

    if (['quien', 'vf', 'encuentra'].indexOf(p.tipo) !== -1 && e.fase === 'pregunta') {
      var restanteQ = Math.max(0, G.TIEMPO_QUIZ_SEG - (Date.now() - (e.preguntaInicio || Date.now())) / 1000);
      var barraQ = document.getElementById('quiz-tiempo');
      if (barraQ) barraQ.style.width = (restanteQ / G.TIEMPO_QUIZ_SEG * 100) + '%';
      var segQ = document.getElementById('quiz-seg');
      if (segQ) segQ.textContent = Math.ceil(restanteQ);
      var claveQ = p.id + ':' + e.preguntaIdx;
      if (!soyAnfitrion || revelandoQuiz[claveQ]) return;
      var todosQ = e.jugadores.every(function (id) { return !!e.respuestas[id]; });
      if (todosQ || restanteQ <= 0) {
        revelandoQuiz[claveQ] = true;
        try {
          var nuevoQ = G.revelarQuiz(e);
          if (nuevoQ.fase === 'final' && !e.puntosAplicados) {
            nuevoQ.puntosAplicados = true;
            guardarEstado(p, nuevoQ).then(function () { aplicarPuntosDePartida(nuevoQ); });
          } else guardarEstado(p, nuevoQ);
        } catch (err) { /* otro aparato ya lo reveló */ }
      }
      return;
    }

    if (!soyAnfitrion) return;
    // Cierres por tiempo de otros juegos (solo el anfitrión mueve el estado).
    if (p.tipo === 'dibujo' && e.fase === 'dibujando' && e.inicioDibujo) {
      var segD = document.getElementById('dibujo-seg');
      var restD = Math.max(0, (e.duracionSeg || 60) - (Date.now() - e.inicioDibujo) / 1000);
      if (segD) segD.textContent = Math.ceil(restD);
      var todosAdivinaron = e.jugadores.filter(function (id) { return id !== G.dibujanteDe(e); })
        .every(function (id) { return !!e.aciertos[id]; });
      if (restD <= 0 || (todosAdivinaron && e.jugadores.length > 1)) {
        accionRelojUnaVez(p.id + ':dibujo:' + e.ronda, function () {
          try { guardarConPuntos(p, e, G.cerrarRondaDibujo(e)); } catch (err) {}
        });
      }
    } else if (p.tipo === 'basta' && e.fase === 'escribiendo' && e.inicioRonda) {
      var segB = document.getElementById('basta-seg');
      var restB = Math.max(0, 60 - (Date.now() - e.inicioRonda) / 1000);
      if (segB) segB.textContent = Math.ceil(restB);
      if (restB <= 0) {
        accionRelojUnaVez(p.id + ':basta:' + e.ronda, function () {
          try { guardarEstado(p, G.cerrarBasta(e, yo.id)); } catch (err) {}
        });
      }
    } else if (p.tipo === 'quef' && e.fase === 'viendo' && e.vistaInicio) {
      if ((Date.now() - e.vistaInicio) / 1000 >= 6) {
        accionRelojUnaVez(p.id + ':quef:' + e.ronda, function () {
          try { guardarEstado(p, G.ocultarQueFalta(e)); } catch (err) {}
        });
      }
    } else if (p.tipo === 'orden' && e.fase === 'viendo' && e.vistaInicio) {
      if ((Date.now() - e.vistaInicio) / 1000 >= 7) {
        accionRelojUnaVez(p.id + ':orden:' + e.ronda, function () {
          try { guardarEstado(p, G.voltearOrden(e)); } catch (err) {}
        });
      }
    } else if (p.tipo === 'numeros' && e.fase === 'viendo' && e.vistaInicio) {
      if ((Date.now() - e.vistaInicio) / 1000 >= 5) {
        accionRelojUnaVez(p.id + ':numeros:' + e.ronda, function () {
          try { guardarEstado(p, G.ocultarNumeros(e)); } catch (err) {}
        });
      }
    }
  }

  /* ----- Memoria ----- */
  function renderMemoria(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var esMiTurno = e.jugadores[e.turno] === yo.id;
    avisoTurno(p, esMiTurno && !e.terminado);
    var html = '<h3>' + (e.mazo === 'biblia' ? '🕊️ Memoria Bíblica' : '🃏 Memoria de parejas') + '</h3><div class="marcador">' + e.jugadores.map(function (id, i) {
      return '<span class="chip-presencia"><span class="avatar">' + emojiDe(id) + '</span>' +
        (i === e.turno && !e.terminado ? '👉 ' : '') + escapar(nombreDe(id)) + ': <strong>' + (e.puntajes[id] || 0) + '</strong> parejas</span>';
    }).join('') + '</div>';
    html += '<p>' + (e.terminado ? '🏁 ¡Se encontraron todas las parejas!' : esMiTurno ? '¡Tu turno! Toca dos cartas 🃏' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…') + '</p>';
    // v3.4.1: las columnas las manda el CONTEO de cartas, no el ancho de
    // pantalla (los mazos de la casa son de 16 cartas → 4×4, cuadrado y
    // completo en el celular). La rejilla usa minmax(0,1fr): ver la nota
    // de la v3.4.1 en styles.css.
    var colsMemoria = e.cartas.length <= 9 ? 3 : e.cartas.length <= 16 ? 4 : e.cartas.length <= 25 ? 5 : 6;
    html += '<div class="tablero-memoria" style="--cols-memoria:' + colsMemoria + '">';
    e.cartas.forEach(function (carta, i) {
      var visible = carta.encontrada || e.volteadas.indexOf(i) !== -1;
      var clase = 'carta-memoria' + (carta.encontrada ? ' encontrada' : visible ? ' volteada' : '');
      var contenido = visible
        ? '<span>' + carta.emoji + (carta.nombre ? '<small class="carta-nombre">' + escapar(carta.nombre) + '</small>' : '') + '</span>'
        : '❓';
      html += '<button class="' + clase + '" data-carta="' + i + '">' + contenido + '</button>';
    });
    html += '</div>';
    zona.innerHTML = html;
    $$('#zona-juego .carta-memoria').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!esMiTurno || e.terminado) { if (!esMiTurno) Fun.sonido('error'); return; }
        try {
          var nuevo = L.voltearMemoria(e, Number(b.dataset.carta));
          var acierto = nuevo.parejasRestantes < e.parejasRestantes;
          if (acierto) Fun.sonido('acierto');
          if (nuevo.terminado && !e.puntosAplicados) {
            nuevo.puntosAplicados = true;
            guardarEstado(p, nuevo).then(function () { aplicarPuntosDePartida(nuevo); });
            return;
          }
          guardarEstado(p, nuevo);
          if (nuevo.pendiente && !resolviendoMemoria[p.id]) {
            resolviendoMemoria[p.id] = true;
            setTimeout(function () {
              resolviendoMemoria[p.id] = false;
              var actual = partidasPorId[p.id];
              if (actual && actual.estado.pendiente) guardarEstado(actual, L.resolverMemoria(actual.estado));
            }, 1300);
          }
        } catch (err) { Fun.sonido('error'); }
      });
    });
    if (e.terminado) {
      var mejor = null, mejorPts = -1;
      Object.keys(e.puntajes).forEach(function (id) { if (e.puntajes[id] > mejorPts) { mejorPts = e.puntajes[id]; mejor = id; } });
      celebrarSiGane(p, mejor === yo.id, '¡Memoria de elefante! 🐘🏆', 'Nadie esconde una pareja de ti');
    }
  }

  /* ============ Ayudantes compartidos de la biblioteca de juegos ============ */
  // Guarda el estado y, si la jugada terminó la partida, aplica los puntos
  // de campeones una sola vez (misma bandera que usan gato/trivia/memoria).
  function guardarConPuntos(p, e, nuevo) {
    if (nuevo && nuevo.terminado && !e.puntosAplicados) {
      nuevo.puntosAplicados = true;
      return guardarEstado(p, nuevo).then(function () { aplicarPuntosDePartida(nuevo); });
    }
    return guardarEstado(p, nuevo);
  }

  function marcadorPuntos(e, sufijo) {
    return '<div class="marcador">' + e.jugadores.map(function (id) {
      return '<span class="chip-presencia"><span class="avatar">' + emojiDe(id) + '</span>' +
        escapar(nombreDe(id)) + ': <strong>' + (e.puntajes[id] || 0) + '</strong>' + (sufijo || '') + '</span>';
    }).join('') + '</div>';
  }

  function rankingFinalHTML(e) {
    var ranking = L.rankingCampeones(e.puntajes || {});
    return ranking.map(function (r) {
      return '<p>' + r.posicion + '. ' + emojiDe(r.id) + ' <strong>' + escapar(nombreDe(r.id)) + '</strong> — ' + r.puntos + ' pts · ' + r.titulo + '</p>';
    }).join('');
  }

  function celebrarPorPuntajes(p, e, titulo, sub) {
    if (!e.terminado) return;
    var ganador = G.ganadorPorPuntajes(e);
    if (ganador) celebrarSiGane(p, ganador === yo.id, titulo, sub);
  }

  function celebrarGanador(p, e, titulo, sub) {
    if (e.terminado && e.ganador) celebrarSiGane(p, e.ganador === yo.id, titulo, sub);
  }

  function tituloJuego(p, e, texto) {
    var dentro = e.jugadores.indexOf(yo.id) !== -1;
    return '<h3>' + texto + '</h3>' + (dentro ? '' : '<p class="subtitulo">Estás mirando la partida 👀</p>');
  }

  /* ----- Conecta 4 ----- */
  function renderConecta(p) {
    var e = p.estado;
    var miIdx = e.jugadores.indexOf(yo.id);
    var zona = $('#zona-juego');
    avisoTurno(p, !e.terminado && miIdx !== -1 && e.turno === miIdx);
    var estadoTxt = e.terminado
      ? (e.empate ? '¡Empate! El tablero se llenó 🤝' : '🏆 ¡Ganó ' + escapar(nombreDe(e.ganador)) + '!')
      : (miIdx === -1 ? '' : e.turno === miIdx ? '¡Tu turno! Toca una flecha ⬇️' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…');
    var html = tituloJuego(p, e, '🔴 Conecta 4') +
      '<p>' + e.jugadores.map(function (id, i) { return G.FICHAS_CONECTA[i] + ' ' + escapar(nombreDe(id)); }).join(' · ') + '</p>' +
      '<p><strong>' + estadoTxt + '</strong></p><div class="conecta-cols">';
    for (var c = 0; c < 7; c++) {
      var llena = e.tablero[c] !== null;
      html += '<button class="btn-suave btn-chico" data-col="' + c + '"' + (e.terminado || miIdx !== e.turno || llena ? ' disabled' : '') + '>⬇️</button>';
    }
    html += '</div><div class="tablero-conecta">';
    e.tablero.forEach(function (celda) {
      html += '<div class="celda-conecta">' + (celda === null ? '' : G.FICHAS_CONECTA[celda]) + '</div>';
    });
    html += '</div>';
    zona.innerHTML = html;
    $$('#zona-juego [data-col]').forEach(function (b) {
      b.addEventListener('click', function () {
        try {
          var nuevo = G.jugadaConecta(e, miIdx, Number(b.dataset.col));
          Fun.sonido('pop');
          guardarConPuntos(p, e, nuevo);
        } catch (err) { Fun.sonido('error'); }
      });
    });
    celebrarGanador(p, e, '¡Conecta 4 campeón! 🔴🏆', 'Cuatro en línea, ¡qué puntería!');
  }

  /* ----- Serpientes y Escaleras ----- */
  function renderSerpientes(p) {
    var e = p.estado;
    var miIdx = e.jugadores.indexOf(yo.id);
    var zona = $('#zona-juego');
    avisoTurno(p, !e.terminado && miIdx !== -1 && e.turno === miIdx);
    var fichasPorCasilla = {};
    e.jugadores.forEach(function (id, i) {
      var pos = e.posiciones[id] || 0;
      if (pos > 0) (fichasPorCasilla[pos] = fichasPorCasilla[pos] || []).push(i);
    });
    var eventoTxt = e.evento === 'serpiente' ? ' 🐍 ¡Ay, una serpiente!' : e.evento === 'escalera' ? ' 🪜 ¡Una escalera, qué suerte!' : '';
    var html = tituloJuego(p, e, '🐍 Serpientes y Escaleras') +
      '<p>' + e.jugadores.map(function (id, i) {
        return ['🔴', '🔵', '🟢'][i] + ' ' + escapar(nombreDe(id)) + ': casilla <strong>' + (e.posiciones[id] || 0) + '</strong>';
      }).join(' · ') + '</p>' +
      '<p><strong>' + (e.terminado ? '🏆 ¡Ganó ' + escapar(nombreDe(e.ganador)) + '!' :
        (e.dado ? '🎲 Salió un ' + e.dado + eventoTxt + ' · ' : '') +
        (miIdx === -1 ? '' : e.turno === miIdx ? '¡Tu turno de tirar!' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…')) + '</strong></p>';
    if (!e.terminado && miIdx === e.turno) html += '<button class="btn-principal" id="serp-tirar">🎲 ¡Tirar el dado!</button>';
    html += '<div class="tablero-serpientes">';
    for (var n = 100; n >= 1; n--) {
      var marca = G.SERPIENTES[n] ? ' 🐍' : G.ESCALERAS[n] ? ' 🪜' : '';
      var fichas = (fichasPorCasilla[n] || []).map(function (i) { return ['🔴', '🔵', '🟢'][i]; }).join('');
      html += '<div class="celda-serp' + (n === 100 ? ' meta' : '') + '"><small>' + n + marca + '</small><span>' + fichas + '</span></div>';
    }
    html += '</div>';
    zona.innerHTML = html;
    var btn = $('#serp-tirar');
    if (btn) btn.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.tirarSerpientes(e, miIdx)); Fun.sonido('turno'); }
      catch (err) { Fun.sonido('error'); }
    });
    celebrarGanador(p, e, '¡Llegaste a la meta! 🐍🏆', 'Ni las serpientes pudieron contigo');
  }

  /* ----- Ahorcado ----- */
  function renderAhorcado(p) {
    var e = p.estado;
    var miIdx = e.jugadores.indexOf(yo.id);
    var zona = $('#zona-juego');
    avisoTurno(p, !e.terminado && miIdx !== -1 && e.turno === miIdx);
    var corazones = '';
    for (var i = 0; i < e.maxFallos; i++) corazones += i < (e.maxFallos - e.fallos) ? '❤️' : '🤍';
    var palabra = e.terminado ? e.palabra.split('').join(' ') : G.palabraVisibleAhorcado(e);
    var html = tituloJuego(p, e, '🔤 Ahorcado') +
      '<p class="subtitulo">Pista: es de la familia «' + escapar(e.pista) + '» · Vidas: ' + corazones + '</p>' +
      '<div class="palabra-ahorcado">' + escapar(palabra) + '</div>' +
      '<p><strong>' + (e.terminado
        ? (e.ganado ? '🎉 ¡La salvaron! La palabra era ' + escapar(e.palabra) : '😢 Se acabaron las vidas… la palabra era ' + escapar(e.palabra))
        : (miIdx === -1 ? '' : e.turno === miIdx ? '¡Tu turno! Elige una letra' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…')) + '</strong></p>' +
      '<div class="teclado-ahorcado">';
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (letra) {
      var usada = e.usadas.indexOf(letra) !== -1;
      var buena = usada && e.palabra.indexOf(letra) !== -1;
      html += '<button class="' + (usada ? (buena ? 'btn-verde' : 'btn-suave') : 'btn-suave') + ' btn-chico" data-letra="' + letra + '"' +
        (usada || e.terminado || miIdx !== e.turno ? ' disabled' : '') + '>' + letra + '</button>';
    });
    html += '</div>';
    zona.innerHTML = html;
    $$('#zona-juego [data-letra]').forEach(function (b) {
      b.addEventListener('click', function () {
        try {
          var nuevo = G.letraAhorcado(e, miIdx, b.dataset.letra);
          Fun.sonido(e.palabra.indexOf(b.dataset.letra) !== -1 ? 'acierto' : 'error');
          guardarConPuntos(p, e, nuevo);
        } catch (err) { Fun.sonido('error'); }
      });
    });
    if (e.terminado && e.ganado) celebrarSiGane(p, e.jugadores.indexOf(yo.id) !== -1, '¡Palabra salvada! 🔤🎉', 'El muñequito respira tranquilo');
  }

  /* ----- Dibujo y Adivina ----- */
  var canalDibujo = null, canalDibujoId = null, trazoEnCurso = null;

  function asegurarCanalDibujo(partidaId) {
    if (canalDibujoId === partidaId && canalDibujo) return;
    if (canalDibujo) { try { supa.removeChannel(canalDibujo); } catch (err) {} }
    canalDibujoId = partidaId;
    canalDibujo = supa.channel('dibujo-' + partidaId, { config: { broadcast: { self: false } } });
    canalDibujo
      .on('broadcast', { event: 'trazo' }, function (msg) { pintarSegmentoRemoto(msg.payload); })
      .on('broadcast', { event: 'limpiar' }, function () {
        var c = document.getElementById('canvas-dibujo');
        if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
      })
      .subscribe();
  }

  function trazarPuntos(ctx, pts, canvas) {
    if (!pts || pts.length < 1) return;
    ctx.strokeStyle = '#3d2c29'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(function (pt, i) {
      var x = pt[0] * canvas.width, y = pt[1] * canvas.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    if (pts.length === 1) ctx.lineTo(pts[0][0] * canvas.width + 0.1, pts[0][1] * canvas.height + 0.1);
    ctx.stroke();
  }

  function pintarSegmentoRemoto(payload) {
    var c = document.getElementById('canvas-dibujo');
    if (!c || !payload || !payload.pts) return;
    trazarPuntos(c.getContext('2d'), payload.pts, c);
  }

  function renderDibujo(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var soyDibujante = G.dibujanteDe(e) === yo.id;
    var html = tituloJuego(p, e, '🎨 Dibujo y Adivina') + marcadorPuntos(e, ' pts') +
      '<p>Ronda ' + e.ronda + ' · Dibuja: ' + emojiDe(G.dibujanteDe(e)) + ' <strong>' + escapar(nombreDe(G.dibujanteDe(e))) + '</strong></p>';
    if (e.fase === 'final') {
      html += '<h3>🏁 ¡Se acabó el dibujo!</h3>' + rankingFinalHTML(e);
    } else if (e.fase === 'elegir') {
      if (soyDibujante) {
        html += '<p><strong>Te toca dibujar 🎨 Elige tu palabra secreta:</strong></p><div class="botones-juego">' +
          e.opciones.map(function (op, i) { return '<button class="btn-principal" data-palabra="' + i + '">' + escapar(op) + '</button>'; }).join('') + '</div>';
      } else {
        html += '<p>' + escapar(nombreDe(G.dibujanteDe(e))) + ' está eligiendo qué dibujar… ✍️</p>';
      }
    } else { // dibujando
      html += '<p>' + (soyDibujante
        ? 'Tu palabra secreta es: <strong class="palabra-secreta">' + escapar(e.palabra) + '</strong> 🤫'
        : 'La palabra tiene ' + (e.palabra || '').length + ' letras… ¿qué será? 🤔') +
        ' · ⏱️ <span id="dibujo-seg">' + (e.duracionSeg || 60) + '</span>s</p>';
      html += '<div class="lienzo-marco"><canvas id="canvas-dibujo" width="640" height="440"></canvas></div>';
      if (soyDibujante) {
        html += '<div class="botones-juego" style="margin-top:10px"><button class="btn-suave" id="dibujo-limpiar">🧽 Borrar todo</button>' +
          '<button class="btn-suave" id="dibujo-cerrar">⏭️ Terminar la ronda</button></div>';
      } else if (!e.aciertos[yo.id]) {
        html += '<form class="chat-enviar" id="form-dibujo"><input type="text" id="dibujo-intento" maxlength="30" placeholder="¿Qué está dibujando? ✏️" autocomplete="off">' +
          '<button type="submit" class="btn-principal">¡Ya sé!</button></form>';
      } else {
        html += '<p>✅ ¡Ya acertaste! A mirar cómo los demás se rompen la cabeza 😄</p>';
      }
      var acertaron = Object.keys(e.aciertos).filter(function (id) { return e.aciertos[id]; });
      if (acertaron.length) html += '<p>Ya acertaron: ' + acertaron.map(function (id) { return emojiDe(id) + ' ' + escapar(nombreDe(id)); }).join(' · ') + ' 🎉</p>';
      if (p.creada_por === yo.id && !soyDibujante) html += '<button class="btn-suave btn-chico" id="dibujo-cerrar">⏭️ Terminar la ronda</button>';
    }
    zona.innerHTML = html;

    $$('#zona-juego [data-palabra]').forEach(function (b) {
      b.addEventListener('click', function () {
        try {
          var nuevo = G.elegirPalabraDibujo(e, e.jugadores.indexOf(yo.id), Number(b.dataset.palabra));
          nuevo.inicioDibujo = Date.now();
          guardarEstado(p, nuevo);
          Fun.sonido('turno');
        } catch (err) { Fun.sonido('error'); }
      });
    });
    var btnCerrar = $('#dibujo-cerrar');
    if (btnCerrar) btnCerrar.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.cerrarRondaDibujo(e)); } catch (err) { Fun.sonido('error'); }
    });
    var form = $('#form-dibujo');
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var texto = $('#dibujo-intento').value;
      try {
        var res = G.intentoDibujo(e, yo.id, texto);
        if (res.acierto) {
          Fun.sonido('acierto'); Fun.confeti({ cantidad: 40, duracionMs: 1400 });
          guardarEstado(p, res.estado);
        } else { Fun.sonido('error'); $('#dibujo-intento').value = ''; $('#dibujo-intento').placeholder = '¡Casi! Esa no era… otra vez 💪'; }
      } catch (err) { Fun.sonido('error'); }
    });

    if (e.fase === 'dibujando') {
      asegurarCanalDibujo(p.id);
      var canvas = document.getElementById('canvas-dibujo');
      if (canvas) {
        var ctx = canvas.getContext('2d');
        (e.trazos || []).forEach(function (trazo) { trazarPuntos(ctx, trazo, canvas); });
        if (soyDibujante) {
          canvas.style.touchAction = 'none';
          var puntoDe = function (ev2) {
            var r = canvas.getBoundingClientRect();
            return [Math.min(1, Math.max(0, (ev2.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev2.clientY - r.top) / r.height))];
          };
          canvas.addEventListener('pointerdown', function (ev2) {
            canvas.setPointerCapture(ev2.pointerId);
            trazoEnCurso = [puntoDe(ev2)];
            trazarPuntos(ctx, trazoEnCurso, canvas);
          });
          canvas.addEventListener('pointermove', function (ev2) {
            if (!trazoEnCurso) return;
            var pt = puntoDe(ev2);
            var prev = trazoEnCurso[trazoEnCurso.length - 1];
            trazoEnCurso.push(pt);
            trazarPuntos(ctx, [prev, pt], canvas);
            if (canalDibujo) canalDibujo.send({ type: 'broadcast', event: 'trazo', payload: { pts: [prev, pt] } });
          });
          var soltar = function () {
            if (!trazoEnCurso || trazoEnCurso.length < 2) { trazoEnCurso = null; return; }
            var trazo = trazoEnCurso; trazoEnCurso = null;
            var actual = partidasPorId[p.id];
            if (!actual || actual.estado.fase !== 'dibujando') return;
            var nuevoE = JSON.parse(JSON.stringify(actual.estado));
            nuevoE.trazos = (nuevoE.trazos || []).concat([trazo]);
            var totalPuntos = nuevoE.trazos.reduce(function (s, t) { return s + t.length; }, 0);
            if (totalPuntos < 5000) guardarEstado(actual, nuevoE); // guardado ligero: si se llena, solo va por broadcast
          };
          canvas.addEventListener('pointerup', soltar);
          canvas.addEventListener('pointercancel', soltar);
          var btnLimpiar = $('#dibujo-limpiar');
          if (btnLimpiar) btnLimpiar.addEventListener('click', function () {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (canalDibujo) canalDibujo.send({ type: 'broadcast', event: 'limpiar', payload: {} });
            var actual = partidasPorId[p.id];
            if (actual) { var nuevoE = JSON.parse(JSON.stringify(actual.estado)); nuevoE.trazos = []; guardarEstado(actual, nuevoE); }
          });
        }
      }
    }
    celebrarPorPuntajes(p, e, '¡Artista de la familia! 🎨🏆', 'Esos dibujos valen oro');
  }

  /* ----- Parchís ----- */
  function renderParchis(p) {
    var e = p.estado;
    var miIdx = e.jugadores.indexOf(yo.id);
    var zona = $('#zona-juego');
    avisoTurno(p, !e.terminado && miIdx !== -1 && e.turno === miIdx);
    var colores = ['🔴', '🔵', '🟢'];
    // Fichas por casilla absoluta
    var porCasilla = {};
    e.jugadores.forEach(function (id, i) {
      (e.fichas[id] || []).forEach(function (prog) {
        if (prog >= 0 && prog < 40) {
          var abs = (i * 10 + prog) % 40;
          (porCasilla[abs] = porCasilla[abs] || []).push(colores[i]);
        }
      });
    });
    var html = tituloJuego(p, e, '🎲 Parchís') +
      e.jugadores.map(function (id, i) {
        var f = (e.fichas[id] || []).map(function (prog) {
          return prog === -1 ? '🏠' : prog === 40 ? '🏁' : '▸' + (prog + 1);
        }).join(' ');
        return '<p>' + colores[i] + ' <strong>' + escapar(nombreDe(id)) + '</strong>: ' + f + '</p>';
      }).join('') +
      '<p><strong>' + (e.terminado ? '🏆 ¡Ganó ' + escapar(nombreDe(e.ganador)) + '!' :
        (e.evento === 'captura' ? '😱 ¡Hubo captura! ' : '') +
        (miIdx === -1 ? '' : e.turno === miIdx
          ? (e.fase === 'dado' ? '¡Tu turno! Tira el dado 🎲' : 'Dado: <strong>' + e.dado + '</strong> · elige qué ficha mover')
          : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…')) + '</strong></p>';
    if (!e.terminado && miIdx === e.turno && e.fase === 'dado') {
      html += '<button class="btn-principal" id="parchis-dado">🎲 Tirar el dado</button>';
    }
    if (!e.terminado && miIdx === e.turno && e.fase === 'mover') {
      html += '<div class="botones-juego">' + G.movimientosParchis(e, miIdx, e.dado).map(function (m) {
        return '<button class="btn-principal" data-ficha="' + m.ficha + '">Mover ficha ' + (m.ficha + 1) +
          (m.desde === -1 ? ' (¡sale de casa!)' : ' (a la ' + (m.destino + 1) + ')') + '</button>';
      }).join('') + '</div>';
    }
    if (e.dado && e.fase === 'mover') html += '<p class="subtitulo">🎲 En el dado hay un ' + e.dado + '</p>';
    html += '<div class="tablero-parchis">';
    for (var n = 0; n < 40; n++) {
      var esSeguro = G.PARCHIS_SEGUROS.indexOf(n) !== -1;
      var esSalida = n % 10 === 0;
      html += '<div class="celda-parchis' + (esSeguro ? ' segura' : '') + (esSalida ? ' salida' : '') + '"><small>' + (n + 1) + (esSeguro ? '⭐' : '') + '</small><span>' + (porCasilla[n] || []).join('') + '</span></div>';
    }
    html += '</div><p class="subtitulo">⭐ = casilla segura (nadie te captura ahí). Con un 5 sales de casa; si caes donde hay un rival fuera de seguro… ¡a su casa! 😱</p>';
    zona.innerHTML = html;
    var btnDado = $('#parchis-dado');
    if (btnDado) btnDado.addEventListener('click', function () {
      try { var nuevo = G.tirarParchis(e, miIdx); Fun.sonido('turno'); guardarEstado(p, nuevo); }
      catch (err) { Fun.sonido('error'); }
    });
    $$('#zona-juego [data-ficha]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { guardarConPuntos(p, e, G.moverParchis(e, miIdx, Number(b.dataset.ficha))); Fun.sonido('pop'); }
        catch (err) { Fun.sonido('error'); }
      });
    });
    celebrarGanador(p, e, '¡Rey/Reina del parchís! 🎲🏆', 'Directo a la meta sin mirar atrás');
  }

  /* ----- Dominó ----- */
  var dominoSeleccion = {}; // partidaId -> índice de ficha elegida en mi mano

  function renderDomino(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    if (e.fase === 'esperando') {
      zona.innerHTML = tituloJuego(p, e, '🁢 Dominó') +
        '<p>Jugadores dentro: ' + e.jugadores.map(function (id) { return emojiDe(id) + ' ' + escapar(nombreDe(id)); }).join(' · ') + '</p>' +
        (e.jugadores.length < 2 ? '<p class="subtitulo">Esperando a que se una alguien más… ¡el dominó es de a dos o tres! 🁢</p>'
          : (p.creada_por === yo.id ? '<button class="btn-principal" id="domino-iniciar">🁢 ¡Repartir las fichas!</button>' : '<p class="subtitulo">El anfitrión reparte cuando quiera…</p>'));
      var bi = $('#domino-iniciar');
      if (bi) bi.addEventListener('click', function () {
        try { guardarEstado(p, G.iniciarDomino(e)); Fun.sonido('turno'); } catch (err) { Fun.sonido('error'); }
      });
      return;
    }
    avisoTurno(p, !e.terminado && miIdx !== -1 && e.turno === miIdx);
    var ext = G.extremosDomino(e);
    var miMano = e.manos[yo.id] || [];
    var puedo = miIdx !== -1 && G.puedeJugarDomino(e, yo.id);
    var sel = dominoSeleccion[p.id];
    var selFicha = (typeof sel === 'number') ? miMano[sel] : null;
    var html = tituloJuego(p, e, '🁢 Dominó') +
      '<p>' + e.jugadores.map(function (id, i) {
        return (i === e.turno && !e.terminado ? '👉 ' : '') + emojiDe(id) + ' ' + escapar(nombreDe(id)) + ': ' + (e.manos[id] || []).length + ' fichas';
      }).join(' · ') + ' · Pozo: ' + e.pozo.length + '</p>' +
      '<p><strong>' + (e.terminado
        ? (e.ganador ? '🏆 ¡Ganó ' + escapar(nombreDe(e.ganador)) + '!' : '🤝 ¡Tranca empatada!')
        : (miIdx === -1 ? '' : e.turno === miIdx ? '¡Tu turno!' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…')) + '</strong></p>' +
      '<div class="mesa-domino">' + (e.mesa.length
        ? e.mesa.map(function (f) { return '<span class="ficha-domino">' + f[0] + '│' + f[1] + '</span>'; }).join('')
        : '<span class="subtitulo">La mesa está vacía: el primero pone la ficha que quiera.</span>') + '</div>';
    if (!e.terminado && miIdx !== -1) {
      html += '<h4>Tu mano (toca una ficha para jugarla)</h4><div class="mano-domino">' +
        miMano.map(function (f, i) {
          return '<button class="ficha-domino-btn' + (sel === i ? ' elegida' : '') + '" data-mano="' + i + '">' + f[0] + '│' + f[1] + '</button>';
        }).join('') + '</div>';
      if (selFicha) {
        var cazaIzq = ext && (selFicha[0] === ext[0] || selFicha[1] === ext[0]);
        var cazaDer = ext && (selFicha[0] === ext[1] || selFicha[1] === ext[1]);
        html += '<div class="botones-juego" style="margin-top:8px">' +
          (!ext ? '<button class="btn-principal" id="domino-poner">🁢 Poner en la mesa</button>' : '') +
          (ext && cazaIzq ? '<button class="btn-principal" id="domino-izq">⬅️ Por la izquierda (' + ext[0] + ')</button>' : '') +
          (ext && cazaDer ? '<button class="btn-principal" id="domino-der">Por la derecha (' + ext[1] + ') ➡️</button>' : '') +
          (ext && !cazaIzq && !cazaDer ? '<span class="subtitulo">Esa ficha no caza en ningún lado 🙈 Elige otra.</span>' : '') +
          '</div>';
      }
      if (miIdx === e.turno && !puedo) {
        html += '<div class="botones-juego" style="margin-top:8px">' +
          (e.pozo.length ? '<button class="btn-suave" id="domino-robar">🎣 Robar del pozo</button>'
                         : '<button class="btn-suave" id="domino-pasar">🙋 Pasar (no tengo)</button>') + '</div>';
      }
    }
    zona.innerHTML = html;
    $$('#zona-juego [data-mano]').forEach(function (b) {
      b.addEventListener('click', function () {
        dominoSeleccion[p.id] = Number(b.dataset.mano);
        renderJuego(p);
      });
    });
    var jugar = function (lado) {
      try {
        var nuevo = G.jugarDomino(e, miIdx, sel, lado);
        delete dominoSeleccion[p.id];
        Fun.sonido('pop');
        guardarConPuntos(p, e, nuevo);
      } catch (err) { Fun.sonido('error'); }
    };
    var bp = $('#domino-poner'); if (bp) bp.addEventListener('click', function () { jugar('derecha'); });
    var bl = $('#domino-izq'); if (bl) bl.addEventListener('click', function () { jugar('izquierda'); });
    var br = $('#domino-der'); if (br) br.addEventListener('click', function () { jugar('derecha'); });
    var bro = $('#domino-robar');
    if (bro) bro.addEventListener('click', function () {
      try { guardarEstado(p, G.robarDomino(e, miIdx)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    var bpa = $('#domino-pasar');
    if (bpa) bpa.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.pasarDomino(e, miIdx)); } catch (err) { Fun.sonido('error'); }
    });
    celebrarGanador(p, e, '¡Mano limpia! 🁢🏆', 'El dominó se rindió ante ti');
  }

  /* ----- Batalla Naval ----- */
  function rejillaNavalHTML(celdas, claseExtra) {
    var html = '<div class="tablero-naval ' + (claseExtra || '') + '">';
    for (var i = 0; i < 64; i++) html += celdas(i);
    return html + '</div>';
  }

  function renderNaval(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var honor = '<p class="subtitulo">🤝 Sistema de honor familiar: los barcos viven en los datos de la partida, así que… ¡prometido no espiar! Solo mirar tu pantalla.</p>';
    if (e.fase === 'esperando') {
      var misBarcos = G.celdasBarco(e.barcos[yo.id] || []);
      zona.innerHTML = tituloJuego(p, e, '🚢 Batalla Naval') + honor +
        '<p>Jugadores: ' + e.jugadores.map(function (id) { return emojiDe(id) + ' ' + escapar(nombreDe(id)); }).join(' · ') + '</p>' +
        '<h4>Tus barcos (así quedaron anclados):</h4>' +
        rejillaNavalHTML(function (i) {
          return '<div class="celda-naval">' + (misBarcos[i] ? '🚢' : '🌊') + '</div>';
        }) +
        '<div class="botones-juego" style="margin-top:10px"><button class="btn-suave" id="naval-recolocar">🔀 Recolocar mis barcos</button>' +
        (e.jugadores.length === 2
          ? (p.creada_por === yo.id ? '<button class="btn-principal" id="naval-iniciar">⚓ ¡A la batalla!</button>' : '<span class="subtitulo">El anfitrión da la salida…</span>')
          : '<span class="subtitulo">Falta el rival: que se una con un toque.</span>') + '</div>';
      var reco = $('#naval-recolocar');
      if (reco) reco.addEventListener('click', function () {
        try { guardarEstado(p, G.recolocarNaval(e, yo.id)); } catch (err) { Fun.sonido('error'); }
      });
      var ini = $('#naval-iniciar');
      if (ini) ini.addEventListener('click', function () {
        try { guardarEstado(p, G.iniciarNaval(e)); Fun.sonido('turno'); } catch (err) { Fun.sonido('error'); }
      });
      return;
    }
    var rival = e.jugadores[1 - miIdx];
    avisoTurno(p, !e.terminado && miIdx !== -1 && e.turno === miIdx);
    var misDisparos = e.disparos[yo.id] || {};
    var barcosRival = G.celdasBarco(e.barcos[rival] || []);
    // barcos hundidos del rival: grupos completos tocados
    var hundidas = {};
    (e.barcos[rival] || []).forEach(function (barco) {
      if (barco.every(function (c) { return misDisparos[c] === 'tocado'; })) {
        barco.forEach(function (c) { hundidas[c] = true; });
      }
    });
    var disparosRival = rival ? (e.disparos[rival] || {}) : {};
    var misBarcos2 = G.celdasBarco(e.barcos[yo.id] || []);
    var ultimo = e.ultimoDisparo
      ? '<p>Último disparo: ' + escapar(nombreDe(e.ultimoDisparo.de)) + ' → ' +
        (e.ultimoDisparo.resultado === 'agua' ? '🌊 ¡agua!' : e.ultimoDisparo.resultado === 'hundido' ? '🔥 ¡tocado y hundido!' : '💥 ¡tocado!') + '</p>' : '';
    var html = tituloJuego(p, e, '🚢 Batalla Naval') + honor + ultimo +
      '<p><strong>' + (e.terminado ? '🏆 ¡Ganó ' + escapar(nombreDe(e.ganador)) + '! Flota a salvo (más o menos 😄)'
        : (miIdx === -1 ? '' : e.turno === miIdx ? '¡Tu turno! Toca una casilla del mar enemigo 🎯' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…')) + '</strong></p>' +
      '<h4>🌊 Mar enemigo (tus disparos)</h4>' +
      rejillaNavalHTML(function (i) {
        var d = misDisparos[i];
        var contenido = d === 'tocado' ? (hundidas[i] ? '🔥' : '💥') : d === 'agua' ? '·' : '';
        return '<button class="celda-naval disparo" data-disparo="' + i + '"' + (e.terminado || miIdx !== e.turno || d ? ' disabled' : '') + '>' + contenido + '</button>';
      }) +
      '<h4 style="margin-top:14px">🚢 Tu flota</h4>' +
      rejillaNavalHTML(function (i) {
        var d = disparosRival[i];
        var contenido = d === 'tocado' ? '💥' : misBarcos2[i] ? '🚢' : d === 'agua' ? '·' : '🌊';
        return '<div class="celda-naval">' + contenido + '</div>';
      });
    zona.innerHTML = html;
    $$('#zona-juego [data-disparo]').forEach(function (b) {
      b.addEventListener('click', function () {
        try {
          var nuevo = G.dispararNaval(e, miIdx, Number(b.dataset.disparo));
          Fun.sonido(nuevo.ultimoDisparo.resultado === 'agua' ? 'error' : 'acierto');
          guardarConPuntos(p, e, nuevo);
        } catch (err) { Fun.sonido('error'); }
      });
    });
    celebrarGanador(p, e, '¡Almirante de la familia! 🚢🏆', 'Hundiste toda la flota rival');
  }

  /* ----- Sopa de Letras ----- */
  var sopaInicio = {}; // partidaId -> primera casilla tocada

  function renderSopa(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var inicio = sopaInicio[p.id];
    var html = tituloJuego(p, e, '🔎 Sopa de Letras') + marcadorPuntos(e, ' palabras') +
      '<p>Palabras a encontrar: ' + e.palabras.map(function (pal) {
        return pal.por ? '✅ <s>' + escapar(pal.palabra) + '</s> (' + escapar(nombreDe(pal.por)) + ')' : '🔎 <strong>' + escapar(pal.palabra) + '</strong>';
      }).join(' · ') + '</p>' +
      '<p class="subtitulo">' + (e.terminado ? '🏁 ¡Sopa terminada!' : 'Toca la primera letra y luego la última de una palabra (en línea recta). ¡Todos buscan a la vez!') + '</p>' +
      '<div class="tablero-sopa">';
    e.rejilla.forEach(function (letra, i) {
      var encontrada = e.palabras.some(function (pal) {
        if (!pal.por) return false;
        var celdas = G.caminoSopa(pal.inicio, pal.fin);
        return celdas && celdas.indexOf(i) !== -1;
      });
      html += '<button class="celda-sopa' + (encontrada ? ' encontrada' : '') + (inicio === i ? ' elegida' : '') + '" data-sopa="' + i + '">' + letra + '</button>';
    });
    html += '</div>';
    zona.innerHTML = html;
    $$('#zona-juego [data-sopa]').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = Number(b.dataset.sopa);
        if (sopaInicio[p.id] == null) { sopaInicio[p.id] = idx; renderJuego(p); return; }
        var desde = sopaInicio[p.id];
        delete sopaInicio[p.id];
        try {
          var nuevo = G.marcarSopa(e, yo.id, desde, idx);
          Fun.sonido('acierto'); Fun.confeti({ cantidad: 30, duracionMs: 1200 });
          guardarConPuntos(p, e, nuevo);
        } catch (err) { Fun.sonido('error'); renderJuego(p); }
      });
    });
    celebrarPorPuntajes(p, e, '¡Ojo de águila! 🔎🏆', 'Ninguna palabra se te escapa');
  }

  /* ----- ¡Basta! ----- */
  function renderBasta(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var mias = e.respuestas[yo.id] || {};
    var html = tituloJuego(p, e, '✋ ¡Basta! (Stop)') + marcadorPuntos(e, ' pts') +
      '<p>Ronda ' + e.ronda + ' de ' + e.rondasTotales + ' · La letra es… <span class="letra-basta">' + e.letra + '</span></p>';
    if (e.fase === 'escribiendo') {
      html += '<p>⏱️ Quedan <span id="basta-seg">60</span>s · Escribe una palabra con <strong>' + e.letra + '</strong> en cada categoría:</p>';
      G.CATEGORIAS_BASTA.forEach(function (cat, i) {
        html += '<label class="campo-basta">' + escapar(cat) +
          '<input type="text" id="basta-in-' + i + '" maxlength="40" value="' + escapar(mias[cat] || '') + '" placeholder="con ' + e.letra + '…"></label>';
      });
      html += '<div class="botones-juego" style="margin-top:10px">' +
        '<button class="btn-principal" id="basta-enviar">📨 Enviar mis respuestas</button>' +
        '<button class="btn-verde" id="basta-cerrar">✋ ¡Basta!</button></div>' +
        '<p class="subtitulo">El primero que termine grita «¡Basta!» y se cierra la ronda. Las respuestas enviadas quedan guardadas aunque no grites tú.</p>';
    } else if (e.fase === 'puntuando') {
      html += '<p><strong>✋ ' + escapar(nombreDe(e.cerradaPor)) + ' gritó ¡Basta!</strong> Ahora, con honestidad familiar 🤝: marca si TUS respuestas valen (existen y empiezan con ' + e.letra + ').</p>';
      html += '<table class="tabla-basta"><tr><th></th>' + G.CATEGORIAS_BASTA.map(function (c) { return '<th>' + escapar(c) + '</th>'; }).join('') + '</tr>';
      e.jugadores.forEach(function (uid) {
        html += '<tr><td>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + '</td>' + G.CATEGORIAS_BASTA.map(function (cat) {
          var texto = (e.respuestas[uid] || {})[cat] || '';
          var marca = (e.marcas[uid] || {})[cat];
          var celda = texto ? escapar(texto) : '<span class="subtitulo">—</span>';
          if (uid === yo.id && texto) {
            celda += ' <button class="btn-chico ' + (marca ? 'btn-verde' : 'btn-suave') + '" data-marca="' + escapar(cat) + '">' + (marca ? '✅ Vale' : '¿Vale?') + '</button>';
          } else if (texto) {
            celda += ' ' + (marca ? '✅' : '·');
          }
          return '<td>' + celda + '</td>';
        }).join('') + '</tr>';
      });
      html += '</table>';
      if (p.creada_por === yo.id) html += '<button class="btn-principal" id="basta-puntuar" style="margin-top:10px">🏁 Sumar los puntos</button>';
      else html += '<p class="subtitulo">El anfitrión suma los puntos cuando todos hayan marcado.</p>';
    } else if (e.fase === 'puntuada') {
      html += '<p>✅ Ronda puntuada: palabra única = 10 · repetida = 5 · vacía o que no vale = 0.</p>' +
        (p.creada_por === yo.id ? '<button class="btn-principal" id="basta-siguiente">➡️ Siguiente ronda (nueva letra)</button>' : '<p class="subtitulo">El anfitrión sigue con la próxima letra…</p>');
    } else if (e.fase === 'final') {
      html += '<h3>🏁 ¡Se acabó el Basta!</h3>' + rankingFinalHTML(e);
    }
    zona.innerHTML = html;

    var enviar = function () {
      var resp = {};
      G.CATEGORIAS_BASTA.forEach(function (cat, i) {
        var inp = document.getElementById('basta-in-' + i);
        resp[cat] = inp ? inp.value : '';
      });
      try { return guardarEstado(p, G.enviarRespuestasBasta(e, yo.id, resp)); } catch (err) { Fun.sonido('error'); return Promise.resolve(); }
    };
    var bEnv = $('#basta-enviar');
    if (bEnv) bEnv.addEventListener('click', function () { enviar().then(function () { Fun.sonido('acierto'); }); });
    var bCer = $('#basta-cerrar');
    if (bCer) bCer.addEventListener('click', function () {
      enviar().then(function () {
        var actual = partidasPorId[p.id];
        try { guardarEstado(actual, G.cerrarBasta(actual.estado, yo.id)); Fun.sonido('turno'); } catch (err) { Fun.sonido('error'); }
      });
    });
    $$('#zona-juego [data-marca]').forEach(function (b) {
      b.addEventListener('click', function () {
        var cat = b.dataset.marca;
        var actual = (e.marcas[yo.id] || {})[cat];
        try { guardarEstado(p, G.marcarBasta(e, yo.id, cat, !actual)); } catch (err) { Fun.sonido('error'); }
      });
    });
    var bPun = $('#basta-puntuar');
    if (bPun) bPun.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.puntuarBasta(e)); Fun.sonido('turno'); } catch (err) { Fun.sonido('error'); }
    });
    var bSig = $('#basta-siguiente');
    if (bSig) bSig.addEventListener('click', function () {
      try {
        var nuevo = G.siguienteBasta(e);
        nuevo.inicioRonda = Date.now();
        guardarEstado(p, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Cerebro veloz! ✋🏆', 'En el Basta nadie te gana');
  }

  /* ----- Simón Dice ----- */
  // v3.4.3: la reproducción se guarda por PARTIDA y con temporizador de
  // seguridad. Antes era una bandera pelada que solo se soltaba en el
  // último paso programado: si ese paso no llegaba (página congelada
  // por el sistema en plena llamada, un error en el paso), los paneles
  // quedaban sordos PARA SIEMPRE y sin dar ninguna señal.
  var simonReproduciendo = null; // partidaId cuya secuencia está sonando
  var simonSeguridad = null;     // temporizador que SIEMPRE la suelta
  function soltarSimon() {
    simonReproduciendo = null;
    if (simonSeguridad) { clearTimeout(simonSeguridad); simonSeguridad = null; }
  }

  function renderSimon(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    if (simonReproduciendo && simonReproduciendo !== p.id) soltarSimon();
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx === e.turno && e.vivos[yo.id];
    avisoTurno(p, esMiTurno);
    var coloresEmoji = { rojo: '🔴', verde: '🟢', azul: '🔵', amarillo: '🟡' };
    var html = tituloJuego(p, e, '🔴 Simón Dice') +
      '<p>' + e.jugadores.map(function (id, i) {
        return (e.vivos[id] ? '' : '👻 ') + emojiDe(id) + ' ' + escapar(nombreDe(id)) + ': ' + (e.puntajes[id] || 0) + ' rondas' + (i === e.turno && !e.terminado ? ' 👈' : '');
      }).join(' · ') + '</p>' +
      '<p><strong>' + (e.terminado ? '🏆 ¡Ganó ' + escapar(nombreDe(e.ganador)) + '!' :
        (esMiTurno ? '¡Tu turno! Escucha la secuencia y repítela 🎵 (' + e.progreso + '/' + e.secuencia.length + ')'
          : miIdx === -1 || !e.vivos[yo.id] ? 'Estás mirando/aprendiendo 👀' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…')) + '</strong></p>' +
      '<button class="btn-suave" id="simon-escuchar">▶️ Escuchar la secuencia (' + e.secuencia.length + ')</button>' +
      '<div class="tablero-simon">';
    G.COLORES_SIMON.forEach(function (color) {
      html += '<button class="boton-simon simon-' + color + '" data-simon="' + color + '">' + coloresEmoji[color] + '</button>';
    });
    html += '</div>' +
      (e.ultimoError ? '<p class="subtitulo">😮 ' + escapar(nombreDe(e.ultimoError)) + ' se equivocó de color y quedó fuera.</p>' : '');
    zona.innerHTML = html;
    var escuchar = $('#simon-escuchar');
    if (escuchar) escuchar.addEventListener('click', function () {
      if (simonReproduciendo) return;
      simonReproduciendo = p.id;
      // Red de seguridad: la reproducción suelta los paneles al
      // cumplirse el tiempo de la secuencia + un margen, pase lo que
      // pase con los pasos individuales.
      if (simonSeguridad) clearTimeout(simonSeguridad);
      simonSeguridad = setTimeout(soltarSimon, e.secuencia.length * 480 + 700);
      e.secuencia.forEach(function (color, i) {
        setTimeout(function () {
          try {
            var pad = document.querySelector('#zona-juego [data-simon="' + color + '"]');
            if (pad) { pad.classList.add('sonando'); setTimeout(function () { pad.classList.remove('sonando'); }, 320); }
            Fun.nota(G.NOTAS_SIMON[color], 0.3, 0);
          } catch (errP) { /* un paso sordo no puede atrapar la partida */ }
          if (i === e.secuencia.length - 1) soltarSimon();
        }, i * 480);
      });
    });
    $$('#zona-juego [data-simon]').forEach(function (b) {
      b.addEventListener('click', function () {
        /* v3.4.3 · LA CAUSA DEL «NO PODEMOS TOCAR LOS COLORES»:
           la jugada se aplicaba sobre el estado `e` DEL ÚLTIMO PINTADO.
           Cada toque tarda un viaje entero en volver (UPDATE + SELECT
           de todas las partidas), y Simón se juega a toques rápidos:
           el segundo toque se juzgaba contra el progreso VIEJO — la
           nota correcta se comparaba con secuencia[0] y el jugador
           quedaba ELIMINADO por «error» (pasó en vivo: «se equivocó
           de color y quedó fuera» sin equivocarse), o el turno ya
           había avanzado y exigirTurno lanzaba y el toque se perdía
           en silencio. Ahora la jugada se aplica sobre el estado MÁS
           FRESCO conocido y se pinta AL INSTANTE (optimista): los
           toques encadenan bien aunque la red vaya lenta, y
           guardarEstado confirma detrás hasta converger. */
        var fresca = partidasPorId[p.id] || p;
        var ef = fresca.estado || e;
        var miIdxF = ef.jugadores.indexOf(yo.id);
        var miTurnoF = !ef.terminado && miIdxF !== -1 && miIdxF === ef.turno && !!ef.vivos[yo.id];
        if (!miTurnoF || simonReproduciendo) { if (!miTurnoF) Fun.sonido('error'); return; }
        b.classList.add('sonando'); // destello inmediato: el toque SÍ entró
        setTimeout(function () { b.classList.remove('sonando'); }, 180);
        Fun.nota(G.NOTAS_SIMON[b.dataset.simon], 0.25, 0);
        try {
          var nuevo = G.presionarSimon(ef, miIdxF, b.dataset.simon);
          partidasPorId[p.id] = Object.assign({}, fresca, { estado: nuevo });
          renderJuego(partidasPorId[p.id]);
          guardarConPuntos(fresca, ef, nuevo);
        }
        catch (err) { Fun.sonido('error'); }
      });
    });
    celebrarGanador(p, e, '¡Memoria de Simón! 🔴🏆', 'Esa secuencia era larguísima');
  }

  /* ----- Cálculo Rápido ----- */
  function renderCalculo(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var op = e.operacion;
    var yaRespondi = !!e.respuestas[yo.id];
    var html = tituloJuego(p, e, '➕ Cálculo Rápido') + marcadorPuntos(e, ' pts') +
      '<p>Ronda ' + e.ronda + ' de ' + e.rondasTotales + ' · El primero en acertar se lleva la ronda ⚡</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Fin del cálculo!</h3>' + rankingFinalHTML(e);
    } else {
      html += '<div class="operacion-grande">' + op.a + ' ' + op.op + ' ' + op.b + ' = ?</div>';
      if (!e.rondaCerrada) {
        html += yaRespondi
          ? '<p>Respuesta enviada… ¡a esperar a los demás! ⏳</p>'
          : '<form class="chat-enviar" id="form-calculo"><input type="number" id="calculo-valor" inputmode="numeric" placeholder="Tu respuesta…"><button type="submit" class="btn-principal">¡Esa es!</button></form>';
      } else {
        html += '<p>La respuesta era <strong>' + op.respuesta + '</strong>. ' +
          (e.ganadorRonda ? '⚡ La ganó ' + escapar(nombreDe(e.ganadorRonda)) : 'Nadie acertó esta 🙈') + '</p>';
        if (p.creada_por === yo.id) html += '<button class="btn-principal" id="calculo-siguiente">➡️ Siguiente operación</button>';
        else html += '<p class="subtitulo">El anfitrión trae la siguiente…</p>';
      }
      var respondieron = Object.keys(e.respuestas).map(function (uid) {
        return emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + (e.rondaCerrada ? (e.respuestas[uid].correcta ? ' ✅' : ' ❌') : ' 💭');
      }).join(' · ');
      if (respondieron) html += '<p class="subtitulo">' + respondieron + '</p>';
    }
    zona.innerHTML = html;
    var form = $('#form-calculo');
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var val = Number($('#calculo-valor').value);
      try {
        var nuevo = G.responderCalculo(e, yo.id, val);
        Fun.sonido(nuevo.ganadorRonda === yo.id ? 'acierto' : 'pop');
        guardarEstado(p, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
    var sig = $('#calculo-siguiente');
    if (sig) sig.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.siguienteCalculo(e)); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Calculadora humana! ➕🏆', 'Sumas, restas y multiplicas volando');
  }

  /* ----- Piedra, Papel o Tijera ----- */
  function renderPPT(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var emojis = { piedra: '🪨', papel: '📄', tijera: '✂️' };
    var html = tituloJuego(p, e, '✊ Piedra, Papel o Tijera') +
      '<p>' + e.jugadores.map(function (id) {
        return emojiDe(id) + ' ' + escapar(nombreDe(id)) + ': <strong>' + (e.marcador[id] || 0) + '</strong> rondas';
      }).join(' · ') + ' · Gana quien llegue a ' + e.rondasParaGanar + ' 🏆</p>';
    if (e.terminado) {
      html += '<p><strong>🏆 ¡Ganó ' + escapar(nombreDe(e.ganador)) + '!</strong></p>';
    } else if (e.fase === 'eligiendo') {
      var ya = !!e.elecciones[yo.id];
      html += '<p><strong>Ronda ' + e.ronda + ':</strong> ' + (ya ? 'Ya elegiste 🤫 A esperar a los demás…' : 'Elige en secreto… ¡sin mirar al lado!') + '</p>' +
        '<div class="botones-juego">' + G.OPCIONES_PPT.map(function (op) {
          return '<button class="btn-principal btn-ppt" data-ppt="' + op + '"' + (ya ? ' disabled' : '') + '>' + emojis[op] + ' ' + op + '</button>';
        }).join('') + '</div>' +
        '<p class="subtitulo">Ya eligieron: ' + e.jugadores.filter(function (id) { return !!e.elecciones[id]; }).map(function (id) { return emojiDe(id) + ' ' + escapar(nombreDe(id)); }).join(' · ') + '</p>';
    } else { // revelado
      var r = e.ultimoResultado || { elecciones: {}, ganadores: [] };
      html += '<p><strong>¡Se revela!</strong></p><p>' + e.jugadores.map(function (id) {
        return emojiDe(id) + ' ' + escapar(nombreDe(id)) + ': ' + emojis[r.elecciones[id]] + ' ' + (r.elecciones[id] || '') +
          (r.ganadores.indexOf(id) !== -1 ? ' ⭐' : '');
      }).join(' · ') + '</p>' +
        '<p>' + (r.ganadores.length ? '⭐ Punto para: ' + r.ganadores.map(function (id) { return escapar(nombreDe(id)); }).join(' y ') : '🤝 Empate: nadie suma') + '</p>';
      if (p.creada_por === yo.id) html += '<button class="btn-principal" id="ppt-siguiente">➡️ Siguiente ronda</button>';
      else html += '<p class="subtitulo">El anfitrión sigue…</p>';
    }
    zona.innerHTML = html;
    $$('#zona-juego [data-ppt]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { guardarConPuntos(p, e, G.elegirPPT(e, yo.id, b.dataset.ppt)); Fun.sonido('pop'); }
        catch (err) { Fun.sonido('error'); }
      });
    });
    var sig = $('#ppt-siguiente');
    if (sig) sig.addEventListener('click', function () {
      try { guardarEstado(p, G.siguientePPT(e)); } catch (err) { Fun.sonido('error'); }
    });
    celebrarGanador(p, e, '¡Manos de campeón! ✊🏆', 'Piedra, papel… ¡y victoria!');
  }

  /* ----- Adivina el Número ----- */
  function renderAdivina(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    avisoTurno(p, e.fase === 'jugando' && miIdx !== -1 && e.turno === miIdx);
    var html = tituloJuego(p, e, '🔢 Adivina el Número') + marcadorPuntos(e, ' pts') +
      '<p>Ronda ' + e.ronda + ' de ' + e.rondasTotales + ' · Pienso un número del 1 al 100… 🤫 Menos intentos = más puntos.</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Se acabó!</h3>' + rankingFinalHTML(e);
    } else if (e.fase === 'ronda-fin') {
      html += '<p>🎉 ' + escapar(nombreDe(e.ganadorRonda)) + ' lo adivinó: ¡era el <strong>' + e.secreto + '</strong>!</p>';
      if (p.creada_por === yo.id) html += '<button class="btn-principal" id="adivina-siguiente">➡️ Siguiente ronda</button>';
      else html += '<p class="subtitulo">El anfitrión piensa otro número…</p>';
    } else {
      if (miIdx === e.turno && miIdx !== -1) {
        html += '<form class="chat-enviar" id="form-adivina"><input type="number" id="adivina-valor" min="1" max="100" inputmode="numeric" placeholder="Tu número…"><button type="submit" class="btn-principal">¡Ese!</button></form>';
      } else {
        html += '<p>Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…</p>';
      }
      if (e.historial.length) {
        html += '<div class="historial-adivina">' + e.historial.slice().reverse().map(function (h) {
          return '<p>' + emojiDe(h.de) + ' ' + escapar(nombreDe(h.de)) + ' dijo <strong>' + h.numero + '</strong> → ' +
            (h.pista === 'exacto' ? '🎯 ¡exacto!' : h.pista === 'mayor' ? '⬆️ el número es MAYOR' : '⬇️ el número es MENOR') + '</p>';
        }).join('') + '</div>';
      }
    }
    zona.innerHTML = html;
    var form = $('#form-adivina');
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      try {
        var nuevo = G.adivinarNumero(e, miIdx, Number($('#adivina-valor').value));
        Fun.sonido(nuevo.fase === 'ronda-fin' ? 'acierto' : 'pop');
        guardarEstado(p, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
    var sig = $('#adivina-siguiente');
    if (sig) sig.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.siguienteAdivina(e)); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Números claritos! 🔢🏆', 'Casi lees la mente');
  }

  /* ----- Completa el Versículo ----- */
  function renderVersiculo(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var soyAnfitrion = p.creada_por === yo.id;
    var html = '<h3>✍️ Completa el Versículo</h3>' + marcadorPuntos(e, ' pts');
    if (e.fase === 'esperando') {
      html += '<p>El anfitrión presenta los versículos cuando estén todos. ¡A completar la palabra que falta!</p>';
      if (soyAnfitrion) html += '<button class="btn-principal" id="versiculo-iniciar">🚀 ¡Empezar!</button>';
      else html += '<p class="subtitulo">Esperando la salida del anfitrión… 🏁</p>';
    } else if (e.fase === 'pregunta') {
      var v = G.versiculoActual(e);
      var ya = !!e.respuestas[yo.id];
      html += '<p class="subtitulo">Versículo ' + (e.preguntaIdx + 1) + ' de ' + e.orden.length + ' · ⏱️ <span id="versiculo-seg">' + G.TIEMPO_VERSICULO_SEG + '</span>s</p>' +
        '<div class="barra-tiempo"><div id="versiculo-tiempo" style="width:100%"></div></div>' +
        '<p class="versiculo-texto">«' + escapar(v.texto) + '»</p><p class="versiculo-cita">— ' + escapar(v.cita) + '</p><div class="opciones-trivia">';
      v.opciones.forEach(function (op, i) {
        html += '<button class="opcion-trivia" data-vop="' + i + '" ' + (ya ? 'disabled' : '') + '>' + escapar(op) + '</button>';
      });
      html += '</div>' + (ya ? '<p>✅ ¡Guardado! Esperando a los demás…</p>' : '<p class="subtitulo">¿Qué palabra falta? Responde rápido y ganas más ⚡</p>');
    } else if (e.fase === 'revelado') {
      var v2 = G.versiculoActual(e);
      html += '<p class="versiculo-texto">«' + escapar(v2.texto.replace('___', v2.opciones[v2.correcta])) + '»</p><p class="versiculo-cita">— ' + escapar(v2.cita) + '</p><div class="opciones-trivia">';
      v2.opciones.forEach(function (op, i) {
        html += '<button class="opcion-trivia ' + (i === e.correctaRevelada ? 'correcta' : '') + '" disabled>' + escapar(op) + (i === e.correctaRevelada ? ' ✅' : '') + '</button>';
      });
      html += '</div>';
      if (soyAnfitrion) html += '<button class="btn-principal" id="versiculo-siguiente" style="margin-top:12px">Siguiente versículo ➡️</button>';
      else html += '<p class="subtitulo">El anfitrión sigue cuando quiera…</p>';
    } else if (e.fase === 'final') {
      html += '<h3>🏁 ¡Se acabaron los versículos!</h3>' + rankingFinalHTML(e);
    }
    zona.innerHTML = html;
    var bi = $('#versiculo-iniciar');
    if (bi) bi.addEventListener('click', function () {
      var nuevo = G.iniciarVersiculo(e);
      nuevo.preguntaInicio = Date.now();
      guardarEstado(p, nuevo);
    });
    var bs = $('#versiculo-siguiente');
    if (bs) bs.addEventListener('click', function () {
      var nuevo = G.siguienteVersiculo(e);
      nuevo.preguntaInicio = Date.now();
      guardarEstado(p, nuevo);
    });
    $$('#zona-juego [data-vop]').forEach(function (b) {
      b.addEventListener('click', function () {
        var restante = Math.max(0, G.TIEMPO_VERSICULO_SEG - (Date.now() - (e.preguntaInicio || Date.now())) / 1000);
        try {
          var nuevo = G.responderVersiculo(e, yo.id, Number(b.dataset.vop), restante);
          var v3 = G.versiculoActual(e);
          if (Number(b.dataset.vop) === v3.correcta) { Fun.sonido('acierto'); Fun.confeti({ cantidad: 30, duracionMs: 1200 }); }
          else Fun.sonido('error');
          guardarEstado(p, nuevo);
        } catch (err) { Fun.sonido('error'); }
      });
    });
    if (e.fase === 'final') celebrarPorPuntajes(p, e, '¡Versículos al dedillo! ✍️🏆', 'Esa memoria bíblica es de oro');
  }

  /* ----- ¿Qué falta? ----- */
  function renderQueFalta(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var html = tituloJuego(p, e, '🤔 ¿Qué falta?') + marcadorPuntos(e, ' pts') +
      '<p>Ronda ' + e.ronda + ' de ' + e.rondasTotales + ' · Cada ronda hay más cosas que mirar 👀</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Fin del juego!</h3>' + rankingFinalHTML(e);
    } else if (e.fase === 'viendo') {
      html += '<p><strong>¡Memorízalos todos! En unos segundos uno se esconde… 🙈</strong></p><div class="rejilla-objetos">' +
        e.conjunto.map(function (em) { return '<span>' + em + '</span>'; }).join('') + '</div>';
      if (p.creada_por === yo.id) html += '<button class="btn-suave" id="quef-ocultar">🙈 ¡Ocultar ya!</button>';
    } else {
      html += '<p>Esto es lo que quedó… <strong>¿qué falta?</strong></p><div class="rejilla-objetos">' +
        (e.mostrados || []).map(function (em) { return '<span>' + em + '</span>'; }).join('') + '</div>';
      var ya = !!e.respuestas[yo.id];
      html += '<div class="botones-juego">' + e.opciones.map(function (op, i) {
        var mia = ya && e.respuestas[yo.id].opcion === i;
        return '<button class="btn-opcion-objeto' + (mia ? ' elegida' : '') + '" data-quef="' + i + '"' + (ya ? ' disabled' : '') + '>' + op + '</button>';
      }).join('') + '</div>';
      var todos = e.jugadores.every(function (id) { return !!e.respuestas[id]; });
      if (todos) {
        html += '<p>La respuesta era: <strong style="font-size:1.6rem">' + e.falta + '</strong> ' +
          e.jugadores.map(function (id) {
            return emojiDe(id) + ' ' + (e.respuestas[id].correcta ? '✅' : '❌');
          }).join(' · ') + '</p>';
        if (p.creada_por === yo.id) html += '<button class="btn-principal" id="quef-siguiente">➡️ Siguiente ronda</button>';
      } else if (ya) html += '<p>✅ Respuesta guardada. Esperando a los demás…</p>';
    }
    zona.innerHTML = html;
    var oc = $('#quef-ocultar');
    if (oc) oc.addEventListener('click', function () {
      try { guardarEstado(p, G.ocultarQueFalta(e)); } catch (err) { Fun.sonido('error'); }
    });
    $$('#zona-juego [data-quef]').forEach(function (b) {
      b.addEventListener('click', function () {
        try {
          var nuevo = G.responderQueFalta(e, yo.id, Number(b.dataset.quef));
          Fun.sonido(nuevo.respuestas[yo.id].correcta ? 'acierto' : 'error');
          guardarEstado(p, nuevo);
        } catch (err) { Fun.sonido('error'); }
      });
    });
    var sig = $('#quef-siguiente');
    if (sig) sig.addEventListener('click', function () {
      try {
        var nuevo = G.siguienteQueFalta(e);
        if (!nuevo.terminado) nuevo.vistaInicio = Date.now();
        guardarConPuntos(p, e, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Nada se te escapa! 🤔🏆', 'Ojos de detective profesional');
  }

  /* ----- Recuerda el Orden ----- */
  var ordenLocal = {}; // partidaId:ronda -> emojis que voy tocando
  var ordenBotonesLocal = {}; // partidaId:ronda -> orden MEZCLADO de los botones

  // v3.4.3: los botones de respuesta se mezclan UNA vez por ronda y ese
  // orden queda fijo mientras respondo (cada toque repinta la pantalla:
  // sin esta memoria los botones saltarían de sitio a cada toque). Se
  // cuida además que el orden mezclado nunca coincida con la fila
  // verdadera — antes los botones salían EN el orden de la fila y la
  // respuesta se leía de izquierda a derecha sin memorizar nada.
  function botonesOrdenDe(clave, fila) {
    var guardado = ordenBotonesLocal[clave];
    if (!guardado || guardado.length !== fila.length) {
      guardado = fila.slice();
      for (var i = guardado.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = guardado[i]; guardado[i] = guardado[j]; guardado[j] = t;
      }
      if (guardado.length > 1 && guardado.join('') === fila.join('')) {
        var t2 = guardado[0]; guardado[0] = guardado[1]; guardado[1] = t2;
      }
      ordenBotonesLocal[clave] = guardado;
    }
    return guardado;
  }

  function renderOrden(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var clave = p.id + ':' + e.ronda;
    var tocados = ordenLocal[clave] || [];
    var ya = !!e.respuestas[yo.id];
    var html = tituloJuego(p, e, '🔢 Recuerda el Orden') + marcadorPuntos(e, ' pts') +
      '<p>Ronda ' + e.ronda + ' de ' + e.rondasTotales + ' · 5 puntos por posición correcta y ¡10 extra si aciertas la fila entera!</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Fin del juego!</h3>' + rankingFinalHTML(e);
    } else if (e.fase === 'viendo') {
      html += '<p><strong>¡Memoriza el orden! La fila se voltea en unos segundos… 👀</strong></p><div class="rejilla-objetos fila-orden">' +
        e.fila.map(function (em) { return '<span>' + em + '</span>'; }).join('') + '</div>';
      if (p.creada_por === yo.id) html += '<button class="btn-suave" id="orden-voltear">🙈 ¡Voltear ya!</button>';
    } else {
      // v3.4.3: en la fase de respuesta la fila objetivo va TAPADA
      // (❓): sus iconos solo se ven en la fase de memorizar («viendo»)
      // y al revelarse el resultado de la ronda (cuando todos
      // respondieron, abajo). Lo que se ve abierto aquí es MI avance
      // (lo que yo voy tocando), en su propia fila.
      html += '<p>La fila era un misterio… <strong>repítela tocando en orden:</strong></p>' +
        '<div class="rejilla-objetos fila-orden fila-tapada">' +
        e.fila.map(function () { return '<span>❓</span>'; }).join('') + '</div>' +
        '<div class="rejilla-objetos fila-orden">' + (tocados.length
          ? tocados.map(function (em) { return '<span>' + em + '</span>'; }).join('')
          : '<span class="subtitulo">Tu fila va apareciendo aquí…</span>') + '</div>';
      if (!ya) {
        html += '<div class="botones-juego">' + botonesOrdenDe(clave, e.fila).map(function (em) {
          return '<button class="btn-opcion-objeto" data-orden="' + em + '">' + em + '</button>';
        }).join('') + '</div>' +
          '<div class="botones-juego" style="margin-top:8px"><button class="btn-suave" id="orden-borrar">↩️ Empezar de nuevo</button>' +
          '<button class="btn-principal" id="orden-enviar">✅ ¡Ese es el orden!</button></div>' +
          '<p class="subtitulo">Te faltan ' + (e.fila.length - tocados.length) + ' por tocar.</p>';
      } else {
        html += '<p>Tu acierto: <strong>' + e.respuestas[yo.id].aciertos + '/' + e.fila.length + '</strong> posiciones (+' + e.respuestas[yo.id].puntos + ' pts) 🎯</p>';
      }
      var todos = e.jugadores.every(function (id) { return !!e.respuestas[id]; });
      if (todos) {
        html += '<p>La fila verdadera era: </p><div class="rejilla-objetos fila-orden">' +
          e.fila.map(function (em) { return '<span>' + em + '</span>'; }).join('') + '</div>';
        if (p.creada_por === yo.id) html += '<button class="btn-principal" id="orden-siguiente">➡️ Siguiente ronda</button>';
      }
    }
    zona.innerHTML = html;
    var vo = $('#orden-voltear');
    if (vo) vo.addEventListener('click', function () {
      try { guardarEstado(p, G.voltearOrden(e)); } catch (err) { Fun.sonido('error'); }
    });
    $$('#zona-juego [data-orden]').forEach(function (b) {
      b.addEventListener('click', function () {
        var lista = ordenLocal[clave] || (ordenLocal[clave] = []);
        if (lista.length >= e.fila.length) { Fun.sonido('error'); return; }
        lista.push(b.dataset.orden);
        Fun.sonido('pop');
        renderJuego(p);
      });
    });
    var bo = $('#orden-borrar');
    if (bo) bo.addEventListener('click', function () { ordenLocal[clave] = []; renderJuego(p); });
    var en = $('#orden-enviar');
    if (en) en.addEventListener('click', function () {
      try {
        var nuevo = G.enviarOrden(e, yo.id, tocados);
        Fun.sonido(nuevo.respuestas[yo.id].aciertos ? 'acierto' : 'error');
        guardarEstado(p, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
    var sig = $('#orden-siguiente');
    if (sig) sig.addEventListener('click', function () {
      try {
        var nuevo = G.siguienteOrden(e);
        if (!nuevo.terminado) nuevo.vistaInicio = Date.now();
        guardarConPuntos(p, e, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Orden perfecto! 🔢🏆', 'Esa memoria es una cámara fotográfica');
  }

  /* ----- Memoria de Números ----- */
  function renderNumeros(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var html = tituloJuego(p, e, '🧮 Memoria de Números') + marcadorPuntos(e, ' pts') +
      '<p>Ronda ' + e.ronda + ' de ' + e.rondasTotales + ' · El número crece cada ronda…</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Fin del juego!</h3>' + rankingFinalHTML(e);
    } else if (e.fase === 'viendo') {
      html += '<p><strong>¡Memorízalo! Desaparece en unos segundos…</strong></p><div class="numero-grande">' + e.numero + '</div>';
      if (p.creada_por === yo.id) html += '<button class="btn-suave" id="numeros-ocultar">🙈 ¡Ocultar ya!</button>';
    } else {
      var ya = !!e.respuestas[yo.id];
      html += ya
        ? '<p>✅ Tu respuesta quedó guardada (' + (e.respuestas[yo.id].correcta ? '¡y era correcta! 🎉' : 'a cruzar los dedos 🤞') + ')</p>'
        : '<form class="chat-enviar" id="form-numeros"><input type="number" id="numeros-valor" inputmode="numeric" placeholder="¿Qué número era?"><button type="submit" class="btn-principal">¡Ese!</button></form>';
      var todos = e.jugadores.every(function (id) { return !!e.respuestas[id]; });
      if (todos) {
        html += '<p>El número era: <strong class="numero-grande-inline">' + e.numero + '</strong> · ' +
          e.jugadores.map(function (id) { return emojiDe(id) + ' ' + (e.respuestas[id].correcta ? '✅' : '❌'); }).join(' · ') + '</p>';
        if (p.creada_por === yo.id) html += '<button class="btn-principal" id="numeros-siguiente">➡️ Siguiente (¡más largo!)</button>';
      }
    }
    zona.innerHTML = html;
    var oc = $('#numeros-ocultar');
    if (oc) oc.addEventListener('click', function () {
      try { guardarEstado(p, G.ocultarNumeros(e)); } catch (err) { Fun.sonido('error'); }
    });
    var form = $('#form-numeros');
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      try {
        var nuevo = G.responderNumeros(e, yo.id, $('#numeros-valor').value);
        Fun.sonido(nuevo.respuestas[yo.id].correcta ? 'acierto' : 'error');
        guardarEstado(p, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
    var sig = $('#numeros-siguiente');
    if (sig) sig.addEventListener('click', function () {
      try {
        var nuevo = G.siguienteNumeros(e);
        if (!nuevo.terminado) nuevo.vistaInicio = Date.now();
        guardarConPuntos(p, e, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Calculadora con patas! 🧮🏆', 'Ni un dígito se te escapa');
  }

  /* ==================== v3: RENDERS DE JUEGOS NUEVOS ==================== */

  /* ----- Damas ----- */
  var damasSeleccion = -1;
  function renderDamas(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    avisoTurno(p, !e.terminado && miIdx !== -1 && e.turno === miIdx);
    var emojis = { r: '🔴', R: '👑', b: '⚪', B: '👑' };
    var destinos = damasSeleccion >= 0 ? G.movimientosDamas(e, damasSeleccion).map(function (m) { return m.hasta; }) : [];
    var turnoTxt = e.terminado
      ? '🏆 ¡Ganó ' + escapar(nombreDe(e.ganador)) + '!'
      : (miIdx === -1 ? '' : e.turno === miIdx ? '¡Tu turno! Toca tu pieza y luego la casilla ✨' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…');
    var html = tituloJuego(p, e, '🔴 Damas') +
      '<p>' + e.jugadores.map(function (id, i) { return (i === 0 ? '🔴 ' : '⚪ ') + escapar(nombreDe(id)); }).join('  ·  ') +
      '</p><p><strong>' + turnoTxt + '</strong></p><div class="tablero-damas">';
    e.tablero.forEach(function (celda, i) {
      var f = Math.floor(i / 8), c = i % 8;
      var clase = 'casilla-damas ' + ((f + c) % 2 === 1 ? 'oscura' : 'clara') + (i === damasSeleccion ? ' sel' : '');
      var extra = destinos.indexOf(i) !== -1 ? ' style="outline:3px solid #51cf66; outline-offset:-3px"' : '';
      html += '<button class="' + clase + '"' + extra + ' data-damas="' + i + '">' + (celda ? emojis[celda] : '') + '</button>';
    });
    html += '</div><p class="subtitulo">Salta sobre la pieza rival para comerla. Al llegar al otro lado, ¡corona! 👑 (reyes sencillos: un paso en cualquier diagonal)</p>';
    zona.innerHTML = html;
    $$('#zona-juego [data-damas]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (e.terminado || miIdx === -1 || e.turno !== miIdx) return;
        var i = Number(b.dataset.damas);
        var pieza = e.tablero[i];
        var esMia = pieza && (miIdx === 0 ? (pieza === 'r' || pieza === 'R') : (pieza === 'b' || pieza === 'B'));
        if (esMia) { damasSeleccion = i; renderDamas(p); return; }
        if (damasSeleccion >= 0) {
          try {
            var nuevo = G.moverDamas(e, miIdx, damasSeleccion, i);
            damasSeleccion = -1;
            Fun.sonido('pop');
            guardarConPuntos(p, e, nuevo);
          } catch (err) { Fun.sonido('error'); }
        }
      });
    });
    celebrarGanador(p, e, '¡Damas de campeón! 🔴🏆', 'Estrategia pura, paso a paso');
  }

  /* ----- Lotería ----- */
  function renderLoteria(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var salidas = e.ordenCantadas.slice(0, e.cantadas);
    var soyAnfitrion = p.creada_por === yo.id;
    var html = tituloJuego(p, e, '🎴 Lotería') +
      '<p class="subtitulo">El anfitrión canta las figuras. Tu cartón se marca solo con 🫘. ¡El primero en llenarlo grita «¡Lotería!» y gana!</p>';
    if (e.cantadas > 0) {
      var ult = G.FIGURAS_LOTERIA[e.ordenCantadas[e.cantadas - 1]];
      html += '<p style="text-align:center;font-size:1.3rem">🎙️ «¡' + escapar(ult.n) + '!» <span style="font-size:2.2rem">' + ult.e + '</span></p>';
    } else html += '<p style="text-align:center">🎙️ Todavía no se canta ninguna…</p>';
    html += '<p class="subtitulo" style="text-align:center">Van ' + e.cantadas + ' de ' + e.ordenCantadas.length + ' figuras</p>';
    if (e.terminado) {
      html += '<p style="text-align:center"><strong>🎉 ¡LOTERÍA! Ganó ' + escapar(nombreDe(e.ganador)) + ' 🎉</strong></p>';
    } else if (soyAnfitrion) {
      html += '<div class="botones-juego" style="justify-content:center"><button class="btn-principal" id="loteria-cantar">🎙️ Cantar la siguiente</button></div>';
    } else html += '<p class="subtitulo" style="text-align:center">El anfitrión está cantando… 👂</p>';
    e.jugadores.forEach(function (uid) {
      var carton = G.cartonDeLoteria(e.semilla, uid);
      var marcadas = carton.filter(function (fi) { return salidas.indexOf(fi) !== -1; }).length;
      html += '<h4>' + (uid === yo.id ? '🫘 Tu cartón' : 'Cartón de ' + escapar(nombreDe(uid))) + ' · ' + marcadas + '/16</h4><div class="carton-loteria">' +
        carton.map(function (fi) {
          return '<div class="celda-loteria' + (salidas.indexOf(fi) !== -1 ? ' marcada' : '') + '">' + G.FIGURAS_LOTERIA[fi].e + '</div>';
        }).join('') + '</div>';
    });
    zona.innerHTML = html;
    var bc = $('#loteria-cantar');
    if (bc) bc.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.cantarLoteria(e)); Fun.sonido('pop'); }
      catch (err) { Fun.sonido('error'); }
    });
    celebrarGanador(p, e, '¡LOTERÍA! 🎴🏆', 'Cartón lleno, qué emoción');
  }

  /* ----- Guerra de Cartas ----- */
  function renderGuerra(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var html = tituloJuego(p, e, '⚔️ Guerra de Cartas') + marcadorPuntos(e, ' rondas') +
      '<p>Ronda ' + Math.min(e.ronda + 1, e.rondasTotales) + ' de ' + e.rondasTotales + ' · Todos sacan carta a la vez: ¡la mayor gana la ronda!</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Fin de la guerra!</h3>' + rankingFinalHTML(e);
    } else if (e.fase === 'esperando') {
      html += '<div class="botones-juego"><button class="btn-principal" id="guerra-revelar">🃏 ¡A revelar cartas!</button></div>';
    } else {
      html += '<div class="botones-juego">' + e.jugadores.map(function (uid) {
        return '<div class="carta-guerra">' + emojiDe(uid) + '<br>' + G.nombreCartaGuerra(e.cartas[uid]) + '<br><small>' + escapar(nombreDe(uid)) + (e.ultimoGanador === uid ? ' ⭐' : '') + '</small></div>';
      }).join('') + '</div>' +
        '<p>' + (e.ultimoGanador ? '⭐ Ronda para ' + escapar(nombreDe(e.ultimoGanador)) : '🤝 ¡Empate en lo alto! Nadie suma') + '</p>' +
        '<button class="btn-principal" id="guerra-siguiente">➡️ Siguiente ronda</button>';
    }
    zona.innerHTML = html;
    var br = $('#guerra-revelar');
    if (br) br.addEventListener('click', function () {
      try { guardarEstado(p, G.revelarGuerra(e)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    var bs = $('#guerra-siguiente');
    if (bs) bs.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.siguienteGuerra(e)); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Guerra ganada! ⚔️🏆', 'La carta mayor manda');
  }

  /* ----- El Tesoro Escondido ----- */
  function renderTesoro(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    avisoTurno(p, !e.terminado && miIdx !== -1 && e.turno === miIdx);
    var probadas = {};
    Object.keys(e.intentos).forEach(function (uid) {
      (e.intentos[uid] || []).forEach(function (c) { probadas[c] = G.pistaTesoro(G.distanciaTesoro(c, e.tesoro)); });
    });
    var html = tituloJuego(p, e, '🗺️ El Tesoro Escondido') +
      '<p>Hay un tesoro 💰 escondido en el mapa. Por turnos, toquen una casilla: 🔥 caliente = cerquita, 🧊 frío = lejos.</p>';
    if (e.terminado) html += '<p><strong>💰 ¡' + escapar(nombreDe(e.ganador)) + ' encontró el tesoro!</strong></p>';
    else if (e.ultimoIntento) html += '<p>' + emojiDe(e.ultimoIntento.de) + ' ' + escapar(nombreDe(e.ultimoIntento.de)) + ' probó una casilla: <strong>' + e.ultimoIntento.pista + '</strong></p>';
    if (!e.terminado) html += '<p><strong>' + (miIdx === e.turno ? '¡Tu turno, a buscar! 🔎' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…') + '</strong></p>';
    html += '<div class="mapa-tesoro">';
    for (var i = 0; i < 36; i++) {
      var esTesoro = e.terminado && i === e.tesoro;
      var marca = esTesoro ? '💰' : (probadas[i] ? probadas[i].split(' ')[0] : '▫️');
      html += '<button class="casilla-tesoro" data-tesoro="' + i + '"' + (e.terminado || probadas[i] || miIdx !== e.turno ? ' disabled' : '') + '>' + marca + '</button>';
    }
    html += '</div>';
    zona.innerHTML = html;
    $$('#zona-juego [data-tesoro]').forEach(function (b) {
      b.addEventListener('click', function () {
        try {
          var nuevo = G.buscarTesoro(e, miIdx, Number(b.dataset.tesoro));
          Fun.sonido(nuevo.terminado ? 'acierto' : 'pop');
          guardarConPuntos(p, e, nuevo);
        } catch (err) { Fun.sonido('error'); }
      });
    });
    celebrarGanador(p, e, '¡Tesoro encontrado! 🗺️🏆', 'Nariz de explorador');
  }

  /* ----- Verdad o Reto familiar ----- */
  function renderVerdad(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '💬 Verdad o Reto familiar') +
      '<p class="subtitulo">Tarjetas suaves y divertidas para toda la familia. Cada tarjeta cumplida vale <strong>10 pts</strong>. Turno ' + (e.jugadas + 1) + ' de ' + e.jugadasTotales + '.</p>' +
      marcadorPuntos(e, ' pts');
    if (e.terminado) {
      html += '<h3>🎉 ¡Lo lograron!</h3><p>Completaron todas las tarjetas. ¡Qué familia tan valiente y divertida! 💛</p>';
    } else if (e.fase === 'eligiendo') {
      html += '<p><strong>' + (esMiTurno ? '¡Tu turno! Elige:' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + ': está eligiendo…') + '</strong></p>';
      if (esMiTurno) html += '<div class="botones-juego"><button class="btn-principal" data-verdad="verdad">💬 Verdad</button><button class="btn-verde" data-verdad="reto">🎲 Reto</button></div>';
    } else {
      html += '<p>' + emojiDe(e.jugadores[e.turno]) + ' ' + escapar(nombreDe(e.jugadores[e.turno])) + ' eligió <strong>' + (e.tarjeta.clase === 'reto' ? '🎲 RETO' : '💬 VERDAD') + '</strong>:</p>' +
        '<p style="font-size:1.25rem;background:#fff3d6;border-radius:12px;padding:14px">' + escapar(e.tarjeta.texto) + '</p>';
      if (esMiTurno) html += '<button class="btn-principal" id="verdad-hecho">✅ ¡Hecho!</button>';
      else html += '<p class="subtitulo">A cumplirla con una sonrisa… 😄</p>';
    }
    zona.innerHTML = html;
    $$('#zona-juego [data-verdad]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { guardarEstado(p, G.elegirTarjetaVerdad(e, miIdx, b.dataset.verdad)); Fun.sonido('pop'); }
        catch (err) { Fun.sonido('error'); }
      });
    });
    var bh = $('#verdad-hecho');
    if (bh) bh.addEventListener('click', function () {
      try {
        var nuevo = G.completarVerdad(e);
        Fun.sonido('acierto');
        if (nuevo.terminado && !celebraciones[p.id]) { celebraciones[p.id] = true; Fun.pantallaGanador('¡Verdad o Reto completo! 💬🏆', 'Familia valiente y divertida'); }
        guardarConPuntos(p, e, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
  }

  /* ----- Carrera de Dados ----- */
  function renderCarrera(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '🎲 Carrera de Dados') +
      '<p>Llega a <strong>' + e.meta + ' puntos</strong>. Tira dos dados y suma… pero si sale un <strong>1</strong>, ¡pierdes lo del turno! Tú decides: ¿plantarte o seguir?</p>' +
      e.jugadores.map(function (uid) {
        var tot = e.totales[uid] || 0;
        return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ': <strong>' + tot + '/' + e.meta + '</strong></p>' +
          '<div class="barra-tiempo"><div style="width:' + Math.min(100, tot / e.meta * 100) + '%"></div></div>';
      }).join('');
    if (e.terminado) {
      html += '<p><strong>🏆 ¡' + escapar(nombreDe(e.ganador)) + ' llegó a la meta!</strong></p>';
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong>' +
        (e.parcial ? ' · En la mano: <strong>' + e.parcial + ' pts</strong> sin guardar' : '') + '</p>';
      if (e.ultimosDados) html += '<p style="font-size:1.6rem;text-align:center">🎲 ' + e.ultimosDados[0] + ' · ' + e.ultimosDados[1] + ' 🎲</p>';
      if (e.ultimoEvento) html += '<p class="subtitulo">' + escapar(e.ultimoEvento) + '</p>';
      if (esMiTurno) html += '<div class="botones-juego"><button class="btn-principal" id="carrera-tirar">🎲 Tirar dados</button>' +
        '<button class="btn-verde" id="carrera-plantar"' + (e.parcial ? '' : ' disabled') + '>🏦 Plantarme y guardar</button></div>';
    }
    zona.innerHTML = html;
    var bt = $('#carrera-tirar');
    if (bt) bt.addEventListener('click', function () {
      try { guardarEstado(p, G.tirarCarrera(e)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    var bp = $('#carrera-plantar');
    if (bp) bp.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.plantarseCarrera(e)); Fun.sonido('acierto'); } catch (err) { Fun.sonido('error'); }
    });
    celebrarGanador(p, e, '¡Carrera ganada! 🎲🏆', 'Supo cuándo plantarse');
  }

  /* ----- v3.6 · 🏃 Obby ¡Salta y Gana! ----- */
  function renderObby(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '🏃 Obby ¡Salta y Gana!') +
      '<p>Un parkour de casillas: tira el dado 🎲 y avanza. Las 🪙 valen puntos, el 🌀 te lanza lejos, la 🌋 te devuelve a tu bandera 🚩. ¡El primero a la meta 🏁 gana!</p>';
    html += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin:8px 0">';
    for (var c = 0; c <= G.OBBY_META; c++) {
      var fondo = c === G.OBBY_META ? '#ffe066' : G.OBBY_LAVA.indexOf(c) !== -1 ? '#ffb3a7' : G.OBBY_TRAMPOLIN[c] ? '#b3e5fc' : (c % 10 === 0 && c > 0) ? '#d3f9d8' : '#fff';
      var dentro = '';
      if (c === G.OBBY_META) dentro = '🏁';
      else if (G.OBBY_LAVA.indexOf(c) !== -1) dentro = '🌋';
      else if (G.OBBY_TRAMPOLIN[c]) dentro = '🌀';
      else if (G.OBBY_MONEDAS[c]) dentro = '🪙';
      else if (c % 10 === 0 && c > 0) dentro = '🚩';
      var fichas = e.jugadores.filter(function (uid) { return (e.posiciones[uid] || 0) === c; })
        .map(function (uid) { return emojiDe(uid); }).join('');
      html += '<div style="background:' + fondo + ';border:2px solid var(--borde);border-radius:8px;min-height:44px;text-align:center;padding:2px">' +
        '<small>' + c + '</small><br>' + (fichas || dentro || '') + '</div>';
    }
    html += '</div>';
    html += e.jugadores.map(function (uid) {
      return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ': casilla <strong>' + (e.posiciones[uid] || 0) + '</strong> · 🪙 <strong>' + (e.monedas[uid] || 0) + '</strong></p>';
    }).join('');
    if (e.dado) html += '<p style="font-size:1.6rem;text-align:center">🎲 ' + e.dado + '</p>';
    if (e.evento) html += '<p class="subtitulo">' + escapar(e.evento) + '</p>';
    if (e.terminado) {
      html += '<p><strong>🏆 ¡' + escapar(nombreDe(e.ganador)) + ' llegó a la meta!</strong></p>' + rankingFinalHTML(e);
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong></p>';
      if (esMiTurno) html += '<div class="botones-juego"><button class="btn-principal" id="obby-tirar">🎲 ¡Saltar!</button></div>';
    }
    zona.innerHTML = html;
    var bo = $('#obby-tirar');
    if (bo) bo.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.tirarObby(e, miIdx)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Obby ganado! 🏃🏆', 'Saltó como un campeón de parkour');
  }

  /* ----- v3.6 · 🏗️ Mi Tycoon ----- */
  function renderTycoon(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '🏗️ Mi Tycoon') +
      '<p><strong>Ronda ' + e.ronda + ' de ' + e.rondasTotales + '</strong> · En tu turno primero <strong>cobras</strong> lo que dan tus negocios y luego puedes construir <strong>uno</strong> nuevo (o ahorrar). Gana el mayor patrimonio: monedas + lo que valen tus negocios.</p>';
    html += e.jugadores.map(function (uid) {
      var eds = ((e.edificios || {})[uid] || []).map(function (id) {
        var def = null;
        G.EDIFICIOS_TYCOON.forEach(function (x) { if (x.id === id) def = x; });
        return def ? def.icono : '🏠';
      }).join(' ');
      return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ': 🪙 <strong>' + ((e.monedas || {})[uid] || 0) + '</strong>' +
        ' · Patrimonio <strong>' + G.patrimonioTycoon(e, uid) + '</strong><br>' + (eds || '<small>Sin negocios todavía</small>') + '</p>';
    }).join('');
    if (e.evento) html += '<p class="subtitulo">' + escapar(e.evento) + '</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Se acabaron las rondas!</h3>' + rankingFinalHTML(e);
    } else if (esMiTurno) {
      var alCobrar = ((e.monedas || {})[yo.id] || 0) + G.ingresoTycoon(e, yo.id);
      html += '<p>Al tocar, cobras <strong>+' + G.ingresoTycoon(e, yo.id) + ' 🪙</strong> (tendrás ' + alCobrar + '). ¿Qué construyes?</p><div class="botones-juego">';
      G.EDIFICIOS_TYCOON.forEach(function (def) {
        html += '<button class="btn-suave" data-edificio="' + def.id + '"' + (alCobrar < def.costo ? ' disabled' : '') + '>' +
          def.icono + ' ' + escapar(def.nombre) + ' · ' + def.costo + ' 🪙 (+' + def.ingreso + '/turno)</button>';
      });
      html += '<button class="btn-verde" data-edificio="">🏦 Solo cobrar y ahorrar</button></div>';
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong>…</p>';
    }
    zona.innerHTML = html;
    $$('#zona-juego [data-edificio]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { guardarConPuntos(p, e, G.jugarTycoon(e, miIdx, b.dataset.edificio || null)); Fun.sonido('acierto'); }
        catch (err) { Fun.sonido('error'); }
      });
    });
    celebrarPorPuntajes(p, e, '¡Tycoon ganado! 🏗️🏆', 'Construyó el imperio más grande');
  }

  /* ----- v3.6 · 🐾 Mascotas Monederas ----- */
  function renderMascotas(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '🐾 Mascotas Monederas') +
      '<p>Explora por turnos: puedes hallar monedas 🪙, una estrella ⭐… ¡o una <strong>mascota nueva</strong> que te ayuda a encontrar más! Quedan <strong>' + (e.jugadasTotales - e.jugadas) + '</strong> exploraciones entre todos.</p>';
    html += e.jugadores.map(function (uid) {
      var ms = ((e.mascotas || {})[uid] || []).map(function (id) { var m = G.mascotaDe(id); return m ? m.icono : '🐾'; }).join(' ');
      return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ': 🪙 <strong>' + ((e.monedas || {})[uid] || 0) + '</strong>' +
        '<br>' + (ms || '<small>Sin mascotas todavía</small>') + '</p>';
    }).join('');
    if (e.ultimoEvento) html += '<p style="font-size:1.15rem;text-align:center">' + escapar(e.ultimoEvento) + '</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Se acabó la exploración!</h3>' + rankingFinalHTML(e);
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong></p>';
      if (esMiTurno) html += '<div class="botones-juego"><button class="btn-principal" id="mascotas-explorar">🧭 ¡Explorar!</button></div>';
    }
    zona.innerHTML = html;
    var bm = $('#mascotas-explorar');
    if (bm) bm.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.explorarMascotas(e, miIdx)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Explorador mayor! 🐾🏆', 'Sus mascotas valen oro');
  }

  /* ----- v3.6 · 🎈 Defiende la Torre (cooperativo) ----- */
  var torreElegida = 'dardos';
  function renderTorre(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '🎈 Defiende la Torre') +
      '<p>¡Trabajo en equipo! Los globos 🎈 quieren cruzar el camino. Coloquen torres por turnos y lancen la oleada cuando estén listos. Si escapan 10 globos, pierden; si aguantan las ' + e.rondasTotales + ' oleadas, ¡gana la familia! 🏆</p>' +
      '<p>❤️ Vidas: <strong>' + e.vidas + '</strong> · 🎈 Oleada <strong>' + e.ronda + ' de ' + e.rondasTotales + '</strong> · Mis monedas: 🪙 <strong>' + ((e.monedas || {})[yo.id] || 0) + '</strong></p>';
    html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:8px 0">';
    for (var c = 0; c < G.TORRE_PISTA; c++) {
      var t = (e.torres || {})[c];
      var def = null;
      if (t) G.TORRES.forEach(function (x) { if (x.id === t.tipo) def = x; });
      html += '<button class="casilla-tesoro" data-casilla="' + c + '"' + (t ? ' disabled' : '') + ' style="min-height:52px">' +
        '<small>' + (c + 1) + '</small><br>' + (def ? def.icono + '<br><small>' + escapar(nombreDe(t.dueno)) + '</small>' : '·') + '</button>';
    }
    html += '</div><p>🏁 Los globos salen por la izquierda y escapan por la derecha.</p>';
    html += marcadorPuntos(e, ' globos reventados');
    if (e.ultimoResumen) html += '<p class="subtitulo">' + escapar(e.ultimoResumen) + '</p>';
    if (e.terminado) {
      html += e.ganado
        ? '<h3>🏆 ¡¡LA FAMILIA DEFENDIÓ LA TORRE!!</h3>'
        : '<h3>🎈 Los globos ganaron esta vez… ¡a intentarlo otra vez! 💪</h3>';
      html += rankingFinalHTML(e);
    } else if (esMiTurno) {
      html += '<p><strong>Tu turno:</strong> elige una torre y luego toca una casilla libre del camino:</p><div class="botones-juego">';
      G.TORRES.forEach(function (def2) {
        var alcanza = ((e.monedas || {})[yo.id] || 0) >= def2.costo;
        html += '<button class="' + (torreElegida === def2.id ? 'btn-principal' : 'btn-suave') + '" data-torre="' + def2.id + '"' + (alcanza ? '' : ' disabled') + '>' +
          def2.icono + ' ' + escapar(def2.nombre) + ' · ' + def2.costo + ' 🪙</button>';
      });
      html += '</div><div class="botones-juego"><button class="btn-suave" id="torre-pasar">⏭️ Pasar</button>' +
        '<button class="btn-verde" id="torre-oleada">🎈 ¡Lanzar oleada ' + e.ronda + '!</button></div>';
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong>…</p>';
    }
    zona.innerHTML = html;
    $$('#zona-juego [data-torre]').forEach(function (b) {
      b.addEventListener('click', function () { torreElegida = b.dataset.torre; renderTorre(p); });
    });
    $$('#zona-juego [data-casilla]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!esMiTurno) { Fun.sonido('error'); return; }
        try { guardarEstado(p, G.colocarTorre(e, miIdx, torreElegida, Number(b.dataset.casilla))); Fun.sonido('acierto'); }
        catch (err) { Fun.sonido('error'); }
      });
    });
    var bpT = $('#torre-pasar');
    if (bpT) bpT.addEventListener('click', function () {
      try { guardarEstado(p, G.pasarTorre(e, miIdx)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    var boT = $('#torre-oleada');
    if (boT) boT.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.lanzarOleada(e, miIdx)); Fun.sonido('turno'); } catch (err) { Fun.sonido('error'); }
    });
    if (e.terminado && e.ganado) celebrarSiGane(p, true, '¡La familia defendió la torre! 🎈🏆', 'Ni un globo de más pasó');
  }

  /* ----- v3.6 · 🕵️ El Impostor ----- */
  // Los puntos se aplican por DELTA en cada ronda: la partida guarda el
  // acumulado entre rondas, así que se resta lo ya contado (puntosBase).
  function guardarImpostor(p, e, nuevo) {
    if (nuevo.terminado && nuevo.fase === 'final' && !e.puntosAplicados) {
      nuevo.puntosAplicados = true;
      var base = e.puntosBase || {};
      var delta = { tipo: 'impostor', jugadores: nuevo.jugadores, terminado: true, puntajes: {} };
      nuevo.jugadores.forEach(function (uid) {
        delta.puntajes[uid] = (nuevo.puntajes[uid] || 0) - (base[uid] || 0);
      });
      return guardarEstado(p, nuevo).then(function () { aplicarPuntosDePartida(delta); });
    }
    return guardarEstado(p, nuevo);
  }

  function renderImpostor(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var yoListo = (e.listos || []).indexOf(yo.id) !== -1;
    var html = tituloJuego(p, e, '🕵️ El Impostor') +
      '<p><strong>Ronda ' + e.ronda + '</strong> · Categoría: <strong>' + escapar(e.categoria) + '</strong> 🎭 Todos conocen la palabra secreta… ¡menos el impostor!</p>' +
      marcadorPuntos(e, ' pts');
    if (e.fase === 'roles') {
      html += '<p>Cada quien mira su rol <strong>en su propio aparato</strong>, en secreto 🤫</p>';
      if (yoListo) {
        html += '<p>✅ Ya viste tu rol. Esperando a los demás (' + (e.listos || []).length + '/' + e.jugadores.length + ')…</p>';
      } else {
        html += '<div class="botones-juego"><button class="btn-principal" id="impostor-ver">👀 Mantén tocado para ver tu rol</button></div>' +
          '<div id="impostor-rol" class="oculto" style="text-align:center;font-size:1.25rem;background:#fff3d6;border-radius:10px;padding:12px;margin:8px 0"></div>' +
          '<div class="botones-juego"><button class="btn-verde" id="impostor-listo">🙈 Ya lo vi, ¡a jugar!</button></div>';
      }
    } else if (e.fase === 'pistas') {
      html += '<p>Por turnos, cada quien escribe <strong>UNA palabra</strong> de pista sobre la palabra secreta. El impostor improvisa… 😏</p>';
      html += e.jugadores.map(function (uid) {
        return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ': ' +
          (e.pistas[uid] ? '«<strong>' + escapar(e.pistas[uid]) + '</strong>»' : '<em>pensando…</em>') + '</p>';
      }).join('');
      if (e.jugadores[e.turnoPista] === yo.id) {
        html += '<div class="botones-juego"><input type="text" id="impostor-pista" maxlength="20" placeholder="Tu pista (una palabra)" autocomplete="off">' +
          '<button class="btn-principal" id="impostor-dar">💬 Dar pista</button></div><p class="subtitulo" id="impostor-error"></p>';
      } else {
        html += '<p>Turno de pista de ' + emojiDe(e.jugadores[e.turnoPista]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turnoPista])) + '</strong>…</p>';
      }
    } else if (e.fase === 'votacion') {
      html += '<p>🗳️ <strong>¡A votar!</strong> ¿Quién es el impostor?</p>';
      html += e.jugadores.map(function (uid) {
        return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ' dijo: «<strong>' + escapar(e.pistas[uid] || '') + '</strong>»</p>';
      }).join('');
      if (e.votos[yo.id]) {
        html += '<p>✅ Ya votaste. Esperando votos (' + Object.keys(e.votos).length + '/' + e.jugadores.length + ')…</p>';
      } else {
        html += '<div class="botones-juego">' + e.jugadores.filter(function (uid) { return uid !== yo.id; }).map(function (uid) {
          return '<button class="btn-suave" data-voto="' + uid + '">🕵️ ' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + '</button>';
        }).join('') + '</div>';
      }
    } else if (e.fase === 'final') {
      html += e.descubierto
        ? '<h3>🎉 ¡Descubrieron al impostor!</h3>'
        : '<h3>😎 ¡El impostor se escapó!</h3>';
      html += '<p>El impostor era ' + emojiDe(e.impostor) + ' <strong>' + escapar(nombreDe(e.impostor)) + '</strong> 🕵️<br>' +
        'La palabra secreta era: <strong>' + escapar(e.palabra) + '</strong> (' + escapar(e.categoria) + ')</p>';
      html += e.jugadores.map(function (uid) {
        return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ' votó por ' + (e.votos[uid] ? escapar(nombreDe(e.votos[uid])) : '—') + '</p>';
      }).join('');
      html += '<div class="botones-juego"><button class="btn-principal" id="impostor-otra">🔁 Otra ronda (sigue el marcador)</button></div>';
    }
    zona.innerHTML = html;
    var bv = $('#impostor-ver');
    if (bv) {
      var rol = G.rolDeImpostor(e, yo.id);
      var cajaRol = $('#impostor-rol');
      var mostrar = function () {
        if (!rol || !cajaRol) return;
        cajaRol.innerHTML = rol.esImpostor
          ? '🕵️ ¡Eres el <strong>IMPOSTOR</strong>!<br><small>Solo sabes la categoría: ' + escapar(rol.categoria) + '. ¡Improvisa tu pista y que no te cacen! 😏</small>'
          : '🤫 Tu palabra secreta es:<br><strong>' + escapar(rol.palabra) + '</strong><br><small>(' + escapar(rol.categoria) + ') Da una pista sin decirla.</small>';
        cajaRol.classList.remove('oculto');
      };
      var esconder = function () { if (cajaRol) cajaRol.classList.add('oculto'); };
      bv.addEventListener('pointerdown', mostrar);
      bv.addEventListener('pointerup', esconder);
      bv.addEventListener('pointerleave', esconder);
      bv.addEventListener('pointercancel', esconder);
    }
    var bl = $('#impostor-listo');
    if (bl) bl.addEventListener('click', function () {
      try { guardarEstado(p, G.marcarRolImpostor(e, yo.id)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    var bd = $('#impostor-dar');
    if (bd) bd.addEventListener('click', function () {
      var inp = $('#impostor-pista');
      try {
        guardarEstado(p, G.darPistaImpostor(e, yo.id, inp ? inp.value : ''));
        Fun.sonido('pop');
      } catch (err) {
        Fun.sonido('error');
        var er = $('#impostor-error');
        if (er) er.textContent = err.message;
      }
    });
    $$('#zona-juego [data-voto]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { guardarImpostor(p, e, G.votarImpostor(e, yo.id, b.dataset.voto)); Fun.sonido('turno'); }
        catch (err) { Fun.sonido('error'); }
      });
    });
    var bot = $('#impostor-otra');
    if (bot) bot.addEventListener('click', function () {
      try {
        var nueva = G.siguienteRondaImpostor(e);
        nueva.puntosBase = Object.assign({}, e.puntajes);
        guardarEstado(p, nueva);
        Fun.sonido('turno');
      } catch (err) { Fun.sonido('error'); }
    });
    if (e.fase === 'final') {
      if (e.descubierto) celebrarSiGane(p, yo.id !== e.impostor, '¡Impostor descubierto! 🕵️🎉', 'La familia lo cazó');
      else celebrarSiGane(p, yo.id === e.impostor, '¡El impostor se escapó! 🕵️💨', 'Nadie lo descubrió');
    }
  }

  /* ----- v3.7 · 🐳 Jonás y la Ballena ----- */
  function renderJonas(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '🐳 Jonás y la Ballena') +
      '<p>Del puerto a <strong>Nínive</strong> por el mar 🌊: la tormenta 🌩️ te atrasa, la ola te empuja, la ballena 🐳 es un atajo ¡y las conchas 🐚 valen puntos!</p>';
    html += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin:8px 0">';
    for (var c = 0; c <= G.JONAS_META; c++) {
      var fondo = c === G.JONAS_META ? '#ffe066' : G.JONAS_TORMENTA.indexOf(c) !== -1 ? '#d0bfff' : '#fff';
      var dentro = '';
      if (c === G.JONAS_META) dentro = '🏁';
      else if (G.JONAS_BALLENA[c]) dentro = '🐳';
      else if (G.JONAS_OLA[c]) dentro = '🌊';
      else if (G.JONAS_TORMENTA.indexOf(c) !== -1) dentro = '🌩️';
      else if (G.JONAS_CONCHAS[c]) dentro = '🐚';
      var fichas = e.jugadores.filter(function (uid) { return (e.posiciones[uid] || 0) === c; })
        .map(function (uid) { return emojiDe(uid); }).join('');
      html += '<div style="background:' + fondo + ';border:2px solid var(--borde);border-radius:8px;min-height:44px;text-align:center;padding:2px">' +
        '<small>' + c + '</small><br>' + (fichas || dentro || '') + '</div>';
    }
    html += '</div>';
    html += e.jugadores.map(function (uid) {
      return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ': casilla <strong>' + (e.posiciones[uid] || 0) + '</strong> · 🐚 <strong>' + (e.conchas[uid] || 0) + '</strong></p>';
    }).join('');
    if (e.dado) html += '<p style="font-size:1.6rem;text-align:center">🎲 ' + e.dado + '</p>';
    if (e.evento) html += '<p class="subtitulo">' + escapar(e.evento) + '</p>';
    if (e.terminado) {
      html += '<p><strong>🏆 ¡' + escapar(nombreDe(e.ganador)) + ' llegó a Nínive!</strong></p>' + rankingFinalHTML(e);
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong></p>';
      if (esMiTurno) html += '<div class="botones-juego"><button class="btn-principal" id="jonas-tirar">🎲 ¡Navegar!</button></div>';
    }
    zona.innerHTML = html;
    var bj = $('#jonas-tirar');
    if (bj) bj.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.tirarJonas(e, miIdx)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Llegó a Nínive! 🐳🏆', 'Ni la ballena lo detuvo');
  }

  /* ----- v3.7 · 🦁 El Arca de Noé ----- */
  function renderArca(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '🦁 El Arca de Noé') +
      '<p>Busquen animales y completen sus <strong>parejas</strong> (+10 pts) antes de que el agua tape el arca. ¡Con ' + G.ARCA_PAREJAS_META + ' parejas el arca queda lista y ganas al instante!</p>' +
      '<p style="font-size:1.2rem">💧 Agua: <strong>' + (e.agua || 0) + ' / ' + G.ARCA_AGUA_MAX + '</strong> · Ronda ' + (e.ronda || 1) + '</p>' +
      '<div class="barra-tiempo"><div style="width:' + Math.min(100, (e.agua || 0) / G.ARCA_AGUA_MAX * 100) + '%;background:#4dabf7"></div></div>';
    html += e.jugadores.map(function (uid) {
      var par = ((e.parejas || {})[uid] || []).map(function (id) { var a = G.animalArca(id); return a ? a.icono + a.icono : ''; }).join(' ');
      var sue = ((e.sueltos || {})[uid] || []).map(function (id) { var a = G.animalArca(id); return a ? a.icono : ''; }).join(' ');
      return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ': <strong>' + ((e.puntajes || {})[uid] || 0) + ' pts</strong><br>' +
        (par || '<small>Sin parejas todavía</small>') + (sue ? '<br><small>Esperando pareja: ' + sue + '</small>' : '') + '</p>';
    }).join('');
    if (e.evento) html += '<p style="font-size:1.15rem;text-align:center">' + escapar(e.evento) + '</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡El arca zarpó!</h3>' + rankingFinalHTML(e);
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong></p>';
      if (esMiTurno) html += '<div class="botones-juego"><button class="btn-principal" id="arca-buscar">🔍 ¡Buscar animales!</button></div>';
    }
    zona.innerHTML = html;
    var ba = $('#arca-buscar');
    if (ba) ba.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.buscarArca(e, miIdx)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡El arca está lista! 🦁🏆', 'Reunió las parejas a tiempo');
  }

  /* ----- v3.7 · 🪨 David y Goliat ----- */
  var goliatPiedra = 'mediana', goliatFuerza = 5;
  function renderGoliat(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var vientoTxt = e.viento > 0 ? '💨 Viento a favor: +' + e.viento : e.viento < 0 ? '💨 Viento en contra: ' + e.viento : '🍃 Sin viento';
    var html = tituloJuego(p, e, '🪨 David y Goliat') +
      '<p>Goliat está a <strong>' + G.GOLIAT_DISTANCIA + ' pasos</strong>. El tiro llega a <strong>6 + tu fuerza</strong>, ajustado por la piedra y el viento. ¡Justo en la frente = 50 pts!</p>' +
      '<p style="font-size:1.3rem;text-align:center"><strong>Tiro ' + Math.min(e.ronda || 1, G.GOLIAT_RONDAS) + ' de ' + G.GOLIAT_RONDAS + '</strong> · ' + vientoTxt + '</p>' +
      marcadorPuntos(e, ' pts');
    if (e.ultimoTiro) {
      html += '<p class="subtitulo">Último tiro de ' + escapar(nombreDe(e.ultimoTiro.jugador)) + ': cayó a ' + e.ultimoTiro.impacto +
        ' pasos (' + (e.ultimoTiro.error === 0 ? '🎯 ¡EN LA FRENTE!' : 'a ' + e.ultimoTiro.error + ' de la frente') + ') → ' + e.ultimoTiro.puntos + ' pts</p>';
    }
    if (e.evento) html += '<p class="subtitulo">' + escapar(e.evento) + '</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Se acabaron los tiros!</h3>' + rankingFinalHTML(e);
    } else if (esMiTurno) {
      html += '<p><strong>Elige tu piedra:</strong></p><div class="botones-juego">';
      G.PIEDRAS_GOLIAT.forEach(function (pd) {
        html += '<button class="' + (goliatPiedra === pd.id ? 'btn-principal' : 'btn-suave') + '" data-piedra="' + pd.id + '">' +
          pd.icono + ' ' + escapar(pd.nombre) + '<br><small>' + escapar(pd.nota) + '</small></button>';
      });
      html += '</div><p><strong>Fuerza: <span id="goliat-fuerza-txt">' + goliatFuerza + '</span> 💪</strong></p>' +
        '<input type="range" id="goliat-fuerza" min="1" max="10" step="1" value="' + goliatFuerza + '" style="width:100%">' +
        '<div class="botones-juego"><button class="btn-principal" id="goliat-lanzar">🪨 ¡Lanzar!</button></div>';
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong>…</p>';
    }
    zona.innerHTML = html;
    $$('#zona-juego [data-piedra]').forEach(function (b) {
      b.addEventListener('click', function () { goliatPiedra = b.dataset.piedra; renderGoliat(p); });
    });
    var desl = $('#goliat-fuerza');
    if (desl) desl.addEventListener('input', function () {
      goliatFuerza = Number(desl.value);
      var t = $('#goliat-fuerza-txt'); if (t) t.textContent = goliatFuerza;
    });
    var bl2 = $('#goliat-lanzar');
    if (bl2) bl2.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.lanzarGoliat(e, miIdx, goliatPiedra, goliatFuerza)); Fun.sonido('pop'); }
      catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Puntería de David! 🪨🏆', 'Goliat no tuvo chance');
  }

  /* ----- v3.7 · 🚀 Carrera Espacial ----- */
  function renderCohete(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '🚀 Carrera Espacial') +
      '<p>¡A la <strong>Luna</strong> 🌕! Tú eliges: propulsor <strong>seguro</strong> (1–3, sin sustos) o <strong>TURBO</strong> (1–8… pero el 1 se sobrecalienta 🔥 y el 8 salta +2). Las ⭐ valen puntos; el 🕳️ te devuelve a tu estación 🚩.</p>';
    html += '<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin:8px 0">';
    for (var c = 0; c <= G.COHETE_META; c++) {
      var fondoC = c === G.COHETE_META ? '#ffe066' : G.COHETE_AGUJERO.indexOf(c) !== -1 ? '#e599f7' : (c % 12 === 0 && c > 0) ? '#d3f9d8' : '#fff';
      var dentroC = '';
      if (c === G.COHETE_META) dentroC = '🌕';
      else if (G.COHETE_AGUJERO.indexOf(c) !== -1) dentroC = '🕳️';
      else if (G.COHETE_RECARGA[c]) dentroC = '⛽';
      else if (G.COHETE_ESTRELLAS[c]) dentroC = '⭐';
      else if (c % 12 === 0 && c > 0) dentroC = '🚩';
      var fichasC = e.jugadores.filter(function (uid) { return (e.posiciones[uid] || 0) === c; })
        .map(function (uid) { return emojiDe(uid); }).join('');
      html += '<div style="background:' + fondoC + ';border:2px solid var(--borde);border-radius:8px;min-height:40px;text-align:center;padding:2px">' +
        '<small>' + c + '</small><br>' + (fichasC || dentroC || '') + '</div>';
    }
    html += '</div>';
    html += e.jugadores.map(function (uid) {
      return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ': casilla <strong>' + (e.posiciones[uid] || 0) + '</strong> · ⭐ <strong>' + (e.estrellas[uid] || 0) + '</strong></p>';
    }).join('');
    if (e.dado) html += '<p style="font-size:1.6rem;text-align:center">🎲 ' + e.dado + (e.ultimoModo === 'turbo' ? ' 🚀' : ' 🛡️') + '</p>';
    if (e.evento) html += '<p class="subtitulo">' + escapar(e.evento) + '</p>';
    if (e.terminado) {
      html += '<p><strong>🏆 ¡' + escapar(nombreDe(e.ganador)) + ' llegó a la Luna!</strong></p>' + rankingFinalHTML(e);
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong></p>';
      if (esMiTurno) html += '<div class="botones-juego"><button class="btn-principal" id="cohete-seguro">🛡️ Seguro (1–3)</button>' +
        '<button class="btn-verde" id="cohete-turbo">🚀 ¡TURBO! (1–8, con riesgo)</button></div>';
    }
    zona.innerHTML = html;
    var bs = $('#cohete-seguro'), bt2 = $('#cohete-turbo');
    if (bs) bs.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.despegarCohete(e, miIdx, 'seguro')); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    if (bt2) bt2.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.despegarCohete(e, miIdx, 'turbo')); Fun.sonido('turno'); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Llegó a la Luna! 🚀🏆', 'Astronauta de la familia');
  }

  /* ----- v3.7 · 🎯 Tiro al Blanco ----- */
  function renderBlanco(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '🎯 Tiro al Blanco') +
      '<p style="font-size:2.2rem;text-align:center">🎯</p>' +
      '<p>Hasta <strong>3 dardos</strong> por turno: centro 50, anillos 25/10/5. Lo sumado queda <strong>sin guardar</strong>: si un dardo sale del blanco, ¡lo pierdes todo! El 3.er acierto seguido paga <strong>doble</strong> 🔥. <strong>Ronda ' + (e.ronda || 1) + ' de ' + G.BLANCO_RONDAS + '</strong></p>' +
      marcadorPuntos(e, ' pts guardados');
    if (esMiTurno || (e.turno === miIdx && !e.terminado)) {
      html += '<p style="font-size:1.2rem;text-align:center">Sin guardar: <strong>' + (e.parcial || 0) + ' pts</strong> · Dardos: <strong>' + (e.dardos || 0) + '/3</strong></p>';
    }
    if (e.ultimoDardo) html += '<p class="subtitulo">Último dardo de ' + escapar(nombreDe(e.ultimoDardo.jugador)) + ': ' + escapar(e.ultimoDardo.anillo) + ' (' + e.ultimoDardo.puntos + ' pts)</p>';
    if (e.evento) html += '<p class="subtitulo">' + escapar(e.evento) + '</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Se acabaron las rondas!</h3>' + rankingFinalHTML(e);
    } else if (esMiTurno) {
      html += '<div class="botones-juego"><button class="btn-principal" id="blanco-lanzar">🎯 ¡Lanzar dardo!</button>' +
        '<button class="btn-verde" id="blanco-plantar"' + ((e.dardos || 0) === 0 ? ' disabled' : '') + '>🏦 Plantarme y guardar</button></div>';
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong>…</p>';
    }
    zona.innerHTML = html;
    var blz = $('#blanco-lanzar');
    if (blz) blz.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.lanzarBlanco(e, miIdx)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    var bpl = $('#blanco-plantar');
    if (bpl) bpl.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.plantarseBlanco(e, miIdx)); Fun.sonido('acierto'); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Tiro al Blanco ganado! 🎯🏆', 'Puntería y nervios de acero');
  }

  /* ----- v3.7 · 🌻 Granja de Monedas ----- */
  function renderGranja(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var clima = G.climaDeGranja(e.clima);
    var climaTxt = {
      sol: 'Tus cultivos crecen +1 al empezar tu turno.',
      lluvia: '¡Tus cultivos crecen el DOBLE al empezar tu turno!',
      tormenta: '¡Cuidado! La tormenta se lleva tu cultivo más viejo.',
      arcoiris: 'Hoy la cosecha paga 15 🪙 en vez de 12.'
    }[clima.id] || '';
    var html = tituloJuego(p, e, '🌻 Granja de Monedas') +
      '<p style="font-size:1.3rem;text-align:center">Clima de hoy: ' + clima.icono + ' <strong>' + escapar(clima.nombre) + '</strong><br><small>' + climaTxt + '</small></p>' +
      '<p><strong>Ronda ' + (e.ronda || 1) + ' de ' + G.GRANJA_RONDAS + '</strong> · Al empezar tu turno tus cultivos sienten el clima, y luego haces <strong>UNA</strong> acción. El cultivo 🌾 dorado (2+ turnos) ya se puede cosechar.</p>';
    html += e.jugadores.map(function (uid) {
      var cultivos = ((e.cultivos || {})[uid] || []).map(function (edad) {
        return edad >= 2 ? '🌾' : edad === 1 ? '🌿' : '🌱';
      }).join(' ');
      return '<p>' + emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ': 🪙 <strong>' + ((e.monedas || {})[uid] || 0) + '</strong>' +
        ' · 🚜 ' + ((e.parcelas || {})[uid] || 1) + ' parcela(s) · Patrimonio <strong>' + G.patrimonioGranja(e, uid) + '</strong><br>' +
        (cultivos || '<small>Sin cultivos</small>') + '</p>';
    }).join('');
    if (e.evento) html += '<p class="subtitulo">' + escapar(e.evento) + '</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Se acabó la temporada!</h3>' + rankingFinalHTML(e);
    } else if (esMiTurno) {
      html += '<div class="botones-juego">' +
        '<button class="btn-principal" data-accion-granja="plantar">🌱 Plantar (5 🪙)</button>' +
        '<button class="btn-verde" data-accion-granja="cosechar">🧺 Cosechar maduros</button>' +
        '<button class="btn-suave" data-accion-granja="parcela">🚜 Parcela nueva (15 🪙)</button>' +
        '<button class="btn-suave" data-accion-granja="pasar">⏭️ Pasar</button></div>' +
        '<p class="subtitulo" id="granja-error"></p>';
    } else {
      html += '<p>Turno de ' + emojiDe(e.jugadores[e.turno]) + ' <strong>' + escapar(nombreDe(e.jugadores[e.turno])) + '</strong>…</p>';
    }
    zona.innerHTML = html;
    $$('#zona-juego [data-accion-granja]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { guardarConPuntos(p, e, G.jugarGranja(e, miIdx, b.dataset.accionGranja)); Fun.sonido('acierto'); }
        catch (err) {
          Fun.sonido('error');
          var er = $('#granja-error');
          if (er) er.textContent = err.message;
        }
      });
    });
    celebrarPorPuntajes(p, e, '¡Granja de Monedas ganada! 🌻🏆', 'El mejor granjero de la familia');
  }

  /* ----- Palabra Encadenada ----- */
  function renderEncadenada(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var miIdx = e.jugadores.indexOf(yo.id);
    var esMiTurno = !e.terminado && miIdx !== -1 && e.turno === miIdx;
    avisoTurno(p, esMiTurno);
    var html = tituloJuego(p, e, '🔤 Palabra Encadenada') + marcadorPuntos(e, ' pts') +
      '<p>La siguiente palabra debe <strong>empezar con la última letra</strong> de la anterior y estar en la lista secreta de palabras. ¡10 puntos por palabra!</p>';
    if (e.terminado) {
      html += '<h3>🏁 ¡Se acabó la cadena!</h3>' + rankingFinalHTML(e);
    } else {
      html += '<p style="text-align:center;font-size:1.5rem">Palabra: <strong>' + escapar(e.palabraActual.toUpperCase()) + '</strong> → empieza con <strong>' + escapar(G.ultimaLetraEncadena(e.palabraActual).toUpperCase()) + '</strong></p>' +
        '<p class="subtitulo">Turno ' + (e.turnoGlobal + 1) + ' de ' + e.turnosTotales + ' · ' + (esMiTurno ? '¡Te toca!' : 'Turno de ' + escapar(nombreDe(e.jugadores[e.turno])) + '…') + '</p>';
      if (e.ultimoError) html += '<p class="aviso">' + escapar(e.ultimoError) + '</p>';
      if (esMiTurno) html += '<form class="chat-enviar" id="form-encadenada"><input type="text" id="encadenada-valor" autocomplete="off" placeholder="Tu palabra…"><button type="submit" class="btn-principal">¡Esa!</button></form>' +
        '<button class="btn-suave btn-chico" id="encadenada-pasar" style="margin-top:8px">⏭️ No sé ninguna: pasar</button>';
      if (e.usadas.length) html += '<p class="subtitulo" style="margin-top:10px">Cadena: ' + e.usadas.map(escapar).join(' → ') + '</p>';
    }
    zona.innerHTML = html;
    var form = $('#form-encadenada');
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      try {
        var nuevo = G.enviarEncadenada(e, miIdx, $('#encadenada-valor').value);
        Fun.sonido(nuevo.ultimoError ? 'error' : 'acierto');
        guardarConPuntos(p, e, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
    var bpasar = $('#encadenada-pasar');
    if (bpasar) bpasar.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.pasarEncadenada(e, miIdx)); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Cadena de campeón! 🔤🏆', 'Las palabras fluyen en esta familia');
  }

  /* ----- Rompecabezas Deslizante (cooperativo) ----- */
  function renderPuzzle(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var dentro = e.jugadores.indexOf(yo.id) !== -1;
    var segs = e.inicioEn ? Math.floor((Date.now() - e.inicioEn) / 1000) : 0;
    var html = tituloJuego(p, e, '🧩 Rompecabezas Deslizante') +
      '<p>¡En equipo! Toca una pieza junto al hueco para moverla. Ordenen los animalitos como la fila de arriba. Movimientos: <strong>' + e.movimientos + '</strong> · ⏱️ ' + segs + ' s</p>' +
      '<p style="text-align:center;font-size:1.3rem">' + G.EMOJIS_PUZZLE.join(' ') + '</p><div class="puzzle-deslizante">';
    e.piezas.forEach(function (pz, i) {
      html += '<button class="pieza-puzzle' + (pz ? '' : ' vacia') + '" data-puzzle="' + i + '"' + (e.terminado || !dentro ? ' disabled' : '') + '>' + pz + '</button>';
    });
    html += '</div>';
    if (e.terminado) html += '<p style="text-align:center"><strong>🎉 ¡Lo lograron en ' + e.movimientos + ' movimientos y ' + segs + ' segundos!</strong></p>';
    zona.innerHTML = html;
    $$('#zona-juego [data-puzzle]').forEach(function (b) {
      b.addEventListener('click', function () {
        try {
          var nuevo = G.moverPuzzle(e, Number(b.dataset.puzzle));
          Fun.sonido(nuevo.terminado ? 'acierto' : 'pop');
          guardarConPuntos(p, e, nuevo);
        } catch (err) { /* pieza que no se mueve: sin ruido */ }
      });
    });
    if (e.terminado && !celebraciones[p.id]) {
      celebraciones[p.id] = true;
      Fun.pantallaGanador('¡Rompecabezas completo! 🧩🏆', 'Trabajo en equipo de verdad');
    }
  }

  /* ----- Quizzes bíblicos (quien / vf / encuentra) ----- */
  var QUIZ_CFG = {
    quien: { titulo: '🗣️ ¿Quién lo Dijo?', premio: '¡Lo dijo clarito! 🗣️🏆' },
    vf: { titulo: '✅ Verdadero o Falso Bíblico', premio: '¡Verdad de campeón! ✅🏆' },
    encuentra: { titulo: '🔍 Encuentra el Versículo', premio: '¡Versículo encontrado! 🔍🏆' }
  };
  function opcionesDeQuiz(e) {
    var item = G.preguntaQuiz(e);
    if (e.tipo === 'vf') return ['✅ ¡Verdadero!', '❌ Falso'];
    return item.opciones;
  }
  function enunciadoDeQuiz(e) {
    var item = G.preguntaQuiz(e);
    if (e.tipo === 'quien') return '<p class="versiculo-texto">«' + escapar(item.frase) + '»</p><p>¿Quién dijo esto?</p>';
    if (e.tipo === 'vf') return '<p class="versiculo-texto">' + escapar(item.afirmacion) + '</p><p>¿Es verdadero o falso?</p>';
    return '<p>¿Cuál es el texto correcto de <strong>' + escapar(item.cita) + '</strong>?</p>';
  }
  function renderQuizBiblico(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var cfg = QUIZ_CFG[e.tipo];
    var soyAnfitrion = p.creada_por === yo.id;
    var html = tituloJuego(p, e, cfg.titulo) + marcadorPuntos(e, ' pts');
    if (e.fase === 'esperando') {
      html += '<p>El anfitrión presenta las preguntas cuando estén todos. ¡A pensar en familia!</p>';
      if (soyAnfitrion) html += '<button class="btn-principal" id="quiz-iniciar">🚀 ¡Empezar!</button>';
      else html += '<p class="subtitulo">Esperando la salida del anfitrión… 🏁</p>';
    } else if (e.fase === 'pregunta') {
      var ya = !!e.respuestas[yo.id];
      html += '<p class="subtitulo">Pregunta ' + (e.preguntaIdx + 1) + ' de ' + e.orden.length + ' · ⏱️ <span id="quiz-seg">' + G.TIEMPO_QUIZ_SEG + '</span>s</p>' +
        '<div class="barra-tiempo"><div id="quiz-tiempo" style="width:100%"></div></div>' + enunciadoDeQuiz(e) + '<div class="opciones-trivia">';
      opcionesDeQuiz(e).forEach(function (op, i) {
        html += '<button class="opcion-trivia" data-qop="' + i + '" ' + (ya ? 'disabled' : '') + '>' + escapar(op) + '</button>';
      });
      html += '</div>' + (ya ? '<p>✅ ¡Guardado! Esperando a los demás…</p>' : '<p class="subtitulo">Responde rápido y ganas más ⚡</p>');
    } else if (e.fase === 'revelado') {
      var item = G.preguntaQuiz(e);
      html += enunciadoDeQuiz(e) + '<div class="opciones-trivia">';
      opcionesDeQuiz(e).forEach(function (op, i) {
        html += '<button class="opcion-trivia ' + (i === e.correctaRevelada ? 'correcta' : '') + '" disabled>' + escapar(op) + (i === e.correctaRevelada ? ' ✅' : '') + '</button>';
      });
      html += '</div>';
      if (e.tipo === 'quien' && item.cita) html += '<p class="versiculo-cita">— ' + escapar(item.cita) + '</p>';
      if (soyAnfitrion) html += '<button class="btn-principal" id="quiz-siguiente" style="margin-top:12px">Siguiente pregunta ➡️</button>';
      else html += '<p class="subtitulo">El anfitrión sigue cuando quiera…</p>';
    } else if (e.fase === 'final') {
      html += '<h3>🏁 ¡Se acabaron las preguntas!</h3>' + rankingFinalHTML(e);
    }
    zona.innerHTML = html;
    var bi = $('#quiz-iniciar');
    if (bi) bi.addEventListener('click', function () {
      var nuevo = G.iniciarQuiz(e);
      nuevo.preguntaInicio = Date.now();
      guardarEstado(p, nuevo);
    });
    var bs2 = $('#quiz-siguiente');
    if (bs2) bs2.addEventListener('click', function () {
      var nuevo = G.siguienteQuiz(e);
      nuevo.preguntaInicio = Date.now();
      guardarEstado(p, nuevo);
    });
    $$('#zona-juego [data-qop]').forEach(function (b) {
      b.addEventListener('click', function () {
        var restante = Math.max(0, G.TIEMPO_QUIZ_SEG - (Date.now() - (e.preguntaInicio || Date.now())) / 1000);
        try {
          var nuevo = G.responderQuiz(e, yo.id, Number(b.dataset.qop), restante);
          var eraCorrecta = Number(b.dataset.qop) === (e.tipo === 'vf' ? (G.preguntaQuiz(e).verdad ? 0 : 1) : G.preguntaQuiz(e).correcta);
          if (eraCorrecta) { Fun.sonido('acierto'); Fun.confeti({ cantidad: 30, duracionMs: 1200 }); }
          else Fun.sonido('error');
          guardarEstado(p, nuevo);
        } catch (err) { Fun.sonido('error'); }
      });
    });
    if (e.fase === 'final') celebrarPorPuntajes(p, e, cfg.premio, 'Esa memoria bíblica es de oro');
  }

  /* ----- Ordena la Historia ----- */
  function renderOrdena(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var datos = G.EVENTOS_ORDENA[e.historiaIdx];
    var dentro = e.jugadores.indexOf(yo.id) !== -1;
    var entregue = !!e.entregados[yo.id];
    var html = tituloJuego(p, e, '📜 Ordena la Historia') + marcadorPuntos(e, ' pts') +
      '<p>Historia: <strong>' + escapar(datos.historia) + '</strong>. ' +
      (e.fase === 'final' ? 'Este es el orden correcto:' : 'Pon los 5 momentos en el orden en que pasaron (20 pts por cada uno en su sitio). ¡Solo tú ves tu orden hasta entregar!') + '</p>';
    var arreglo = e.fase === 'final' ? [0, 1, 2, 3, 4] : G.arregloDeOrdena(e, yo.id);
    html += '<div class="ordenable">' + arreglo.map(function (evIdx, pos) {
      var bien = e.fase === 'final' || (entregue && evIdx === pos);
      return '<div class="orden-item"><strong>' + (pos + 1) + '.</strong><span class="crece">' + escapar(datos.eventos[evIdx]) + (bien && e.fase !== 'final' ? ' ✅' : '') + '</span>' +
        (e.fase === 'ordenando' && dentro && !entregue
          ? '<button class="btn-suave btn-chico" data-ord="' + pos + ':-1">⬆️</button><button class="btn-suave btn-chico" data-ord="' + pos + ':1">⬇️</button>'
          : '') + '</div>';
    }).join('') + '</div>';
    if (e.fase === 'ordenando') {
      var entregados = e.jugadores.filter(function (uid) { return !!e.entregados[uid]; }).length;
      html += '<p class="subtitulo">Han entregado ' + entregados + ' de ' + e.jugadores.length + '.</p>';
      if (dentro && !entregue) html += '<button class="btn-principal" id="ordena-entregar">✅ ¡Así quedó! Entregar</button>';
      else if (entregue) html += '<p>✅ ¡Entregado! Esperando a los demás…</p>';
    } else {
      html += rankingFinalHTML(e);
    }
    zona.innerHTML = html;
    $$('#zona-juego [data-ord]').forEach(function (b) {
      b.addEventListener('click', function () {
        var partes = b.dataset.ord.split(':');
        try { guardarEstado(p, G.moverEnOrdena(e, yo.id, Number(partes[0]), Number(partes[1]))); Fun.sonido('pop'); }
        catch (err) { Fun.sonido('error'); }
      });
    });
    var be = $('#ordena-entregar');
    if (be) be.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.entregarOrdena(e, yo.id)); Fun.sonido('acierto'); }
      catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Historia en orden! 📜🏆', 'Conoces la historia de principio a fin');
  }

  /* ----- Personaje Misterioso ----- */
  function renderMisterio(p) {
    var e = p.estado;
    var zona = $('#zona-juego');
    var pj = G.personajeMisterio(e);
    var dentro = e.jugadores.indexOf(yo.id) !== -1;
    var yaLoTengo = !!e.resueltos[yo.id];
    var soyAnfitrion = p.creada_por === yo.id;
    var html = tituloJuego(p, e, '🕵️ Personaje Misterioso') + marcadorPuntos(e, ' pts') +
      '<p>Un personaje de la Biblia se esconde tras las pistas. ¡Descúbrelo con las menos pistas posibles: con 1 pista ganas 100 pts; con 5, solo 20!</p>';
    for (var i = 0; i < e.pistasMostradas; i++) {
      html += '<p class="pista-misterio">🔎 Pista ' + (i + 1) + ': ' + escapar(pj.pistas[i]) + '</p>';
    }
    if (e.terminado) {
      html += '<p style="font-size:1.3rem;text-align:center">🎉 ¡Era <strong>' + escapar(pj.nombre) + '</strong>!</p>' + rankingFinalHTML(e);
    } else {
      html += '<p class="subtitulo">Ya lo descubrieron: ' +
        (e.jugadores.filter(function (uid) { return !!e.resueltos[uid]; }).map(function (uid) { return emojiDe(uid) + ' ' + escapar(nombreDe(uid)) + ' (con ' + e.resueltos[uid] + ' pista' + (e.resueltos[uid] > 1 ? 's' : '') + ')'; }).join(' · ') || 'nadie todavía…') + '</p>';
      if (dentro && !yaLoTengo) {
        html += '<form class="chat-enviar" id="form-misterio"><input type="text" id="misterio-valor" autocomplete="off" placeholder="¿Quién es? Escribe su nombre…"><button type="submit" class="btn-principal">¡Es…!</button></form>';
        if (e.intentosFallidos[yo.id]) html += '<p class="subtitulo">Intentos fallidos tuyos: ' + e.intentosFallidos[yo.id] + ' ❌ ¡Sigue pensando!</p>';
      } else if (yaLoTengo) html += '<p>✅ ¡Lo descubriste con ' + e.resueltos[yo.id] + ' pista' + (e.resueltos[yo.id] > 1 ? 's' : '') + '! Esperando a los demás…</p>';
      if (soyAnfitrion) {
        if (e.pistasMostradas < pj.pistas.length) html += '<button class="btn-verde" id="misterio-pista" style="margin-top:10px">➕ Revelar otra pista</button>';
        html += ' <button class="btn-suave" id="misterio-cerrar" style="margin-top:10px">🏁 Terminar y revelar</button>';
      }
    }
    zona.innerHTML = html;
    var form = $('#form-misterio');
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var antes = (e.intentosFallidos[yo.id] || 0);
      try {
        var nuevo = G.adivinarMisterio(e, yo.id, $('#misterio-valor').value);
        if (nuevo.resueltos[yo.id]) { Fun.sonido('acierto'); Fun.confeti({ cantidad: 40, duracionMs: 1300 }); }
        else Fun.sonido('error');
        guardarConPuntos(p, e, nuevo);
      } catch (err) { Fun.sonido('error'); }
    });
    var bpis = $('#misterio-pista');
    if (bpis) bpis.addEventListener('click', function () {
      try { guardarEstado(p, G.revelarPistaMisterio(e)); Fun.sonido('pop'); } catch (err) { Fun.sonido('error'); }
    });
    var bcer = $('#misterio-cerrar');
    if (bcer) bcer.addEventListener('click', function () {
      try { guardarConPuntos(p, e, G.cerrarMisterio(e)); } catch (err) { Fun.sonido('error'); }
    });
    celebrarPorPuntajes(p, e, '¡Detective bíblico! 🕵️🏆', 'Qué bien conoces a los personajes');
  }

  /* ============================ BIBLIA 📖 ============================ */
  var historiaAbierta = -1;

  function iniciarBiblia() {
    var v = G.versiculoDelDia(new Date());
    $('#biblia-versiculo-texto').textContent = '«' + v.texto + '»';
    $('#biblia-versiculo-cita').textContent = '— ' + v.cita;
    var lista = $('#lista-biblia-historias');
    lista.innerHTML = '';
    // v3.3: las 36 historias ya NO se listan en vertical (esa lista larguísima
    // enterraba los juegos bíblicos al fondo de la pestaña). Ahora cada
    // testamento es una BARRA DE DESLIZAMIENTO INTERNO: una sola fila que se
    // desliza de lado a lado (swipe) DENTRO de la pestaña, con altura fija y
    // compacta. Cada historia es una tarjeta con su ilustración de portada
    // (biblia-img/<slug>.jpg), su título y su cita corta; al tocarla se abre
    // en la capa sobrepuesta de siempre (abrirHistoria, v3.2).
    [['antiguo', '📜 Antiguo Testamento'], ['nuevo', '🌟 Nuevo Testamento']].forEach(function (grupo) {
      var cab = document.createElement('h3');
      cab.className = 'biblia-grupo';
      cab.textContent = grupo[1];
      lista.appendChild(cab);
      var barra = document.createElement('div');
      barra.className = 'barra-historias';
      barra.setAttribute('data-barra', grupo[0]);
      G.HISTORIAS_BIBLICAS.forEach(function (h, i) {
        if (h.testamento !== grupo[0]) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'historia-tarjeta';
        b.setAttribute('data-historia', String(i));
        b.innerHTML =
          (h.slug ? '<img class="historia-portada" src="biblia-img/' + escapar(h.slug) + '.jpg" alt="" loading="lazy">' : '') +
          '<span class="historia-tarjeta-titulo">' + h.emoji + ' ' + escapar(h.titulo) + '</span>' +
          (h.cita ? '<span class="historia-tarjeta-cita">📖 ' + escapar(h.cita) + '</span>' : '');
        b.addEventListener('click', function () { abrirHistoria(i); });
        barra.appendChild(b);
      });
      lista.appendChild(barra);
    });
    $('#btn-compartir-versiculo').addEventListener('click', function () {
      var payload = { texto: v.texto, cita: v.cita, de: yo.id };
      mostrarVersiculoCompartido(payload, true);
      if (canalSala) canalSala.send({ type: 'broadcast', event: 'versiculo', payload: payload });
      Fun.sonido('mensaje');
    });
    // v3.2: el versículo del día se toca y se lee en la capa sobrepuesta.
    var tocable = $('#versiculo-dia-tocable');
    if (tocable) {
      var abrirElDelDia = function () { abrirVersiculoEnCapa(v.texto, v.cita, '📖 Versículo del día', ''); };
      tocable.addEventListener('click', abrirElDelDia);
      tocable.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirElDelDia(); }
      });
    }
    // Las ✖ grandes de las capas de Biblia (solo cierran con su botón).
    var cerrarHistoria = $('#btn-cerrar-historia');
    if (cerrarHistoria) cerrarHistoria.addEventListener('click', function () { cerrarCapa('capa-historia'); Fun.sonido('pop'); });
    var cerrarVersiculo = $('#btn-cerrar-versiculo');
    if (cerrarVersiculo) cerrarVersiculo.addEventListener('click', function () { cerrarCapa('capa-versiculo'); Fun.sonido('pop'); });
  }

  // v3.2: TODA lectura de versículo se hace en la capa sobrepuesta, en
  // grande y encima de la pantalla (antes se pintaba dentro de la página).
  function abrirVersiculoEnCapa(texto, cita, titulo, deTexto) {
    var t = $('#capa-versiculo-titulo'); if (t) t.textContent = titulo || '📖 Versículo';
    var x = $('#capa-versiculo-texto'); if (x) x.textContent = '«' + texto + '»';
    var c = $('#capa-versiculo-cita'); if (c) c.textContent = '— ' + cita;
    var d = $('#capa-versiculo-de'); if (d) d.textContent = deTexto || '';
    abrirCapa('capa-versiculo');
  }

  function mostrarVersiculoCompartido(payload, propio) {
    abrirVersiculoEnCapa(payload.texto, payload.cita,
      propio ? '📣 Compartiste este versículo' : '📣 Un versículo para todos',
      propio ? 'Toda la familia lo está viendo ahora mismo 💛'
             : 'Lo compartió ' + nombreDe(payload.de) + ' para toda la familia 💛');
    if (!propio) Fun.sonido('mensaje');
  }

  function abrirHistoria(idx) {
    historiaAbierta = idx;
    var h = G.HISTORIAS_BIBLICAS[idx];
    if (!h) return;
    $('#biblia-historia-contenido').innerHTML =
      '<h3>' + h.emoji + ' ' + escapar(h.titulo) + '</h3>' +
      (h.slug ? '<img class="historia-img" src="biblia-img/' + escapar(h.slug) + '.jpg" alt="Dibujo de la historia">' : '') +
      (h.cita ? '<p class="versiculo-cita">📖 ' + escapar(h.cita) + '</p>' : '') +
      h.parrafos.map(function (t) { return '<p>' + escapar(t) + '</p>'; }).join('') +
      '<div class="aviso">💬 Para conversar en familia: ' + escapar(h.pregunta) + '</div>' +
      '<div class="botones-juego" style="margin-top:12px"><button class="btn-verde" id="btn-leer-todos">📖 Leer para todos</button></div>';
    var btn = $('#btn-leer-todos');
    if (btn) btn.addEventListener('click', function () {
      if (canalSala) canalSala.send({ type: 'broadcast', event: 'historia', payload: { idx: idx, de: yo.id } });
      Fun.sonido('mensaje');
    });
    // v3.2: la historia se lee en la capa sobrepuesta (con su ilustración),
    // tanto al tocarla como cuando llega por «Leer para todos».
    abrirCapa('capa-historia');
    Fun.sonido('pop');
  }

  function recibirHistoriaCompartida(payload) {
    var h = G.HISTORIAS_BIBLICAS[payload.idx];
    if (!h) return;
    var aviso = $('#biblia-aviso-lectura');
    if (aviso) {
      aviso.classList.remove('oculto');
      aviso.innerHTML = '📖 ' + escapar(nombreDe(payload.de)) + ' está leyendo con todos: <strong>' + h.emoji + ' ' + escapar(h.titulo) + '</strong>';
    }
    abrirHistoria(payload.idx);
  }

  /* ==================== VER Y ESCUCHAR JUNTOS (YouTube) ==================== */
  var ytPlayer = null, ytListo = false;
  var videoActual = null, ultimoNonce = null;
  var estadoRepro = null;        // fila global de reproducción
  var ultimoMsgSync = null;      // { posicion, reproduciendo, enviadoEn }
  var desfaseSync = 0;           // v3.6 · desfase entre el reloj de quien envía y el de este aparato (ms)
  var atascadoTicks = 0;         // v3.6 · ciclos seguidos sin sonar mientras el grupo sí suena
  var soyControlador = false;
  var colaActual = [];
  var canalCine = null;
  var ticksSync = 0;
  // v3.5 · Rescate de reproducción en iPhone/iPad: esos aparatos no dejan
  // que un video arranque CON SONIDO sin un toque del dueño. Si el grupo
  // quiere sonar y el reproductor no arrancó, lo arrancamos en silencio
  // (eso sí lo permiten) y ofrecemos el botón grande «Toca para…».
  var grupoQuiereSonar = false;
  var rescateTimer = null;

  function iniciarCine() {
    if (!CFG.YOUTUBE_API_KEY) $('#aviso-yt-config').classList.remove('oculto');
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = function () {
      ytPlayer = new YT.Player('yt-player', {
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0 },
        events: { onStateChange: alCambiarEstadoYT, onError: alErrorYT }
      });
      ytListo = true;
      if (estadoRepro) aplicarEstadoReproduccion(estadoRepro, true);
    };
    canalCine = supa.channel('cine-sync', { config: { broadcast: { self: false } } });
    canalCine.on('broadcast', { event: 'sync' }, function (msg) { recibirSyncBroadcast(msg.payload); });
    // v3.4 · «Más apps»: lo que comparte un familiar llega por el mismo
    // canal de cine (broadcast, sin tocar la base: cero SQL nuevo).
    canalCine.on('broadcast', { event: 'apps-embed' }, function (msg) {
      if (msg.payload) { mostrarEmbedApps(msg.payload); Fun.sonido('mensaje'); }
    });
    canalCine.on('broadcast', { event: 'apps-quitar' }, function () { quitarEmbedApps(); });
    canalCine.on('broadcast', { event: 'apps-lanzar' }, function (msg) {
      if (msg.payload) abrirLanzamiento(msg.payload);
    });
    canalCine.subscribe();

    supa.from('estado_reproduccion').select('*').eq('id', 1).maybeSingle().then(function (res) {
      estadoRepro = res.data;
      aplicarEstadoReproduccion(res.data, true);
    });
    supa.channel('repro-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'estado_reproduccion' }, function (payload) {
        estadoRepro = payload.new;
        aplicarEstadoReproduccion(payload.new, false);
      })
      .subscribe();

    cargarCola();
    supa.channel('cola-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cola_videos' }, function () { cargarCola(); })
      .subscribe();

    $('#form-buscar').addEventListener('submit', buscarVideos);
    $('#resultados').addEventListener('click', alAccionResultado);
    $('#cine-play').addEventListener('click', function () { controlGlobal('reproducir'); });
    $('#cine-pause').addEventListener('click', function () { controlGlobal('pausar'); });
    $('#cine-siguiente').addEventListener('click', function () { siguienteDeLaCola(true); });
    // v3.5 · Botón grande sobre el video: su toque SÍ cuenta como gesto
    // del dueño, así que con él el video arranca con sonido en iOS.
    $('#cine-toca').addEventListener('click', function () {
      if (!ytListo || !ytPlayer) return;
      try { ytPlayer.unMute(); ytPlayer.setVolume(100); ytPlayer.playVideo(); } catch (e) { /* queda el intento */ }
      ocultarToca();
    });
    // v3.5 · Salida de emergencia: ver el video actual en YouTube.
    $('#cine-youtube').addEventListener('click', function () {
      if (videoActual) window.open('https://www.youtube.com/watch?v=' + encodeURIComponent(videoActual), '_blank');
    });
    // v3.5 · Vigilante: si la API de YouTube no cargó en 9 s y hay un
    // video puesto, se avisa con claridad en vez de un cuadro mudo.
    setTimeout(function () {
      if (!ytListo && (videoActual || (estadoRepro && estadoRepro.video_id))) {
        var av = $('#aviso-yt-carga'); if (av) av.classList.remove('oculto');
      }
    }, 9000);
    // v3.4 · «Más apps»: el formulario de pegar enlaces y la capa de
    // «Abrir para todos» (su ✖ y su botón de abrir).
    $('#form-apps').addEventListener('submit', compartirEnlaceApps);
    $('#btn-cerrar-lanzar').addEventListener('click', cerrarLanzamiento);
    $('#lanzar-abrir').addEventListener('click', abrirEnlaceLanzado);
    setInterval(mantenimientoSync, 2000);
    setInterval(enviarLatido, 2000); // v3.6 · pulso del anfitrión
    // v3.6 · Al volver a la app (pantalla que se durmió, cambio de app),
    // re-leer la fila y re-alinear de golpe en vez de esperar al ciclo.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden || soyControlador) return;
      supa.from('estado_reproduccion').select('*').eq('id', 1).maybeSingle().then(function (res) {
        if (res.data) { estadoRepro = res.data; aplicarEstadoReproduccion(res.data, false); }
      });
    });
  }

  /* ----- buscador de YouTube (dentro de la app, sin pegar enlaces) ----- */
  function buscarVideos(e) {
    e.preventDefault();
    var caja = $('#resultados');
    if (!CFG.YOUTUBE_API_KEY) {
      caja.innerHTML = '<p class="subtitulo">Falta la clave de YouTube en config.js para buscar. 🔑</p>';
      return;
    }
    var q = $('#buscar-texto').value.trim();
    if (!q) return;
    caja.innerHTML = '<p class="subtitulo">Buscando en YouTube… 🔎</p>';
    var url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=12&q=' +
      encodeURIComponent(q) + '&key=' + encodeURIComponent(CFG.YOUTUBE_API_KEY);
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      var items = (data.items || []).filter(function (it) { return it.id && it.id.videoId; });
      if (!items.length) { caja.innerHTML = '<p class="subtitulo">No apareció nada con ese nombre. Prueba con otra palabra. 🤷</p>'; return; }
      caja.innerHTML = '';
      items.forEach(function (it) {
        var thumb = (it.snippet.thumbnails && (it.snippet.thumbnails.medium || it.snippet.thumbnails.default) || {}).url || '';
        var div = document.createElement('div');
        div.className = 'resultado';
        div.innerHTML = '<img src="' + escapar(thumb) + '" alt="">' +
          '<div class="tit">' + escapar(it.snippet.title) + '</div>' +
          '<div class="acciones">' +
          '<button class="btn-principal btn-chico" data-accion="todos" data-vid="' + it.id.videoId + '" data-titulo="' + escapar(it.snippet.title) + '">▶️ Para todos</button>' +
          '<button class="btn-suave btn-chico" data-accion="cola" data-vid="' + it.id.videoId + '" data-titulo="' + escapar(it.snippet.title) + '" data-thumb="' + escapar(thumb) + '">➕ A la cola</button>' +
          '<button class="btn-suave btn-chico" data-accion="solo" data-vid="' + it.id.videoId + '">Escuchar yo</button>' +
          '</div>';
        caja.appendChild(div);
      });
    }).catch(function () {
      caja.innerHTML = '<p class="subtitulo">Uy, YouTube no respondió. Revisa tu internet y prueba otra vez. 📶</p>';
    });
  }

  function alAccionResultado(e) {
    var b = e.target.closest('button[data-accion]');
    if (!b) return;
    var vid = b.dataset.vid, titulo = b.dataset.titulo || '';
    if (b.dataset.accion === 'todos') reproducirParaTodos(vid, titulo);
    else if (b.dataset.accion === 'solo') { if (ytListo) { videoActual = vid; ytPlayer.loadVideoById(vid); } }
    else if (b.dataset.accion === 'cola') {
      supa.from('cola_videos').insert({ video_id: vid, titulo: titulo, miniatura: b.dataset.thumb || null, agregado_por: miPerfil.nombre })
        .then(function (res) { if (!res.error) { Fun.sonido('turno'); } });
    }
  }

  /* ----- estado global y eventos de sincronización ----- */
  function actualizarFilaRepro(campos) {
    // v3.6 · actualizado_en ya NO se manda desde el aparato: la columna
    // tiene default now() y PostgreSQL pone la hora del servidor. Antes
    // cada aparato escribía con SU reloj y los demás extrapolaban la
    // posición contra relojes distintos → cada pantalla en un punto.
    var datos = Object.assign({}, campos, { actualizado_por: yo.id });
    return supa.from('estado_reproduccion').update(datos).eq('id', 1);
  }

  // v3.6 · Estima el desfase entre el reloj de quien envió el mensaje y
  // el de este aparato. La muestra vale enviadoEn − ahora(local): el
  // tránsito de red solo puede RESTAR, así que la muestra mayor es la
  // más cercana a la verdad (truco clásico de sincronización de relojes).
  function anotarDesfase(enviadoEn) {
    if (!enviadoEn || soyControlador) return;
    var muestra = enviadoEn - Date.now();
    if (muestra > desfaseSync || desfaseSync - muestra > 10000) desfaseSync = muestra;
  }

  // «Ahora» en el reloj de quien manda: contra ese reloj se extrapola.
  function ahoraRemoto() { return Date.now() + desfaseSync; }

  function enviarSync(tipo, extra) {
    var msg = Object.assign({
      tipo: tipo,
      videoId: videoActual,
      posicion: ytListo && ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0,
      reproduciendo: tipo === 'reproducir' || tipo === 'cargar',
      enviadoEn: Date.now()
    }, extra || {});
    ultimoMsgSync = msg;
    if (canalCine) canalCine.send({ type: 'broadcast', event: 'sync', payload: msg });
    return msg;
  }

  function mostrarToca(texto) {
    var b = $('#cine-toca');
    if (!b) return;
    if (texto) b.textContent = texto;
    b.classList.remove('oculto');
  }

  function ocultarToca() {
    var b = $('#cine-toca');
    if (b) b.classList.add('oculto');
  }

  function programarRescate() {
    clearTimeout(rescateTimer);
    rescateTimer = setTimeout(rescateToque, 800); // v3.6 · rescate más rápido
  }

  // Si el grupo quiere escuchar y el video no arrancó solo (pasa en
  // iPhone/iPad sin un toque previo), lo arrancamos en silencio y
  // dejamos el botón grande para que un toque traiga el sonido.
  function rescateToque() {
    if (!ytListo || !ytPlayer || !grupoQuiereSonar || !videoActual) return;
    var estado;
    try { estado = ytPlayer.getPlayerState(); } catch (e) { return; }
    if (estado === 1) {
      var mudo = false;
      try { mudo = ytPlayer.isMuted(); } catch (e) { /* sin dato */ }
      if (mudo) mostrarToca('🔊 Toca para escuchar el video');
      else ocultarToca();
      return;
    }
    try { ytPlayer.mute(); ytPlayer.playVideo(); } catch (e) { /* queda el botón */ }
    mostrarToca('🔊 Toca para escuchar el video');
    setTimeout(function () {
      if (!grupoQuiereSonar || !ytListo) return;
      var e2;
      try { e2 = ytPlayer.getPlayerState(); } catch (err) { return; }
      if (e2 !== 1) mostrarToca('▶️ Toca para ver el video');
    }, 1300);
  }

  function ejecutarAccionSync(accionObj, evento) {
    if (!ytListo || !ytPlayer) {
      // Sin reproductor listo: si hay un video puesto, que se sepa por qué no se ve.
      if (accionObj && accionObj.accion === 'cargar') {
        var avc = $('#aviso-yt-carga'); if (avc) avc.classList.remove('oculto');
        var by = $('#cine-youtube'); if (by) by.classList.remove('oculto');
        videoActual = accionObj.videoId || videoActual;
      }
      return;
    }
    if (accionObj.accion === 'cargar') {
      videoActual = accionObj.videoId;
      grupoQuiereSonar = true;
      $('#aviso-embed').classList.add('oculto');
      var btnY = $('#cine-youtube'); if (btnY) btnY.classList.remove('oculto');
      ytPlayer.loadVideoById({ videoId: accionObj.videoId, startSeconds: Math.max(0, accionObj.posicion || 0) });
      programarRescate();
    } else if (accionObj.accion === 'play') {
      grupoQuiereSonar = true;
      ytPlayer.playVideo();
      programarRescate();
    } else if (accionObj.accion === 'pause') {
      grupoQuiereSonar = false;
      ocultarToca();
      ytPlayer.pauseVideo();
    } else if (accionObj.accion === 'seek') ytPlayer.seekTo(accionObj.a, true);
  }

  function recibirSyncBroadcast(ev) {
    if (!ev || !ev.tipo) return;
    if (ev.tipo === 'posicion' && ev.videoId && videoActual && ev.videoId !== videoActual) return; // latido de otro video
    anotarDesfase(ev.enviadoEn);
    ultimoMsgSync = { posicion: ev.posicion || 0, reproduciendo: !!ev.reproduciendo, enviadoEn: ev.enviadoEn || Date.now() };
    if (ev.tipo === 'posicion') return; // el latido solo alimenta la corrección de deriva
    ejecutarAccionSync(L.interpretarSync(ev), ev);
  }

  // v3.6 · Latido del anfitrión: cada 2 s anuncia su posición exacta por
  // el canal. Es el pulso contra el que todos se alinean; sin él, entre
  // refresco y refresco de la fila (segundos) cada aparato derivaba solo.
  function enviarLatido() {
    if (!soyControlador || !videoActual || !ytListo || !ytPlayer) return;
    var estado;
    try { estado = ytPlayer.getPlayerState(); } catch (e) { return; }
    if (estado !== 1) return;
    enviarSync('posicion', { reproduciendo: true });
  }

  function aplicarEstadoReproduccion(row, inicial) {
    if (!row) return;
    // v3.7.6 · Cine familiar: si el video_id trae «:» (peli:, drive:,
    // web:) NO es un video de YouTube: lo atiende cine-familiar.js con
    // su propio reproductor. Aquí solo se aparca el de YouTube para
    // que no intente cargar ese id ni enseñe errores que no son suyos.
    if (row.video_id && row.video_id.indexOf(':') !== -1) {
      if (videoActual && ytListo && ytPlayer) { try { ytPlayer.pauseVideo(); } catch (e) { /* aún sin reproductor */ } }
      videoActual = null;
      grupoQuiereSonar = false;
      ocultarToca();
      var avp = $('#aviso-yt-carga'); if (avp) avp.classList.add('oculto');
      var ave = $('#aviso-embed'); if (ave) ave.classList.add('oculto');
      return;
    }
    grupoQuiereSonar = !!row.reproduciendo;
    if (row.video_id && !ytListo) {
      var av2 = $('#aviso-yt-carga'); if (av2) av2.classList.remove('oculto');
      var by2 = $('#cine-youtube'); if (by2) by2.classList.remove('oculto');
    }
    anotarDesfase(row.actualizado_en ? Date.parse(row.actualizado_en) : null);
    ultimoMsgSync = {
      posicion: row.posicion || 0,
      reproduciendo: !!row.reproduciendo,
      enviadoEn: row.actualizado_en ? Date.parse(row.actualizado_en) : Date.now()
    };
    if (!row.video_id || !ytListo) return;
    var esNuevo = row.video_id !== videoActual || (row.nonce && row.nonce !== ultimoNonce);
    if (esNuevo) {
      ultimoNonce = row.nonce;
      var pos = L.posicionRemota(ultimoMsgSync, ahoraRemoto());
      ejecutarAccionSync({ accion: 'cargar', videoId: row.video_id, posicion: pos }, null);
      if (!row.reproduciendo) setTimeout(function () { if (ytListo) ytPlayer.pauseVideo(); }, 600);
      return;
    }
    // Mismo video: alinear play/pausa Y posición con el grupo (v3.6: antes
    // solo se alineaba play/pausa y un aparato atrasado se quedaba atrás).
    try {
      var estado = ytPlayer.getPlayerState();
      if (row.reproduciendo) {
        var corrFila = L.correccionDeriva(ytPlayer.getCurrentTime(), ultimoMsgSync, ahoraRemoto());
        if (corrFila.accion === 'seek') ytPlayer.seekTo(corrFila.a, true);
        if (estado !== 1) { ytPlayer.playVideo(); programarRescate(); }
      }
      if (!row.reproduciendo && estado === 1) ytPlayer.pauseVideo();
    } catch (e) { /* el reproductor aún despierta */ }
  }

  function reproducirParaTodos(videoId, titulo) {
    soyControlador = true;
    desfaseSync = 0; // ahora el reloj de referencia es el de este aparato
    atascadoTicks = 0;
    grupoQuiereSonar = true;
    var nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    ultimoNonce = nonce;
    enviarSync('cargar', { videoId: videoId, posicion: 0, reproduciendo: true });
    ejecutarAccionSync({ accion: 'cargar', videoId: videoId, posicion: 0 }, null);
    actualizarFilaRepro({ video_id: videoId, titulo: titulo || null, reproduciendo: true, posicion: 0, nonce: nonce });
    Fun.sonido('turno');
  }

  function controlGlobal(tipo) {
    if (!videoActual) return;
    soyControlador = true;
    desfaseSync = 0; // ahora el reloj de referencia es el de este aparato
    grupoQuiereSonar = tipo === 'reproducir';
    var pos = ytListo && ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    enviarSync(tipo, { posicion: pos });
    ejecutarAccionSync(L.interpretarSync({ tipo: tipo, posicion: pos }), null);
    actualizarFilaRepro({ reproduciendo: tipo === 'reproducir', posicion: pos, nonce: ultimoNonce });
  }

  /* ----- cola compartida ----- */
  function cargarCola() {
    supa.from('cola_videos').select('*').order('creado_en', { ascending: true }).then(function (res) {
      colaActual = res.data || [];
      var caja = $('#cola');
      if (!colaActual.length) { caja.innerHTML = '<p class="subtitulo">La cola está vacía. Busca algo rico y agrégalo.</p>'; return; }
      caja.innerHTML = '';
      colaActual.forEach(function (item, i) {
        var div = document.createElement('div');
        div.className = 'cola-item';
        div.innerHTML = (item.miniatura ? '<img src="' + escapar(item.miniatura) + '" alt="">' : '') +
          '<span style="flex:1"><strong>' + (i + 1) + '.</strong> ' + escapar(item.titulo) +
          '<br><span class="subtitulo">lo puso ' + escapar(item.agregado_por || 'alguien') + '</span></span>';
        var btn = document.createElement('button');
        btn.className = 'btn-principal btn-chico';
        btn.textContent = '▶️ Poner ya';
        btn.addEventListener('click', function () {
          reproducirParaTodos(item.video_id, item.titulo);
          supa.from('cola_videos').delete().eq('id', item.id).then(function () { cargarCola(); });
        });
        div.appendChild(btn);
        var quitar = document.createElement('button');
        quitar.className = 'btn-suave btn-chico';
        quitar.textContent = '✖';
        quitar.addEventListener('click', function () {
          supa.from('cola_videos').delete().eq('id', item.id).then(function () { cargarCola(); });
        });
        div.appendChild(quitar);
        caja.appendChild(div);
      });
    });
  }

  function siguienteDeLaCola(manual) {
    var item = colaActual[0];
    if (!item) { if (manual) Fun.sonido('error'); return; }
    reproducirParaTodos(item.video_id, item.titulo);
    supa.from('cola_videos').delete().eq('id', item.id).then(function () { cargarCola(); });
  }

  /* ----- v3.4 · MÁS APPS: compartir contenido de otras plataformas -----
     Pedido del dueño: «solo aparece YouTube y quiero las demás apps».
     Dos caminos honestos, según lo que cada plataforma permite (la
     clasificación vive en fun.js, pura y probada):
     1) INCRUSTABLES (Spotify, Apple Music, SoundCloud): suenan AQUÍ
        DENTRO con el reproductor oficial incrustado. Se pega el enlace,
        la tarjeta aparece en #apps-zona de TODOS (broadcast por el canal
        de cine, sin base de datos: cero SQL) y cada quien le da play en
        su aparato — el reproductor incrustado no se puede sincronizar
        como el de YouTube, y no fingimos lo contrario. Sin búsqueda
        interna para estas: su buscador exige credenciales de
        desarrollador de cada plataforma.
     2) LAS DEMÁS (Netflix, Disney+, Prime Video, Max, TikTok, Twitch…):
        no dejan sonar dentro de otras apps. Se avisa a todos con la capa
        «Abrir para todos»: cuenta regresiva SINCRONIZADA de 3 segundos
        (un instante absoluto compartido, abrirEn) y botón «¡Abrir
        ahora!» que abre el enlace en el aparato de cada quien, en su
        app y con su cuenta — para empezar a la vez.
     Un enlace de YouTube pegado aquí se manda al reproductor de la casa. */
  var embedAppsActual = null;
  var lanzarActual = null;
  var lanzarTimer = null;
  var lanzarSonoYa = false;

  function compartirEnlaceApps(e) {
    e.preventDefault();
    var input = $('#apps-enlace');
    var aviso = $('#apps-aviso');
    var texto = (input.value || '').trim();
    if (!texto) return;
    var ytId = Fun.idVideoYouTube(texto);
    if (ytId) {
      reproducirParaTodos(ytId, 'Video de YouTube 🎬');
      input.value = '';
      aviso.classList.add('oculto');
      return;
    }
    var inc = Fun.enlaceIncrustable(texto);
    if (inc) {
      var payload = { plataforma: inc.plataforma, nombre: inc.nombre, icono: inc.icono,
        embed: inc.embed, altura: inc.altura, de: yo.id, nombreDe: miPerfil.nombre };
      mostrarEmbedApps(payload); // el canal es self:false: me lo aplico yo mismo
      if (canalCine) canalCine.send({ type: 'broadcast', event: 'apps-embed', payload: payload });
      Fun.sonido('turno');
      input.value = '';
      aviso.classList.add('oculto');
      return;
    }
    var ext = Fun.servicioExterno(texto);
    if (ext) {
      var lanzamiento = { url: ext.url, servicio: ext.nombre, icono: ext.icono,
        de: yo.id, nombreDe: miPerfil.nombre, abrirEn: Date.now() + 3000 };
      abrirLanzamiento(lanzamiento); // y a los demás les llega por broadcast
      if (canalCine) canalCine.send({ type: 'broadcast', event: 'apps-lanzar', payload: lanzamiento });
      input.value = '';
      aviso.classList.add('oculto');
      return;
    }
    aviso.textContent = 'Mmm… eso no parece un enlace. 🙈 Copia el enlace desde la otra app (Compartir → Copiar enlace) y pégalo aquí.';
    aviso.classList.remove('oculto');
    Fun.sonido('error');
  }

  function mostrarEmbedApps(p) {
    if (!p || !p.embed) return;
    embedAppsActual = p;
    var zona = $('#apps-zona');
    if (!zona) return;
    zona.innerHTML = '';
    var cab = document.createElement('p');
    cab.className = 'apps-cabecera';
    cab.innerHTML = '<strong>' + (p.icono || '🎵') + ' ' + escapar(p.nombre || 'Música') + '</strong>' +
      ' <span class="subtitulo">· lo compartió ' + escapar(p.nombreDe || 'alguien') + ' — dale play aquí mismo ▶️</span>';
    zona.appendChild(cab);
    var marco = document.createElement('div');
    marco.className = 'apps-marco';
    var ifr = document.createElement('iframe');
    ifr.src = p.embed; // construida por Fun.enlaceIncrustable, nunca el texto tal cual
    ifr.style.height = (p.altura || 166) + 'px';
    ifr.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
    ifr.setAttribute('allowfullscreen', '');
    ifr.setAttribute('loading', 'lazy');
    ifr.title = p.nombre || 'Reproductor';
    marco.appendChild(ifr);
    zona.appendChild(marco);
    var btn = document.createElement('button');
    btn.className = 'btn-suave';
    btn.style.marginTop = '10px';
    btn.textContent = '⏹️ Parar y quitar (para todos)';
    btn.addEventListener('click', function () {
      quitarEmbedApps();
      if (canalCine) canalCine.send({ type: 'broadcast', event: 'apps-quitar', payload: {} });
      Fun.sonido('pop');
    });
    zona.appendChild(btn);
  }

  function quitarEmbedApps() {
    embedAppsActual = null;
    var zona = $('#apps-zona');
    if (zona) zona.innerHTML = '<p class="subtitulo">Todavía no suena nada de otras apps. ¡Pega el primer enlace!</p>';
  }

  function abrirLanzamiento(p) {
    if (!p || !p.url) return;
    lanzarActual = p;
    lanzarSonoYa = false;
    $('#lanzar-icono').textContent = p.icono || '📺';
    $('#lanzar-de').textContent = p.nombreDe || 'Alguien';
    $('#lanzar-servicio').textContent = (p.icono || '📺') + ' ' + (p.servicio || 'Otra app');
    $('#lanzar-enlace').textContent = p.url;
    var btn = $('#lanzar-abrir');
    btn.disabled = true;
    btn.textContent = '⏳ ¡Prepárate…!';
    abrirCapa('capa-lanzar');
    Fun.sonido('mensaje');
    detenerRegresiva();
    lanzarTimer = setInterval(pintarRegresiva, 120);
    pintarRegresiva();
  }
  function pintarRegresiva() {
    if (!lanzarActual) { detenerRegresiva(); return; }
    var queda = Fun.restanteRegresiva(lanzarActual.abrirEn, Date.now());
    var cuenta = $('#lanzar-cuenta');
    if (queda > 0) {
      if (cuenta) cuenta.textContent = String(queda);
      return;
    }
    if (cuenta) cuenta.textContent = '¡Ya! 🎉';
    var btn = $('#lanzar-abrir');
    if (btn) { btn.disabled = false; btn.textContent = '▶️ ¡Abrir ahora!'; }
    if (!lanzarSonoYa) { lanzarSonoYa = true; Fun.sonido('acierto'); }
    detenerRegresiva();
  }
  function detenerRegresiva() {
    if (lanzarTimer) { clearInterval(lanzarTimer); lanzarTimer = null; }
  }
  function cerrarLanzamiento() {
    detenerRegresiva();
    lanzarActual = null;
    cerrarCapa('capa-lanzar');
  }
  function abrirEnlaceLanzado() {
    if (!lanzarActual) return;
    var url = lanzarActual.url;
    window.open(url, '_blank'); // en el mismo gesto del toque: el navegador lo deja pasar
    cerrarLanzamiento();
  }

  /* ----- eventos del reproductor y corrección de deriva ----- */
  function alCambiarEstadoYT(ev) {
    if (ev.data === 1) { // ya está sonando
      var mudo2 = false;
      try { mudo2 = ytPlayer.isMuted(); } catch (e) { /* sin dato */ }
      if (mudo2 && grupoQuiereSonar) mostrarToca('🔊 Toca para escuchar el video');
      else ocultarToca();
    }
    if (ev.data === 2 && !grupoQuiereSonar) ocultarToca();
    if (ev.data === 0 && soyControlador) { // terminó el video
      if (colaActual.length) siguienteDeLaCola(false);
      else actualizarFilaRepro({ reproduciendo: false, posicion: 0 });
    }
  }

  function alErrorYT(ev) {
    // 100 = no existe · 101/150 = el dueño no permite insertarlo en otras apps
    if ([100, 101, 150].indexOf(ev.data) !== -1) {
      $('#aviso-embed').classList.remove('oculto');
      Fun.sonido('error');
    }
  }

  function mantenimientoSync() {
    ticksSync++;
    if (!ytListo || !ytPlayer || !videoActual || !ultimoMsgSync) return;
    var estado;
    try { estado = ytPlayer.getPlayerState(); } catch (e) { return; }
    if (soyControlador) {
      // Quien controla refresca la posición del grupo cada ~10 s (la
      // precisión fina la da el latido de 2 s por el canal, no la fila).
      if (ticksSync % 5 === 0 && estado === 1) {
        actualizarFilaRepro({ posicion: ytPlayer.getCurrentTime(), reproduciendo: true, nonce: ultimoNonce });
      }
      return;
    }
    var ahora = ahoraRemoto();
    if (!ultimoMsgSync.reproduciendo) {
      // El grupo está en pausa: este aparato también, y en el mismo punto.
      atascadoTicks = 0;
      if (estado === 1) {
        try {
          var destinoPausa = L.posicionRemota(ultimoMsgSync, ahora);
          ytPlayer.pauseVideo();
          ytPlayer.seekTo(destinoPausa, true);
        } catch (e) { /* sin reproductor aún */ }
      }
      return;
    }
    if (estado === 1) {
      atascadoTicks = 0;
      var correccion = L.correccionDeriva(ytPlayer.getCurrentTime(), ultimoMsgSync, ahora);
      if (correccion.accion === 'seek') ytPlayer.seekTo(correccion.a, true);
      return;
    }
    // v3.6 · El grupo SÍ está sonando y este aparato no (pausado, cargando
    // o sin arrancar — el caso del iPad). Antes aquí no se hacía NADA y el
    // aparato se quedaba atrás para siempre. Ahora: tras ~4 s atascado,
    // salta al punto exacto del grupo y arranca (en silencio si iOS lo
    // exige; el botón grande trae el sonido con un toque).
    if (estado === 2 || estado === 3 || estado === -1 || estado === 5) {
      atascadoTicks++;
      if (atascadoTicks >= 2) {
        atascadoTicks = 0;
        var destino = L.posicionRemota(ultimoMsgSync, ahora);
        try { ytPlayer.seekTo(destino, true); ytPlayer.playVideo(); } catch (e) { /* queda el rescate */ }
        programarRescate();
      }
    }
  }

  /* ================= AVISOS DE LLAMADA (Web Push) ================= */
  // Nivel PWA instalada: cada aparato se suscribe una vez (botón en la
  // Sala) y la Edge Function «avisar-llamada» despierta a los demás
  // cuando alguien entra a la voz. La clave privada VAPID jamás está
  // aquí: vive solo como secreto de la función.
  var pushAvisoEnviado = false; // el aviso sale UNA vez por sesión de llamada

  var swRecargaHecha = false;
  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // (v3.1) Toma de control AGRESIVA: en el iPhone la app instalada podía
    // quedarse con la versión vieja por días — la comprobación de sw.js se
    // servía de la caché HTTP, nadie pedía «update» al reanudar la app y,
    // aunque el SW nuevo tomaba el control, la página abierta seguía con el
    // código viejo en memoria. Ahora: la comprobación salta la caché HTTP,
    // se pide actualización al abrir y al volver a la app, y cuando el
    // control cambia de manos la página se recarga UNA sola vez.
    var habiaControlador = !!navigator.serviceWorker.controller;
    try {
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!habiaControlador || swRecargaHecha) return; // la 1ª instalación no recarga
        try {
          if (sessionStorage.getItem('nr_sw_recargado') === '1') return; // anti-bucle
          sessionStorage.setItem('nr_sw_recargado', '1');
        } catch (e) { /* sin sessionStorage manda la variable */ }
        swRecargaHecha = true;
        window.location.reload();
      });
    } catch (e) { /* sin eventos de SW: la app sigue igual */ }
    var promesa = null;
    try { promesa = navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }); }
    catch (eReg) {
      try { promesa = navigator.serviceWorker.register('sw.js'); } catch (eReg2) { promesa = null; }
    }
    if (!promesa || !promesa.then) return;
    promesa.then(function (reg) {
      function pedirActualizacion() { try { reg.update(); } catch (e) { /* ya se pedirá luego */ } }
      pedirActualizacion();
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) pedirActualizacion();
      });
      window.addEventListener('pageshow', pedirActualizacion);
    }).catch(function () { /* sin SW la app funciona igual */ });
  }

  function urlBase64ABytes(base64) {
    var relleno = '='.repeat((4 - (base64.length % 4)) % 4);
    var b64 = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
    var crudo = window.atob(b64);
    var bytes = new Uint8Array(crudo.length);
    for (var i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
    return bytes;
  }

  function pushDisponible() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) &&
      ('Notification' in window) && !!CFG.VAPID_PUBLIC_KEY;
  }

  function pintarEstadoAvisos() {
    var estado = $('#avisos-estado');
    var boton = $('#btn-avisos');
    if (!estado || !boton) return;
    if (!pushDisponible()) {
      estado.textContent = 'Este navegador no deja activar avisos aquí. En iPhone/iPad abre la app desde la pantalla de inicio (iOS 16.4 o más nuevo) 📲';
      boton.classList.add('oculto');
      return;
    }
    if (Notification.permission === 'denied') {
      estado.textContent = 'Los avisos están bloqueados en este aparato 🔕 Actívalos en los ajustes del navegador para este sitio y vuelve aquí.';
      boton.classList.add('oculto');
      return;
    }
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription();
      }).then(function (sub) {
        if (sub) {
          estado.textContent = '✅ Avisos activados en este aparato: cuando alguien llame, sonará la notificación.';
          boton.textContent = '🔔 Avisos ya activados en este aparato';
        } else {
          estado.textContent = 'Todavía no: toca el botón para activar los avisos en este aparato.';
          boton.textContent = '🔔 Activar avisos de llamada';
        }
      }).catch(function () { /* el texto por defecto ya orienta */ });
    } else {
      estado.textContent = 'Todavía no: toca el botón para activar los avisos en este aparato.';
    }
  }

  function activarAvisos() {
    if (!pushDisponible()) { pintarEstadoAvisos(); return; }
    Notification.requestPermission().then(function (permiso) {
      if (permiso !== 'granted') { pintarEstadoAvisos(); Fun.sonido('error'); return null; }
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (previa) {
          if (previa) return previa; // ya había: se reutiliza
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ABytes(CFG.VAPID_PUBLIC_KEY)
          });
        });
      }).then(function (sub) {
        var forma = Fun.formaSuscripcion(sub && sub.toJSON ? sub.toJSON() : sub);
        if (!forma) throw new Error('suscripcion-incompleta');
        return supa.from('suscripciones_push').upsert({
          user_id: yo.id,
          endpoint: forma.endpoint,
          p256dh: forma.p256dh,
          auth: forma.auth,
          user_agent: navigator.userAgent
        }, { onConflict: 'endpoint' });
      }).then(function (res) {
        if (res && res.error) throw res.error;
        Fun.sonido('acierto');
        pintarEstadoAvisos();
      });
    }).catch(function () {
      var estado = $('#avisos-estado');
      if (estado) estado.textContent = 'Uy, no se pudieron activar los avisos 🙏 Prueba otra vez en un ratito.';
      Fun.sonido('error');
    });
  }

  $('#btn-avisos').addEventListener('click', activarAvisos);

  // Al unirme a la voz: avisar a los demás aparatos (una vez por sesión).
  function dispararAvisoLlamada() {
    if (pushAvisoEnviado) return;
    pushAvisoEnviado = true;
    if (!supa || !supa.functions) return;
    try {
      var p = supa.functions.invoke('avisar-llamada', { body: { de_nombre: miPerfil.nombre } });
      if (p && p.catch) p.catch(function () { /* si el push falla, la voz sigue */ });
    } catch (e) { /* la función aún no desplegada no debe romper la voz */ }
  }

  /* ------------- llamada entrante DENTRO de la app ------------- */
  // Si alguien está en la voz (presencia del canal de voz) y yo no,
  // tarjeta grande + tono en bucle. «Ahora no» la oculta para ESA
  // combinación de personas; si cambia quién está, vuelve a salir.
  var llamadaOcultaPara = '';

  function revisarLlamadaEntrante() {
    var tarjeta = $('#tarjeta-llamada');
    if (!tarjeta || !canalVoz || !yo) return;
    var estado = canalVoz.presenceState();
    var otros = Object.keys(estado).filter(function (id) { return id !== yo.id; });
    if (enVoz || !otros.length) {
      tarjeta.classList.add('oculto');
      Fun.detenerTonoLlamada();
      if (!otros.length) llamadaOcultaPara = '';
      return;
    }
    var clave = otros.slice().sort().join(',');
    if (clave === llamadaOcultaPara) {
      tarjeta.classList.add('oculto');
      Fun.detenerTonoLlamada();
      return;
    }
    var primero = estado[otros[0]] && estado[otros[0]][0];
    var nombre = (primero && primero.nombre) || nombreDe(otros[0]);
    $('#llamada-titulo').textContent = '📹 ' + nombre + ' te está llamando…';
    tarjeta.classList.remove('oculto');
    Fun.iniciarTonoLlamada();
  }

  $('#llamada-contestar').addEventListener('click', function () {
    $('#tarjeta-llamada').classList.add('oculto');
    Fun.detenerTonoLlamada();
    unirseVoz(); // Contestar = unirse a la voz (la cámara es opcional después)
  });
  $('#llamada-ahora-no').addEventListener('click', function () {
    if (canalVoz) {
      var estado = canalVoz.presenceState();
      llamadaOcultaPara = Object.keys(estado).filter(function (id) { return id !== yo.id; }).sort().join(',');
    }
    $('#tarjeta-llamada').classList.add('oculto');
    Fun.detenerTonoLlamada();
    Fun.sonido('pop');
  });

  /* ===================== VOZ + VIDEO (WebRTC en malla) ===================== */
  var canalVoz = null;
  var flujoLocal = null;
  var enVoz = false;
  var paresVoz = {};        // id -> { pc, el, iniciador }
  var hieloPendiente = {};  // id -> [candidates] antes de tener descripción remota
  var STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
  // --- Video (extensión de la misma malla y la misma señalización) ---
  var videoActivo = false;
  var pistaVideoLocal = null;
  var caraCamara = 'user';      // 'user' = frontal · 'environment' = trasera
  var estadoVideo = {};         // id -> 'camara' (Fun.registrarVideo; sin entrada = avatar)
  var flujosRemotos = {};       // id -> MediaStream remoto (para su mosaico)
  // --- Compartir pantalla: una pista de video más por la misma malla ---
  var pantallaActiva = false;
  var pistaPantallaLocal = null;
  var flujoPantallaLocal = null;
  var estadoPantalla = {};        // id -> 'pantalla' (Fun.registrarPantalla)
  var flujosPantallaRemotos = {}; // id -> MediaStream de SU pantalla
  var pantallaPistaPorId = {};    // id -> track.id de su pantalla (llega por señalización)
  var videosPendientes = {};      // id -> [{track, stream}] por clasificar (¿cámara o pantalla?)
  // v3.4.3: mosaico en ESCENARIO (grande): clave del recuadro elegido —
  // el id del participante o 'pantalla:<id>'; null = rejilla normal.
  var mosaicoGrande = null;

  function prepararCanalVoz() {
    if (canalVoz) return;
    canalVoz = supa.channel('voz', { config: { presence: { key: yo.id }, broadcast: { self: false } } });
    canalVoz
      .on('presence', { event: 'sync' }, pintarEstadoVoz)
      .on('presence', { event: 'leave' }, function (payload) {
        (payload.leftPresences || []).forEach(function (p) { cerrarConexion(p.key); });
        pintarEstadoVoz();
      })
      .on('broadcast', { event: 'rtc' }, function (msg) {
        var p = msg.payload;
        if (!p || p.para !== yo.id || !enVoz) return;
        recibirRTC(p);
      })
      .on('broadcast', { event: 'video' }, function (msg) {
        var p = msg.payload;
        if (!p || p.de === yo.id) return;
        estadoVideo = Fun.registrarVideo(estadoVideo, p.de, !!p.activo);
        pintarMosaicos();
      })
      .on('broadcast', { event: 'pantalla' }, function (msg) {
        var p = msg.payload;
        if (!p || p.de === yo.id) return;
        if (p.activo) {
          pantallaPistaPorId[p.de] = p.pista || null;
          estadoPantalla = Fun.registrarPantalla(estadoPantalla, p.de, true);
          clasificarVideosPendientes(p.de);
        } else {
          delete flujosPantallaRemotos[p.de];
          delete pantallaPistaPorId[p.de];
          estadoPantalla = Fun.registrarPantalla(estadoPantalla, p.de, false);
        }
        pintarMosaicos();
      })
      .subscribe();
  }

  function pintarEstadoVoz() {
    if (!canalVoz) return;
    var estado = canalVoz.presenceState();
    var nombres = Object.keys(estado).map(function (id) {
      return (estado[id][0] && estado[id][0].nombre) || nombreDe(id);
    });
    $('#voz-estado').textContent = nombres.length
      ? 'En la voz ahora: ' + nombres.join(', ') + ' 🎙️'
      : 'La voz está tranquila… por ahora 😴';
    // Si mi cámara está encendida, recuerdo mi estado a quien acabe de llegar.
    if (enVoz && videoActivo) avisarVideo(true);
    if (enVoz && pantallaActiva) avisarPantalla(true);
    pintarMosaicos();
    revisarLlamadaEntrante(); // ¿hay que mostrar la tarjeta de llamada?
  }

  function enviarRTC(para, tipo, datos) {
    if (canalVoz) canalVoz.send({ type: 'broadcast', event: 'rtc', payload: { de: yo.id, para: para, tipo: tipo, datos: datos } });
  }

  // Clasifica un video remoto: ¿es la CÁMARA de este participante o su PANTALLA?
  // La señalización «pantalla» trae el track.id de la pantalla; si el video llegó
  // antes que la señal, queda en espera y se clasifica al llegar.
  function clasificarVideosPendientes(id) {
    var pend = videosPendientes[id] || [];
    delete videosPendientes[id];
    pend.forEach(function (v) { registrarVideoRemoto(id, v.track, v.stream); });
  }
  function registrarVideoRemoto(id, track, stream) {
    if (pantallaPistaPorId[id] && track.id === pantallaPistaPorId[id]) {
      flujosPantallaRemotos[id] = stream; // su pantalla, NO su cámara
    } else if (Fun.tienePantalla(estadoPantalla, id) && !pantallaPistaPorId[id]) {
      (videosPendientes[id] = videosPendientes[id] || []).push({ track: track, stream: stream });
      return;
    } else {
      flujosRemotos[id] = stream;
      estadoVideo = Fun.registrarVideo(estadoVideo, id, true);
    }
    pintarMosaicos();
  }
  function vigilarPistaVideoRemota(id, track) {
    track.onmute = function () {
      if (pantallaPistaPorId[id] === track.id) return; // la pantalla no apaga la cámara
      estadoVideo = Fun.registrarVideo(estadoVideo, id, false);
      pintarMosaicos();
    };
    track.onended = function () {
      if (pantallaPistaPorId[id] === track.id) {
        delete flujosPantallaRemotos[id];
        delete pantallaPistaPorId[id];
        estadoPantalla = Fun.registrarPantalla(estadoPantalla, id, false);
      } else {
        estadoVideo = Fun.registrarVideo(estadoVideo, id, false);
      }
      pintarMosaicos();
    };
  }

  function crearConexion(id, iniciador) {
    if (paresVoz[id]) return paresVoz[id].pc;
    var pc = new RTCPeerConnection(STUN);
    paresVoz[id] = { pc: pc, el: null, iniciador: !!iniciador };
    if (flujoLocal) flujoLocal.getTracks().forEach(function (t) { pc.addTrack(t, flujoLocal); });
    // Si ya estoy compartiendo pantalla, el recién llegado también la recibe.
    if (pantallaActiva && pistaPantallaLocal && flujoPantallaLocal) pc.addTrack(pistaPantallaLocal, flujoPantallaLocal);
    pc.onicecandidate = function (e) { if (e.candidate) enviarRTC(id, 'ice', e.candidate); };
    pc.ontrack = function (e) {
      if (e.track.kind === 'video') {
        // El video remoto va a su mosaico (cámara o pantalla); el audio, a su altavoz oculto.
        registrarVideoRemoto(id, e.track, e.streams[0]);
        vigilarPistaVideoRemota(id, e.track);
        return;
      }
      var el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      el.srcObject = e.streams[0];
      $('#audios-voz').appendChild(el);
      paresVoz[id].el = el;
    };
    pc.onconnectionstatechange = function () {
      if (['failed', 'closed'].indexOf(pc.connectionState) !== -1) cerrarConexion(id);
    };
    if (iniciador) hacerOferta(id);
    return pc;
  }

  function hacerOferta(id) {
    var par = paresVoz[id];
    if (!par || !par.pc) return;
    par.pc.createOffer().then(function (oferta) { return par.pc.setLocalDescription(oferta); })
      .then(function () { enviarRTC(id, 'offer', par.pc.localDescription); })
      .catch(function () { /* se reintenta al próximo encuentro */ });
  }

  // Renegociación al cambiar las pistas de video: ofrece quien inició la
  // conexión; el otro pide la oferta por la misma señalización.
  function renegociar(id) {
    var par = paresVoz[id];
    if (!par) return;
    if (par.iniciador) hacerOferta(id);
    else enviarRTC(id, 'pedir-oferta', {});
  }

  function recibirRTC(p) {
    var pc = paresVoz[p.de] ? paresVoz[p.de].pc : null;
    if (p.tipo === 'offer') {
      pc = crearConexion(p.de, false);
      pc.setRemoteDescription(new RTCSessionDescription(p.datos))
        .then(function () { vaciarHielo(p.de, pc); return pc.createAnswer(); })
        .then(function (resp) { return pc.setLocalDescription(resp); })
        .then(function () { enviarRTC(p.de, 'answer', pc.localDescription); })
        .catch(function () { /* descripción inválida o choque de ofertas: se ignora */ });
    } else if (p.tipo === 'answer') {
      if (pc) pc.setRemoteDescription(new RTCSessionDescription(p.datos)).then(function () { vaciarHielo(p.de, pc); }).catch(function () {});
    } else if (p.tipo === 'pedir-oferta') {
      if (pc) hacerOferta(p.de);
    } else if (p.tipo === 'ice') {
      if (pc && pc.remoteDescription) pc.addIceCandidate(new RTCIceCandidate(p.datos)).catch(function () {});
      else { (hieloPendiente[p.de] = hieloPendiente[p.de] || []).push(p.datos); }
    }
  }

  function vaciarHielo(id, pc) {
    (hieloPendiente[id] || []).forEach(function (c) {
      pc.addIceCandidate(new RTCIceCandidate(c)).catch(function () {});
    });
    hieloPendiente[id] = [];
  }

  function cerrarConexion(id) {
    var par = paresVoz[id];
    if (!par) return;
    try { par.pc.close(); } catch (e) { /* ya estaba cerrada */ }
    if (par.el) par.el.remove();
    delete paresVoz[id];
    delete flujosRemotos[id];
    delete flujosPantallaRemotos[id];
    delete pantallaPistaPorId[id];
    delete videosPendientes[id];
    estadoVideo = Fun.registrarVideo(estadoVideo, id, false);
    estadoPantalla = Fun.registrarPantalla(estadoPantalla, id, false);
    pintarMosaicos();
  }

  function unirseVoz() {
    prepararCanalVoz();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#barra-voz').classList.remove('oculto');
      $('#voz-estado').textContent = 'Este navegador no deja usar el micrófono aquí. Prueba desde Safari/Chrome actualizado. 🎤';
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      flujoLocal = stream;
      enVoz = true;
      // v3.5 · Durante la llamada sí se ve la barra de controles, y el
      // botón 📞 de arriba queda rojo: tocarlo de nuevo cuelga.
      $('#barra-voz').classList.remove('oculto');
      var btnL = $('#btn-llamar');
      if (btnL) { btnL.classList.add('en-llamada'); btnL.title = 'Colgar'; }
      $('#voz-silenciar').classList.remove('oculto');
      $('#voz-camara').classList.remove('oculto');
      // Compartir pantalla SOLO si el navegador lo soporta (PC/Android).
      // En iPhone/iPad el botón no aparece nunca.
      if (Fun.pantallaSoportada()) $('#voz-pantalla').classList.remove('oculto');
      $('#voz-salir').classList.remove('oculto');
      canalVoz.track({ nombre: miPerfil.nombre });
      // Quien llega ofrece la llamada a los que ya están dentro.
      var presentes = canalVoz.presenceState();
      Object.keys(presentes).forEach(function (id) { if (id !== yo.id) crearConexion(id, true); });
      Fun.sonido('turno');
      dispararAvisoLlamada(); // push a los demás aparatos, una vez por sesión
      pintarEstadoVoz();
      pintarMosaicos();
    }).catch(function () {
      $('#barra-voz').classList.remove('oculto');
      $('#voz-estado').textContent = 'No se pudo usar el micrófono 🎤 Revisa el permiso (candado de la barra de direcciones → Micrófono → Permitir) y prueba otra vez.';
      Fun.sonido('error');
    });
  }

  function salirDeLaVoz() {
    if (!enVoz) return;
    apagarCamara(); // avisa y limpia el video antes de salir
    dejarDeCompartirPantalla(); // y la pantalla, si estaba compartiendo
    enVoz = false;
    mosaicoGrande = null; // v3.4.3: el escenario se suelta al colgar
    pushAvisoEnviado = false; // la próxima llamada vuelve a avisar
    Object.keys(paresVoz).forEach(cerrarConexion);
    if (flujoLocal) { flujoLocal.getTracks().forEach(function (t) { t.stop(); }); flujoLocal = null; }
    pistaVideoLocal = null; // v3.4.3: su pista ya se detuvo con el stream de arriba
    if (canalVoz) canalVoz.untrack();
    estadoVideo = {};
    estadoPantalla = {};
    flujosRemotos = {};
    flujosPantallaRemotos = {};
    pantallaPistaPorId = {};
    videosPendientes = {};
    // v3.5 · Al colgar, la barra de controles se esconde otra vez y el
    // 📞 de arriba vuelve a la normalidad.
    $('#barra-voz').classList.add('oculto');
    var btnL2 = $('#btn-llamar');
    if (btnL2) { btnL2.classList.remove('en-llamada'); btnL2.title = 'Llamar a la familia (voz y video)'; }
    $('#voz-silenciar').classList.add('oculto');
    $('#voz-camara').classList.add('oculto');
    $('#voz-cambiar-camara').classList.add('oculto');
    $('#voz-pantalla').classList.add('oculto');
    $('#voz-salir').classList.add('oculto');
    $('#franja-videos').classList.add('oculto');
    pintarEstadoVoz();
  }

  /* ------------------------- VIDEO (sobre la voz) ------------------------- */
  function avisarVideo(activo) {
    if (canalVoz) canalVoz.send({ type: 'broadcast', event: 'video', payload: { de: yo.id, activo: activo } });
  }

  function actualizarBotonesVideo() {
    $('#voz-camara').textContent = videoActivo ? '📷 Apagar cámara' : '📹 Activar cámara';
    $('#voz-cambiar-camara').classList.toggle('oculto', !videoActivo);
  }

  function alternarCamara() {
    if (!enVoz || !flujoLocal) return;
    if (videoActivo) { apagarCamara(); return; }
    // v3.4.3: si la pista de video ya existe (se apagó con enabled), se
    // REENCIENDE en el acto — sin pedir la cámara otra vez, sin
    // renegociar y sin tocar la pista de audio.
    if (pistaVideoLocal && pistaVideoLocal.readyState === 'live') {
      pistaVideoLocal.enabled = true;
      videoActivo = true;
      estadoVideo = Fun.registrarVideo(estadoVideo, yo.id, true);
      avisarVideo(true);
      actualizarBotonesVideo();
      pintarMosaicos();
      Fun.sonido('turno');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#voz-estado').textContent = 'Este navegador no deja usar la cámara aquí 📷 La voz sigue sin problema 🎙️';
      $('#voz-camara').classList.add('oculto');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: caraCamara }, audio: false }).then(function (flujoVideo) {
      var pista = flujoVideo.getVideoTracks()[0];
      if (!pista) throw new Error('sin-camara');
      pista.enabled = true;
      pistaVideoLocal = pista;
      flujoLocal.addTrack(pista);
      videoActivo = true;
      Object.keys(paresVoz).forEach(function (id) {
        paresVoz[id].pc.addTrack(pista, flujoLocal);
        renegociar(id);
      });
      estadoVideo = Fun.registrarVideo(estadoVideo, yo.id, true);
      avisarVideo(true);
      actualizarBotonesVideo();
      pintarMosaicos();
      Fun.sonido('turno');
    }).catch(function () {
      // Permiso denegado o sin cámara: mensaje claro, el botón se esconde
      // y LA VOZ NO SE TOCA.
      $('#voz-estado').textContent = 'Sin cámara por ahora 📷 (permiso denegado o el aparato no tiene). Tu voz sigue perfecta 🎙️';
      $('#voz-camara').classList.add('oculto');
      Fun.sonido('error');
    });
  }

  function apagarCamara() {
    if (!videoActivo) return;
    /* v3.4.3 · MICRÓFONO INDEPENDIENTE DE LA CÁMARA (reporte del dueño
       en plena llamada: «no podemos hablar si la cámara está
       apagada»). La cámara se apaga SOLO con enabled=false sobre SU
       pista: no se detiene (stop), no se quita de los pares
       (removeTrack) y no se renegocia nada. El camino anterior hacía
       las tres cosas y volvía a pedir la cámara al encenderla; en los
       teléfonos ese ciclo dejaba la sesión de captura tocada y la voz
       se perdía. La pista de AUDIO no se nombra en esta función: no
       es asunto de la cámara. La pista de video solo se detiene de
       verdad al COLGAR (salirDeLaVoz detiene todas las del stream). */
    if (pistaVideoLocal) pistaVideoLocal.enabled = false;
    videoActivo = false;
    estadoVideo = Fun.registrarVideo(estadoVideo, yo.id, false);
    avisarVideo(false); // los demás vuelven a ver mi avatar
    actualizarBotonesVideo();
    pintarMosaicos();
  }

  function cambiarCamara() {
    if (!videoActivo || !pistaVideoLocal || !navigator.mediaDevices) return;
    caraCamara = caraCamara === 'user' ? 'environment' : 'user';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: caraCamara }, audio: false }).then(function (flujoVideo) {
      var nueva = flujoVideo.getVideoTracks()[0];
      if (!nueva) throw new Error('sin-camara');
      var vieja = pistaVideoLocal;
      var cambios = Object.keys(paresVoz).map(function (id) {
        var sender = paresVoz[id].pc.getSenders().filter(function (s) { return s.track === vieja; })[0];
        return sender ? sender.replaceTrack(nueva) : Promise.resolve();
      });
      return Promise.all(cambios).then(function () {
        nueva.enabled = true; // v3.4.3: el cambio es de video por video (replaceTrack); el audio ni se entera
        if (flujoLocal) { flujoLocal.removeTrack(vieja); flujoLocal.addTrack(nueva); }
        try { vieja.stop(); } catch (e) { /* ya parada */ }
        pistaVideoLocal = nueva;
        pintarMosaicos(); // la vista previa se reengancha a la pista nueva
        Fun.sonido('pop');
      });
    }).catch(function () {
      $('#voz-estado').textContent = 'Esa otra cámara no quiso colaborar 😅 Seguimos con la de siempre.';
    });
  }

  /* --------------------- COMPARTIR PANTALLA --------------------- */
  // La pantalla viaja como UNA pista de video más por la misma malla, pero
  // con su propio MediaStream: así el receptor la distingue de la cámara.
  // La señalización «pantalla» anuncia quién comparte y el id de su pista.
  function avisarPantalla(activa) {
    if (canalVoz) canalVoz.send({ type: 'broadcast', event: 'pantalla', payload: { de: yo.id, activo: activa, pista: activa && pistaPantallaLocal ? pistaPantallaLocal.id : null } });
  }
  function actualizarBotonPantalla() {
    $('#voz-pantalla').textContent = pantallaActiva ? '🛑 Dejar de compartir' : '🖥️ Compartir pantalla';
  }
  function alternarPantalla() {
    if (pantallaActiva) dejarDeCompartirPantalla();
    else compartirPantalla();
  }
  function compartirPantalla() {
    if (!enVoz) return;
    if (!Fun.pantallaSoportada()) return; // sin getDisplayMedia no hay botón; esto es el cinturón extra
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).then(function (flujo) {
      var pista = flujo.getVideoTracks()[0];
      if (!pista) throw new Error('sin-pantalla');
      pistaPantallaLocal = pista;
      flujoPantallaLocal = flujo;
      pantallaActiva = true;
      // Si el sistema corta la captura (su propio botón «Dejar de compartir»), se apaga solo.
      pista.onended = function () { dejarDeCompartirPantalla(); };
      Object.keys(paresVoz).forEach(function (id) {
        paresVoz[id].pc.addTrack(pista, flujo);
        renegociar(id);
      });
      estadoPantalla = Fun.registrarPantalla(estadoPantalla, yo.id, true);
      avisarPantalla(true);
      actualizarBotonPantalla();
      pintarMosaicos();
      Fun.sonido('turno');
    }).catch(function () {
      // Canceló el selector del sistema o no dio permiso: la voz sigue intacta.
      $('#voz-estado').textContent = 'No se compartió la pantalla 🖥️ Tu voz sigue perfecta 🎙️';
    });
  }
  function dejarDeCompartirPantalla() {
    if (!pantallaActiva) return;
    pantallaActiva = false;
    if (pistaPantallaLocal) {
      Object.keys(paresVoz).forEach(function (id) {
        var pc = paresVoz[id].pc;
        pc.getSenders().forEach(function (s) {
          if (s.track === pistaPantallaLocal) { pc.removeTrack(s); renegociar(id); }
        });
      });
      try { pistaPantallaLocal.stop(); } catch (e) { /* ya parada */ }
      pistaPantallaLocal = null;
    }
    flujoPantallaLocal = null;
    estadoPantalla = Fun.registrarPantalla(estadoPantalla, yo.id, false);
    avisarPantalla(false);
    actualizarBotonPantalla();
    pintarMosaicos();
  }

  // Mosaicos: una miniatura por participante. Con cámara = su video;
  // sin cámara = su avatar. Mi vista previa va en espejo, como un espejito.
  function pintarMosaicos() {
    var franja = $('#franja-videos');
    var cont = $('#videos-mosaicos');
    if (!franja || !cont) return;
    if (!enVoz) { franja.classList.add('oculto'); return; }
    franja.classList.remove('oculto');
    cont.innerHTML = '';
    var mosaicoGrandeSigue = false; // ¿el recuadro en grande sigue presente?
    var ids = [yo.id].concat(Object.keys(paresVoz));
    // Incluye también a quienes están en presencia aunque su conexión siga naciendo.
    if (canalVoz) {
      Object.keys(canalVoz.presenceState()).forEach(function (id) {
        if (ids.indexOf(id) === -1) ids.push(id);
      });
    }
    ids.forEach(function (id) {
      var esLocal = id === yo.id;
      var caja = document.createElement('div');
      caja.className = 'mosaico-video' + (mosaicoGrande === id ? ' mosaico-grande' : '');
      caja.dataset.clave = id; // v3.4.3: tocar el recuadro lo pone en grande
      if (mosaicoGrande === id) mosaicoGrandeSigue = true;
      if (Fun.tieneVideo(estadoVideo, id) && (esLocal ? flujoLocal : flujosRemotos[id])) {
        var v = document.createElement('video');
        v.autoplay = true;
        v.setAttribute('playsinline', '');
        v.muted = esLocal;
        if (esLocal) v.className = 'espejo';
        v.srcObject = esLocal ? flujoLocal : flujosRemotos[id];
        caja.appendChild(v);
      } else {
        var av = document.createElement('span');
        av.className = 'avatar-grande';
        av.textContent = emojiDe(id);
        caja.appendChild(av);
      }
      var nom = document.createElement('span');
      nom.className = 'mosaico-nombre';
      nom.textContent = esLocal ? 'Tú' : nombreDe(id);
      caja.appendChild(nom);
      cont.appendChild(caja);
    });
    // Mosaicos de pantalla compartida (uno por participante que comparte).
    Fun.participantesConPantalla(estadoPantalla).forEach(function (id) {
      var esLocalP = id === yo.id;
      var flujoP = esLocalP ? flujoPantallaLocal : flujosPantallaRemotos[id];
      var cajaP = document.createElement('div');
      cajaP.className = 'mosaico-video mosaico-pantalla' + (mosaicoGrande === 'pantalla:' + id ? ' mosaico-grande' : '');
      cajaP.dataset.clave = 'pantalla:' + id; // v3.4.3: también se puede poner en grande
      if (mosaicoGrande === 'pantalla:' + id) mosaicoGrandeSigue = true;
      if (flujoP) {
        var vp = document.createElement('video');
        vp.autoplay = true;
        vp.setAttribute('playsinline', '');
        vp.muted = esLocalP;
        vp.srcObject = flujoP;
        cajaP.appendChild(vp);
      } else {
        var avP = document.createElement('span');
        avP.className = 'avatar-grande';
        avP.textContent = '🖥️';
        cajaP.appendChild(avP);
      }
      var nomP = document.createElement('span');
      nomP.className = 'mosaico-nombre';
      nomP.textContent = '🖥️ Pantalla de ' + (esLocalP ? 'ti' : nombreDe(id));
      cajaP.appendChild(nomP);
      cont.appendChild(cajaP);
    });
    // v3.4.3: si el recuadro en grande ya no está (esa persona salió o
    // dejó de compartir), el escenario se suelta solo; si sigue, la
    // franja entra en modo escenario (el grande manda, los demás en
    // fila debajo). La llamada NO se toca: es solo cómo se pinta.
    if (mosaicoGrande && !mosaicoGrandeSigue) mosaicoGrande = null;
    cont.classList.toggle('con-escenario', !!mosaicoGrande);
  }

  // v3.4.3 · CÁMARA GRANDE: tocar un recuadro lo pone en el escenario;
  // tocarlo otra vez (u otro recuadro) vuelve a la rejilla o cambia el
  // protagonista. Delegado: los mosaicos se repintan a cada cambio y
  // el oyente sobrevive a todos los repintados.
  $('#videos-mosaicos').addEventListener('click', function (ev) {
    var caja = (ev.target && ev.target.closest) ? ev.target.closest('.mosaico-video') : null;
    if (!caja || !caja.dataset.clave) return;
    mosaicoGrande = (mosaicoGrande === caja.dataset.clave) ? null : caja.dataset.clave;
    pintarMosaicos();
  });

  // v3.5 · El 📞 de la barra de arriba es la puerta de la voz: sin
  // llamada une; en llamada, cuelga.
  $('#btn-llamar').addEventListener('click', function () {
    if (enVoz) salirDeLaVoz();
    else unirseVoz();
  });
  $('#voz-salir').addEventListener('click', salirDeLaVoz);
  $('#voz-camara').addEventListener('click', alternarCamara);
  $('#voz-pantalla').addEventListener('click', alternarPantalla);
  $('#voz-cambiar-camara').addEventListener('click', cambiarCamara);
  $('#videos-plegar').addEventListener('click', function () {
    var franja = $('#franja-videos');
    var plegada = franja.classList.toggle('plegada');
    $('#videos-plegar').textContent = plegada ? '➕ Mostrar' : '➖ Ocultar';
  });
  $('#voz-silenciar').addEventListener('click', function () {
    if (!flujoLocal) return;
    var pista = flujoLocal.getAudioTracks()[0];
    if (!pista) return;
    pista.enabled = !pista.enabled;
    $('#voz-silenciar').textContent = pista.enabled ? '🔇 Silenciarme' : '🎙️ Activar mi voz';
  });

  // La voz necesita su canal listo desde que se entra a la app.
  var entrarBase = entrar;
  entrar = function () { entrarBase(); prepararCanalVoz(); };

  iniciar();
})();

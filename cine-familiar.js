/* =====================================================================
   cine-familiar.js — Cine familiar 🎬 (Nuestro Rincón, v3.7.6)
   ---------------------------------------------------------------------
   Función ADITIVA y autocontenida, con el mismo patrón que skins.js:
   no crea cliente de Supabase nuevo ni toca la sesión; habla con el
   REST de Supabase usando el token que la app ya guarda, y app.js
   solo recibió una guarda mínima: si el video_id de la fila trae
   prefijo con «:» no es de YouTube y el reproductor de YouTube se
   aparca (lo atiende este módulo).

   QUÉ TRAE (todo dentro de la pestaña «Ver y escuchar»):
   1) «🎬 Películas de la familia»: el catálogo del servidor propio
      (cine.eternityplatform.com, tras Caddy en el VPS). Las películas
      se suben una vez desde la página /subir de ese servidor y se ven
      en un <video> AQUÍ DENTRO, con la MISMA sincronía dura del cine
      de YouTube (v3.6): fila estado_reproduccion como verdad
      compartida + extrapolación por reloj + corrección de deriva
      (FamilyLogic) + rescate del aparato que se queda atrás.
      El video_id de la fila para una película del servidor es
      «peli:<id>»; el enlace firmado de streaming (6 h) lo entrega la
      API del servidor solo a quien tiene sesión de la familia.
   2) «🔗 Pegar enlace»: detecta el tipo y lo reproduce DENTRO
      siempre que la fuente lo permita:
      · YouTube → se escribe la fila normal y manda el motor de
        YouTube de app.js, como siempre.
      · Archivo de video directo (.mp4/.webm/.mov/.m4v) → <video>
        aquí dentro con el mismo motor de sincronía («peli:url:…»).
      · Google Drive → iframe con su reproductor /preview dentro de
        la capa y cuenta regresiva compartida para darle play a la
        vez (Drive no expone control: no fingimos sincronía fina).
      · Otra página web → iframe dentro; debajo queda SIEMPRE el
        aviso honesto con el botón «Abrir para todos» por si la
        página se niega a verse dentro (queda en blanco).
   La encuesta de la fila es cada 2 s (el mismo latido conceptual
   que mantenimientoSync): sin websockets nuevos, sin tocar la
   sesión, y si la red falla, se reintenta en silencio.

   API pública (también para las pruebas):
     window.NRCineFamiliar.clasificarEnlace(texto)
     window.NRCineFamiliar.fuenteDesdeVideoId(videoId)
   ===================================================================== */
(function () {
  'use strict';

  var CINE_BASE = 'https://cine.eternityplatform.com';
  var REF_SUPABASE = (function () {
    var u = (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) || '';
    var m = /https:\/\/([^.]+)\./.exec(u);
    return m ? m[1] : '';
  })();

  /* ------------------------- sesión (solo lectura) ------------------------- */
  function datosSesion() {
    try {
      var crudo = localStorage.getItem('sb-' + REF_SUPABASE + '-auth-token');
      if (!crudo) return null;
      return JSON.parse(crudo);
    } catch (e) { return null; }
  }
  function miUid() {
    var d = datosSesion();
    return (d && d.user && d.user.id) || null;
  }
  function tokenActual() {
    var d = datosSesion();
    return (d && d.access_token) || null;
  }
  function cfgSupa() {
    var c = window.APP_CONFIG || {};
    return (c.SUPABASE_URL && c.SUPABASE_ANON_KEY) ? c : null;
  }
  function cabecerasRest(conCuerpo) {
    var cfg = cfgSupa();
    var h = {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + tokenActual()
    };
    if (conCuerpo) {
      h['Content-Type'] = 'application/json';
      h.Prefer = 'return=minimal';
    }
    return h;
  }

  /* ------------------------- utilidades ------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function porId(id) { return document.getElementById(id); }
  function nonceNuevo() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function fmtDuracion(seg) {
    if (!seg && seg !== 0) return '';
    var h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
    return h ? (h + ' h ' + m + ' min') : (m + ' min');
  }
  function fmtTamano(b) {
    if (!b && b !== 0) return '';
    if (b >= 1073741824) return (Math.round(b / 10737418.24) / 100) + ' GB';
    return Math.round(b / 104857.6) / 10 + ' MB';
  }

  /* ------------------- clasificador de enlaces (puro) ------------------- */
  function clasificarEnlace(texto) {
    var t = String(texto || '').trim();
    if (!t) return null;
    if (window.Fun && Fun.idVideoYouTube) {
      var yt = Fun.idVideoYouTube(t);
      if (yt) return { tipo: 'youtube', videoId: yt };
    }
    var md = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)|docs\.google\.com\/file\/d\/)([A-Za-z0-9_-]{10,})/.exec(t);
    if (md) return { tipo: 'drive', id: md[1] };
    if (/^https?:\/\/\S+$/i.test(t)) {
      var sinQuery = t.split(/[?#]/)[0];
      if (/\.(mp4|webm|mov|m4v)$/i.test(sinQuery)) return { tipo: 'archivo', url: t };
      return { tipo: 'web', url: t };
    }
    return null;
  }

  /* La fuente que describe el video_id de la fila, si es de este módulo. */
  function fuenteDesdeVideoId(videoId) {
    if (!videoId || typeof videoId !== 'string') return null;
    if (videoId.indexOf('peli:url:') === 0) {
      var url = videoId.slice('peli:url:'.length);
      try { url = decodeURIComponent(url); } catch (e) { /* queda tal cual */ }
      return { modo: 'video', url: url, esRemota: true };
    }
    if (videoId.indexOf('peli:') === 0) return { modo: 'video', servidorId: videoId.slice(5), esRemota: false };
    if (videoId.indexOf('drive:') === 0) return { modo: 'drive', id: videoId.slice(6) };
    if (videoId.indexOf('web:') === 0) {
      var u2 = videoId.slice(4);
      try { u2 = decodeURIComponent(u2); } catch (e) { /* queda tal cual */ }
      return { modo: 'web', url: u2 };
    }
    return null;
  }

  /* ------------------------- la fila compartida ------------------------- */
  var ultimaFila = null;
  function leerFila() {
    var cfg = cfgSupa();
    if (!cfg || !tokenActual() || typeof fetch !== 'function') return Promise.resolve(null);
    return fetch(cfg.SUPABASE_URL + '/rest/v1/estado_reproduccion?id=eq.1&select=*', {
      headers: cabecerasRest(false)
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (filas) {
        var fila = (filas && filas[0]) || null;
        if (fila) ultimaFila = fila;
        return fila;
      }).catch(function () { return null; });
  }
  function escribirFila(campos) {
    var cfg = cfgSupa();
    if (!cfg || !tokenActual() || typeof fetch !== 'function') return Promise.resolve(false);
    // actualizado_en lo pone QUIEN escribe con su reloj, igual que los
    // mensajes broadcast de v3.6: los demás estiman el desfase con la
    // muestra mayor y extrapolan contra ese reloj (no hay trigger en
    // la tabla; el default now() solo actúa al insertar).
    var datos = Object.assign({}, campos, {
      actualizado_en: new Date().toISOString(),
      actualizado_por: miUid()
    });
    return fetch(cfg.SUPABASE_URL + '/rest/v1/estado_reproduccion?id=eq.1', {
      method: 'PATCH',
      headers: cabecerasRest(true),
      body: JSON.stringify(datos)
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  /* ------------------------- estado del módulo ------------------------- */
  var construido = false;
  var video = null, marcoIframe = null, videoEl = null;
  var claveActual = null;        // video_id + '|' + nonce de lo que suena
  var fuenteActual = null;       // fuente parseada de lo que suena
  var soyControlador = false;
  var desfase = 0;               // ms del reloj de quien escribe vs. el mío
  var ticks = 0;
  var atascadoTicks = 0;
  var cuentaHastaLocal = 0;      // cuenta regresiva (drive): fin en hora LOCAL de este aparato
  var cuentaTimer = null;
  var reintentoStreamHecho = false;
  var prog = { play: 0, pause: 0, seek: 0 }; // eventos programáticos por consumir
  var catalogo = [];
  var mapaStream = {};           // id del servidor -> URL firmada absoluta
  var L = window.FamilyLogic || null;

  function anotarDesfase(iso) {
    if (!iso) return;
    var muestra = Date.parse(iso) - Date.now();
    if (isNaN(muestra)) return;
    if (muestra > desfase || desfase - muestra > 10000) desfase = muestra;
  }
  function ahoraRemoto() { return Date.now() + desfase; }

  /* ------------------------- construcción del DOM ------------------------- */
  function construir() {
    if (construido) return;
    var sec = porId('sec-cine');
    if (!sec) return;
    construido = true;

    var card = document.createElement('div');
    card.className = 'tarjeta';
    card.id = 'cf-tarjeta';
    card.innerHTML =
      '<h2>🎬 Películas de la familia</h2>' +
      '<p class="subtitulo">Películas guardadas en el servidor de la familia: se suben una vez y se ven aquí dentro, juntos, cada quien en su aparato — si pausas tú, se pausa en todos. 💛</p>' +
      '<div id="cf-escenario" class="oculto">' +
        '<div class="reproductor-marco cf-marco">' +
          '<video id="cf-video" class="oculto" playsinline controls preload="metadata"></video>' +
          '<iframe id="cf-iframe" class="oculto" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen title="Contenido compartido"></iframe>' +
          '<div id="cf-cuenta" class="cf-cuenta oculto"></div>' +
          '<button id="cf-toca" class="cine-toca oculto" type="button">🔊 Toca para escuchar</button>' +
        '</div>' +
        '<p id="cf-ahora" class="cf-ahora"></p>' +
        '<div id="cf-ayuda" class="aviso oculto" style="margin-top:10px"></div>' +
        '<div class="controles-cine">' +
          '<button class="btn-verde" id="cf-play" type="button">▶️ Reproducir para todos</button>' +
          '<button class="btn-suave" id="cf-pause" type="button">⏸️ Pausa para todos</button>' +
          '<button class="btn-suave" id="cf-quitar" type="button">⏹️ Quitar para todos</button>' +
        '</div>' +
      '</div>' +
      '<div id="cf-catalogo"><p class="subtitulo">Cargando la cartelera… 🍿</p></div>' +
      '<p style="margin-top:14px"><a class="btn-principal cf-btn-subir" href="' + CINE_BASE + '/subir" target="_blank" rel="noopener">⬆️ Subir una película</a></p>' +
      '<p class="subtitulo">La subida se hace una sola vez desde esa página (entras con tu cuenta del rincón); la película queda en el servidor de la familia, sin el tope de 50 MB de los archivos del chat.</p>' +
      '<h3 style="margin-top:20px">🔗 Pegar enlace: verlo aquí dentro</h3>' +
      '<p class="subtitulo">Pega el enlace de un video y lo ponemos para todos SIN salir de la app: YouTube va al reproductor de arriba; un archivo de video (.mp4, .webm, .mov) suena aquí mismo con la sincronía de la casa; un video de Google Drive se abre aquí dentro con cuenta regresiva para darle play a la vez; otra página se intenta ver aquí dentro y, si ella se niega, te avisamos y queda el «Abrir para todos» de siempre.</p>' +
      '<form class="buscador" id="cf-form-enlace">' +
        '<input type="text" inputmode="url" id="cf-enlace" placeholder="Pega el enlace aquí… 🔗" aria-label="Enlace para ver juntos aquí dentro">' +
        '<button type="submit" class="btn-principal">Poner para todos 💌</button>' +
      '</form>' +
      '<div id="cf-aviso" class="aviso oculto" style="margin-top:10px"></div>';

    var tarjetas = sec.querySelectorAll('.tarjeta');
    var ultima = tarjetas[tarjetas.length - 1]; // la de «Más apps»: la nuestra va antes
    if (ultima && ultima.parentNode === sec) sec.insertBefore(card, ultima);
    else sec.appendChild(card);

    videoEl = porId('cf-video');
    marcoIframe = porId('cf-iframe');
    enlazarEventosVideo();
    porId('cf-play').addEventListener('click', function () { controlGrupo(true); });
    porId('cf-pause').addEventListener('click', function () { controlGrupo(false); });
    porId('cf-quitar').addEventListener('click', quitarParaTodos);
    porId('cf-toca').addEventListener('click', function () {
      if (!videoEl) return;
      try { videoEl.muted = false; videoEl.volume = 1; var p = videoEl.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* queda el intento */ }
      ocultarTocaCF();
    });
    porId('cf-form-enlace').addEventListener('submit', compartirEnlace);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) leerFila().then(function (f) { if (f) aplicarFila(f); });
    });

    cargarCatalogo();
    setInterval(ciclo, 2000);
    ciclo();
  }

  /* ------------------------- catálogo del servidor ------------------------- */
  function cargarCatalogo() {
    if (!tokenActual() || typeof fetch !== 'function') return Promise.resolve(false);
    return fetch(CINE_BASE + '/api/peliculas', {
      headers: { Authorization: 'Bearer ' + tokenActual() }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (datos) {
        if (!datos || !datos.peliculas) return false;
        catalogo = datos.peliculas;
        mapaStream = {};
        catalogo.forEach(function (p) { if (p.stream) mapaStream[p.id] = CINE_BASE + p.stream; });
        pintarCatalogo();
        return true;
      }).catch(function () { return false; });
  }
  function pintarCatalogo() {
    var caja = porId('cf-catalogo');
    if (!caja) return;
    if (!catalogo.length) {
      caja.innerHTML = '<p class="subtitulo">Todavía no hay películas en el servidor. Sube la primera con el botón de abajo. 🍿</p>';
      return;
    }
    caja.innerHTML = '';
    catalogo.forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'cf-peli';
      var meta = [fmtDuracion(p.duracion), fmtTamano(p.tamano)].filter(Boolean).join(' · ');
      if (p.estado === 'lista') {
        div.innerHTML = '<span class="cf-peli-tit">🎬 <strong></strong>' + (meta ? '<br><span class="subtitulo">' + esc(meta) + '</span>' : '') + '</span>';
        div.querySelector('strong').textContent = p.titulo;
        var btn = document.createElement('button');
        btn.className = 'btn-principal btn-chico';
        btn.type = 'button';
        btn.textContent = '▶️ Para todos';
        btn.addEventListener('click', function () { ponerPelicula(p); });
        div.appendChild(btn);
      } else if (p.estado === 'convirtiendo' || p.estado === 'procesando') {
        div.innerHTML = '<span class="cf-peli-tit">⏳ <strong></strong><br><span class="subtitulo">Preparándose para el iPad… vuelve en unos minutos.</span></span>';
        div.querySelector('strong').textContent = p.titulo;
      } else {
        div.innerHTML = '<span class="cf-peli-tit">⚠️ <strong></strong><br><span class="subtitulo">Este formato no se puede ver en el iPad. Súbela en MP4 y listo.</span></span>';
        div.querySelector('strong').textContent = p.titulo;
      }
      caja.appendChild(div);
    });
  }

  /* ------------------------- poner cosas para todos ------------------------- */
  function aplicarLocal(campos) {
    var fila = Object.assign({}, ultimaFila || {}, campos, {
      actualizado_en: new Date().toISOString(),
      actualizado_por: miUid()
    });
    ultimaFila = fila;
    aplicarFila(fila);
  }
  function ponerPelicula(p) {
    soyControlador = true;
    desfase = 0;
    var campos = {
      video_id: 'peli:' + p.id, titulo: p.titulo,
      reproduciendo: true, posicion: 0, nonce: nonceNuevo()
    };
    escribirFila(campos);
    aplicarLocal(campos);
    if (window.Fun && Fun.sonido) Fun.sonido('turno');
  }
  function compartirEnlace(e) {
    e.preventDefault();
    var input = porId('cf-enlace');
    var aviso = porId('cf-aviso');
    var texto = (input.value || '').trim();
    if (!texto) return;
    var c = clasificarEnlace(texto);
    if (!c) {
      aviso.textContent = 'Mmm… eso no parece un enlace. 🙈 Copia el enlace desde la otra app (Compartir → Copiar enlace) y pégalo aquí.';
      aviso.classList.remove('oculto');
      if (window.Fun && Fun.sonido) Fun.sonido('error');
      return;
    }
    var campos = null;
    if (c.tipo === 'youtube') {
      campos = { video_id: c.videoId, titulo: 'Video de YouTube 🎬', reproduciendo: true, posicion: 0, nonce: nonceNuevo() };
      notaEnlace('🎬 ¡Puesto en el reproductor de YouTube de arriba, para todos!');
    } else if (c.tipo === 'archivo') {
      soyControlador = true;
      campos = { video_id: 'peli:url:' + encodeURIComponent(c.url), titulo: 'Video del enlace 🔗', reproduciendo: true, posicion: 0, nonce: nonceNuevo() };
      notaEnlace('🎬 ¡Sonando aquí mismo, en el Cine familiar, para todos!');
    } else if (c.tipo === 'drive') {
      soyControlador = true;
      campos = { video_id: 'drive:' + c.id, titulo: 'Video de Google Drive 📁', reproduciendo: true, posicion: 0, nonce: nonceNuevo() };
      notaEnlace('📁 ¡Video de Drive abierto aquí dentro para todos! Cuando la cuenta llegue a 0, cada quien toca ▶️ en el video.');
    } else if (c.tipo === 'web') {
      soyControlador = true;
      campos = { video_id: 'web:' + encodeURIComponent(c.url), titulo: 'Página compartida 🌐', reproduciendo: true, posicion: 0, nonce: nonceNuevo() };
      notaEnlace('🌐 ¡Página abierta aquí dentro para todos! Si queda en blanco, ella no se deja: usa el botón «Abrir para todos» del aviso.');
    }
    if (campos) {
      escribirFila(campos);
      aplicarLocal(campos);
      input.value = '';
      if (window.Fun && Fun.sonido) Fun.sonido('turno');
    }
  }
  function notaEnlace(texto) {
    var aviso = porId('cf-aviso');
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.classList.remove('oculto');
  }

  /* ------------------------- el escenario ------------------------- */
  function mostrarEscenario() { var z = porId('cf-escenario'); if (z) z.classList.remove('oculto'); }
  function ocultarEscenario() {
    var z = porId('cf-escenario'); if (z) z.classList.add('oculto');
    detenerCuenta();
  }
  function mostrarTocaCF() { var b = porId('cf-toca'); if (b) b.classList.remove('oculto'); }
  function ocultarTocaCF() { var b = porId('cf-toca'); if (b) b.classList.add('oculto'); }
  function ponerAhora(texto) { var p = porId('cf-ahora'); if (p) p.textContent = texto; }
  function ponerAyuda(html, conAbrir, urlAbrir) {
    var a = porId('cf-ayuda');
    if (!a) return;
    if (!html) { a.classList.add('oculto'); a.innerHTML = ''; return; }
    a.innerHTML = html;
    if (conAbrir && urlAbrir) {
      var b = document.createElement('button');
      b.className = 'btn-suave btn-chico';
      b.type = 'button';
      b.style.marginLeft = '8px';
      b.textContent = '📺 Abrir para todos';
      b.addEventListener('click', function () { window.open(urlAbrir, '_blank'); });
      a.appendChild(b);
    }
    a.classList.remove('oculto');
  }
  function apagarMedios() {
    if (videoEl) {
      try { videoEl.pause(); } catch (e) { /* sin nada sonando */ }
      videoEl.removeAttribute('src');
      try { videoEl.load(); } catch (e) { /* nada que cargar */ }
      videoEl.classList.add('oculto');
    }
    if (marcoIframe) { marcoIframe.removeAttribute('src'); marcoIframe.classList.add('oculto'); }
    ocultarTocaCF();
    detenerCuenta();
    var c = porId('cf-cuenta'); if (c) c.classList.add('oculto');
  }
  function detenerTodoLocal() {
    claveActual = null;
    fuenteActual = null;
    soyControlador = false;
    atascadoTicks = 0;
    apagarMedios();
    ocultarEscenario();
  }

  /* ------------------------- cargar cada tipo de fuente ------------------------- */
  function cargarFuente(fuente, fila) {
    fuenteActual = fuente;
    reintentoStreamHecho = false;
    mostrarEscenario();
    apagarMedios();
    var titulo = fila.titulo || 'Algo para ver juntos';
    if (fuente.modo === 'video') {
      var url = fuente.url || null;
      if (!url && fuente.servidorId) url = mapaStream[fuente.servidorId] || null;
      if (!url && fuente.servidorId) {
        // El enlace firmado aún no llegó con el catálogo: pedirlo y reintentar.
        ponerAhora('🎬 ' + titulo + ' — preparando el video…');
        cargarCatalogo().then(function () {
          if (fuenteActual && fuenteActual.servidorId === fuente.servidorId) cargarFuente(fuente, fila);
        });
        return;
      }
      if (!url) { ponerAyuda('Ese video no se encontró en el servidor. 🙈', false); return; }
      ponerAhora('🎬 ' + titulo + ' — se ve en todos los aparatos a la vez 💛');
      ponerAyuda('', false);
      videoEl.src = url;
      videoEl.classList.remove('oculto');
      var pos = L ? L.posicionRemota(
        { posicion: fila.posicion || 0, reproduciendo: !!fila.reproduciendo, enviadoEn: Date.parse(fila.actualizado_en || '') || Date.now() },
        ahoraRemoto()) : (fila.posicion || 0);
      var fijar = function () {
        try { videoEl.currentTime = Math.max(0, pos); } catch (e) { /* aún sin metadata */ }
        if (fila.reproduciendo) intentarReproducir();
      };
      if (videoEl.readyState >= 1) fijar();
      else videoEl.addEventListener('loadedmetadata', fijar, { once: true });
    } else if (fuente.modo === 'drive') {
      ponerAhora('📁 ' + titulo + ' — de Google Drive, aquí dentro');
      ponerAyuda('Cuando la cuenta llegue a <strong>0</strong>, cada quien toca ▶️ <strong>dentro del video</strong> en su aparato, y así empiezan a la vez. (Drive no deja controlar su reproductor desde fuera: la cuenta regresiva ES la sincronía.) Si el video pide permiso, su dueño debe compartirlo en Drive con «cualquier persona con el enlace».', false);
      marcoIframe.src = 'https://drive.google.com/file/d/' + encodeURIComponent(fuente.id) + '/preview';
      marcoIframe.classList.remove('oculto');
      iniciarCuenta();
    } else if (fuente.modo === 'web') {
      ponerAhora('🌐 ' + titulo + ' — aquí dentro');
      ponerAyuda('¿Se ve la página aquí arriba? Perfecto. 🎉 <strong>Si quedó en blanco</strong>, esa página no se deja ver dentro de otras apps (lo bloquea ella): con este botón cada quien la abre en su aparato, como siempre.', true, fuente.url);
      marcoIframe.src = fuente.url;
      marcoIframe.classList.remove('oculto');
    }
  }

  /* Cuenta regresiva compartida (Drive): empieza al VER la fuente en
     este aparato (~6 s para que todos se preparen). */
  function iniciarCuenta() {
    detenerCuenta();
    cuentaHastaLocal = Date.now() + 6000;
    var caja = porId('cf-cuenta');
    if (caja) { caja.classList.remove('oculto'); }
    cuentaTimer = setInterval(pintarCuenta, 200);
    pintarCuenta();
  }
  function pintarCuenta() {
    var caja = porId('cf-cuenta');
    if (!caja) { detenerCuenta(); return; }
    var queda = Math.ceil((cuentaHastaLocal - Date.now()) / 1000);
    if (queda > 0) { caja.textContent = String(queda); return; }
    caja.textContent = '¡Denle play! ▶️';
    detenerCuenta();
    setTimeout(function () { caja.classList.add('oculto'); }, 4000);
  }
  function detenerCuenta() {
    if (cuentaTimer) { clearInterval(cuentaTimer); cuentaTimer = null; }
  }

  /* ------------------------- motor de sincronía (video) ------------------------- */
  function intentarReproducir() {
    if (!videoEl) return;
    prog.play++;
    var p = videoEl.play();
    if (p && p.catch) p.catch(function () {
      prog.play = Math.max(0, prog.play - 1);
      // iOS no deja arrancar CON sonido sin un toque: arrancar en
      // silencio (eso sí lo deja) y ofrecer el botón grande.
      try {
        videoEl.muted = true;
        prog.play++;
        var p2 = videoEl.play();
        if (p2 && p2.catch) p2.catch(function () { prog.play = Math.max(0, prog.play - 1); });
      } catch (e) { /* queda el botón */ }
      mostrarTocaCF();
    });
  }
  function alinearVideo(fila) {
    if (!videoEl || !fuenteActual || fuenteActual.modo !== 'video' || !L) return;
    var msg = {
      posicion: fila.posicion || 0,
      reproduciendo: !!fila.reproduciendo,
      enviadoEn: Date.parse(fila.actualizado_en || '') || Date.now()
    };
    if (!msg.reproduciendo) {
      atascadoTicks = 0;
      if (!videoEl.paused) {
        prog.pause++;
        try { videoEl.pause(); } catch (e) { prog.pause = Math.max(0, prog.pause - 1); }
      }
      // En pausa, todos en el mismo fotograma.
      var destinoP = L.posicionRemota(msg, ahoraRemoto());
      if (videoEl.readyState >= 1 && Math.abs((videoEl.currentTime || 0) - destinoP) > 1.5) {
        prog.seek++;
        try { videoEl.currentTime = destinoP; } catch (e) { prog.seek = Math.max(0, prog.seek - 1); }
      }
      return;
    }
    if (!videoEl.paused && !videoEl.ended) {
      atascadoTicks = 0;
      var corr = L.correccionDeriva(videoEl.currentTime || 0, msg, ahoraRemoto());
      if (corr.accion === 'seek') {
        prog.seek++;
        try { videoEl.currentTime = corr.a; } catch (e) { prog.seek = Math.max(0, prog.seek - 1); }
      }
      return;
    }
    // El grupo suena y este aparato no (pausado o cargando): tras ~4 s
    // atascado, salta solo al punto del grupo y arranca (rescate v3.6).
    atascadoTicks++;
    if (atascadoTicks >= 2) {
      atascadoTicks = 0;
      var destino = L.posicionRemota(msg, ahoraRemoto());
      if (videoEl.readyState >= 1) {
        prog.seek++;
        try { videoEl.currentTime = destino; } catch (e) { prog.seek = Math.max(0, prog.seek - 1); }
      }
      intentarReproducir();
    }
  }
  function aplicarFila(fila) {
    if (!fila) return;
    ultimaFila = fila;
    anotarDesfase(fila.actualizado_en);
    var fuente = fuenteDesdeVideoId(fila.video_id);
    if (!fuente) { detenerTodoLocal(); return; }
    if (fila.actualizado_por && miUid() && fila.actualizado_por !== miUid()) soyControlador = false;
    var clave = fila.video_id + '|' + (fila.nonce || '');
    if (clave !== claveActual) {
      claveActual = clave;
      cargarFuente(fuente, fila);
      return;
    }
    if (fuente.modo === 'video') alinearVideo(fila);
  }
  function ciclo() {
    ticks++;
    if (!tokenActual()) return;
    leerFila().then(function (f) { if (f) aplicarFila(f); });
    // Latido del controlador: refresca la posición del grupo cada ~6 s.
    if (soyControlador && fuenteActual && fuenteActual.modo === 'video' && videoEl &&
        !videoEl.paused && !videoEl.ended && ticks % 3 === 0 && ultimaFila) {
      escribirFila({
        video_id: ultimaFila.video_id, titulo: ultimaFila.titulo,
        reproduciendo: true, posicion: videoEl.currentTime || 0, nonce: ultimaFila.nonce
      });
    }
    if (ticks % 30 === 0) cargarCatalogo();
  }

  /* Controles del grupo y eventos del <video>: quien toca, manda.
     Los eventos que dispara el propio módulo se marcan con el
     contador prog y no se re-anuncian. */
  function hacermeControlador(reproduciendo) {
    if (!ultimaFila || !fuenteActual || fuenteActual.modo !== 'video') return;
    soyControlador = true;
    desfase = 0;
    escribirFila({
      video_id: ultimaFila.video_id, titulo: ultimaFila.titulo,
      reproduciendo: reproduciendo, posicion: videoEl ? (videoEl.currentTime || 0) : 0,
      nonce: ultimaFila.nonce
    });
  }
  function controlGrupo(reproducir) {
    if (!fuenteActual || fuenteActual.modo !== 'video' || !videoEl) return;
    if (reproducir) { intentarReproducir(); } // el gesto local ayuda en iOS…
    else { prog.pause++; try { videoEl.pause(); } catch (e) { prog.pause = Math.max(0, prog.pause - 1); } }
    hacermeControlador(reproducir);           // …y el evento/fila manda a los demás
  }
  function quitarParaTodos() {
    if (!ultimaFila) return;
    var campos = { video_id: null, titulo: null, reproduciendo: false, posicion: 0, nonce: nonceNuevo() };
    escribirFila(campos);
    aplicarLocal(campos);
  }
  function enlazarEventosVideo() {
    if (!videoEl) return;
    videoEl.addEventListener('play', function () {
      if (prog.play > 0) { prog.play--; return; }
      if (!videoEl.muted) ocultarTocaCF();
      hacermeControlador(true);
    });
    videoEl.addEventListener('pause', function () {
      if (prog.pause > 0) { prog.pause--; return; }
      if (videoEl.ended) return;
      hacermeControlador(false);
    });
    videoEl.addEventListener('seeked', function () {
      if (prog.seek > 0) { prog.seek--; return; }
      hacermeControlador(!videoEl.paused);
    });
    videoEl.addEventListener('ended', function () {
      if (soyControlador && ultimaFila) {
        escribirFila({
          video_id: ultimaFila.video_id, titulo: ultimaFila.titulo,
          reproduciendo: false, posicion: 0, nonce: ultimaFila.nonce
        });
      }
    });
    videoEl.addEventListener('error', function () {
      if (!fuenteActual || fuenteActual.modo !== 'video') return;
      if (fuenteActual.servidorId && !reintentoStreamHecho) {
        // Puede ser el enlace firmado caducado: pedir otro y reintentar una vez.
        reintentoStreamHecho = true;
        var idBuscado = fuenteActual.servidorId;
        cargarCatalogo().then(function () {
          var nueva = mapaStream[idBuscado];
          if (nueva && videoEl && fuenteActual && fuenteActual.servidorId === idBuscado) videoEl.src = nueva;
        });
        return;
      }
      ponerAyuda('Ese video no se pudo reproducir aquí dentro. 🙈 Si es un enlace, puede que la página no lo deje sonar en otras apps.', !!fuenteActual.url, fuenteActual.url || null);
    });
  }

  /* ------------------------- arranque ------------------------- */
  window.NRCineFamiliar = {
    clasificarEnlace: clasificarEnlace,
    fuenteDesdeVideoId: fuenteDesdeVideoId
  };
  var intentos = 0;
  var espera = setInterval(function () {
    intentos++;
    if (tokenActual() && porId('sec-cine')) {
      clearInterval(espera);
      construir();
    } else if (intentos > 40) {
      clearInterval(espera); // sin sesión no hay cine familiar; la app sigue igual
    }
  }, 1500);
})();

/* =====================================================================
   skins.js — Skins de héroes para elegir 🦸 (Nuestro Rincón)
   ---------------------------------------------------------------------
   Función ADITIVA y autocontenida: no toca la lógica de partidas ni
   de juegos de app.js. Cada quien elige un héroe que lo representa
   (emoji + nombre + colores) y lo puede CAMBIAR cuando quiera, las
   veces que quiera: sin bloqueo, sin esperas y sin costo en puntos
   (requisito del dueño, 2026-11-07). El cambio surte efecto al
   instante, sin recargar la página.

   DÓNDE SE VE el skin (v3.7.4 — pedido de Rafiel: «Quiero que
   cambien el zorro»): el héroe REEMPLAZA al avatar de siempre
   (🦊/🌸/🦁) en los avatares de quien lo tenga elegido:
   - El círculo grande de su fila en la Sala («¿Quién anda por aquí?»).
   - Su chip de presencia de la cabecera.
   - Su avatar en la Tabla de campeones.
   - El chat: el emoji del héroe acompaña a su nombre (y MI burbuja
     se tiñe con los colores de mi héroe).
   - El botón «🦸 Mi héroe» de la cabecera (disco con el emoji y los
     colores). Ese botón vive SIEMPRE en la cabecera y abre el
     selector: así el skin se puede cambiar en cualquier momento.
   Además (2026-11-07): MI avatar es TOCABLE — el círculo de mi fila
   en la Sala, mi chip de la cabecera y mi fila de campeones abren el
   mismo selector («si presionamos nuestros animales podamos elegir
   cambiarlo»). El avatar de otro no abre nada. Y junto a mi nombre
   en la Sala sigue la insignia con el nombre del héroe.

   CÓMO SE GUARDA (v3.7.4): DOBLE — en este aparato (localStorage,
   clave por usuario nr-skin::<id> + copia genérica nr-skin) Y en el
   perfil de Supabase (columna perfiles.skin, que guarda el id del
   héroe): al elegir/cambiar/quitar se actualiza MI fila, y una
   sincronización (al abrir, al entrar, periódica y tras repintados)
   lee los skins de TODA la familia para pintar el avatar de cada
   quien en cada aparato: el skin VIAJA. Se habla con el REST de
   Supabase con el token de la sesión que la app ya guarda (no se
   crea cliente nuevo ni se toca la sesión). DEGRADACIÓN ELEGANTE:
   si la columna no existe o la lectura falla, todo sigue como en
   v3.7.3 (solo localStorage), sin errores visibles, y se reintenta
   en las siguientes sincronizaciones.

   API pública:
     window.NRSkins.catalogo()     -> copia del catálogo
     window.NRSkins.categorias()   -> copia de las categorías (v3.7.5)
     window.NRSkins.actual()       -> skin elegido o null
     window.NRSkins.elegir(id)     -> aplica y guarda al instante
     window.NRSkins.abrir()        -> abre el selector
     window.NRSkins.sincronizar()  -> relee perfiles.skin de la familia
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------- catálogo de héroes -------------------------
     v3.7.5 (pedido de Rafiel: «más skins, de Mario, Marvel, DC y de
     series famosas — como Doctor Strange y Spider-Man»): el catálogo
     crece a 34 y el selector se organiza por CATEGORÍAS. Todo sigue
     siendo SOLO emoji + nombre + paleta CSS: sin imágenes ni assets
     externos. Los 10 originales quedan en «Héroes». Colisiones de
     emoji resueltas: ⚡ es Capitán Rayo (Flash corre con 🏃), 🛡️ es
     el Guardián (Capitán América brilla con ⭐), 👸 es la Princesa
     Guerrera (Mujer Maravilla pelea con ⚔️ y Peach reina con 👑),
     🌟 es Súper Estrella, y Mario 🍄 se distingue de Toad 🍄✨ por
     el brillo, el nombre y los colores. */
  var CATEGORIAS = [
    { id: 'heroes', nombre: 'Héroes' },
    { id: 'mario',  nombre: 'Mario y amigos' },
    { id: 'marvel', nombre: 'Marvel' },
    { id: 'dc',     nombre: 'DC' },
    { id: 'series', nombre: 'Series famosas' }
  ];

  var CATALOGO = [
    /* Héroes (los 10 originales) */
    { id: 'rayo',     nombre: 'Capitán Rayo',      emoji: '⚡', colores: ['#ffb020', '#ff7847'], categoria: 'heroes' },
    { id: 'estrella', nombre: 'Súper Estrella',    emoji: '🌟', colores: ['#f368e0', '#feca57'], categoria: 'heroes' },
    { id: 'guardian', nombre: 'Héroe Guardián',    emoji: '🛡️', colores: ['#54a0ff', '#2e86de'], categoria: 'heroes' },
    { id: 'turbo',    nombre: 'Chica Turbo',       emoji: '🚀', colores: ['#ff6b81', '#a55eea'], categoria: 'heroes' },
    { id: 'leon',     nombre: 'Rey León',          emoji: '🦁', colores: ['#f39c12', '#d35400'], categoria: 'heroes' },
    { id: 'ninja',    nombre: 'Ninja Sombra',      emoji: '🥷', colores: ['#8395a7', '#222f3e'], categoria: 'heroes' },
    { id: 'princesa', nombre: 'Princesa Guerrera', emoji: '👸', colores: ['#fd79a8', '#e84393'], categoria: 'heroes' },
    { id: 'robot',    nombre: 'Robot Héroe',       emoji: '🤖', colores: ['#7ed6df', '#3dc1d3'], categoria: 'heroes' },
    { id: 'dragon',   nombre: 'Dragón Valiente',   emoji: '🐉', colores: ['#2ed573', '#1e90ff'], categoria: 'heroes' },
    { id: 'oceano',   nombre: 'Capitán Océano',    emoji: '🌊', colores: ['#00d2ff', '#3a7bd5'], categoria: 'heroes' },
    /* Mario y amigos */
    { id: 'mario',    nombre: 'Mario',             emoji: '🍄', colores: ['#e52521', '#049cd8'], categoria: 'mario' },
    { id: 'luigi',    nombre: 'Luigi',             emoji: '🧢', colores: ['#2fa84f', '#2456a6'], categoria: 'mario' },
    { id: 'peach',    nombre: 'Princesa Peach',    emoji: '👑', colores: ['#f78fb3', '#f5cd30'], categoria: 'mario' },
    { id: 'bowser',   nombre: 'Bowser',            emoji: '🐢', colores: ['#5da130', '#f5821f'], categoria: 'mario' },
    { id: 'yoshi',    nombre: 'Yoshi',             emoji: '🦖', colores: ['#7ac74f', '#f39c3c'], categoria: 'mario' },
    { id: 'toad',     nombre: 'Toad',              emoji: '🍄✨', colores: ['#f6e8e8', '#e52521'], categoria: 'mario' },
    /* Marvel */
    { id: 'spiderman',  nombre: 'Spider-Man',      emoji: '🕷️', colores: ['#d42a2a', '#1f3a93'], categoria: 'marvel' },
    { id: 'strange',    nombre: 'Doctor Strange',  emoji: '🔮', colores: ['#a31621', '#d4a017'], categoria: 'marvel' },
    { id: 'ironman',    nombre: 'Iron Man',        emoji: '🦾', colores: ['#b71313', '#f5a623'], categoria: 'marvel' },
    { id: 'hulk',       nombre: 'Hulk',            emoji: '💚', colores: ['#3fa34d', '#14532d'], categoria: 'marvel' },
    { id: 'thor',       nombre: 'Thor',            emoji: '🔨', colores: ['#2e5aa8', '#9fb6c9'], categoria: 'marvel' },
    { id: 'panther',    nombre: 'Black Panther',   emoji: '🐾', colores: ['#241f31', '#7b2d8b'], categoria: 'marvel' },
    { id: 'capamerica', nombre: 'Capitán América', emoji: '⭐', colores: ['#1f4e9c', '#d43a2f'], categoria: 'marvel' },
    /* DC */
    { id: 'batman',     nombre: 'Batman',          emoji: '🦇', colores: ['#23272e', '#f5c518'], categoria: 'dc' },
    { id: 'superman',   nombre: 'Superman',        emoji: '💙', colores: ['#1e5aa8', '#e23636'], categoria: 'dc' },
    { id: 'maravilla',  nombre: 'Mujer Maravilla', emoji: '⚔️', colores: ['#c8102e', '#f2a900'], categoria: 'dc' },
    { id: 'flash',      nombre: 'Flash',           emoji: '🏃', colores: ['#d42a1e', '#f7c948'], categoria: 'dc' },
    { id: 'aquaman',    nombre: 'Aquaman',         emoji: '🔱', colores: ['#1e7a5a', '#f2a900'], categoria: 'dc' },
    /* Series famosas */
    { id: 'goku',       nombre: 'Goku',            emoji: '🥋', colores: ['#f57c00', '#1e5aa8'], categoria: 'series' },
    { id: 'naruto',     nombre: 'Naruto',          emoji: '🍥', colores: ['#f5821f', '#23272e'], categoria: 'series' },
    { id: 'pikachu',    nombre: 'Pikachu',         emoji: '🐹', colores: ['#ffcb05', '#f5a623'], categoria: 'series' },
    { id: 'sonic',      nombre: 'Sonic',           emoji: '🦔', colores: ['#1e6fd9', '#0d3b8c'], categoria: 'series' },
    { id: 'harry',      nombre: 'Harry Potter',    emoji: '🧙', colores: ['#740001', '#d3a625'], categoria: 'series' },
    { id: 'minecraft',  nombre: 'Minecraft',       emoji: '⛏️', colores: ['#5da130', '#8a5a2b'], categoria: 'series' }
  ];

  var CLAVE_BASE = 'nr-skin';
  var REF_SUPABASE = 'gmnqcixtztvhlljbumlz'; // ref del proyecto (ver config.js)

  var $ = function (s, d) { return (d || document).querySelector(s); };
  var $$ = function (s, d) { return Array.prototype.slice.call((d || document).querySelectorAll(s)); };

  var elegido = null; // skin actual (objeto del catálogo) o null

  function porId(id) {
    for (var i = 0; i < CATALOGO.length; i++) if (CATALOGO[i].id === id) return CATALOGO[i];
    return null;
  }

  /* La sesión que Supabase guarda en el aparato, parseada. Solo se
     LEE localStorage: no se toca la sesión ni app.js. De ella salen
     mi id (para mi clave y mi fila) y mi token (para el REST). */
  function datosSesion() {
    try {
      var crudo = localStorage.getItem('sb-' + REF_SUPABASE + '-auth-token');
      if (!crudo) return null;
      return JSON.parse(crudo);
    } catch (e) { return null; }
  }

  function miUid() {
    var datos = datosSesion();
    return (datos && datos.user && datos.user.id) || null;
  }

  function tokenActual() {
    var datos = datosSesion();
    return (datos && datos.access_token) || null;
  }

  function clave() {
    var uid = miUid();
    return uid ? CLAVE_BASE + '::' + uid : CLAVE_BASE;
  }

  function leerGuardado() {
    try {
      // Primero mi clave personal; si aún no hay sesión, la genérica.
      return porId(localStorage.getItem(clave()) || localStorage.getItem(CLAVE_BASE));
    } catch (e) { return null; }
  }

  function guardar(skin) {
    try {
      if (skin) {
        localStorage.setItem(clave(), skin.id);
        localStorage.setItem(CLAVE_BASE, skin.id);
      } else {
        localStorage.removeItem(clave());
        localStorage.removeItem(CLAVE_BASE);
      }
    } catch (e) { /* aparato sin localStorage: el skin vive solo en pantalla */ }
  }

  /* ----------------- Supabase: el skin viaja en perfiles.skin -----------------
     Se habla con el REST de Supabase usando el token de MI sesión (la
     misma que app.js mantiene guardada): GET de los perfiles para
     pintar el avatar de cada quien y PATCH de SOLO mi fila al elegir.
     Sin cliente nuevo, sin tocar la sesión, sin credenciales nuevas
     (la URL y la clave anónima salen de window.APP_CONFIG, el mismo
     config.js público de la app). Si la columna skin no existe o la
     red falla, columnaOk=false y todo sigue en modo local. */

  var mapaRemoto = null;        // nombre normalizado -> skin (objeto) o null, según el servidor
  var miNombre = null;          // mi nombre según mi fila en perfiles
  var columnaOk = true;         // false tras un rechazo del servidor (p. ej. falta la columna)
  var eleccionDeSesion = false; // true si elegí/quité héroe en esta sesión de página
  var syncEnCurso = false;
  var ultimoSync = 0;

  function normNombre(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
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

  /* Guarda MI skin en mi fila de perfiles (fire-and-forget: si el
     servidor lo rechaza —columna ausente—, se anota y se sigue en
     local, sin molestar a nadie). */
  function guardarSkinRemoto(id) {
    var cfg = cfgSupa();
    var uid = miUid();
    if (!cfg || !uid || !tokenActual() || typeof fetch !== 'function') return;
    try {
      fetch(cfg.SUPABASE_URL + '/rest/v1/perfiles?id=eq.' + encodeURIComponent(uid), {
        method: 'PATCH',
        headers: cabecerasRest(true),
        body: JSON.stringify({ skin: id || null })
      }).then(function (r) {
        if (!r.ok) columnaOk = false;
      }).catch(function () { columnaOk = false; });
    } catch (e) { columnaOk = false; }
  }

  /* Lee id/nombre/emoji/skin de TODA la familia y repinta avatares.
     Conciliación de lo mío: si en esta página aún no elegí nada, el
     servidor manda (p. ej. elegí mi héroe en otro aparato: aquí se
     adopta y se guarda en local); si el servidor me trae sin skin y
     en este aparato ya tenía uno de antes de existir la columna, se
     sube (migración suave de las elecciones de v3.7.3). */
  function sincronizarPerfiles() {
    var cfg = cfgSupa();
    if (!cfg || !tokenActual() || typeof fetch !== 'function') return Promise.resolve(false);
    if (syncEnCurso) return Promise.resolve(false);
    syncEnCurso = true;
    ultimoSync = Date.now();
    return fetch(cfg.SUPABASE_URL + '/rest/v1/perfiles?select=id,nombre,emoji,skin', {
      headers: cabecerasRest(false)
    }).then(function (r) {
      if (!r.ok) throw new Error('rest ' + r.status);
      return r.json();
    }).then(function (filas) {
      var uid = miUid();
      var mapa = {};
      var miFila = null;
      (filas || []).forEach(function (f) {
        mapa[normNombre(f.nombre)] = porId(f.skin) || null;
        if (uid && f.id === uid) miFila = f;
      });
      mapaRemoto = mapa;
      columnaOk = true;
      if (miFila) {
        miNombre = normNombre(miFila.nombre);
        if (!eleccionDeSesion) {
          var remoto = porId(miFila.skin) || null;
          if (remoto && (!elegido || remoto.id !== elegido.id)) {
            guardar(remoto);
            aplicar(remoto);
          } else if (!remoto && elegido) {
            guardarSkinRemoto(elegido.id); // elección previa a la columna: subirla
          }
        }
      }
      syncEnCurso = false;
      refrescarDecoracion();
      return true;
    }).catch(function () {
      columnaOk = false; // p. ej. falta la columna skin: modo local, en silencio
      syncEnCurso = false;
      return false;
    });
  }

  function quizaSincronizar() {
    if (Date.now() - ultimoSync > 8000) sincronizarPerfiles();
  }

  /* El skin que toca pintar para un nombre: lo mío manda mi elección
     local (es la última palabra y ya va PATCH camino del servidor);
     lo de los demás, lo que diga el servidor (o nada si aún no llegó). */
  function skinDeNombre(nombre, esMio) {
    if (esMio) return elegido;
    if (mapaRemoto && Object.prototype.hasOwnProperty.call(mapaRemoto, nombre)) return mapaRemoto[nombre];
    return null;
  }

  /* ------------------------- aplicación visual ------------------------- */

  function aplicar(skin) {
    elegido = skin || null;
    var raiz = document.documentElement;
    CATALOGO.forEach(function (s) { document.body.classList.remove('skin-' + s.id); });
    if (elegido) {
      document.body.classList.add('con-skin', 'skin-' + elegido.id);
      raiz.style.setProperty('--skin-1', elegido.colores[0]);
      raiz.style.setProperty('--skin-2', elegido.colores[1]);
    } else {
      document.body.classList.remove('con-skin');
      raiz.style.removeProperty('--skin-1');
      raiz.style.removeProperty('--skin-2');
    }
    pintarBoton();
    pintarPrevia();
    marcarRejilla();
    decorarChat();
    decorarMiFila();
    pintarAvatares();
  }

  function elegir(id) {
    var skin = id ? porId(id) : null;
    eleccionDeSesion = true;
    guardar(skin);
    guardarSkinRemoto(skin ? skin.id : null); // que viaje a los demás aparatos
    aplicar(skin);
    if (window.Fun) {
      try {
        Fun.sonido('pop');
        if (skin) Fun.confeti({ cantidad: 40 });
      } catch (e) { /* el sonido nunca rompe la elección */ }
    }
    var aviso = $('#skins-aviso');
    if (aviso) {
      aviso.textContent = skin
        ? '¡Ahora eres ' + skin.nombre + '! ' + skin.emoji + ' Puedes cambiar cuando quieras.'
        : 'Sin héroe por ahora. Elige el tuyo cuando quieras. 🦸';
    }
  }

  /* ------------------------- botón de la cabecera -------------------------
     SIEMPRE visible dentro de la app: es la puerta permanente al
     selector («cambiar cuando uno quiera»). Muestra mi héroe actual. */

  function ponerBoton() {
    var barra = $('header.barra');
    if (!barra || document.getElementById('btn-skins')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'btn-skins';
    b.className = 'btn-suave btn-chico skin-chip';
    b.title = 'Elegir o cambiar mi héroe';
    b.setAttribute('aria-label', 'Elegir o cambiar mi héroe');
    b.innerHTML = '<span class="skin-chip-disco" aria-hidden="true">🦸</span>' +
      '<span class="skin-chip-texto">Mi héroe</span>';
    b.addEventListener('click', abrirSelector);
    var sonido = document.getElementById('btn-sonido');
    barra.insertBefore(b, sonido || null);
  }

  function pintarBoton() {
    var b = document.getElementById('btn-skins');
    if (!b) return;
    var disco = b.querySelector('.skin-chip-disco');
    var texto = b.querySelector('.skin-chip-texto');
    if (elegido) {
      disco.textContent = elegido.emoji;
      disco.style.background = 'linear-gradient(135deg,' + elegido.colores[0] + ',' + elegido.colores[1] + ')';
      texto.textContent = elegido.nombre;
    } else {
      disco.textContent = '🦸';
      disco.style.background = '';
      texto.textContent = 'Mi héroe';
    }
  }

  /* ------------------------- capa del selector -------------------------
     Mismo patrón visual de la casa (.capa sobrepuesta, ✖ grande para
     cerrar, la página de debajo no se mueve). La construye skins.js
     para no tener que tocar el HTML de index.html más que las dos
     etiquetas de carga. */

  function construirCapa() {
    if (document.getElementById('capa-skins')) return;
    var capa = document.createElement('div');
    capa.id = 'capa-skins';
    capa.className = 'capa oculto';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-label', 'Elegir mi héroe');
    capa.innerHTML =
      '<div class="capa-panel">' +
        '<div class="capa-cabecera">' +
          '<span class="capa-titulo">🦸 Mi héroe</span>' +
          '<button type="button" class="btn-cerrar-capa" id="btn-cerrar-skins" aria-label="Cerrar">✖</button>' +
        '</div>' +
        '<div class="capa-cuerpo">' +
          '<div class="tarjeta tarjeta-en-capa">' +
            '<div class="skins-previa" id="skins-previa"></div>' +
            '<p>Elige el héroe que te representa en el rincón: <strong>reemplaza a tu animal</strong> ' +
            'en la Sala, en la cabecera y en los campeones, y la familia lo ve en sus aparatos. ' +
            '<strong>Puedes cambiarlo cuando quieras, las veces que quieras</strong>: es gratis, sin ' +
            'puntos y sin esperas — también tocando tu animal en la Sala. 💛</p>' +
            '<div class="skins-rejilla" id="skins-rejilla"></div>' +
            '<p class="subtitulo" id="skins-aviso" style="margin-top:12px"></p>' +
            '<div class="botones-juego">' +
              '<button type="button" class="btn-suave" id="btn-skin-quitar">Quitar mi héroe</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(capa);
    $('#btn-cerrar-skins', capa).addEventListener('click', cerrarSelector);
    $('#btn-skin-quitar', capa).addEventListener('click', function () { elegir(null); });
    var rejilla = $('#skins-rejilla', capa);
    CATEGORIAS.forEach(function (cat) {
      var deCategoria = CATALOGO.filter(function (s) { return s.categoria === cat.id; });
      if (!deCategoria.length) return;
      var encabezado = document.createElement('h3');
      encabezado.className = 'skins-categoria';
      encabezado.textContent = cat.nombre;
      rejilla.appendChild(encabezado);
      deCategoria.forEach(function (skin) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'skin-opcion';
        b.dataset.skin = skin.id;
        b.setAttribute('aria-label', 'Elegir ' + skin.nombre);
        b.innerHTML =
          '<span class="skin-disco" style="background:linear-gradient(135deg,' +
            skin.colores[0] + ',' + skin.colores[1] + ')" aria-hidden="true">' + skin.emoji + '</span>' +
          '<span class="skin-nombre">' + skin.nombre + '</span>' +
          '<span class="skin-check" aria-hidden="true">✔</span>';
        b.addEventListener('click', function () { elegir(skin.id); });
        rejilla.appendChild(b);
      });
    });
  }

  function pintarPrevia() {
    var previa = document.getElementById('skins-previa');
    if (!previa) return;
    if (elegido) {
      previa.style.background = 'linear-gradient(135deg,' + elegido.colores[0] + ',' + elegido.colores[1] + ')';
      previa.innerHTML = '<span class="skins-previa-emoji" aria-hidden="true">' + elegido.emoji + '</span>' +
        '<span class="skins-previa-nombre">' + elegido.nombre + '</span>';
    } else {
      previa.style.background = '';
      previa.innerHTML = '<span class="skins-previa-emoji" aria-hidden="true">🦸</span>' +
        '<span class="skins-previa-nombre">Todavía no tienes héroe</span>';
    }
  }

  function marcarRejilla() {
    $$('#skins-rejilla .skin-opcion').forEach(function (b) {
      b.classList.toggle('elegido', !!elegido && b.dataset.skin === elegido.id);
    });
    var quitar = document.getElementById('btn-skin-quitar');
    if (quitar) quitar.classList.toggle('oculto', !elegido);
  }

  /* Bloqueo del fondo con la MISMA técnica de app.js (clase «con-capa»
     y top negativo), pero con estado propio: solo restauro lo que yo
     bloqueé, y si al cerrar queda otra capa abierta, no toco nada. */
  var yoBloquee = false;
  var miScroll = 0;

  function bloquearFondo() {
    if (yoBloquee) return;
    yoBloquee = true;
    try {
      miScroll = window.pageYOffset ||
        (document.documentElement ? document.documentElement.scrollTop : 0) || 0;
      document.body.style.top = (-miScroll) + 'px';
      document.body.classList.add('con-capa');
    } catch (e) { /* la capa se abre igual */ }
  }

  function desbloquearFondo() {
    if (!yoBloquee) return;
    yoBloquee = false;
    try {
      var quedaOtra = $$('.capa:not(.oculto)').some(function (c) { return c.id !== 'capa-skins'; });
      if (quedaOtra) return; // la otra capa manda sobre el fondo
      document.body.classList.remove('con-capa');
      document.body.style.top = '';
      window.scrollTo(0, miScroll);
    } catch (e) { /* cerrar nunca se cae */ }
  }

  function abrirSelector() {
    construirCapa();
    aplicar(elegido); // repinta previa, rejilla y botón con lo guardado
    var aviso = $('#skins-aviso');
    if (aviso) aviso.textContent = '';
    bloquearFondo();
    document.getElementById('capa-skins').classList.remove('oculto');
  }

  function cerrarSelector() {
    var capa = document.getElementById('capa-skins');
    if (capa) capa.classList.add('oculto');
    desbloquearFondo();
  }

  /* ------------------------- adornos donde ya pinta app.js -------------------------
     Decoración de SOLO LECTURA sobre el DOM que app.js ya pintó (no se
     cambia su lógica): insignia de mi héroe en mis mensajes del chat y
     en mi fila de la Sala. Los MutationObserver reponen la insignia
     cuando app.js repinta (p. ej. al reaccionar a un mensaje), y cada
     función es idempotente para no caer en bucles. */

  /* Nombre visible de un «.quien» del chat sin contar mi insignia. */
  function nombreEnQuien(quien) {
    var texto = '';
    Array.prototype.forEach.call(quien.childNodes, function (n) {
      if (n.nodeType === 3) texto += n.nodeValue;
    });
    return normNombre(texto || quien.textContent);
  }

  /* En el chat no hay círculo de avatar: el «avatar» de cada mensaje
     es la insignia junto a su nombre. Desde v3.7.4 la lleva TODO el
     que tenga héroe (no solo yo): así el héroe de cada quien se ve
     también junto a sus mensajes. Mi burbuja conserva su tinte. */
  function decorarChat() {
    $$('#chat-caja .mensaje').forEach(function (div) {
      var quien = div.querySelector('.quien');
      if (!quien) return;
      var nombre = nombreEnQuien(quien);
      var skin = skinDeNombre(nombre, div.classList.contains('mio'));
      var ins = quien.querySelector('.skin-insignia');
      if (!skin) { if (ins) ins.parentNode.removeChild(ins); return; }
      if (!ins) {
        ins = document.createElement('span');
        ins.className = 'skin-insignia';
        quien.appendChild(ins);
      }
      var texto = ' ' + skin.emoji;
      if (ins.textContent !== texto) ins.textContent = texto;
      if (ins.title !== skin.nombre) ins.title = skin.nombre;
    });
  }

  /* Poner (o quitar) el héroe en un elemento-avatar que trae el emoji
     de perfil como texto. El emoji original se guarda la primera vez
     para poder restaurarlo al quitar el héroe. Solo se toca el DOM
     cuando el valor cambia: así los MutationObserver no giran. */
  function aplicarEnAvatar(el, skin) {
    if (!el) return;
    if (skin) {
      if (el.dataset.skinOriginal == null) el.dataset.skinOriginal = el.textContent;
      if (el.textContent !== skin.emoji) el.textContent = skin.emoji;
      if (el.title !== skin.nombre) el.title = skin.nombre;
    } else if (el.dataset.skinOriginal != null) {
      if (el.textContent !== el.dataset.skinOriginal) el.textContent = el.dataset.skinOriginal;
      delete el.dataset.skinOriginal;
      el.title = '';
    }
  }

  /* Lo mismo para avatares que viven en un nodo de texto suelto
     (en la Tabla de campeones el emoji va como texto antes del
     nombre, sin elemento propio): se guarda el texto original en
     el dataset del contenedor y se reescribe solo el emoji. */
  function aplicarEnNodoTexto(contenedor, skin) {
    if (!contenedor) return;
    var nodo = null;
    Array.prototype.forEach.call(contenedor.childNodes, function (n) {
      if (!nodo && n.nodeType === 3 && /\S/.test(n.nodeValue)) nodo = n;
    });
    if (!nodo) return;
    if (skin) {
      if (contenedor.dataset.skinOriginal == null) contenedor.dataset.skinOriginal = nodo.nodeValue;
      var nuevo = skin.emoji + ' ';
      if (nodo.nodeValue !== nuevo) nodo.nodeValue = nuevo;
    } else if (contenedor.dataset.skinOriginal != null) {
      if (nodo.nodeValue !== contenedor.dataset.skinOriginal) nodo.nodeValue = contenedor.dataset.skinOriginal;
      delete contenedor.dataset.skinOriginal;
    }
  }

  /* MI avatar abre el selector: pista visual sutil (clase skin-tocable,
     cursor y título) y el toque enganchado UNA vez por elemento (los
     repintados de app.js crean elementos nuevos sin la marca, y el
     siguiente refresco los engancha). El avatar de otro no hace nada. */
  function hacerTocable(el) {
    if (!el) return;
    if (!el.classList.contains('skin-tocable')) el.classList.add('skin-tocable');
    var titulo = 'Toca para cambiar tu héroe 🦸';
    if (el.title !== titulo) el.title = titulo;
    if (!el.dataset.skinTocable) {
      el.dataset.skinTocable = '1';
      el.addEventListener('click', function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        abrirSelector();
      });
    }
  }

  /* EL REEMPLAZO (v3.7.4): donde app.js pinta el animal de perfil de
     alguien con héroe, se pinta su héroe; y mi avatar queda tocable
     en la Sala, la cabecera y la Tabla de campeones. La identidad de
     cada elemento se resuelve por el NOMBRE visible que la propia
     fila ya trae (la familia son tres y los nombres no se repiten),
     con «(tú)» como marca extra de mi fila en la Sala. */
  function pintarAvatares() {
    // Sala · «¿Quién anda por aquí?»: círculo grande de cada fila.
    $$('#lista-miembros .miembro').forEach(function (fila) {
      var fuerte = fila.querySelector('strong');
      var avatar = fila.querySelector('.avatar-grande');
      if (!fuerte || !avatar) return;
      var crudo = normNombre(fuerte.textContent);
      var esMio = crudo.indexOf('(tú)') !== -1 || (!!miNombre && crudo === miNombre);
      var nombre = crudo.replace(/\s*\(tú\)\s*$/, '');
      aplicarEnAvatar(avatar, skinDeNombre(nombre, esMio));
      if (esMio) hacerTocable(avatar);
    });
    // Cabecera · chips de presencia: avatar + nombre en el mismo chip.
    $$('#presencia .chip-presencia').forEach(function (chip) {
      var avatar = chip.querySelector('.avatar');
      if (!avatar) return;
      var nombre = '';
      Array.prototype.forEach.call(chip.childNodes, function (n) {
        if (n.nodeType === 3 && /\S/.test(n.nodeValue)) nombre = normNombre(n.nodeValue);
      });
      if (!nombre) return;
      var esMio = !!miNombre && nombre === miNombre;
      aplicarEnAvatar(avatar, skinDeNombre(nombre, esMio));
      if (esMio) hacerTocable(chip);
    });
    // Tabla de campeones: emoji como texto antes del nombre (1ª celda).
    $$('#tabla-campeones tr').forEach(function (tr) {
      var celda = tr.querySelector('td');
      var fuerte = tr.querySelector('td strong');
      if (!celda || !fuerte) return;
      var nombre = normNombre(fuerte.textContent);
      var esMio = !!miNombre && nombre === miNombre;
      aplicarEnNodoTexto(celda, skinDeNombre(nombre, esMio));
      if (esMio) hacerTocable(celda);
    });
  }

  /* Refresco único de toda la decoración, con programa anti-rebote:
     nuestras propias pintadas disparan los observadores otra vez,
     pero como cada función solo toca el DOM si el valor cambia, la
     segunda pasada no muta nada y la cadena se detiene sola. */
  var refrescoPendiente = false;
  function refrescarDecoracion() {
    decorarChat();
    decorarMiFila();
    pintarAvatares();
  }
  function programarRefresco() {
    if (refrescoPendiente) return;
    refrescoPendiente = true;
    setTimeout(function () {
      refrescoPendiente = false;
      refrescarDecoracion();
      quizaSincronizar(); // si el repintado vino de perfiles nuevos, releer skins
    }, 40);
  }

  function decorarMiFila() {
    $$('#lista-miembros .miembro').forEach(function (fila) {
      var fuerte = fila.querySelector('strong');
      if (!fuerte || fuerte.textContent.indexOf('(tú)') === -1) return;
      var ins = fila.querySelector('.skin-insignia');
      if (!elegido) { if (ins) ins.parentNode.removeChild(ins); return; }
      if (!ins) {
        ins = document.createElement('span');
        ins.className = 'skin-insignia skin-insignia-fila';
        fuerte.parentNode.insertBefore(ins, fuerte.nextSibling);
      }
      var texto = elegido.emoji + ' ' + elegido.nombre;
      if (ins.textContent !== texto) ins.textContent = texto;
    });
  }

  function observar() {
    if (!window.MutationObserver) return;
    // Toda zona que app.js repinta queda vigilada: cualquier repintado
    // (presencia, perfiles en vivo, reacciones del chat…) dispara el
    // refresco completo de la decoración, avatares incluidos.
    ['chat-caja', 'lista-miembros', 'presencia', 'tabla-campeones'].forEach(function (id) {
      var zona = document.getElementById(id);
      if (zona) new MutationObserver(programarRefresco).observe(zona, { childList: true, subtree: true });
    });
    // Al entrar a la app (login hecho), mi clave pasa a ser la personal:
    // se relee lo guardado por si este aparato lo compartió la familia
    // y se sincroniza con perfiles.skin (mi skin puede venir de otro
    // aparato, y los de los demás pintan los avatares).
    var vista = document.getElementById('vista-app');
    if (vista) {
      new MutationObserver(function () {
        if (!vista.classList.contains('oculto')) {
          aplicar(leerGuardado());
          sincronizarPerfiles();
        }
      }).observe(vista, { attributes: true, attributeFilter: ['class'] });
    }
  }

  /* Arranque de la sincronización: se espera a que exista sesión
     (skins.js carga antes del login) y luego se relee cada minuto
     con la app a la vista, por si alguien cambió su héroe en otro
     aparato sin que este repintara nada. */
  function arrancarSync() {
    var intentos = 0;
    var tic = setInterval(function () {
      intentos++;
      if (tokenActual()) {
        clearInterval(tic);
        sincronizarPerfiles();
      } else if (intentos > 40) {
        clearInterval(tic);
      }
    }, 1500);
    setInterval(function () {
      if (!document.hidden) sincronizarPerfiles();
    }, 60000);
  }

  /* ------------------------- arranque ------------------------- */
  ponerBoton();
  construirCapa();
  aplicar(leerGuardado());
  observar();
  arrancarSync();

  window.NRSkins = {
    catalogo: function () { return CATALOGO.slice(); },
    categorias: function () { return CATEGORIAS.slice(); },
    actual: function () { return elegido; },
    elegir: elegir,
    abrir: abrirSelector,
    sincronizar: sincronizarPerfiles
  };

  /* =====================================================================
     INTEGRACIÓN SUPABASE — YA APLICADA en v3.7.4 (este mismo archivo):
     la columna perfiles.skin existe (creada el 2026-11-07) y guarda el
     id del héroe ('ninja', 'dragon'… o null). skins.js la mantiene:
     PATCH de mi fila al elegir/cambiar/quitar y GET de todos los
     perfiles al sincronizar, pintando el avatar de cada quien según
     su skin. Todo con el token de la sesión guardada y el REST, sin
     tocar app.js ni la sesión. Si algún día la columna faltara, el
     modo local (localStorage) sigue solo, en silencio.
     ===================================================================== */
})();

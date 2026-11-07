/* =====================================================================
   skins.js — Skins de héroes para elegir 🦸 (Nuestro Rincón)
   ---------------------------------------------------------------------
   Función ADITIVA y autocontenida: no toca la lógica de partidas ni
   de juegos de app.js. Cada quien elige un héroe que lo representa
   (emoji + nombre + colores) y lo puede CAMBIAR cuando quiera, las
   veces que quiera: sin bloqueo, sin esperas y sin costo en puntos
   (requisito del dueño, 2026-11-07). El cambio surte efecto al
   instante, sin recargar la página.

   DÓNDE SE VE el skin:
   - En el botón «🦸 Mi héroe» de la cabecera (disco con el emoji y
     los colores del héroe). Ese botón vive SIEMPRE en la cabecera y
     abre el selector: así el skin se puede cambiar en cualquier
     momento, no solo la primera vez.
   - En la Sala, junto a tu nombre en «¿Quién anda por aquí?» (tu fila
     es la que dice «(tú)»).
   - En el chat: tus mensajes llevan el emoji de tu héroe junto a tu
     nombre y tu burbuja se tiñe con los colores de tu héroe.

   CÓMO SE GUARDA (honesto): en ESTE aparato, en localStorage, con una
   clave por usuario (nr-skin::<id de Supabase>) y una copia genérica
   (nr-skin). NO viaja a Supabase: la tabla perfiles no tiene columna
   de skin y agregarla exige migración + tocar app.js (archivo en
   conflicto durante el arreglo de partidas). Por eso, hoy cada
   aparato recuerda la elección de quien lo usa; Maryelin y Ethan
   eligen el suyo en su aparato. La vía futura, cuando se quiera que
   el skin se vea en los aparatos de los demás, está documentada en
   INTEGRACIÓN SUPABASE al final de este archivo (window.NRSkins ya
   expone la API para engancharla con un cambio mínimo en app.js).

   API pública (para la integración final):
     window.NRSkins.catalogo()  -> copia del catálogo
     window.NRSkins.actual()    -> skin elegido o null
     window.NRSkins.elegir(id)  -> aplica y guarda al instante
     window.NRSkins.abrir()     -> abre el selector
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------- catálogo de héroes -------------------------
     10 héroes ORIGINALES y genéricos (emoji + nombre + paleta CSS).
     Nada de personajes con copyright ni imágenes externas. */
  var CATALOGO = [
    { id: 'rayo',     nombre: 'Capitán Rayo',      emoji: '⚡', colores: ['#ffb020', '#ff7847'] },
    { id: 'estrella', nombre: 'Súper Estrella',    emoji: '🌟', colores: ['#f368e0', '#feca57'] },
    { id: 'guardian', nombre: 'Héroe Guardián',    emoji: '🛡️', colores: ['#54a0ff', '#2e86de'] },
    { id: 'turbo',    nombre: 'Chica Turbo',       emoji: '🚀', colores: ['#ff6b81', '#a55eea'] },
    { id: 'leon',     nombre: 'Rey León',          emoji: '🦁', colores: ['#f39c12', '#d35400'] },
    { id: 'ninja',    nombre: 'Ninja Sombra',      emoji: '🥷', colores: ['#8395a7', '#222f3e'] },
    { id: 'princesa', nombre: 'Princesa Guerrera', emoji: '👸', colores: ['#fd79a8', '#e84393'] },
    { id: 'robot',    nombre: 'Robot Héroe',       emoji: '🤖', colores: ['#7ed6df', '#3dc1d3'] },
    { id: 'dragon',   nombre: 'Dragón Valiente',   emoji: '🐉', colores: ['#2ed573', '#1e90ff'] },
    { id: 'oceano',   nombre: 'Capitán Océano',    emoji: '🌊', colores: ['#00d2ff', '#3a7bd5'] }
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

  /* Mi id de usuario según la sesión que Supabase guarda en el aparato.
     Solo se LEE localStorage: no se toca la sesión ni app.js. */
  function miUid() {
    try {
      var crudo = localStorage.getItem('sb-' + REF_SUPABASE + '-auth-token');
      if (!crudo) return null;
      var datos = JSON.parse(crudo);
      return (datos && datos.user && datos.user.id) || null;
    } catch (e) { return null; }
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
  }

  function elegir(id) {
    var skin = id ? porId(id) : null;
    guardar(skin);
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
            '<p>Elige el héroe que te representa en el rincón. <strong>Puedes cambiarlo ' +
            'cuando quieras, las veces que quieras</strong>: es gratis, sin puntos y sin esperas. 💛</p>' +
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
    CATALOGO.forEach(function (skin) {
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

  function decorarChat() {
    $$('#chat-caja .mensaje.mio').forEach(function (div) {
      var quien = div.querySelector('.quien');
      if (!quien) return;
      var ins = quien.querySelector('.skin-insignia');
      if (!elegido) { if (ins) ins.parentNode.removeChild(ins); return; }
      if (!ins) {
        ins = document.createElement('span');
        ins.className = 'skin-insignia';
        quien.appendChild(ins);
      }
      var texto = ' ' + elegido.emoji;
      if (ins.textContent !== texto) ins.textContent = texto;
      ins.title = elegido.nombre;
    });
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
    var chat = document.getElementById('chat-caja');
    if (chat) new MutationObserver(decorarChat).observe(chat, { childList: true, subtree: true });
    var miembros = document.getElementById('lista-miembros');
    if (miembros) new MutationObserver(decorarMiFila).observe(miembros, { childList: true, subtree: true });
    // Al entrar a la app (login hecho), mi clave pasa a ser la personal:
    // se relee lo guardado por si este aparato lo compartió la familia.
    var vista = document.getElementById('vista-app');
    if (vista) {
      new MutationObserver(function () {
        if (!vista.classList.contains('oculto')) aplicar(leerGuardado());
      }).observe(vista, { attributes: true, attributeFilter: ['class'] });
    }
  }

  /* ------------------------- arranque ------------------------- */
  ponerBoton();
  construirCapa();
  aplicar(leerGuardado());
  observar();

  window.NRSkins = {
    catalogo: function () { return CATALOGO.slice(); },
    actual: function () { return elegido; },
    elegir: elegir,
    abrir: abrirSelector
  };

  /* =====================================================================
     INTEGRACIÓN SUPABASE (futura, cuando se quiera ver el skin de los
     demás en mi aparato — NO aplicada a propósito en esta entrega):
     1) Migración de una línea:  alter table perfiles add column if not
        exists skin text;
     2) En app.js, dentro de cargarPerfiles() y tras guardar mi perfil,
        enganchar (dos líneas, fuera de la capa de partidas):
          - al elegir: NRSkins ya guarda local; añadir un update
            supa.from('perfiles').update({ skin: id }).eq('id', yo.id)
          - al pintar miembros/presencia/chat de OTROS: leer
            perfiles[id].skin y buscar el héroe en NRSkins.catalogo()
            para pintar su disco junto a su nombre.
     Mientras tanto, el skin es por aparato y eso está avisado en la
     propia capa del selector (el texto no promete más de lo real).
     ===================================================================== */
})();

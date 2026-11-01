/* =====================================================================
   logic.js — Lógica pura de la App Familiar (juegos + sincronización)
   Funciona en el navegador (window.FamilyLogic) y en Node (module.exports)
   para poder probarla con la batería de tests sin levantar la interfaz.
   ===================================================================== */
(function (global) {
  'use strict';

  var UMBRAL_DERIVA_SEG = 1.5; // si la diferencia pasa de esto, se re-sincroniza

  /* ============================ GATO (tres en raya) ============================ */
  var LINEAS_GATO = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // filas
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columnas
    [0, 4, 8], [2, 4, 6]             // diagonales
  ];

  function crearGato(jugadores) {
    return {
      tipo: 'gato',
      tablero: [null, null, null, null, null, null, null, null, null],
      jugadores: (jugadores || []).slice(0, 2), // ids de los 2 jugadores (el resto mira)
      turno: 0,                                 // índice en jugadores[]
      ganador: null,                            // 'X' | 'O' | null
      empate: false,
      terminado: false
    };
  }

  function ganadorGato(tablero) {
    for (var i = 0; i < LINEAS_GATO.length; i++) {
      var l = LINEAS_GATO[i];
      if (tablero[l[0]] && tablero[l[0]] === tablero[l[1]] && tablero[l[0]] === tablero[l[2]]) {
        return tablero[l[0]];
      }
    }
    if (tablero.every(function (c) { return !!c; })) return 'empate';
    return null;
  }

  // jugadorIdx: 0 (X) o 1 (O). Devuelve un estado NUEVO (no muta el anterior).
  function jugadaGato(estado, jugadorIdx, casilla) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (jugadorIdx !== estado.turno) throw new Error('No es tu turno');
    if (typeof casilla !== 'number' || casilla < 0 || casilla > 8) throw new Error('Casilla inválida');
    if (estado.tablero[casilla]) throw new Error('Esa casilla ya está ocupada');
    var simbolo = jugadorIdx === 0 ? 'X' : 'O';
    var tablero = estado.tablero.slice();
    tablero[casilla] = simbolo;
    var g = ganadorGato(tablero);
    var nuevo = Object.assign({}, estado, { tablero: tablero });
    if (g === 'empate') {
      nuevo.terminado = true; nuevo.empate = true; nuevo.ganador = null;
    } else if (g) {
      nuevo.terminado = true; nuevo.ganador = g;
    } else {
      nuevo.turno = 1 - estado.turno;
    }
    return nuevo;
  }

  /* ============================ TRIVIA ============================ */
  // Banco de preguntas en español, aptas para niños. correcta = índice en opciones[].
  var BANCO_PREGUNTAS = [
    { categoria: 'Animales', pregunta: '¿Cuál es el animal terrestre más grande del mundo?', opciones: ['El elefante africano', 'La jirafa', 'El hipopótamo', 'El rinoceronte'], correcta: 0 },
    { categoria: 'Animales', pregunta: '¿Cuántas patas tiene una araña?', opciones: ['6', '8', '10', '4'], correcta: 1 },
    { categoria: 'Animales', pregunta: '¿Qué animal es conocido como el mejor amigo del hombre?', opciones: ['El gato', 'El caballo', 'El perro', 'El loro'], correcta: 2 },
    { categoria: 'Animales', pregunta: '¿Qué comen los osos panda principalmente?', opciones: ['Pescado', 'Bambú', 'Miel', 'Frutas'], correcta: 1 },
    { categoria: 'Animales', pregunta: '¿Cuál de estos animales puede volar?', opciones: ['El pingüino', 'El murciélago', 'El avestruz', 'El kiwi'], correcta: 1 },
    { categoria: 'Ciencia', pregunta: '¿Cuántos colores tiene el arcoíris?', opciones: ['5', '6', '7', '8'], correcta: 2 },
    { categoria: 'Ciencia', pregunta: '¿Qué planeta es el más cercano al Sol?', opciones: ['Venus', 'Marte', 'Mercurio', 'La Tierra'], correcta: 2 },
    { categoria: 'Ciencia', pregunta: '¿H2O es la fórmula de qué sustancia?', opciones: ['La sal', 'El agua', 'El oxígeno', 'El azúcar'], correcta: 1 },
    { categoria: 'Ciencia', pregunta: '¿Qué parte de la planta hace la fotosíntesis?', opciones: ['La raíz', 'El tallo', 'Las hojas', 'La flor'], correcta: 2 },
    { categoria: 'Ciencia', pregunta: '¿Cuántos minutos tiene una hora?', opciones: ['30', '90', '100', '60'], correcta: 3 },
    { categoria: 'Espacio', pregunta: '¿Cómo se llama el planeta donde vivimos?', opciones: ['Marte', 'La Tierra', 'Júpiter', 'Venus'], correcta: 1 },
    { categoria: 'Espacio', pregunta: '¿Qué astro ilumina la Tierra durante el día?', opciones: ['La Luna', 'El Sol', 'Las estrellas', 'Un cometa'], correcta: 1 },
    { categoria: 'Espacio', pregunta: '¿Cuántas lunas tiene la Tierra?', opciones: ['Ninguna', 'Una', 'Dos', 'Tres'], correcta: 1 },
    { categoria: 'Espacio', pregunta: '¿Qué planeta es conocido como el planeta rojo?', opciones: ['Marte', 'Saturno', 'Neptuno', 'Mercurio'], correcta: 0 },
    { categoria: 'Geografía', pregunta: '¿Cuál es el océano más grande del mundo?', opciones: ['Atlántico', 'Índico', 'Pacífico', 'Ártico'], correcta: 2 },
    { categoria: 'Geografía', pregunta: '¿Cuál es el río más largo del mundo?', opciones: ['El Amazonas', 'El Nilo', 'El Misisipi', 'El Yangtsé'], correcta: 1 },
    { categoria: 'Geografía', pregunta: '¿En qué continente está Egipto?', opciones: ['Asia', 'Europa', 'África', 'América'], correcta: 2 },
    { categoria: 'Geografía', pregunta: '¿Cuál es la capital de España?', opciones: ['Barcelona', 'Madrid', 'Sevilla', 'Valencia'], correcta: 1 },
    { categoria: 'Geografía', pregunta: '¿Cuál es la montaña más alta del mundo?', opciones: ['El Aconcagua', 'El Kilimanjaro', 'El Everest', 'Los Alpes'], correcta: 2 },
    { categoria: 'Historia', pregunta: '¿Quién pintó la Mona Lisa?', opciones: ['Picasso', 'Leonardo da Vinci', 'Van Gogh', 'Miguel Ángel'], correcta: 1 },
    { categoria: 'Historia', pregunta: '¿En qué año llegó el hombre a la Luna por primera vez?', opciones: ['1959', '1969', '1979', '1989'], correcta: 1 },
    { categoria: 'Deporte', pregunta: '¿Cuántos jugadores de un equipo de fútbol están en la cancha?', opciones: ['9', '10', '11', '12'], correcta: 2 },
    { categoria: 'Deporte', pregunta: '¿Cada cuántos años se celebran los Juegos Olímpicos?', opciones: ['2 años', '3 años', '4 años', '5 años'], correcta: 2 },
    { categoria: 'Deporte', pregunta: '¿En qué deporte se usa una raqueta y una pelota amarilla sobre una red?', opciones: ['Bádminton', 'Tenis', 'Ping pong', 'Squash'], correcta: 1 },
    { categoria: 'Comida', pregunta: '¿De qué fruta se hace el jugo de naranja?', opciones: ['De la manzana', 'De la naranja', 'Del limón', 'De la pera'], correcta: 1 },
    { categoria: 'Comida', pregunta: '¿Qué vegetal hace llorar cuando lo cortas?', opciones: ['La papa', 'La zanahoria', 'La cebolla', 'El tomate'], correcta: 2 },
    { categoria: 'Comida', pregunta: '¿De dónde viene principalmente el chocolate?', opciones: ['Del café', 'Del cacao', 'De la caña', 'Del maíz'], correcta: 1 },
    { categoria: 'Arte', pregunta: '¿Cuántos colores primarios hay en la pintura tradicional?', opciones: ['2', '3', '4', '5'], correcta: 1 },
    { categoria: 'Arte', pregunta: '¿Qué instrumento tiene teclas blancas y negras?', opciones: ['La guitarra', 'El violín', 'El piano', 'La flauta'], correcta: 2 },
    { categoria: 'Cuerpo humano', pregunta: '¿Cuántos sentidos tiene el cuerpo humano?', opciones: ['4', '5', '6', '7'], correcta: 1 },
    { categoria: 'Cuerpo humano', pregunta: '¿Qué órgano bombea la sangre por todo el cuerpo?', opciones: ['El hígado', 'El pulmón', 'El corazón', 'El cerebro'], correcta: 2 },
    { categoria: 'Cuerpo humano', pregunta: '¿Cuántos dientes tiene un adulto aproximadamente?', opciones: ['20', '28', '32', '40'], correcta: 2 }
  ];

  var TIEMPO_PREGUNTA_SEG = 20;

  // La trivia puede jugarse con el banco general o con el bíblico
  // (games.js lo aporta; se lee perezosamente para no crear dependencias).
  function bancoDe(estado) {
    if (estado && estado.banco === 'biblica' && global.FamilyGames && global.FamilyGames.BANCO_TRIVIA_BIBLICA) {
      return global.FamilyGames.BANCO_TRIVIA_BIBLICA;
    }
    return BANCO_PREGUNTAS;
  }

  function crearTrivia(jugadores, orden, banco) {
    var bancoElegido = banco === 'biblica' ? 'biblica' : 'general';
    var indices = bancoDe({ banco: bancoElegido }).map(function (_, i) { return i; });
    return {
      tipo: 'trivia',
      banco: bancoElegido,
      fase: 'esperando',          // esperando | pregunta | revelado | final
      orden: orden ? orden.slice() : indices,
      preguntaIdx: 0,             // posición dentro de orden[]
      jugadores: (jugadores || []).slice(),
      respuestas: {},             // userId -> { opcion, puntos, tiempoRestante }
      puntajes: {},               // userId -> total
      correctaRevelada: null
    };
  }

  function preguntaActual(estado) {
    if (estado.preguntaIdx >= estado.orden.length) return null;
    return bancoDe(estado)[estado.orden[estado.preguntaIdx]];
  }

  // Puntaje: 100 por acertar + hasta 50 de bono por rapidez.
  function puntosRespuesta(esCorrecta, tiempoRestante, tiempoTotal) {
    if (!esCorrecta) return 0;
    var total = tiempoTotal || TIEMPO_PREGUNTA_SEG;
    var r = Math.max(0, Math.min(tiempoRestante, total));
    return 100 + Math.round(50 * r / total);
  }

  function responderTrivia(estado, userId, opcion, tiempoRestante) {
    if (estado.fase !== 'pregunta') throw new Error('Ahora no se puede responder');
    if (estado.respuestas[userId]) throw new Error('Ya respondiste esta pregunta');
    var p = preguntaActual(estado);
    var puntos = puntosRespuesta(opcion === p.correcta, tiempoRestante);
    var respuestas = Object.assign({}, estado.respuestas);
    respuestas[userId] = { opcion: opcion, puntos: puntos, tiempoRestante: tiempoRestante };
    return Object.assign({}, estado, { respuestas: respuestas });
  }

  // Cierra la pregunta: suma puntos y pasa a fase 'revelado' (o 'final').
  function revelarTrivia(estado) {
    if (estado.fase !== 'pregunta') throw new Error('No hay pregunta abierta');
    var p = preguntaActual(estado);
    var puntajes = Object.assign({}, estado.puntajes);
    Object.keys(estado.respuestas).forEach(function (uid) {
      puntajes[uid] = (puntajes[uid] || 0) + estado.respuestas[uid].puntos;
    });
    var esUltima = estado.preguntaIdx >= estado.orden.length - 1;
    return Object.assign({}, estado, {
      puntajes: puntajes,
      correctaRevelada: p.correcta,
      fase: esUltima ? 'final' : 'revelado'
    });
  }

  function siguientePregunta(estado) {
    if (estado.fase !== 'revelado') throw new Error('Todavía no se reveló la respuesta');
    return Object.assign({}, estado, {
      fase: 'pregunta',
      preguntaIdx: estado.preguntaIdx + 1,
      respuestas: {},
      correctaRevelada: null
    });
  }

  function iniciarTrivia(estado) {
    if (estado.fase !== 'esperando') throw new Error('La trivia ya empezó');
    return Object.assign({}, estado, { fase: 'pregunta' });
  }

  /* ============================ MEMORIA (parejas) ============================ */
  var EMOJIS_MEMORIA = ['🐶', '🍕', '🚗', '🌈', '⚽', '🎸', '🍓', '🐱', '🚀', '🌻', '🎈', '🍦'];

  // mazo (opcional): lista de { emoji, nombre } — mazos temáticos y
  // bíblico de games.js. Sin mazo se usan los emojis clásicos de siempre.
  function crearMemoria(numParejas, rng, mazo) {
    rng = rng || Math.random;
    var cartas = [];
    if (mazo && mazo.length) {
      var delMazo = mazo.slice(0, Math.max(2, Math.min(numParejas || 8, mazo.length)));
      delMazo.forEach(function (item) {
        cartas.push({ emoji: item.emoji, nombre: item.nombre || null, encontrada: false });
        cartas.push({ emoji: item.emoji, nombre: item.nombre || null, encontrada: false });
      });
      for (var i2 = cartas.length - 1; i2 > 0; i2--) {
        var j2 = Math.floor(rng() * (i2 + 1));
        var t2 = cartas[i2]; cartas[i2] = cartas[j2]; cartas[j2] = t2;
      }
      return {
        tipo: 'memoria', cartas: cartas, jugadores: [], turno: 0,
        volteadas: [], pendiente: null, puntajes: {},
        parejasRestantes: delMazo.length, terminado: false
      };
    }
    var elegidos = EMOJIS_MEMORIA.slice(0, Math.max(2, Math.min(numParejas || 8, EMOJIS_MEMORIA.length)));
    elegidos.forEach(function (e) {
      cartas.push({ emoji: e, encontrada: false });
      cartas.push({ emoji: e, encontrada: false });
    });
    for (var i = cartas.length - 1; i > 0; i--) { // Fisher-Yates
      var j = Math.floor(rng() * (i + 1));
      var tmp = cartas[i]; cartas[i] = cartas[j]; cartas[j] = tmp;
    }
    return {
      tipo: 'memoria',
      cartas: cartas,
      jugadores: [],
      turno: 0,
      volteadas: [],     // índices boca arriba en este turno (0, 1 o 2)
      pendiente: null,   // [a, b] cuando falló: se ocultan al resolver
      puntajes: {},      // userId -> parejas encontradas
      parejasRestantes: elegidos.length,
      terminado: false
    };
  }

  function voltearMemoria(estado, indice) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.pendiente) throw new Error('Espera a que se oculten las cartas');
    var carta = estado.cartas[indice];
    if (!carta) throw new Error('Carta inválida');
    if (carta.encontrada) throw new Error('Esa pareja ya se encontró');
    if (estado.volteadas.indexOf(indice) !== -1) throw new Error('Esa carta ya está volteada');
    if (estado.volteadas.length >= 2) throw new Error('Ya hay dos cartas volteadas');

    var volteadas = estado.volteadas.concat([indice]);
    if (volteadas.length === 1) return Object.assign({}, estado, { volteadas: volteadas });

    var a = volteadas[0], b = volteadas[1];
    if (estado.cartas[a].emoji === estado.cartas[b].emoji) {
      var cartas = estado.cartas.map(function (c, i) {
        return i === a || i === b ? Object.assign({}, c, { encontrada: true }) : c;
      });
      var restantes = estado.parejasRestantes - 1;
      var puntajes = Object.assign({}, estado.puntajes);
      var jid = estado.jugadores[estado.turno];
      if (jid) puntajes[jid] = (puntajes[jid] || 0) + 1;
      // Acertar = el mismo jugador sigue.
      return Object.assign({}, estado, {
        cartas: cartas, volteadas: [], puntajes: puntajes,
        parejasRestantes: restantes, terminado: restantes === 0
      });
    }
    // Falló: quedan visibles hasta que resolverMemoria las oculte y pase el turno.
    return Object.assign({}, estado, { volteadas: volteadas, pendiente: [a, b] });
  }

  function resolverMemoria(estado) {
    if (!estado.pendiente) return estado;
    var n = Math.max(1, estado.jugadores.length);
    return Object.assign({}, estado, {
      volteadas: [], pendiente: null, turno: (estado.turno + 1) % n
    });
  }

  /* ================== SINCRONIZACIÓN DE REPRODUCCIÓN ================== */
  // Mensajes que viajan por el canal (broadcast / fila de estado):
  //   { tipo:'cargar', videoId, posicion, reproduciendo, enviadoEn }
  //   { tipo:'reproducir'|'pausar'|'buscar', posicion, reproduciendo, enviadoEn }
  //   { tipo:'posicion', posicion, reproduciendo, enviadoEn }  (ping periódico)

  function posicionRemota(msg, ahoraMs) {
    if (!msg) return 0;
    var transcurrido = msg.reproduciendo ? (ahoraMs - (msg.enviadoEn || ahoraMs)) / 1000 : 0;
    return Math.max(0, (msg.posicion || 0) + transcurrido);
  }

  // Compara la posición local con la del grupo y decide si hay que saltar.
  function correccionDeriva(posicionLocal, msg, ahoraMs, umbral) {
    var limite = (typeof umbral === 'number') ? umbral : UMBRAL_DERIVA_SEG;
    var remota = posicionRemota(msg, ahoraMs);
    var diferencia = remota - posicionLocal;
    if (Math.abs(diferencia) > limite) {
      return { accion: 'seek', a: remota, diferencia: diferencia };
    }
    return { accion: 'nada', diferencia: diferencia };
  }

  // Qué debe hacer el reproductor local ante un evento del grupo.
  function interpretarSync(evento) {
    if (!evento || !evento.tipo) return { accion: 'nada' };
    switch (evento.tipo) {
      case 'cargar': return { accion: 'cargar', videoId: evento.videoId, posicion: evento.posicion || 0 };
      case 'reproducir': return { accion: 'play' };
      case 'pausar': return { accion: 'pause' };
      case 'buscar': return { accion: 'seek', a: evento.posicion || 0 };
      default: return { accion: 'nada' };
    }
  }

  /* ================== TABLA DE CAMPEONES FAMILIAR ================== */
  // Títulos juguetones según la posición en el ranking acumulado.
  var TITULOS_CAMPEON = [
    '👑 Campeón/a de la semana',
    '⭐ Estrella en ascenso',
    '🎯 Francotirador/a de juegos',
    '🌈 Buena racha',
    '🌱 Calentando motores'
  ];

  // totales: { userId: puntos } -> lista ordenada [{ id, puntos, posicion, titulo }]
  function rankingCampeones(totales) {
    var lista = Object.keys(totales || {}).map(function (id) {
      return { id: id, puntos: totales[id] || 0 };
    });
    lista.sort(function (a, b) { return b.puntos - a.puntos; });
    return lista.map(function (item, i) {
      return {
        id: item.id,
        puntos: item.puntos,
        posicion: i + 1,
        titulo: TITULOS_CAMPEON[Math.min(i, TITULOS_CAMPEON.length - 1)]
      };
    });
  }

  // Puntos que suma cada juego al acumulado familiar cuando termina.
  function puntosDePartida(estado) {
    var suma = {};
    if (!estado || !estado.terminado && estado.tipo !== 'trivia') return suma;
    if (estado.tipo === 'gato' && estado.ganador && estado.jugadores) {
      var idx = estado.ganador === 'X' ? 0 : 1;
      if (estado.jugadores[idx]) suma[estado.jugadores[idx]] = 50;
    } else if (estado.tipo === 'memoria') {
      Object.keys(estado.puntajes || {}).forEach(function (uid) {
        suma[uid] = (estado.puntajes[uid] || 0) * 10; // 10 puntos por pareja
      });
    } else if (estado.tipo === 'trivia' && estado.fase === 'final') {
      Object.keys(estado.puntajes || {}).forEach(function (uid) {
        suma[uid] = estado.puntajes[uid] || 0;
      });
    }
    // Juegos de la biblioteca ampliada (games.js): se fusionan sus puntos.
    if (global.FamilyGames && global.FamilyGames.puntosDePartidaExtra) {
      var extra = global.FamilyGames.puntosDePartidaExtra(estado);
      Object.keys(extra).forEach(function (uid) {
        suma[uid] = (suma[uid] || 0) + extra[uid];
      });
    }
    return suma;
  }

  var API = {
    UMBRAL_DERIVA_SEG: UMBRAL_DERIVA_SEG,
    crearGato: crearGato, ganadorGato: ganadorGato, jugadaGato: jugadaGato,
    BANCO_PREGUNTAS: BANCO_PREGUNTAS, TIEMPO_PREGUNTA_SEG: TIEMPO_PREGUNTA_SEG,
    crearTrivia: crearTrivia, preguntaActual: preguntaActual, puntosRespuesta: puntosRespuesta,
    responderTrivia: responderTrivia, revelarTrivia: revelarTrivia,
    siguientePregunta: siguientePregunta, iniciarTrivia: iniciarTrivia,
    EMOJIS_MEMORIA: EMOJIS_MEMORIA, crearMemoria: crearMemoria,
    voltearMemoria: voltearMemoria, resolverMemoria: resolverMemoria,
    posicionRemota: posicionRemota, correccionDeriva: correccionDeriva, interpretarSync: interpretarSync,
    TITULOS_CAMPEON: TITULOS_CAMPEON, rankingCampeones: rankingCampeones, puntosDePartida: puntosDePartida
  };

  global.FamilyLogic = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

/* =====================================================================
   games.js — Biblioteca completa de juegos de Nuestro Rincón 🎲📖
   Lógica pura (sin DOM ni red): funciona en el navegador
   (window.FamilyGames) y en Node (module.exports) para probarla.
   Los estados siguen el mismo patrón que logic.js: funciones que
   reciben el estado y devuelven uno NUEVO, lanzando Error si la
   jugada no vale. La información «oculta» (Batalla Naval, Basta)
   viaja en el mismo JSON familiar: es sistema de honor, como en casa.
   ===================================================================== */
(function (global) {
  'use strict';

  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function mezclar(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function muestra(arr, n, rng) { return mezclar(arr, rng).slice(0, n); }
  // Texto comparable: minúsculas, sin acentos ni espacios de más.
  function normalizarTexto(t) {
    return String(t == null ? '' : t).toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/gi, '').replace(/\s+/g, ' ').trim();
  }
  function exigirTurno(estado, jugadorIdx) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (jugadorIdx !== estado.turno) throw new Error('No es tu turno');
    if (!estado.jugadores[jugadorIdx]) throw new Error('Jugador inválido');
  }
  function siguienteTurno(estado) {
    return (estado.turno + 1) % Math.max(1, estado.jugadores.length);
  }

  /* ============================ 1. CONECTA 4 ============================ */
  var FICHAS_CONECTA = ['🔴', '🟡', '🔵'];

  function crearConecta(jugadores) {
    return {
      tipo: 'conecta',
      tablero: Array(42).fill(null), // 7 columnas × 6 filas (fila 0 = arriba)
      jugadores: (jugadores || []).slice(0, 3),
      turno: 0,
      ganador: null, // userId
      empate: false,
      terminado: false,
      ultimaCasilla: -1
    };
  }

  function lineaConecta(tablero, idx, ficha) {
    var col = idx % 7, fila = Math.floor(idx / 7);
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var d = 0; d < dirs.length; d++) {
      var cuenta = 1;
      for (var s = -1; s <= 1; s += 2) {
        var c = col + dirs[d][0] * s, f = fila + dirs[d][1] * s;
        while (c >= 0 && c < 7 && f >= 0 && f < 6 && tablero[f * 7 + c] === ficha) {
          cuenta++; c += dirs[d][0] * s; f += dirs[d][1] * s;
        }
      }
      if (cuenta >= 4) return true;
    }
    return false;
  }

  function jugadaConecta(estado, jugadorIdx, columna) {
    exigirTurno(estado, jugadorIdx);
    if (typeof columna !== 'number' || columna < 0 || columna > 6) throw new Error('Columna inválida');
    var tablero = estado.tablero.slice();
    var fila = -1;
    for (var f = 5; f >= 0; f--) { if (tablero[f * 7 + columna] === null) { fila = f; break; } }
    if (fila === -1) throw new Error('Esa columna está llena');
    var idx = fila * 7 + columna;
    tablero[idx] = jugadorIdx; // guardamos el índice del jugador; la UI pinta su ficha
    var nuevo = Object.assign({}, estado, { tablero: tablero, ultimaCasilla: idx });
    if (lineaConecta(tablero, idx, jugadorIdx)) {
      nuevo.terminado = true; nuevo.ganador = estado.jugadores[jugadorIdx];
    } else if (tablero.every(function (c) { return c !== null; })) {
      nuevo.terminado = true; nuevo.empate = true;
    } else {
      nuevo.turno = siguienteTurno(estado);
    }
    return nuevo;
  }

  /* ====================== 2. SERPIENTES Y ESCALERAS ====================== */
  var SERPIENTES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
  var ESCALERAS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };

  function crearSerpientes(jugadores) {
    var posiciones = {};
    (jugadores || []).forEach(function (id) { posiciones[id] = 0; }); // 0 = fuera, esperando salir
    return {
      tipo: 'serpientes', jugadores: (jugadores || []).slice(0, 3),
      posiciones: posiciones, turno: 0, dado: null, evento: null,
      ganador: null, terminado: false
    };
  }

  function tirarSerpientes(estado, jugadorIdx, rng) {
    exigirTurno(estado, jugadorIdx);
    rng = rng || Math.random;
    var dado = 1 + Math.floor(rng() * 6);
    var id = estado.jugadores[jugadorIdx];
    var destino = Math.min(100, (estado.posiciones[id] || 0) + dado);
    var evento = null;
    if (SERPIENTES[destino]) { evento = 'serpiente'; destino = SERPIENTES[destino]; }
    else if (ESCALERAS[destino]) { evento = 'escalera'; destino = ESCALERAS[destino]; }
    var posiciones = Object.assign({}, estado.posiciones);
    posiciones[id] = destino;
    var nuevo = Object.assign({}, estado, { posiciones: posiciones, dado: dado, evento: evento });
    if (destino >= 100) { nuevo.terminado = true; nuevo.ganador = id; }
    else nuevo.turno = siguienteTurno(estado);
    return nuevo;
  }

  /* ============================ 3. AHORCADO ============================ */
  var PALABRAS_AHORCADO = [
    { palabra: 'ELEFANTE', pista: 'Animal' }, { palabra: 'MARIPOSA', pista: 'Animal' },
    { palabra: 'JIRAFA', pista: 'Animal' }, { palabra: 'PINGUINO', pista: 'Animal' },
    { palabra: 'CANGURO', pista: 'Animal' }, { palabra: 'TORTUGA', pista: 'Animal' },
    { palabra: 'DELFIN', pista: 'Animal' }, { palabra: 'BALLENA', pista: 'Animal' },
    { palabra: 'TIGRE', pista: 'Animal' }, { palabra: 'CABALLO', pista: 'Animal' },
    { palabra: 'GALLINA', pista: 'Animal' }, { palabra: 'OSO', pista: 'Animal' },
    { palabra: 'MANZANA', pista: 'Comida' }, { palabra: 'PLATANO', pista: 'Comida' },
    { palabra: 'FRESA', pista: 'Comida' }, { palabra: 'NARANJA', pista: 'Comida' },
    { palabra: 'CHOCOLATE', pista: 'Comida' }, { palabra: 'HELADO', pista: 'Comida' },
    { palabra: 'GALLETA', pista: 'Comida' }, { palabra: 'QUESO', pista: 'Comida' },
    { palabra: 'GUITARRA', pista: 'Instrumento' }, { palabra: 'TAMBOR', pista: 'Instrumento' },
    { palabra: 'FLAUTA', pista: 'Instrumento' }, { palabra: 'VIOLIN', pista: 'Instrumento' },
    { palabra: 'BICICLETA', pista: 'Transporte' }, { palabra: 'AVION', pista: 'Transporte' },
    { palabra: 'BARCO', pista: 'Transporte' }, { palabra: 'TREN', pista: 'Transporte' },
    { palabra: 'ESTRELLA', pista: 'Cielo' }, { palabra: 'ARCOIRIS', pista: 'Cielo' },
    { palabra: 'LUNA', pista: 'Cielo' }, { palabra: 'NUBE', pista: 'Cielo' },
    { palabra: 'CASTILLO', pista: 'Lugar' }, { palabra: 'ESCUELA', pista: 'Lugar' },
    { palabra: 'PLAYA', pista: 'Lugar' }, { palabra: 'BOSQUE', pista: 'Lugar' },
    { palabra: 'VOLCAN', pista: 'Lugar' }, { palabra: 'CASCADA', pista: 'Lugar' },
    { palabra: 'PELOTA', pista: 'Juguete' }, { palabra: 'LIBRO', pista: 'Objeto' },
    { palabra: 'ESPEJO', pista: 'Objeto' }, { palabra: 'VENTANA', pista: 'Objeto' },
    { palabra: 'FLOR', pista: 'Planta' }, { palabra: 'ARBOL', pista: 'Planta' },
    { palabra: 'ZANAHORIA', pista: 'Comida' }, { palabra: 'SANDIA', pista: 'Comida' }
  ];

  function crearAhorcado(jugadores, rng) {
    rng = rng || Math.random;
    var elegido = PALABRAS_AHORCADO[Math.floor(rng() * PALABRAS_AHORCADO.length)];
    return {
      tipo: 'ahorcado', jugadores: (jugadores || []).slice(0, 3),
      palabra: elegido.palabra, pista: elegido.pista,
      usadas: [], fallos: 0, maxFallos: 6, turno: 0,
      terminado: false, ganado: false, ultimoAcertante: null
    };
  }

  function palabraVisibleAhorcado(estado) {
    return estado.palabra.split('').map(function (l) {
      return estado.usadas.indexOf(l) !== -1 ? l : '_';
    }).join(' ');
  }

  function letraAhorcado(estado, jugadorIdx, letra) {
    exigirTurno(estado, jugadorIdx);
    letra = String(letra || '').toUpperCase();
    if (!/^[A-Z]$/.test(letra)) throw new Error('Eso no es una letra');
    if (estado.usadas.indexOf(letra) !== -1) throw new Error('Esa letra ya se usó');
    var usadas = estado.usadas.concat([letra]);
    var acierto = estado.palabra.indexOf(letra) !== -1;
    var fallos = estado.fallos + (acierto ? 0 : 1);
    var nuevo = Object.assign({}, estado, { usadas: usadas, fallos: fallos });
    if (acierto) nuevo.ultimoAcertante = estado.jugadores[jugadorIdx];
    var completa = estado.palabra.split('').every(function (l) { return usadas.indexOf(l) !== -1; });
    if (completa) { nuevo.terminado = true; nuevo.ganado = true; }
    else if (fallos >= estado.maxFallos) { nuevo.terminado = true; nuevo.ganado = false; }
    else nuevo.turno = siguienteTurno(estado);
    return nuevo;
  }

  /* ========================= 4. DIBUJO Y ADIVINA ========================= */
  var PALABRAS_DIBUJO = ['SOL', 'LUNA', 'CASA', 'ARBOL', 'FLOR', 'PEZ', 'GATO', 'PERRO', 'BARCO', 'AVION',
    'COCHE', 'PELOTA', 'ESTRELLA', 'CORAZON', 'MANZANA', 'PLATANO', 'HELADO', 'PARAGUAS', 'BICICLETA', 'TREN',
    'CASTILLO', 'FANTASMA', 'ROBOT', 'MARIPOSA', 'TORTUGA', 'LEON', 'OSO', 'PAJARO', 'NUBE', 'ARCOIRIS'];

  function opcionesDibujo(rng) { return muestra(PALABRAS_DIBUJO, 3, rng); }

  function crearDibujo(jugadores, rng) {
    rng = rng || Math.random;
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    return {
      tipo: 'dibujo', jugadores: (jugadores || []).slice(0, 3),
      ronda: 1, dibujante: 0, fase: 'elegir', // elegir | dibujando | final
      opciones: opcionesDibujo(rng), palabra: null,
      trazos: [], aciertos: {}, puntajes: puntajes,
      duracionSeg: 60, terminado: false
    };
  }

  function dibujanteDe(estado) { return estado.jugadores[estado.dibujante]; }

  function elegirPalabraDibujo(estado, jugadorIdx, opcionIdx) {
    if (estado.terminado || estado.fase !== 'elegir') throw new Error('Ahora no se elige palabra');
    if (jugadorIdx !== estado.dibujante) throw new Error('Solo dibuja quien tiene el lápiz');
    var palabra = estado.opciones[opcionIdx];
    if (!palabra) throw new Error('Opción inválida');
    return Object.assign({}, estado, { palabra: palabra, fase: 'dibujando', trazos: [], aciertos: {} });
  }

  function intentoDibujo(estado, userId, texto) {
    if (estado.fase !== 'dibujando') throw new Error('Todavía no se está dibujando');
    if (userId === dibujanteDe(estado)) throw new Error('Quien dibuja no adivina 😉');
    if (estado.aciertos[userId]) throw new Error('¡Ya acertaste esta ronda!');
    var nuevo = copia(estado);
    if (normalizarTexto(texto) === normalizarTexto(estado.palabra)) {
      nuevo.aciertos[userId] = true;
      nuevo.puntajes[userId] = (nuevo.puntajes[userId] || 0) + 30;
      var d = dibujanteDe(estado);
      nuevo.puntajes[d] = (nuevo.puntajes[d] || 0) + 10; // el artista también gana
      return { estado: nuevo, acierto: true };
    }
    return { estado: estado, acierto: false };
  }

  function cerrarRondaDibujo(estado, rng) {
    if (estado.fase === 'final') throw new Error('La partida ya terminó');
    rng = rng || Math.random;
    var totalRondas = Math.max(1, estado.jugadores.length) * 2;
    if (estado.ronda >= totalRondas) {
      return Object.assign({}, estado, { fase: 'final', terminado: true });
    }
    var ronda = estado.ronda + 1;
    return Object.assign({}, estado, {
      ronda: ronda, dibujante: (ronda - 1) % estado.jugadores.length,
      fase: 'elegir', opciones: opcionesDibujo(rng), palabra: null, trazos: [], aciertos: {}
    });
  }

  /* ====================== 5. PARCHÍS SIMPLIFICADO ====================== */
  var PARCHIS_CASILLAS = 40;
  var PARCHIS_SEGUROS = [0, 5, 10, 15, 20, 25, 30, 35]; // casillas absolutas seguras
  function salidaParchis(jugadorIdx) { return jugadorIdx * 10; }

  function crearParchis(jugadores) {
    var fichas = {};
    (jugadores || []).forEach(function (id) { fichas[id] = [-1, -1]; }); // -1 = en casa
    return {
      tipo: 'parchis', jugadores: (jugadores || []).slice(0, 3),
      fichas: fichas, turno: 0, fase: 'dado', dado: null,
      evento: null, ganador: null, terminado: false
    };
  }

  // Destino (progreso 0..40) de una ficha con un dado, o null si no puede moverse.
  function destinoParchis(progreso, dado) {
    if (progreso === -1) return dado === 5 ? 0 : null;
    var dest = progreso + dado;
    if (dest > 40) dest = 40 - (dest - 40); // rebote simple al pasar la meta
    return dest;
  }

  function movimientosParchis(estado, jugadorIdx, dado) {
    var id = estado.jugadores[jugadorIdx];
    var lista = [];
    (estado.fichas[id] || []).forEach(function (prog, ficha) {
      if (prog === 40) return; // ya llegó
      var dest = destinoParchis(prog, dado);
      if (dest !== null) lista.push({ ficha: ficha, desde: prog, destino: dest });
    });
    return lista;
  }

  function tirarParchis(estado, jugadorIdx, rng) {
    exigirTurno(estado, jugadorIdx);
    if (estado.fase !== 'dado') throw new Error('Ya tiraste el dado');
    rng = rng || Math.random;
    var dado = 1 + Math.floor(rng() * 6);
    var nuevo = Object.assign({}, estado, { dado: dado, evento: null });
    if (!movimientosParchis(estado, jugadorIdx, dado).length) {
      // Sin movimientos posibles: el turno pasa solito, sin dramas.
      nuevo.fase = 'dado'; nuevo.dado = null;
      nuevo.turno = siguienteTurno(estado);
      nuevo.evento = 'sin-movimientos';
    } else {
      nuevo.fase = 'mover';
    }
    return nuevo;
  }

  function moverParchis(estado, jugadorIdx, fichaIdx) {
    exigirTurno(estado, jugadorIdx);
    if (estado.fase !== 'mover' || estado.dado == null) throw new Error('Primero tira el dado');
    var id = estado.jugadores[jugadorIdx];
    var mov = movimientosParchis(estado, jugadorIdx, estado.dado)
      .filter(function (m) { return m.ficha === fichaIdx; })[0];
    if (!mov) throw new Error('Esa ficha no se puede mover así');
    var fichas = copia(estado.fichas);
    fichas[id][fichaIdx] = mov.destino;
    var evento = null;
    // Captura: caer en la casilla absoluta de un rival (si no es segura).
    if (mov.destino >= 0 && mov.destino < 40) {
      var absoluta = (salidaParchis(jugadorIdx) + mov.destino) % PARCHIS_CASILLAS;
      if (PARCHIS_SEGUROS.indexOf(absoluta) === -1) {
        estado.jugadores.forEach(function (otroId, otroIdx) {
          if (otroId === id) return;
          fichas[otroId] = fichas[otroId].map(function (prog) {
            if (prog >= 0 && prog < 40 && (salidaParchis(otroIdx) + prog) % PARCHIS_CASILLAS === absoluta) {
              evento = 'captura';
              return -1; // ¡a casa!
            }
            return prog;
          });
        });
      }
    }
    var nuevo = Object.assign({}, estado, { fichas: fichas, dado: null, fase: 'dado', evento: evento });
    if (fichas[id].every(function (p) { return p === 40; })) {
      nuevo.terminado = true; nuevo.ganador = id;
    } else {
      nuevo.turno = siguienteTurno(estado);
    }
    return nuevo;
  }

  /* ============================ 6. DOMINÓ ============================ */
  function crearDomino(jugadores) {
    return {
      tipo: 'domino', jugadores: (jugadores || []).slice(0, 3),
      fase: 'esperando', // esperando | jugando
      manos: {}, mesa: [], pozo: [], turno: 0, pases: 0,
      ganador: null, empatado: false, terminado: false, puntajesBloqueo: null
    };
  }

  function iniciarDomino(estado, rng) {
    if (estado.fase !== 'esperando') throw new Error('La partida ya empezó');
    if (estado.jugadores.length < 2) throw new Error('Hacen falta al menos 2 jugadores');
    rng = rng || Math.random;
    var fichas = [];
    for (var a = 0; a <= 6; a++) for (var b = a; b <= 6; b++) fichas.push([a, b]);
    fichas = mezclar(fichas, rng);
    var manos = {};
    estado.jugadores.forEach(function (id) { manos[id] = fichas.splice(0, 7); });
    var turno = 0; // sale quien tenga el doble seis, si no, el primero
    estado.jugadores.forEach(function (id, i) {
      if (manos[id].some(function (f) { return f[0] === 6 && f[1] === 6; })) turno = i;
    });
    return Object.assign({}, estado, {
      fase: 'jugando', manos: manos, pozo: fichas, mesa: [], turno: turno, pases: 0
    });
  }

  function extremosDomino(estado) {
    if (!estado.mesa.length) return null;
    return [estado.mesa[0][0], estado.mesa[estado.mesa.length - 1][1]];
  }
  function fichaCaza(ficha, extremos) {
    if (!extremos) return true;
    return ficha[0] === extremos[0] || ficha[1] === extremos[0] ||
           ficha[0] === extremos[1] || ficha[1] === extremos[1];
  }
  function puedeJugarDomino(estado, userId) {
    var ext = extremosDomino(estado);
    return (estado.manos[userId] || []).some(function (f) { return fichaCaza(f, ext); });
  }

  function jugarDomino(estado, jugadorIdx, fichaIdx, lado) {
    exigirTurno(estado, jugadorIdx);
    if (estado.fase !== 'jugando') throw new Error('La partida aún no empieza');
    var id = estado.jugadores[jugadorIdx];
    var mano = (estado.manos[id] || []).slice();
    var ficha = mano[fichaIdx];
    if (!ficha) throw new Error('Ficha inválida');
    var mesa = estado.mesa.map(function (f) { return f.slice(); });
    if (!mesa.length) {
      mesa.push(ficha.slice());
    } else {
      var ext = extremosDomino(estado);
      if (lado === 'izquierda') {
        if (ficha[1] === ext[0]) mesa.unshift([ficha[0], ficha[1]]);
        else if (ficha[0] === ext[0]) mesa.unshift([ficha[1], ficha[0]]);
        else throw new Error('Esa ficha no caza por la izquierda');
      } else if (lado === 'derecha') {
        if (ficha[0] === ext[1]) mesa.push([ficha[0], ficha[1]]);
        else if (ficha[1] === ext[1]) mesa.push([ficha[1], ficha[0]]);
        else throw new Error('Esa ficha no caza por la derecha');
      } else {
        throw new Error('Di por qué lado va: izquierda o derecha');
      }
    }
    mano.splice(fichaIdx, 1);
    var manos = Object.assign({}, estado.manos); manos[id] = mano;
    var nuevo = Object.assign({}, estado, { manos: manos, mesa: mesa, pases: 0 });
    if (!mano.length) { nuevo.terminado = true; nuevo.ganador = id; }
    else nuevo.turno = siguienteTurno(estado);
    return nuevo;
  }

  function robarDomino(estado, jugadorIdx) {
    exigirTurno(estado, jugadorIdx);
    if (puedeJugarDomino(estado, estado.jugadores[jugadorIdx])) throw new Error('¡Sí puedes jugar! No vale robar');
    if (!estado.pozo.length) throw new Error('El pozo está vacío: toca pasar');
    var pozo = estado.pozo.slice();
    var manos = Object.assign({}, estado.manos);
    var id = estado.jugadores[jugadorIdx];
    manos[id] = (manos[id] || []).concat([pozo.pop()]);
    return Object.assign({}, estado, { manos: manos, pozo: pozo });
  }

  function pasarDomino(estado, jugadorIdx) {
    exigirTurno(estado, jugadorIdx);
    var id = estado.jugadores[jugadorIdx];
    if (puedeJugarDomino(estado, id)) throw new Error('¡Sí puedes jugar! No vale pasar');
    if (estado.pozo.length) throw new Error('Todavía hay pozo: roba una ficha');
    var pases = estado.pases + 1;
    var nuevo = Object.assign({}, estado, { pases: pases });
    if (pases >= estado.jugadores.length) {
      // ¡Tranca! Gana quien tenga menos puntos en la mano.
      var puntajes = {};
      estado.jugadores.forEach(function (uid) {
        puntajes[uid] = (estado.manos[uid] || []).reduce(function (s, f) { return s + f[0] + f[1]; }, 0);
      });
      var mejor = Math.min.apply(null, estado.jugadores.map(function (uid) { return puntajes[uid]; }));
      var ganadores = estado.jugadores.filter(function (uid) { return puntajes[uid] === mejor; });
      nuevo.terminado = true;
      nuevo.puntajesBloqueo = puntajes;
      nuevo.ganador = ganadores.length === 1 ? ganadores[0] : null;
      nuevo.empatado = ganadores.length !== 1;
    } else {
      nuevo.turno = siguienteTurno(estado);
    }
    return nuevo;
  }

  /* ========================= 7. BATALLA NAVAL ========================= */
  // Ojo, familia: los barcos de todos viven en el mismo JSON de la partida.
  // Es sistema de honor, como jugar en la mesa de la cocina: ¡nada de espiar!
  function colocarBarcosNaval(rng) {
    rng = rng || Math.random;
    var ocupadas = {}, barcos = [];
    [3, 2, 2].forEach(function (tam) {
      var puesto = false;
      while (!puesto) {
        var horizontal = rng() < 0.5;
        var fila = Math.floor(rng() * 8), col = Math.floor(rng() * 8);
        var celdas = [];
        for (var i = 0; i < tam; i++) {
          var f = fila + (horizontal ? 0 : i), c = col + (horizontal ? i : 0);
          if (f > 7 || c > 7) { celdas = null; break; }
          celdas.push(f * 8 + c);
        }
        if (celdas && celdas.every(function (cel) { return !ocupadas[cel]; })) {
          celdas.forEach(function (cel) { ocupadas[cel] = true; });
          barcos.push(celdas); puesto = true;
        }
      }
    });
    return barcos;
  }

  function crearNaval(jugadores, rng) {
    // Los barcos nacen colocados al azar: antes de empezar cada quien puede
    // ver los suyos y recolocarlos con 🔀 (recolocarNaval).
    var barcos = {};
    (jugadores || []).slice(0, 2).forEach(function (id) { barcos[id] = colocarBarcosNaval(rng); });
    return {
      tipo: 'naval', jugadores: (jugadores || []).slice(0, 2),
      fase: 'esperando', // esperando | batalla
      barcos: barcos, disparos: {}, turno: 0,
      ganador: null, terminado: false, ultimoDisparo: null
    };
  }

  function iniciarNaval(estado, rng) {
    if (estado.fase !== 'esperando') throw new Error('La partida ya empezó');
    if (estado.jugadores.length !== 2) throw new Error('La batalla naval es de 2 jugadores');
    var barcos = {}, disparos = {};
    estado.jugadores.forEach(function (id) {
      // Respeta los barcos ya colocados/recolocados; solo coloca a quien no tenga.
      barcos[id] = (estado.barcos && estado.barcos[id]) || colocarBarcosNaval(rng);
      disparos[id] = {}; // casilla -> 'tocado' | 'agua' (disparos QUE HIZO este jugador)
    });
    return Object.assign({}, estado, { fase: 'batalla', barcos: barcos, disparos: disparos });
  }

  function recolocarNaval(estado, userId, rng) {
    if (estado.fase !== 'esperando') throw new Error('Ya empezó la batalla: los barcos no se mueven');
    var barcos = Object.assign({}, estado.barcos);
    barcos[userId] = colocarBarcosNaval(rng);
    return Object.assign({}, estado, { barcos: barcos });
  }

  function celdasBarco(barcos) {
    var set = {};
    (barcos || []).forEach(function (b) { b.forEach(function (c) { set[c] = true; }); });
    return set;
  }

  function dispararNaval(estado, jugadorIdx, casilla) {
    exigirTurno(estado, jugadorIdx);
    if (estado.fase !== 'batalla') throw new Error('La batalla aún no empieza');
    if (typeof casilla !== 'number' || casilla < 0 || casilla > 63) throw new Error('Casilla inválida');
    var atacante = estado.jugadores[jugadorIdx];
    var defensor = estado.jugadores[1 - jugadorIdx];
    var disparos = copia(estado.disparos);
    if (disparos[atacante][casilla]) throw new Error('Ahí ya disparaste');
    var esBarco = !!celdasBarco(estado.barcos[defensor])[casilla];
    disparos[atacante][casilla] = esBarco ? 'tocado' : 'agua';
    var hundido = false;
    if (esBarco) {
      var barco = estado.barcos[defensor].filter(function (b) { return b.indexOf(casilla) !== -1; })[0];
      hundido = barco.every(function (c) { return disparos[atacante][c] === 'tocado'; });
    }
    var nuevo = Object.assign({}, estado, {
      disparos: disparos,
      ultimoDisparo: { de: atacante, casilla: casilla, resultado: esBarco ? (hundido ? 'hundido' : 'tocado') : 'agua' }
    });
    var totalBarco = Object.keys(celdasBarco(estado.barcos[defensor])).length;
    var tocados = Object.keys(disparos[atacante]).filter(function (c) { return disparos[atacante][c] === 'tocado'; }).length;
    if (tocados >= totalBarco) { nuevo.terminado = true; nuevo.ganador = atacante; }
    else if (!esBarco) nuevo.turno = 1 - jugadorIdx; // con acierto se repite turno
    return nuevo;
  }

  /* ========================== 8. SOPA DE LETRAS ========================== */
  var PALABRAS_SOPA = ['FAMILIA', 'AMIGOS', 'ESCUELA', 'PLAYA', 'MUSICA', 'FIESTA',
    'JARDIN', 'VERANO', 'LIBRO', 'PERRO', 'SOL', 'LUNA', 'MAR', 'FLOR'];
  var LETRAS_SOPA = 'AEIOU' + 'BCDFGLMNPQRSTV' + 'AEIOU';

  function crearSopa(jugadores, rng) {
    rng = rng || Math.random;
    var elegidas = muestra(PALABRAS_SOPA, 6, rng);
    var rejilla = Array(100).fill(null);
    var palabras = [];
    elegidas.forEach(function (palabra) {
      var puesta = false, intentos = 0;
      while (!puesta && intentos < 300) {
        intentos++;
        var horizontal = rng() < 0.5;
        var fila = Math.floor(rng() * 10), col = Math.floor(rng() * 10);
        var celdas = [];
        for (var i = 0; i < palabra.length; i++) {
          var f = fila + (horizontal ? 0 : i), c = col + (horizontal ? i : 0);
          if (f > 9 || c > 9) { celdas = null; break; }
          var idx = f * 10 + c;
          if (rejilla[idx] && rejilla[idx] !== palabra[i]) { celdas = null; break; }
          celdas.push(idx);
        }
        if (celdas) {
          celdas.forEach(function (idx, i) { rejilla[idx] = palabra[i]; });
          palabras.push({ palabra: palabra, inicio: celdas[0], fin: celdas[celdas.length - 1], por: null });
          puesta = true;
        }
      }
    });
    for (var k = 0; k < 100; k++) {
      if (!rejilla[k]) rejilla[k] = LETRAS_SOPA[Math.floor(rng() * LETRAS_SOPA.length)];
    }
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    return {
      tipo: 'sopa', jugadores: (jugadores || []).slice(0, 3),
      rejilla: rejilla, palabras: palabras, puntajes: puntajes, terminado: false
    };
  }

  function caminoSopa(inicio, fin) {
    var f0 = Math.floor(inicio / 10), c0 = inicio % 10;
    var f1 = Math.floor(fin / 10), c1 = fin % 10;
    var celdas = [], i;
    if (f0 === f1 && c1 >= c0) { for (i = c0; i <= c1; i++) celdas.push(f0 * 10 + i); }
    else if (c0 === c1 && f1 >= f0) { for (i = f0; i <= f1; i++) celdas.push(i * 10 + c0); }
    else return null;
    return celdas;
  }

  function marcarSopa(estado, userId, inicio, fin) {
    if (estado.terminado) throw new Error('La sopa ya se acabó');
    var celdas = caminoSopa(inicio, fin);
    if (!celdas) throw new Error('Marca en línea recta: primera y última letra');
    var texto = celdas.map(function (i) { return estado.rejilla[i]; }).join('');
    var idxPalabra = -1;
    estado.palabras.forEach(function (p, i) { if (!p.por && p.palabra === texto) idxPalabra = i; });
    if (idxPalabra === -1) throw new Error('Esa no es una palabra de la lista… ¡sigue buscando!');
    var palabras = copia(estado.palabras);
    palabras[idxPalabra].por = userId;
    var puntajes = Object.assign({}, estado.puntajes);
    puntajes[userId] = (puntajes[userId] || 0) + 1;
    var terminado = palabras.every(function (p) { return !!p.por; });
    return Object.assign({}, estado, { palabras: palabras, puntajes: puntajes, terminado: terminado });
  }

  /* ============================ 9. ¡BASTA! ============================ */
  var CATEGORIAS_BASTA = ['Nombre', 'Animal', 'Comida', 'Ciudad o país', 'Cosa'];
  var LETRAS_BASTA = 'ABCDEFGLMNPRSTV';

  function crearBasta(jugadores, rng) {
    rng = rng || Math.random;
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    return {
      tipo: 'basta', jugadores: (jugadores || []).slice(0, 3),
      ronda: 1, rondasTotales: 3,
      letra: LETRAS_BASTA[Math.floor(rng() * LETRAS_BASTA.length)],
      fase: 'escribiendo', // escribiendo | puntuando | puntuada | final
      respuestas: {}, marcas: {}, puntajes: puntajes,
      cerradaPor: null, terminado: false
    };
  }

  function enviarRespuestasBasta(estado, userId, respuestas) {
    if (estado.fase !== 'escribiendo') throw new Error('La ronda ya se cerró');
    var limpias = {};
    CATEGORIAS_BASTA.forEach(function (cat) {
      limpias[cat] = String((respuestas || {})[cat] || '').trim().slice(0, 40);
    });
    var todas = Object.assign({}, estado.respuestas);
    todas[userId] = limpias;
    return Object.assign({}, estado, { respuestas: todas });
  }

  function cerrarBasta(estado, userId) {
    if (estado.fase !== 'escribiendo') throw new Error('La ronda ya se cerró');
    return Object.assign({}, estado, { fase: 'puntuando', cerradaPor: userId });
  }

  // Cada quien marca con honestidad si SUS respuestas valen (existen y van con la letra).
  function marcarBasta(estado, userId, categoria, valida) {
    if (estado.fase !== 'puntuando') throw new Error('Todavía no estamos puntuando');
    if (CATEGORIAS_BASTA.indexOf(categoria) === -1) throw new Error('Categoría inválida');
    var marcas = copia(estado.marcas);
    if (!marcas[userId]) marcas[userId] = {};
    marcas[userId][categoria] = !!valida;
    return Object.assign({}, estado, { marcas: marcas });
  }

  // Única entre las válidas = 10 · repetida = 5 · vacía o inválida = 0.
  function puntuarBasta(estado) {
    if (estado.fase !== 'puntuando') throw new Error('Todavía no estamos puntuando');
    var puntajes = Object.assign({}, estado.puntajes);
    CATEGORIAS_BASTA.forEach(function (cat) {
      var conteo = {};
      estado.jugadores.forEach(function (uid) {
        var texto = normalizarTexto((estado.respuestas[uid] || {})[cat]);
        var valida = texto && estado.marcas[uid] && estado.marcas[uid][cat];
        if (valida) conteo[texto] = (conteo[texto] || 0) + 1;
      });
      estado.jugadores.forEach(function (uid) {
        var texto = normalizarTexto((estado.respuestas[uid] || {})[cat]);
        var valida = texto && estado.marcas[uid] && estado.marcas[uid][cat];
        if (!valida) return;
        puntajes[uid] = (puntajes[uid] || 0) + (conteo[texto] > 1 ? 5 : 10);
      });
    });
    var esFinal = estado.ronda >= estado.rondasTotales;
    return Object.assign({}, estado, {
      puntajes: puntajes,
      fase: esFinal ? 'final' : 'puntuada',
      terminado: esFinal
    });
  }

  function siguienteBasta(estado, rng) {
    if (estado.fase !== 'puntuada') throw new Error('Primero hay que puntuar la ronda');
    rng = rng || Math.random;
    return Object.assign({}, estado, {
      ronda: estado.ronda + 1,
      letra: LETRAS_BASTA[Math.floor(rng() * LETRAS_BASTA.length)],
      fase: 'escribiendo', respuestas: {}, marcas: {}, cerradaPor: null
    });
  }

  /* =========================== 10. SIMÓN DICE =========================== */
  var COLORES_SIMON = ['rojo', 'verde', 'azul', 'amarillo'];
  var NOTAS_SIMON = { rojo: 329.63, verde: 261.63, azul: 392.0, amarillo: 440.0 };

  function crearSimon(jugadores, rng) {
    rng = rng || Math.random;
    var vivos = {}, puntajes = {};
    (jugadores || []).forEach(function (id) { vivos[id] = true; puntajes[id] = 0; });
    return {
      tipo: 'simon', jugadores: (jugadores || []).slice(0, 3),
      secuencia: [COLORES_SIMON[Math.floor(rng() * 4)]],
      turno: 0, progreso: 0, vivos: vivos, puntajes: puntajes,
      ronda: 1, ganador: null, terminado: false, ultimoError: null
    };
  }

  function siguienteVivo(estado, desde) {
    var n = estado.jugadores.length;
    for (var paso = 1; paso <= n; paso++) {
      var idx = (desde + paso) % n;
      if (estado.vivos[estado.jugadores[idx]]) return idx;
    }
    return desde;
  }

  function presionarSimon(estado, jugadorIdx, color, rng) {
    exigirTurno(estado, jugadorIdx);
    rng = rng || Math.random;
    var id = estado.jugadores[jugadorIdx];
    if (!estado.vivos[id]) throw new Error('Ya quedaste fuera de esta partida');
    var esperado = estado.secuencia[estado.progreso];
    var nuevo = copia(estado);
    if (color !== esperado) {
      // ¡Uy! Ese color no era: sale del juego (sin lágrimas, es Simón).
      nuevo.vivos[id] = false;
      nuevo.ultimoError = id;
      nuevo.progreso = 0;
      var quedan = estado.jugadores.filter(function (uid) { return nuevo.vivos[uid]; });
      if (quedan.length <= 1) {
        nuevo.terminado = true;
        nuevo.ganador = quedan.length === 1 ? quedan[0] : null;
      } else {
        nuevo.turno = siguienteVivo(nuevo, jugadorIdx);
      }
      return nuevo;
    }
    nuevo.progreso = estado.progreso + 1;
    if (nuevo.progreso >= estado.secuencia.length) {
      // ¡Secuencia completa! Punto, la secuencia crece y sigue el próximo.
      nuevo.puntajes[id] = (nuevo.puntajes[id] || 0) + 1;
      nuevo.progreso = 0;
      nuevo.ronda = estado.ronda + 1;
      nuevo.ultimoError = null;
      if (estado.secuencia.length >= 12) {
        var mejor = -1, ganador = null;
        estado.jugadores.forEach(function (uid) {
          if (nuevo.vivos[uid] && nuevo.puntajes[uid] > mejor) { mejor = nuevo.puntajes[uid]; ganador = uid; }
        });
        nuevo.terminado = true; nuevo.ganador = ganador;
      } else {
        nuevo.secuencia = estado.secuencia.concat([COLORES_SIMON[Math.floor(rng() * 4)]]);
        nuevo.turno = siguienteVivo(nuevo, jugadorIdx);
      }
    }
    return nuevo;
  }

  /* ========================= 11. CÁLCULO RÁPIDO ========================= */
  function generarOperacion(rng, ronda) {
    rng = rng || Math.random;
    var ops = ronda <= 3 ? ['+', '-'] : ronda <= 7 ? ['+', '-', '×'] : ['+', '-', '×', '×'];
    var op = ops[Math.floor(rng() * ops.length)];
    var a, b;
    if (op === '×') { a = 2 + Math.floor(rng() * 8); b = 2 + Math.floor(rng() * 8); }
    else if (op === '+') { a = 3 + Math.floor(rng() * (ronda <= 3 ? 20 : 60)); b = 3 + Math.floor(rng() * (ronda <= 3 ? 20 : 60)); }
    else { a = 10 + Math.floor(rng() * (ronda <= 3 ? 20 : 70)); b = Math.floor(rng() * a); } // resta sin negativos
    var respuesta = op === '+' ? a + b : op === '-' ? a - b : a * b;
    return { a: a, op: op, b: b, respuesta: respuesta };
  }

  function crearCalculo(jugadores, rng) {
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    return {
      tipo: 'calculo', jugadores: (jugadores || []).slice(0, 3),
      ronda: 1, rondasTotales: 10,
      operacion: generarOperacion(rng, 1),
      respuestas: {}, puntajes: puntajes,
      rondaCerrada: false, ganadorRonda: null, terminado: false
    };
  }

  function responderCalculo(estado, userId, valor) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.rondaCerrada) throw new Error('Esta ronda ya se cerró');
    if (estado.respuestas[userId]) throw new Error('Ya respondiste esta ronda');
    var respuestas = Object.assign({}, estado.respuestas);
    var correcta = Number(valor) === estado.operacion.respuesta;
    respuestas[userId] = { valor: valor, correcta: correcta };
    var nuevo = Object.assign({}, estado, { respuestas: respuestas });
    if (correcta && !estado.ganadorRonda) {
      // ¡El más rápido se lleva la ronda!
      var puntajes = Object.assign({}, estado.puntajes);
      puntajes[userId] = (puntajes[userId] || 0) + 10;
      nuevo.puntajes = puntajes;
      nuevo.ganadorRonda = userId;
      nuevo.rondaCerrada = true;
    } else if (Object.keys(respuestas).length >= estado.jugadores.length) {
      nuevo.rondaCerrada = true; // todos intentaron y nadie acertó
    }
    return nuevo;
  }

  function siguienteCalculo(estado, rng) {
    if (!estado.rondaCerrada) throw new Error('La ronda sigue abierta');
    if (estado.ronda >= estado.rondasTotales) {
      return Object.assign({}, estado, { terminado: true, rondaCerrada: true });
    }
    var ronda = estado.ronda + 1;
    return Object.assign({}, estado, {
      ronda: ronda, operacion: generarOperacion(rng, ronda),
      respuestas: {}, rondaCerrada: false, ganadorRonda: null
    });
  }

  /* ===================== 12. PIEDRA, PAPEL O TIJERA ===================== */
  var OPCIONES_PPT = ['piedra', 'papel', 'tijera'];
  var GANA_A = { piedra: 'tijera', tijera: 'papel', papel: 'piedra' }; // la llave le gana al valor

  function crearPPT(jugadores) {
    var marcador = {};
    (jugadores || []).forEach(function (id) { marcador[id] = 0; });
    return {
      tipo: 'ppt', jugadores: (jugadores || []).slice(0, 3),
      ronda: 1, elecciones: {}, marcador: marcador,
      fase: 'eligiendo', // eligiendo | revelado
      ultimoResultado: null, ganador: null, terminado: false, rondasParaGanar: 3
    };
  }

  function elegirPPT(estado, userId, eleccion) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.fase !== 'eligiendo') throw new Error('Espera a la siguiente ronda');
    if (OPCIONES_PPT.indexOf(eleccion) === -1) throw new Error('Elige piedra, papel o tijera');
    if (estado.elecciones[userId]) throw new Error('Ya elegiste: ¡sin cambiar!');
    var elecciones = Object.assign({}, estado.elecciones);
    elecciones[userId] = eleccion;
    var nuevo = Object.assign({}, estado, { elecciones: elecciones });
    var todosEligieron = estado.jugadores.every(function (uid) { return !!elecciones[uid]; });
    if (!todosEligieron) return nuevo;
    // Revelamos: con 2 opciones distintas gana la que vence; si salen las 3 (o una), empate.
    var distintas = [];
    estado.jugadores.forEach(function (uid) {
      if (distintas.indexOf(elecciones[uid]) === -1) distintas.push(elecciones[uid]);
    });
    var marcador = Object.assign({}, estado.marcador);
    var ganadoresRonda = [];
    if (distintas.length === 2) {
      var ganadora = GANA_A[distintas[0]] === distintas[1] ? distintas[0] : distintas[1];
      estado.jugadores.forEach(function (uid) {
        if (elecciones[uid] === ganadora) { marcador[uid] = (marcador[uid] || 0) + 1; ganadoresRonda.push(uid); }
      });
    }
    nuevo.marcador = marcador;
    nuevo.fase = 'revelado';
    nuevo.ultimoResultado = { elecciones: elecciones, ganadores: ganadoresRonda };
    var campeon = estado.jugadores.filter(function (uid) { return marcador[uid] >= estado.rondasParaGanar; })[0];
    if (campeon) { nuevo.terminado = true; nuevo.ganador = campeon; }
    return nuevo;
  }

  function siguientePPT(estado) {
    if (estado.fase !== 'revelado') throw new Error('Todavía no se reveló la ronda');
    if (estado.terminado) throw new Error('La partida ya terminó');
    return Object.assign({}, estado, {
      ronda: estado.ronda + 1, elecciones: {}, fase: 'eligiendo', ultimoResultado: estado.ultimoResultado
    });
  }

  /* ======================== 13. ADIVINA EL NÚMERO ======================== */
  function crearAdivina(jugadores, rng) {
    rng = rng || Math.random;
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    return {
      tipo: 'adivina', jugadores: (jugadores || []).slice(0, 3),
      ronda: 1, rondasTotales: 3,
      secreto: 1 + Math.floor(rng() * 100),
      turno: 0, intentos: {}, historial: [], puntajes: puntajes,
      fase: 'jugando', // jugando | ronda-fin
      ganadorRonda: null, terminado: false
    };
  }

  function adivinarNumero(estado, jugadorIdx, numero) {
    exigirTurno(estado, jugadorIdx);
    if (estado.fase !== 'jugando') throw new Error('La ronda ya terminó');
    numero = Number(numero);
    if (!isFinite(numero) || numero < 1 || numero > 100) throw new Error('Di un número del 1 al 100');
    var id = estado.jugadores[jugadorIdx];
    var intentos = Object.assign({}, estado.intentos);
    intentos[id] = (intentos[id] || 0) + 1;
    if (numero === estado.secreto) {
      var puntos = Math.max(10, 50 - 5 * (intentos[id] - 1)); // menos intentos = más puntos
      var puntajes = Object.assign({}, estado.puntajes);
      puntajes[id] = (puntajes[id] || 0) + puntos;
      return Object.assign({}, estado, {
        intentos: intentos, puntajes: puntajes, fase: 'ronda-fin', ganadorRonda: id,
        historial: estado.historial.concat([{ de: id, numero: numero, pista: 'exacto' }])
      });
    }
    return Object.assign({}, estado, {
      intentos: intentos,
      historial: estado.historial.concat([{ de: id, numero: numero, pista: numero < estado.secreto ? 'mayor' : 'menor' }]),
      turno: siguienteTurno(estado)
    });
  }

  function siguienteAdivina(estado, rng) {
    if (estado.fase !== 'ronda-fin') throw new Error('La ronda sigue en juego');
    rng = rng || Math.random;
    if (estado.ronda >= estado.rondasTotales) {
      return Object.assign({}, estado, { terminado: true, fase: 'final' });
    }
    return Object.assign({}, estado, {
      ronda: estado.ronda + 1, secreto: 1 + Math.floor(rng() * 100),
      turno: 0, intentos: {}, historial: [], fase: 'jugando', ganadorRonda: null
    });
  }

  /* ==================== BIBLIA: VERSÍCULO DEL DÍA ==================== */
  var VERSICULOS_DIA = [
    { texto: 'El Señor es mi pastor; nada me faltará.', cita: 'Salmo 23:1' },
    { texto: 'Este es el día que hizo el Señor; nos gozaremos y alegraremos en él.', cita: 'Salmo 118:24' },
    { texto: 'Todo lo puedo en Cristo que me fortalece.', cita: 'Filipenses 4:13' },
    { texto: 'Sé fuerte y valiente. No tengas miedo, porque el Señor tu Dios estará contigo dondequiera que vayas.', cita: 'Josué 1:9' },
    { texto: 'En el día que temo, yo en ti confío.', cita: 'Salmo 56:3' },
    { texto: 'No temas, porque yo estoy contigo; no te angusties, porque yo soy tu Dios.', cita: 'Isaías 41:10' },
    { texto: 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo único, para que todo el que cree en él no se pierda, sino que tenga vida eterna.', cita: 'Juan 3:16' },
    { texto: 'Para los hombres es imposible, pero no para Dios; porque todas las cosas son posibles para Dios.', cita: 'Marcos 10:27' },
    { texto: 'Dios es nuestro amparo y fortaleza, nuestro pronto auxilio en las tribulaciones.', cita: 'Salmo 46:1' },
    { texto: 'Confía en el Señor con todo tu corazón, y no te apoyes en tu propia prudencia.', cita: 'Proverbios 3:5' },
    { texto: 'Den gracias al Señor, porque él es bueno; porque para siempre es su misericordia.', cita: 'Salmo 136:1' },
    { texto: 'Nosotros le amamos a él, porque él nos amó primero.', cita: '1 Juan 4:19' },
    { texto: 'Brille su luz delante de todos, para que vean sus buenas obras y glorifiquen a su Padre que está en los cielos.', cita: 'Mateo 5:16' },
    { texto: 'El fruto del Espíritu es amor, gozo, paz, paciencia, benignidad, bondad y fe.', cita: 'Gálatas 5:22' },
    { texto: 'Ama al Señor tu Dios con todo tu corazón, con toda tu alma y con toda tu mente.', cita: 'Mateo 22:37' },
    { texto: 'Ama a tu prójimo como a ti mismo.', cita: 'Mateo 22:39' },
    { texto: 'Dichosos los que oyen la palabra de Dios y la guardan.', cita: 'Lucas 11:28' },
    { texto: 'Mi Dios, pues, suplirá todo lo que les falta conforme a sus riquezas en gloria.', cita: 'Filipenses 4:19' },
    { texto: 'El Señor es mi luz y mi salvación; ¿de quién temeré?', cita: 'Salmo 27:1' },
    { texto: 'Encomienda al Señor tu camino, confía en él, y él hará.', cita: 'Salmo 37:5' },
    { texto: 'Busquen primeramente el reino de Dios y su justicia, y todas estas cosas les serán añadidas.', cita: 'Mateo 6:33' },
    { texto: 'Yo soy el buen pastor; el buen pastor su vida da por las ovejas.', cita: 'Juan 10:11' },
    { texto: 'Dejen que los niños vengan a mí, y no se lo impidan; porque de los tales es el reino de Dios.', cita: 'Marcos 10:14' },
    { texto: 'La bondad y la misericordia me seguirán todos los días de mi vida.', cita: 'Salmo 23:6' },
    { texto: 'Alégrense siempre en el Señor. Otra vez digo: ¡alégrense!', cita: 'Filipenses 4:4' },
    { texto: 'Sean amables unos con otros, compasivos, perdonándose unos a otros, como Dios también los perdonó.', cita: 'Efesios 4:32' },
    { texto: 'El amor es paciente, es bondadoso; el amor no tiene envidia.', cita: '1 Corintios 13:4' },
    { texto: 'En el principio creó Dios los cielos y la tierra.', cita: 'Génesis 1:1' },
    { texto: 'Tu palabra es una lámpara a mis pies y una luz en mi camino.', cita: 'Salmo 119:105' },
    { texto: 'He aquí, yo estoy con ustedes todos los días, hasta el fin del mundo.', cita: 'Mateo 28:20' },
    { texto: 'Los cielos cuentan la gloria de Dios, y el firmamento anuncia la obra de sus manos.', cita: 'Salmo 19:1' },
    { texto: 'Sepan que el Señor es Dios; él nos hizo, y somos suyos; somos su pueblo, y ovejas de su prado.', cita: 'Salmo 100:3' },
    { texto: 'Te alabaré, porque de manera maravillosa fui hecho; maravillosas son tus obras.', cita: 'Salmo 139:14' },
    { texto: 'En todo tiempo ama el amigo, y es como un hermano en el tiempo de angustia.', cita: 'Proverbios 17:17' },
    { texto: 'El nombre del Señor es torre fuerte; a él correrá el justo, y estará seguro.', cita: 'Proverbios 18:10' },
    { texto: 'Los que esperan en el Señor tendrán nuevas fuerzas; levantarán alas como las águilas.', cita: 'Isaías 40:31' },
    { texto: 'Porque yo sé los planes que tengo para ustedes, dice el Señor, planes de paz, y no de mal, para darles un futuro y una esperanza.', cita: 'Jeremías 29:11' },
    { texto: 'Lo que el Señor pide de ti es hacer justicia, amar la misericordia, y humillarte ante tu Dios.', cita: 'Miqueas 6:8' },
    { texto: 'Vengan a mí todos los que están cansados y cargados, y yo les daré descanso.', cita: 'Mateo 11:28' },
    { texto: 'Para los hombres esto es imposible; mas para Dios todo es posible.', cita: 'Mateo 19:26' },
    { texto: 'Traten a los demás como quieren que ellos los traten a ustedes.', cita: 'Lucas 6:31' },
    { texto: 'Yo soy la luz del mundo; el que me sigue no andará en oscuridad, sino que tendrá la luz de la vida.', cita: 'Juan 8:12' },
    { texto: 'Yo soy el camino, y la verdad, y la vida; nadie viene al Padre, sino por mí.', cita: 'Juan 14:6' },
    { texto: 'Nadie tiene mayor amor que este, que uno ponga su vida por sus amigos.', cita: 'Juan 15:13' },
    { texto: 'Cree en el Señor Jesucristo, y serás salvo, tú y tu casa.', cita: 'Hechos 16:31' },
    { texto: 'Sabemos que a los que aman a Dios, todas las cosas les ayudan a bien.', cita: 'Romanos 8:28' },
    { texto: 'Alégrense en la esperanza, sean pacientes en los momentos difíciles, y no dejen de orar.', cita: 'Romanos 12:12' },
    { texto: 'Hagan todo con amor.', cita: '1 Corintios 16:14' },
    { texto: 'No nos cansemos de hacer el bien; porque a su tiempo cosecharemos, si no desmayamos.', cita: 'Gálatas 6:9' },
    { texto: 'Hijos, obedezcan en el Señor a sus padres, porque esto es justo.', cita: 'Efesios 6:1' },
    { texto: 'No se preocupen por nada; más bien, oren y pídanle a Dios todo lo que necesitan, dándole gracias.', cita: 'Filipenses 4:6' },
    { texto: 'Hijos, obedezcan a sus padres en todo, porque esto agrada al Señor.', cita: 'Colosenses 3:20' },
    { texto: 'Estén siempre gozosos. Oren sin cesar. Den gracias en todo, porque esta es la voluntad de Dios para ustedes.', cita: '1 Tesalonicenses 5:16-18' },
    { texto: 'Que nadie te menosprecie por ser joven; sé ejemplo de los creyentes en palabra, conducta, amor, fe y pureza.', cita: '1 Timoteo 4:12' },
    { texto: 'La fe es la certeza de lo que se espera, la convicción de lo que no se ve.', cita: 'Hebreos 11:1' },
    { texto: 'Jesucristo es el mismo ayer, y hoy, y por los siglos.', cita: 'Hebreos 13:8' },
    { texto: 'Todo regalo bueno y todo don perfecto viene de lo alto, de Dios el Padre.', cita: 'Santiago 1:17' },
    { texto: 'Echen toda su ansiedad sobre él, porque él tiene cuidado de ustedes.', cita: '1 Pedro 5:7' },
    { texto: 'Dios secará toda lágrima de sus ojos; y ya no habrá muerte, ni llanto, ni dolor.', cita: 'Apocalipsis 21:4' },
    { texto: 'El Señor va delante de ti; él estará contigo, no te dejará ni te desamparará; no tengas miedo.', cita: 'Deuteronomio 31:8' }
  ];

  // Rota por fecha: mismo versículo para toda la familia en todo el día.
  function versiculoDelDia(fecha) {
    fecha = fecha || new Date();
    var inicio = new Date(fecha.getFullYear(), 0, 0);
    var diaDelAno = Math.floor((fecha - inicio) / 86400000);
    return VERSICULOS_DIA[diaDelAno % VERSICULOS_DIA.length];
  }

  /* ============== BIBLIA: HISTORIAS PARA LEER JUNTOS ============== */
  var HISTORIAS_BIBLICAS = [
    {
      slug: 'creacion', testamento: 'antiguo', titulo: 'La Creación', emoji: '🌍', cita: 'Génesis 1:1–2:3',
      parrafos: [
        'Al principio no había nada: ni luz, ni plantas, ni animales. Solo estaba Dios. Y Dios dijo: «¡Que haya luz!». Y la luz apareció, brillante y hermosa.',
        'Después Dios hizo el cielo y separó las aguas. Aparecieron los mares y la tierra seca, y sobre la tierra brotaron hierbas, flores y árboles llenos de frutas.',
        'Dios puso el sol para el día y la luna con las estrellas para la noche. Llenó el mar de peces, el cielo de pájaros y la tierra de animales de todos los tamaños.',
        'Por último, Dios hizo a las personas, a su imagen, y las llenó de bendiciones. Miró todo lo que había hecho y vio que era muy bueno. Al séptimo día descansó.'
      ],
      pregunta: 'De todo lo que Dios creó, ¿qué es lo que más te gusta? ¿Por qué?'
    },
    {
      slug: 'primera-familia', testamento: 'antiguo', titulo: 'La primera familia', emoji: '🍃', cita: 'Génesis 2–4',
      parrafos: [
        'Al principio, Dios hizo un jardín hermoso llamado Edén. Allí puso a Adán y a Eva, la primera familia. En el jardín había árboles con frutas ricas, un río de agua clara y muchos animales.',
        'Dios les dijo que podían comer de casi todos los árboles. Solo había uno del que les pidió no comer, para cuidarlos. Adán y Eva vivían felices, cerca de Dios.',
        'Un día, una serpiente astuta les dijo que Dios no quería lo mejor para ellos. Eva probó el fruto de ese árbol y también le dio a Adán. Ellos se dieron cuenta de que habían desobedecido y se escondieron con pena.',
        'Dios los buscó y los llamó con cariño: «¿Dónde estás?». Aunque tuvieron que salir del jardín, Dios no dejó de amarlos. Les hizo ropa para cubrirlos y siguió cuidando de ellos cada día.',
        'Adán y Eva tuvieron hijos. Sus dos primeros hijos se llamaron Caín y Abel. Un día, Caín sintió mucha envidia de su hermano y esa envidia le hizo mucho daño a la familia. Dios le enseñó a Caín, y nos enseña también a nosotros, que debemos cuidar a nuestros hermanos, no hacerles daño.'
      ],
      pregunta: '¿Qué hizo Dios cuando Adán y Eva se equivocaron y se escondieron? ¿Cómo nos cuida Dios a nosotros cuando nos equivocamos?'
    },
    {
      slug: 'noe', testamento: 'antiguo', titulo: 'Noé y el arca', emoji: '⛵', cita: 'Génesis 6–9',
      parrafos: [
        'Noé era un hombre bueno que escuchaba a Dios. Un día Dios le dijo que vendría una lluvia muy grande, y le encargó construir un barco enorme: un arca.',
        'Noé se puso a trabajar con martillo y madera, aunque todos se reían. Cuando el arca estuvo lista, entraron Noé, su familia y dos de cada animal: dos elefantes, dos leones, dos corderitos… ¡de todos!',
        'Llovió durante cuarenta días y cuarenta noches, pero dentro del arca todos estaban seguros y sequitos, cuidados por Dios.',
        'Cuando la tierra se secó, Noé abrió la puerta y los animales salieron corriendo felices. Dios puso un arcoíris en el cielo como señal de su promesa de amor.'
      ],
      pregunta: 'Si pudieras llevar dos animales en el arca, ¿cuáles elegirías?'
    },
    {
      slug: 'babel', testamento: 'antiguo', titulo: 'La torre de Babel', emoji: '🗼', cita: 'Génesis 11:1-9',
      parrafos: [
        'Muchos años después, todas las personas del mundo hablaban el mismo idioma. Podían entenderse fácilmente y trabajar juntas en lo que quisieran.',
        'Un día dijeron: «Hagamos una ciudad y una torre muy, muy alta, que llegue hasta el cielo. Así seremos famosos y todos hablarán de nosotros». Comenzaron a hacer ladrillos y a subir la torre más y más.',
        'Pero Dios vio que en su corazón había orgullo. Querían ser grandes sin acordarse de Él, y habían olvidado la tarea que Dios les había dado de llenar toda la tierra.',
        'Entonces Dios hizo algo sorprendente: confundió su idioma. De pronto, unos hablaban de una manera y otros de otra, y ya no podían entenderse para seguir construyendo.',
        'La torre quedó sin terminar y las personas se repartieron por diferentes lugares de la tierra, como Dios había querido desde el principio. A ese lugar lo llamaron Babel, que recuerda el día en que los idiomas se mezclaron.'
      ],
      pregunta: '¿Por qué las personas de Babel querían hacer una torre tan alta? ¿Qué cosas buenas podemos lograr cuando trabajamos juntos sin orgullo?'
    },
    {
      slug: 'abraham', testamento: 'antiguo', titulo: 'Abraham y la gran promesa', emoji: '⭐', cita: 'Génesis 12 y 15',
      parrafos: [
        'Había un hombre bueno llamado Abraham, que vivía con su esposa Sara. Un día Dios le habló y le dijo: «Deja tu tierra y ve al lugar que yo te mostraré. Te bendeciré y de ti nacerá un pueblo grande».',
        'Abraham confió en Dios y emprendió el viaje con Sara, aunque no sabía bien a dónde iba. Caminó por desiertos y montañas, llevando sus tiendas y sus animales, siempre confiando en la promesa.',
        'Una noche, Dios lo sacó fuera de su tienda y le dijo: «Mira las estrellas del cielo. ¿Puedes contarlas? Así de grande será tu familia». Abraham miró el cielo brillando y creyó en Dios con todo su corazón.',
        'Pasaron muchos años y Abraham y Sara ya eran muy viejitos. Parecía imposible que tuvieran un bebé, pero para Dios nada es imposible.',
        '¡Y un día nació Isaac! Sara se reía de alegría y decía: «Dios me ha hecho reír de felicidad». Abraham abrazó a su hijito, sabiendo que Dios siempre cumple sus promesas, aunque tarden un poco.'
      ],
      pregunta: '¿Qué le prometió Dios a Abraham mirando las estrellas? ¿Hay alguna promesa de Dios que te haga sentir feliz?'
    },
    {
      slug: 'jose', testamento: 'antiguo', titulo: 'José y sus sueños', emoji: '🌈', cita: 'Génesis 37–45',
      parrafos: [
        'José era un joven alegre que vivía con su padre Jacob y sus once hermanos. Su padre le regaló una túnica de muchos colores, muy hermosa. José también tenía sueños especiales que Dios le daba, y se los contaba a su familia.',
        'Sus hermanos sintieron celos de él y un día hicieron algo muy triste: lo enviaron lejos, a Egipto, sin que pudiera volver a su casa. José estaba solo en un país extraño, pero Dios nunca lo abandonó.',
        'En Egipto, José trabajó con honestidad y Dios lo ayudó en todo. José podía entender el significado de los sueños, y así llegó a ayudar al faraón, el rey de Egipto, explicándole un sueño sobre años de mucha comida y años de poca comida.',
        'El faraón puso a José como encargado de guardar alimento para todo el país. Cuando llegó el tiempo de hambre, había comida para Egipto y también para las familias de otros lugares.',
        'Un día, sus hermanos llegaron a Egipto buscando comida, sin saber que José era ahora tan importante. José los reconoció, y aunque le habían hecho daño, eligió perdonarlos. Lloró de alegría, los abrazó y salvó a toda su familia. Les dijo: «Dios me trajo aquí para cuidar de ustedes».'
      ],
      pregunta: '¿Qué hizo José cuando volvió a ver a sus hermanos, aunque ellos le habían hecho daño? ¿A quién podrías perdonar tú con la ayuda de Dios?'
    },
    {
      slug: 'moises-bebe', testamento: 'antiguo', titulo: 'Moisés, el bebé del río', emoji: '🧺', cita: 'Éxodo 1–2',
      parrafos: [
        'En Egipto vivía el pueblo de Israel, que había crecido mucho. El faraón, que era un rey injusto, no era bueno con ellos y dio una orden muy triste contra los bebés.',
        'Una mamá israelita tuvo un bebito precioso y lo escondió con mucho cuidado durante tres meses. Cuando ya no pudo esconderlo más, preparó una canastita especial, la cubrió para que no le entrara agua y puso al bebé dentro.',
        'Colocó la canastita entre las plantas altas a la orilla del río Nilo. La hermana mayor del bebé, Miriam, se quedó cerquita, escondida entre las plantas, mirando con atención lo que pasaría.',
        'Justo entonces llegó la hija del faraón a bañarse en el río. Vio la canastita, la abrió y encontró al bebé llorando. Su corazón se llenó de ternura y decidió cuidarlo.',
        'Miriam salió valientemente y ofreció buscar a una señora israelita que ayudara a criar al bebé. ¡Esa señora fue la propia mamá del bebé! La princesa le puso al niño el nombre de Moisés y lo crió en el palacio. Dios había cuidado de Moisés desde su canastita en el río.'
      ],
      pregunta: '¿Cómo cuidó Dios al bebé Moisés en el río? ¿Quiénes te cuidan a ti cada día?'
    },
    {
      slug: 'exodo', testamento: 'antiguo', titulo: 'La salida de Egipto', emoji: '🌊', cita: 'Éxodo 7–14',
      parrafos: [
        'Cuando Moisés creció, Dios lo envió a hablar con el faraón: «Deja salir a mi pueblo». Pero el faraón era terco y decía que no, una y otra vez.',
        'Entonces Dios envió señales sorprendentes sobre Egipto. El agua se volvió de color extraño, llegaron muchísimas ranas que saltaban por todas partes, y cayó granizo del cielo. Con cada señal, Dios mostraba que Él es más grande que el faraón.',
        'Por fin, el faraón dejó salir al pueblo. Miles de familias caminaron juntas fuera de Egipto, libres al fin. Moisés los guiaba, y Dios los acompañaba de día y de noche.',
        'Pero el faraón cambió de idea y salió persiguiéndolos con su ejército. El pueblo llegó frente a un gran mar y no sabía qué hacer. Moisés confió en Dios y levantó su vara sobre las aguas.',
        '¡Entonces el mar se abrió en dos! Una pared de agua a cada lado y un camino seco en el medio. Todo el pueblo cruzó caminando libre y seguro. Al llegar a la otra orilla, cantaron y bailaron de alegría, porque Dios los había salvado.'
      ],
      pregunta: '¿Qué sintió el pueblo cuando cruzó el mar y quedó libre? ¿De qué cosas nos cuida y nos libra Dios hoy?'
    },
    {
      slug: 'mandamientos', testamento: 'antiguo', titulo: 'Los Diez Mandamientos', emoji: '⛰️', cita: 'Éxodo 19–20',
      parrafos: [
        'Después de salir de Egipto, el pueblo llegó al monte Sinaí, una montaña grande y majestuosa. Dios quiso darles un regalo especial: sus palabras para vivir bien y felices.',
        'Moisés subió solo a la cima del monte, entre nubes y truenos que mostraban la grandeza de Dios. Allí Dios le entregó dos tablas de piedra con diez mandamientos escritos.',
        'Esos mandamientos son como reglas de amor. Los primeros nos enseñan a amar a Dios sobre todas las cosas, a hablar de Él con respeto y a apartar un día para descansar y estar con Él.',
        'Los demás nos enseñan a amar a las personas: honrar a papá y mamá, cuidar la vida de todos, ser fieles y honestos, no tomar lo que no es nuestro, decir siempre la verdad y estar contentos con lo que tenemos.',
        'Moisés bajó del monte con las tablas y todo el pueblo escuchó las palabras de Dios. Prometieron seguirlas, porque entendieron que Dios les daba esas reglas porque los amaba mucho.'
      ],
      pregunta: '¿Cuál de los mandamientos te parece más bonito para nuestra familia? ¿Cómo podemos cumplirlo esta semana?'
    },
    {
      slug: 'jerico', testamento: 'antiguo', titulo: 'Josué y las murallas de Jericó', emoji: '🎺', cita: 'Josué 6',
      parrafos: [
        'Josué era ahora el guía del pueblo de Israel, después de Moisés. Frente a ellos estaba la ciudad de Jericó, rodeada de murallas altísimas y muy fuertes. Parecía imposible entrar allí.',
        'Dios le dio a Josué un plan muy curioso, muy distinto a lo que cualquiera hubiera imaginado. No era un plan de fuerza, sino de obediencia y confianza.',
        'Durante seis días, el pueblo marchó en silencio alrededor de la ciudad, una vez cada día. Los sacerdotes llevaban el arca de Dios y tocaban trompetas de cuerno que sonaban por todo el valle.',
        'Al séptimo día, marcharon siete veces alrededor de la ciudad. En la ciudad vivía una mujer llamada Rahab, que había ayudado al pueblo de Dios, y ella y su familia esperaban a salvo dentro de su casa, como se les había prometido.',
        'De pronto, las trompetas sonaron fuerte y todo el pueblo gritó con todas sus fuerzas. ¡Y las grandes murallas de Jericó se vinieron abajo! El pueblo entró en la ciudad, y Rahab y su familia quedaron a salvo, tal como Dios había cuidado de ellos.'
      ],
      pregunta: '¿Qué hizo el pueblo de Israel para que cayeran las murallas de Jericó? ¿Qué nos enseña esta historia sobre obedecer a Dios aunque su plan parezca extraño?'
    },
    {
      slug: 'sanson', testamento: 'antiguo', titulo: 'Sansón el fuerte', emoji: '💪', cita: 'Jueces 13–16',
      parrafos: [
        'Antes de que Sansón naciera, un ángel anunció a su mamá que tendría un hijo especial, apartado para Dios. Como señal de esa promesa, su pelo nunca debía cortarse.',
        'Sansón creció y se volvió el hombre más fuerte de su tierra. Con la fuerza que Dios le daba, protegía a su pueblo de sus enemigos y hacía cosas que nadie más podía hacer.',
        'Un día Sansón conoció a Dalila y se enamoró de ella. Dalila quería descubrir el secreto de su fuerza y le preguntaba una y otra vez, hasta que Sansón, cansado, le contó la verdad sobre su pelo.',
        'Mientras Sansón dormía, le cortaron el pelo y su fuerza se fue. Sansón quedó muy triste y débil, lejos de lo que Dios quería para él. Pero su pelo poco a poco volvió a crecer.',
        'Al final, Sansón oró a Dios con todo su corazón: «Señor, acuérdate de mí y dame fuerzas una vez más». Dios escuchó su oración y le devolvió su fuerza, y la historia de Sansón nos recuerda que Dios siempre escucha cuando le pedimos ayuda de verdad.'
      ],
      pregunta: '¿Qué hizo Sansón cuando estaba triste y sin fuerzas? ¿Qué podemos pedirle a Dios cuando nos sentimos débiles?'
    },
    {
      slug: 'rut', testamento: 'antiguo', titulo: 'Rut y Noemí', emoji: '🌾', cita: 'Rut 1–4',
      parrafos: [
        'Noemí era una señora que vivía lejos de su tierra, en un lugar llamado Moab. Con el tiempo quedó sola, sin su esposo y sin sus hijos, y decidió regresar a su pueblo, Belén.',
        'Una de sus nueras, Rut, la amaba mucho y no quiso dejarla sola. Le dijo unas palabras preciosas: «A donde tú vayas, yo iré. Tu pueblo será mi pueblo, y tu Dios será mi Dios». Y las dos caminaron juntas hasta Belén.',
        'En Belén era tiempo de cosecha. Rut fue a los campos a recoger las espigas de trigo que quedaban en el suelo, para tener comida para ella y para Noemí. Trabajaba con alegría desde temprano, sin quejarse.',
        'El dueño del campo se llamaba Booz, un hombre bueno y generoso. Al ver la bondad de Rut con Noemí, la trató con mucho cariño y cuidó de que nunca le faltara alimento.',
        'Con el tiempo, Booz y Rut se casaron y tuvieron un hijito llamado Obed. Noemí abrazaba feliz a su nietecito, y todo el pueblo se alegraba con ellas. La bondad y la lealtad de Rut fueron recompensadas con una familia llena de amor.'
      ],
      pregunta: '¿Qué palabras bonitas le dijo Rut a Noemí? ¿Cómo podemos acompañar y cuidar nosotros a las personas que amamos?'
    },
    {
      slug: 'samuel', testamento: 'antiguo', titulo: 'Samuel escucha a Dios', emoji: '👂', cita: '1 Samuel 3',
      parrafos: [
        'Samuel era un niño que vivía en el templo de Dios, ayudando al sacerdote Elí. Su mamá, Ana, lo había llevado allí con mucha fe, y Samuel servía a Dios con alegría en las cosas pequeñas de cada día.',
        'Una noche, Samuel ya estaba acostado cuando escuchó una voz que lo llamaba: «¡Samuel, Samuel!». Él se levantó rápido y corrió donde Elí, diciendo: «Aquí estoy, tú me llamaste». Pero Elí respondió: «Yo no te llamé, hijo mío. Vuelve a acostarte».',
        'La voz lo llamó una segunda vez, y Samuel corrió de nuevo donde Elí. Y pasó una tercera vez. Entonces Elí entendió algo maravilloso: era Dios quien estaba llamando al niño.',
        'Elí le enseñó qué responder: «Si te llama otra vez, di: Habla, Señor, que tu siervo escucha». Samuel volvió a su cama con el corazón atento, esperando.',
        'Dios lo llamó una vez más: «¡Samuel, Samuel!». Y el niño respondió como Elí le había enseñado: «Habla, Señor, que tu siervo escucha». Desde esa noche, Samuel supo que Dios le hablaba, y creció escuchando su voz y obedeciéndola toda su vida.'
      ],
      pregunta: '¿Qué le enseñó Elí a Samuel para responderle a Dios? ¿Cómo podemos escuchar a Dios nosotros en casa?'
    },
    {
      slug: 'david-ungido', testamento: 'antiguo', titulo: 'Dios elige a David', emoji: '👑', cita: '1 Samuel 16',
      parrafos: [
        'Dios envió al profeta Samuel a un pueblito llamado Belén, a la casa de un hombre llamado Isaí. Dios le dijo: «Entre los hijos de Isaí he elegido a uno para que sea rey».',
        'Isaí presentó a sus hijos, uno por uno. El mayor era alto y fuerte, y Samuel pensó: «Seguro que este es el elegido». Pero Dios le dijo algo muy importante: «No mires su apariencia. Yo no miro como miran las personas; yo miro el corazón».',
        'Fueron pasando los demás hermanos, grandes y apuestos, pero Dios no había elegido a ninguno de ellos. Samuel preguntó: «¿Son estos todos tus hijos?». Isaí respondió: «Falta el menor, que está cuidando las ovejas en el campo».',
        'Mandaron a buscar al pastorcito David. Era un joven de mejillas rosadas que pasaba sus días cuidando ovejas, tocando música y confiando en Dios.',
        'Apenas llegó, Dios dijo a Samuel: «¡Es él!». Samuel derramó aceite sobre la cabeza de David para ungirlo, delante de todos sus hermanos. Desde ese día, el Espíritu de Dios estuvo con David, el pastorcito de corazón bueno que un día sería rey.'
      ],
      pregunta: '¿Qué mira Dios en las personas: la apariencia o el corazón? ¿Qué cosas buenas hay en tu corazón?'
    },
    {
      slug: 'david-goliat', testamento: 'antiguo', titulo: 'David y Goliat', emoji: '🪨', cita: '1 Samuel 17',
      parrafos: [
        'David era un pastor joven que cuidaba las ovejas de su familia. Tocaba el arpa y confiaba mucho en Dios.',
        'Un día apareció un gigante llamado Goliat, que se burlaba del pueblo de Israel. Todos tenían miedo, porque Goliat era altísimo y muy fuerte.',
        'Pero David no tuvo miedo. «Dios me cuidó de los leones y los osos —dijo—, y también me cuidará hoy». Tomó su honda y cinco piedritas lisas del arroyo.',
        'Con una sola piedra y mucho valor, David venció al gigante. Así aprendió todo el pueblo que no gana el más grande, sino el que confía en Dios.'
      ],
      pregunta: '¿Hay algo que te da miedo? ¿Cómo te ayuda saber que Dios está contigo?'
    },
    {
      slug: 'david-canta', testamento: 'antiguo', titulo: 'David canta a Dios', emoji: '🎵', cita: 'Salmo 23 y Salmo 100',
      parrafos: [
        'David, el pastorcito que Dios eligió, también era músico. Tocaba el arpa muy bien y componía canciones para Dios, que hoy conocemos como salmos y que muchas personas siguen cantando.',
        'Cuando era joven, David cuidaba las ovejas de su padre en las colinas. Las llevaba a pastos verdes y a aguas tranquilas, y las protegía de todo peligro. Así aprendió cuánto cuida un buen pastor a sus ovejitas.',
        'Por eso escribió su canción más famosa: «El Señor es mi pastor, nada me falta. En lugares de verdes pastos me hace descansar, junto a aguas de reposo me conduce». David sabía que Dios lo cuidaba igual que él cuidaba a sus ovejas.',
        'David también cantaba canciones alegres que invitaban a todos a alabar: «¡Canten alegres a Dios, habitantes de toda la tierra! Sirvan al Señor con alegría, vengan ante Él con cánticos de gozo».',
        'Cuando David llegó a ser rey, siguió cantando a Dios en los días buenos y en los difíciles. Sus canciones nos recuerdan que Dios es nuestro pastor: nos conoce, nos guía y nunca nos deja solos.'
      ],
      pregunta: '¿Qué significa para ti que «el Señor es mi pastor»? ¿Por qué cosas le darías gracias a Dios cantando?'
    },
    {
      slug: 'salomon', testamento: 'antiguo', titulo: 'Salomón pide sabiduría', emoji: '🦉', cita: '1 Reyes 3',
      parrafos: [
        'Salomón, el hijo de David, se convirtió en rey de Israel cuando todavía era joven. Amaba a Dios y quería gobernar bien a su pueblo, aunque sabía que era una tarea muy grande.',
        'Una noche, Dios se le apareció en un sueño y le dijo algo increíble: «Pídeme lo que quieras, y yo te lo daré». Salomón podía haber pedido riquezas, una vida larga o ser famoso en todo el mundo.',
        'Pero Salomón pidió algo distinto: «Señor, dame un corazón sabio y entendido, para saber gobernar a tu pueblo y distinguir entre lo bueno y lo malo». Pidió sabiduría para cuidar a los demás.',
        'A Dios le agradó mucho esa petición. Le dio a Salomón una sabiduría como la de ningún otro rey, y también le dio riquezas y honores que no había pedido.',
        'Poco después, dos madres llegaron ante el rey con un problema difícil: las dos decían que un bebé era su hijo. Salomón, con la sabiduría de Dios, descubrió quién era la verdadera mamá por el amor con que ella protegió al bebé. Todo el pueblo vio que Dios había dado a Salomón un corazón muy sabio.'
      ],
      pregunta: '¿Qué le pidió Salomón a Dios en su sueño? Si Dios te dijera «pídeme lo que quieras», ¿qué le pedirías tú?'
    },
    {
      slug: 'elias', testamento: 'antiguo', titulo: 'Elías y el fuego del cielo', emoji: '🔥', cita: '1 Reyes 18',
      parrafos: [
        'El profeta Elías vivía en un tiempo en que mucha gente se había olvidado de Dios y adoraba a un dios falso llamado Baal. Elías los invitó a todos al monte Carmelo para descubrir quién es el Dios verdadero.',
        'Los profetas de Baal prepararon su altar y pidieron a su dios desde la mañana hasta la tarde, pero no pasó nada. Ni una chispa, ni una respuesta. Solo hubo silencio.',
        'Entonces Elías arregló el altar de Dios, puso todo en orden y oró con confianza: «Señor, responde, para que este pueblo sepa que tú eres Dios». En ese momento, ¡cayó fuego del cielo y consumió todo el altar! La gente se postró y exclamó: «¡El Señor es Dios!».',
        'Después, Elías oró pidiendo lluvia, porque hacía mucho tiempo que no llovía en la tierra. Una nubecita pequeña apareció sobre el mar, y pronto llegó una lluvia abundante que llenó de vida los campos secos.',
        'Tiempo después, Elías estaba cansado y se escondió en una cueva. Dios no le habló en el viento fuerte, ni en el temblor, ni en el fuego. Le habló en una vocecita suave y delicada. Elías aprendió que Dios también nos habla bajito, muy cerca del corazón.'
      ],
      pregunta: '¿Cómo le respondió Dios a Elías en el monte Carmelo? ¿Y cómo le habló en la cueva? ¿Cómo te habla Dios a ti?'
    },
    {
      slug: 'naaman', testamento: 'antiguo', titulo: 'Naamán y el río Jordán', emoji: '💧', cita: '2 Reyes 5',
      parrafos: [
        'Naamán era un general importante del ejército de Siria, valiente y respetado por todos. Pero tenía una enfermedad en la piel que lo hacía sufrir mucho y nadie había podido curarlo.',
        'En su casa servía una niña israelita que tenía un corazón generoso. Ella le dijo a la esposa de Naamán: «Si mi señor fuera a ver al profeta que está en mi tierra, él lo sanaría». La niña quería ayudar, aunque estaba lejos de su hogar.',
        'Naamán viajó hasta la casa del profeta Eliseo. Eliseo no salió a recibirlo con una gran ceremonia; solo le mandó un mensaje sencillo: «Ve y báñate siete veces en el río Jordán, y tu piel quedará sana».',
        'Naamán se enojó al principio, porque esperaba algo más espectacular. Pero sus sirvientes lo convencieron con cariño de obedecer. Naamán entró en el Jordán y se sumergió una, dos, tres… ¡hasta siete veces!',
        'Al salir del agua, su piel estaba sana y limpia, como la de un niño. Naamán volvió feliz a dar gracias y exclamó que ahora sabía que el Dios de Israel es el Dios verdadero. Solo tuvo que obedecer algo sencillo para recibir algo grandioso.'
      ],
      pregunta: '¿Quién ayudó a Naamán a encontrar su sanidad? ¿Qué nos enseña esta historia sobre obedecer a Dios en las cosas sencillas?'
    },
    {
      slug: 'ester', testamento: 'antiguo', titulo: 'Ester, la reina valiente', emoji: '👸', cita: 'Ester 4–5',
      parrafos: [
        'Ester era una joven israelita que vivía en un país lejano, cuidada por su primo Mardoqueo, que la amaba como a una hija. Por su bondad y su belleza, Ester fue elegida reina del gran reino de Persia.',
        'Un día llegó una noticia muy preocupante: un hombre malo del palacio había engañado al rey y preparaba un plan que ponía en peligro a todo el pueblo de Ester. Mardoqueo le pidió a Ester que hablara con el rey para ayudar a su gente.',
        'No era fácil: nadie podía presentarse ante el rey sin ser llamado, ni siquiera la reina. Mardoqueo le dijo unas palabras que Ester nunca olvidó: «¿Quién sabe si para esta hora has llegado al reino?». Ester entendió que Dios la había puesto allí con un propósito.',
        'Ester pidió a todo su pueblo que orara y ayunara con ella durante tres días. Luego se vistió con sus ropas de reina, se armó de valentía y se presentó ante el rey, confiando en Dios.',
        'El rey la miró con agrado y extendió hacia ella su cetro de oro, la señal de que era bienvenida. El corazón de Ester se llenó de alivio y esperanza. Su valentía abrió el camino para salvar a su pueblo, y hasta hoy se recuerda a Ester como la reina que fue valiente en el momento más importante.'
      ],
      pregunta: '¿Qué hizo Ester antes de presentarse ante el rey? ¿Cuándo necesitas tú ser valiente y confiar en Dios?'
    },
    {
      slug: 'daniel', testamento: 'antiguo', titulo: 'Daniel y los leones', emoji: '🦁', cita: 'Daniel 6',
      parrafos: [
        'Daniel era un hombre sabio y bueno que trabajaba para el rey. Cada día oraba a Dios junto a su ventana, sin esconderse.',
        'Unos hombres envidiosos engañaron al rey para que firmara una orden injusta: nadie podía orar a Dios. Pero Daniel siguió orando, como siempre.',
        'El rey tuvo que echar a Daniel al foso de los leones. Pasó la noche muy preocupado, sin poder dormir… ¡pero Dios envió a su ángel y cerró la boca de los leones!',
        'Al amanecer, el rey corrió al foso y encontró a Daniel sano y salvo. Entonces el rey declaró que el Dios de Daniel es el Dios verdadero.'
      ],
      pregunta: 'Daniel oraba todos los días. ¿De qué te gusta hablar con Dios cuando oras?'
    },
    {
      slug: 'jonas', testamento: 'antiguo', titulo: 'Jonás y el gran pez', emoji: '🐋', cita: 'Jonás 1–3',
      parrafos: [
        'Dios le pidió a Jonás que fuera a la ciudad de Nínive a dar un mensaje. Pero Jonás no quiso ir, y se subió a un barco que iba para el otro lado.',
        'En el mar se levantó una tormenta terrible. Jonás sabía que la tormenta era por su culpa, y pidió a los marineros que lo echaran al agua. En cuanto lo hicieron, el mar se calmó.',
        'Entonces llegó un pez enorme que se tragó a Jonás. Dentro del pez, Jonás oró y pidió perdón. Al tercer día, el pez lo dejó sano y salvo en la playa.',
        'Esta vez Jonás obedeció y fue a Nínive. La gente escuchó el mensaje, pidió perdón a Dios, y Dios la perdonó con alegría.'
      ],
      pregunta: '¿Qué hizo Jonás cuando se equivocó? ¿Qué podemos hacer nosotros cuando nos equivocamos?'
    },
    {
      slug: 'anunciacion', testamento: 'nuevo', titulo: 'El anuncio a María', emoji: '👼', cita: 'Lucas 1:26-38',
      parrafos: [
        'En un pueblito pequeño llamado Nazaret vivía una joven buena y sencilla llamada María. Ella amaba mucho a Dios y siempre oraba con un corazón alegre. Un día, algo maravilloso y sorprendente pasó en su casa.',
        'Dios envió a su ángel Gabriel a visitarla. El ángel brillaba con luz del cielo y le dijo: «¡Alégrate, María! Dios está contigo y te ha elegido para algo muy especial». María se asustó un poquito al verlo, porque nunca había visto un ángel tan de cerca.',
        'Pero Gabriel le dijo con voz suave: «No tengas miedo, María. Vas a tener un bebé muy especial, y le pondrás por nombre Jesús. Él será grande y será llamado Hijo de Dios, y su reino no tendrá fin».',
        'María escuchó con atención y, aunque no entendía todo, confió en Dios con todo su corazón. Con mucha valentía dijo: «Soy la sierva del Señor. Que se haga en mí lo que has dicho». En ese momento, el ángel se fue y María guardó aquellas palabras como un tesoro.',
        'María se llenó de alegría y dio gracias a Dios cantando. Ella sabía que Dios cumple sus promesas y que, aunque el camino fuera nuevo, Él nunca la dejaría sola.'
      ],
      pregunta: '¿Qué le dirías a Dios si te pidiera hacer algo grande y valiente, como a María?'
    },
    {
      slug: 'nacimiento', testamento: 'nuevo', titulo: 'El nacimiento de Jesús', emoji: '🌟', cita: 'Lucas 2:1-20',
      parrafos: [
        'Hace mucho tiempo, en un pueblito llamado Belén, María y José buscaban un lugar donde pasar la noche. Todas las posadas estaban llenas.',
        'Al fin encontraron un establo, y allí, entre pajas y animalitos, nació el bebé Jesús. María lo envolvió en pañales y lo acostó en un pesebre.',
        'Esa noche, unos ángeles avisaron a los pastores: «¡Ha nacido el Salvador!». Los pastores corrieron a Belén y encontraron al bebé, tal como les habían dicho.',
        'También una estrella brillante guió a unos sabios desde muy lejos, que llegaron con regalos para el rey que había nacido. ¡Qué noche tan especial!'
      ],
      pregunta: '¿Qué regalo le habrías llevado tú al bebé Jesús?'
    },
    {
      slug: 'pastores-magos', testamento: 'nuevo', titulo: 'Los pastores y los sabios', emoji: '🎁', cita: 'Lucas 2 y Mateo 2',
      parrafos: [
        'La noche en que nació Jesús, cerca de Belén había unos pastores cuidando sus ovejas en el campo. Todo estaba oscuro y tranquilo, cuando de pronto el cielo se llenó de una luz hermosa. Un ángel apareció y los pastores tuvieron un poco de miedo.',
        'El ángel les dijo: «No tengan miedo. Les traigo una noticia muy buena y alegre para todos: hoy ha nacido en Belén el Salvador, que es Cristo el Señor. Lo encontrarán acostado en un pesebre». Luego, muchos ángeles más aparecieron cantando: «¡Gloria a Dios en las alturas, y en la tierra paz!».',
        'Los pastores corrieron felices hasta Belén y encontraron a María, a José y al bebé Jesús, tal como el ángel les había dicho. Estaban tan contentos que contaron a todos lo que habían visto y oído, y todos se maravillaron.',
        'También llegaron unos sabios de un país lejano de oriente. Ellos habían visto una estrella especial en el cielo y la siguieron durante mucho tiempo, porque sabían que anunciaba el nacimiento de un Rey. La estrella los guio hasta la casa donde estaba el niño Jesús.',
        'Al ver a Jesús, los sabios se arrodillaron con alegría y le entregaron regalos preciosos: oro, incienso y mirra. Eran regalos dignos de un rey. Después volvieron a su tierra por otro camino, con el corazón lleno de gozo por haber conocido al Salvador.'
      ],
      pregunta: 'Si pudieras llevarle un regalo a Jesús, ¿qué le llevarías y por qué?'
    },
    {
      slug: 'jesus-nino', testamento: 'nuevo', titulo: 'Jesús niño en el templo', emoji: '📜', cita: 'Lucas 2:41-52',
      parrafos: [
        'Cuando Jesús tenía doce años, viajó con María y José a la ciudad de Jerusalén para celebrar una fiesta muy importante. Había mucha gente, música, oraciones y familias que venían de muchos lugares.',
        'Al terminar la fiesta, María y José emprendieron el camino de regreso a casa pensando que Jesús venía con el grupo de familiares y amigos. Pero después de caminar un día entero, se dieron cuenta de que Jesús no estaba con ellos. ¡Qué preocupación sintieron!',
        'Volvieron a Jerusalén y lo buscaron por tres días. Al fin lo encontraron en el templo, el lugar de oración. Jesús estaba sentado entre los maestros de la Biblia, escuchándolos y haciéndoles preguntas. Todos estaban sorprendidos de lo bien que entendía las cosas de Dios, siendo aún un niño.',
        'María le dijo: «Hijo, ¿por qué nos has hecho esto? Te hemos estado buscando muy preocupados». Jesús respondió con cariño y respeto: «¿No sabían que debo estar en la casa de mi Padre?». María guardó todas estas cosas en su corazón, pensando en ellas muchas veces.',
        'Jesús regresó con ellos a Nazaret y les obedecía. Y cada día crecía más: se hacía más sabio, más fuerte, y agradaba a Dios y a las personas que lo conocían.'
      ],
      pregunta: '¿Qué cosas te gusta aprender sobre Dios, como hacía Jesús en el templo?'
    },
    {
      slug: 'bautismo', testamento: 'nuevo', titulo: 'El bautismo de Jesús', emoji: '💦', cita: 'Mateo 3:13-17',
      parrafos: [
        'Antes de que Jesús comenzara a enseñar, un hombre llamado Juan predicaba junto al río Jordán. Juan invitaba a las personas a arrepentirse de sus errores y a vivir de una manera nueva y buena. A muchos los bautizaba en el río como señal de ese nuevo comienzo, por eso lo llamaban Juan el Bautista.',
        'Un día, Jesús llegó hasta el río y le pidió a Juan que también lo bautizara. Juan se sorprendió mucho y le dijo que él no se sentía digno de hacerlo. Pero Jesús le respondió con humildad que así debían cumplir lo que Dios quería.',
        'Juan entonces bautizó a Jesús en las aguas del Jordán. Cuando Jesús salió del agua, pasó algo maravilloso: el cielo se abrió y el Espíritu de Dios bajó sobre Él como una paloma suave y hermosa.',
        'Y se oyó una voz desde el cielo que decía: «Este es mi Hijo amado, en quien tengo complacencia». ¡Qué momento tan especial! Dios el Padre estaba presentando a su Hijo con mucho amor y orgullo.',
        'Desde ese día, Jesús comenzó su misión: enseñar sobre el amor de Dios, ayudar a los enfermos, consolar a los tristes y mostrar a todos el camino al cielo.'
      ],
      pregunta: '¿Cómo crees que se sintió Jesús al escuchar la voz de su Padre diciendo que lo amaba?'
    },
    {
      slug: 'tormenta', testamento: 'nuevo', titulo: 'Jesús calma la tormenta', emoji: '⛈️', cita: 'Marcos 4:35-41',
      parrafos: [
        'Un atardecer, después de enseñar a mucha gente, Jesús dijo a sus amigos: «Crucemos al otro lado del lago». Subieron a una barca y empezaron a navegar tranquilos. Jesús estaba tan cansado que se quedó dormido en la parte de atrás, con la cabeza sobre un cojín.',
        'De pronto se levantó una tormenta muy fuerte. El viento soplaba con fuerza, las olas eran enormes y entraba mucha agua en la barca. ¡La barca parecía que se iba a hundir! Los amigos de Jesús, aunque algunos eran pescadores expertos, tuvieron mucho miedo.',
        'Corrieron a despertar a Jesús y le dijeron: «¡Maestro! ¿No te importa que nos hundamos?». Jesús se levantó, miró el viento y el mar, y con voz firme y poderosa dijo: «¡Calla, enmudece!».',
        'Al instante, el viento dejó de soplar y el mar se quedó completamente tranquilo, como un espejo. ¡Qué calma tan grande! Los amigos se miraron unos a otros, sorprendidos y llenos de admiración.',
        'Jesús les dijo: «¿Por qué tienen miedo? Todavía pueden confiar más». Ellos entendieron que, aun en medio de las tormentas más fuertes, Jesús está presente y tiene poder para traer paz.'
      ],
      pregunta: 'Cuando sientes miedo como los discípulos en la barca, ¿qué puedes decirle a Jesús?'
    },
    {
      slug: 'oveja', testamento: 'nuevo', titulo: 'La oveja perdida', emoji: '🐑', cita: 'Lucas 15:1-7',
      parrafos: [
        'Jesús contó la historia de un pastor que tenía cien ovejas. Las cuidaba a todas con mucho cariño y conocía a cada una.',
        'Un día contó sus ovejas y se dio cuenta de que faltaba una. ¡Una ovejita se había perdido! El pastor dejó a las noventa y nueve seguras y salió a buscarla por montes y caminos.',
        'Buscó y buscó, llamándola por su nombre, hasta que por fin la escuchó balar a lo lejos. La encontró, la abrazó y la cargó sobre sus hombros, contentísimo.',
        'Jesús explicó que así se alegra Dios en el cielo cuando una persona que estaba perdida vuelve a él. Nadie es tan pequeño que Dios no salga a buscarlo.'
      ],
      pregunta: '¿Alguna vez se te perdió algo muy querido? ¿Cómo te sentiste cuando lo encontraste?'
    },
    {
      slug: 'multitud', testamento: 'nuevo', titulo: 'Jesús alimenta a la multitud', emoji: '🍞', cita: 'Juan 6:1-14',
      parrafos: [
        'Un día, una multitud enorme siguió a Jesús hasta un monte para escuchar sus enseñanzas. Eran más de cinco mil personas, y se hizo tarde.',
        'Los discípulos dijeron: «No tenemos comida para tanta gente». Pero un niño se acercó con su merienda: cinco panes y dos pececitos, y se la ofreció a Jesús.',
        'Jesús dio gracias a Dios, partió los panes y los peces, y los discípulos empezaron a repartir. ¡Y alcanzaba para todos! La gente comía y comía, y la comida no se acababa.',
        'Al final, todos quedaron satisfechos y aún sobraron doce canastas llenas. El niño aprendió que lo poco que ofrecemos con amor, Dios lo puede multiplicar.'
      ],
      pregunta: 'El niño compartió su merienda. ¿Qué cosa tuya podrías compartir con alguien que lo necesite?'
    },
    {
      slug: 'prodigo', testamento: 'nuevo', titulo: 'El hijo que volvió a casa', emoji: '🤗', cita: 'Lucas 15:11-32',
      parrafos: [
        'Jesús contó la historia de un padre que tenía dos hijos. Un día, el hijo menor le pidió su parte de la herencia y se fue a un país lejano. Allí gastó todo su dinero en cosas que no valían la pena, sin pensar en el mañana, hasta que se quedó sin nada.',
        'Cuando ya no tuvo dinero, tuvo que buscar trabajo cuidando cerdos. Pasaba hambre y se sentía muy solo y triste. Entonces pensó: «En la casa de mi padre hasta los trabajadores tienen comida de sobra, y yo aquí estoy sufriendo. Volveré a casa y le pediré perdón a mi padre».',
        'El joven emprendió el camino de regreso, un poco avergonzado. Pero cuando todavía estaba lejos, su padre lo vio venir. ¡El padre había estado esperándolo cada día! Lleno de amor, corrió hacia él, lo abrazó fuerte y lo besó, sin dejarlo terminar de pedir perdón.',
        'El padre mandó preparar la mejor ropa, un anillo y una gran fiesta con música y comida rica. Dijo con alegría: «Mi hijo estaba perdido y ha sido encontrado. ¡Vamos a celebrar!». El amor del padre era más grande que cualquier error.',
        'El hermano mayor al principio no entendía tanta fiesta y se sintió molesto. Pero el padre le explicó con ternura: «Hijo, tú siempre estás conmigo y todo lo mío es tuyo. Pero había que celebrar, porque tu hermano ha vuelto a casa». Así nos enseña Jesús que en el amor de Dios hay lugar para todos.'
      ],
      pregunta: '¿Por qué crees que el padre corrió a abrazar a su hijo antes de que él terminara de hablar?'
    },
    {
      slug: 'zaqueo', testamento: 'nuevo', titulo: 'Zaqueo el bajito', emoji: '🌳', cita: 'Lucas 19:1-10',
      parrafos: [
        'En la ciudad de Jericó vivía un hombre llamado Zaqueo. Era bajito de estatura y trabajaba cobrando impuestos. A veces cobraba más dinero del que debía, y por eso muchas personas no lo querían y no tenía buenos amigos.',
        'Un día, Jesús llegó a Jericó y una gran multitud salió a verlo. Zaqueo también quería ver a Jesús, pero era tan bajito que no alcanzaba a ver nada entre tanta gente. Entonces tuvo una idea divertida: corrió adelante y se subió a un árbol llamado sicómoro para verlo pasar.',
        'Cuando Jesús llegó justo debajo del árbol, miró hacia arriba, vio a Zaqueo entre las ramas y lo llamó por su nombre: «Zaqueo, date prisa, baja, porque hoy quiero quedarme en tu casa». ¡Jesús sabía su nombre! Zaqueo bajó corriendo, lleno de alegría, y recibió a Jesús en su casa.',
        'Algunos se quejaban de que Jesús entrara en casa de Zaqueo, pero Jesús lo había mirado con amor, no con rechazo. Ese amor tocó el corazón de Zaqueo y lo hizo cambiar por dentro.',
        'Zaqueo se puso de pie y dijo: «Señor, daré la mitad de mis bienes a los pobres, y a quien le haya cobrado de más, le devolveré cuatro veces más». Jesús sonrió y dijo: «Hoy ha llegado la salvación a esta casa». Desde ese día, Zaqueo fue un hombre nuevo y generoso.'
      ],
      pregunta: '¿Qué cambio bueno hizo Zaqueo después de conocer a Jesús, y qué cambio bueno quieres hacer tú?'
    },
    {
      slug: 'entrada-jerusalen', testamento: 'nuevo', titulo: 'La entrada en Jerusalén', emoji: '🌿', cita: 'Mateo 21:1-11',
      parrafos: [
        'Jesús y sus amigos se acercaban a Jerusalén, la ciudad grande y especial. Jesús pidió a dos de sus discípulos que fueran a una aldea cercana y trajeran un burrito que encontrarían allí. Era un burrito humilde que nadie había montado todavía.',
        'Los discípulos pusieron sus mantos sobre el burrito y Jesús se sentó sobre él. Así entró Jesús a la ciudad, no como un rey guerrero en un caballo grande, sino como un Rey bueno, humilde y lleno de paz.',
        'Una multitud enorme salió a recibirlo con mucha alegría. Las personas ponían sus mantos en el camino, como una alfombra de honor, y cortaban ramas de palma para agitarlas en el aire mientras Jesús pasaba.',
        'Todos gritaban felices: «¡Hosanna al Hijo de David! ¡Bendito el que viene en el nombre del Señor! ¡Hosanna en las alturas!». Los niños también cantaban y gritaban con alegría en el templo, y sus voces llenaban todo el lugar.',
        'Toda la ciudad se llenó de emoción y la gente preguntaba: «¿Quién es este?». Y la multitud respondía: «Este es Jesús, el profeta de Nazaret». Fue un día de fiesta, cantos y ramas verdes para recibir al Rey de amor.'
      ],
      pregunta: '¿Cómo le darías tú la bienvenida a Jesús con alegría, como lo hizo la gente con las palmas?'
    },
    {
      slug: 'ultima-cena', testamento: 'nuevo', titulo: 'La última cena', emoji: '🍇', cita: 'Lucas 22:14-20 y Juan 13',
      parrafos: [
        'Llegó la noche de una cena muy especial, la última que Jesús compartiría con sus amigos antes de partir. Era la fiesta de la Pascua, y Jesús deseaba mucho estar con ellos alrededor de la mesa para despedirse con amor.',
        'Antes de comer, Jesús hizo algo sorprendente: se levantó, tomó una toalla y agua, y lavó los pies de cada uno de sus amigos, como lo hacía un siervo humilde. Con eso les enseñó: «Si yo, su Maestro, les sirvo con amor, ustedes también deben servirse unos a otros».',
        'Luego, ya en la mesa, Jesús tomó el pan, dio gracias a Dios, lo partió y lo repartió diciendo: «Esto es mi cuerpo, que por ustedes es entregado. Hagan esto en memoria de mí». Cada amigo recibió su pedazo con reverencia.',
        'Después tomó la copa y dijo: «Esta copa es el nuevo pacto en mi sangre, que por ustedes se derrama». Era una promesa de amor para siempre: Jesús estaría cerca de sus amigos y de todos los que creen en Él, de una manera nueva y especial.',
        'Esa noche, Jesús les dejó un regalo que nunca se acabaría: cada vez que compartimos el pan y recordamos lo que Él hizo, sentimos su amor cerca. Por eso, hasta hoy, las familias y las iglesias recuerdan esa cena con gratitud y alegría.'
      ],
      pregunta: '¿De qué manera puedes servir con amor a tu familia, como Jesús lavó los pies a sus amigos?'
    },
    {
      slug: 'cruz', testamento: 'nuevo', titulo: 'La cruz y la resurrección', emoji: '✝️', cita: 'Lucas 23 y 24',
      parrafos: [
        'Jesús amaba tanto a todas las personas que dio su vida por amor en una cruz. Fue un día triste para sus amigos y para María, su mamá, que estuvo cerca de Él. Jesús lo hizo para que todos pudiéramos estar cerca de Dios y recibir su perdón y su amor para siempre.',
        'Cuando Jesús murió, unos amigos buenos lo bajaron con mucho cariño y lo pusieron en una tumba nueva, cavada en la roca. Rodaron una piedra grande y pesada para tapar la entrada, y las mujeres que lo amaban miraron bien dónde quedaba la tumba.',
        'Pasó el viernes y el sábado, y todo parecía estar en silencio y muy triste. Pero Dios tenía preparada la sorpresa más grande y alegre de todas. ¡La historia no terminaba en la tumba!',
        'Muy temprano el domingo, al salir el sol, las mujeres fueron a la tumba y encontraron la piedra movida. ¡La tumba estaba vacía! Un ángel con ropas brillantes les dijo: «No tengan miedo. Jesús no está aquí, ha resucitado, tal como lo había dicho».',
        'Las mujeres corrieron llenas de alegría a contar la noticia. Y Jesús mismo, vivo y resucitado, apareció a sus amigos, comió con ellos y les dio paz. Por eso celebramos con esperanza: Jesús vive, venció a la muerte y su amor nunca se apaga.'
      ],
      pregunta: '¿Qué parte de esta historia te llena más de esperanza y alegría, y por qué?'
    },
    {
      slug: 'pentecostes', testamento: 'nuevo', titulo: 'La ascensión y Pentecostés', emoji: '🕊️', cita: 'Hechos 1-2',
      parrafos: [
        'Después de resucitar, Jesús pasó cuarenta días con sus amigos, enseñándoles y dándoles ánimo. Un día, los bendijo y, mientras lo miraban, subió al cielo entre las nubes. Jesús les prometió que no los dejaría solos: enviaría una ayuda muy especial desde el cielo.',
        'Dos ángeles dijeron a los amigos: «Este mismo Jesús volverá un día». Con esa promesa en el corazón, volvieron a Jerusalén y se quedaron juntos, orando y esperando con paciencia lo que Jesús les había prometido. María y muchos otros creyentes oraban unidos cada día.',
        'Llegó el día de una fiesta llamada Pentecostés. De repente, se oyó un sonido fuerte como un viento poderoso que llenó toda la casa donde estaban. Y aparecieron algo como llamitas de fuego que se posaron sobre cada uno de ellos, sin quemarlos.',
        '¡Era el Espíritu Santo que Jesús había prometido! Todos fueron llenos de su poder y empezaron a hablar en otros idiomas, para que personas de muchos países pudieran entender las maravillas de Dios. Pedro, que antes había tenido miedo, ahora habló con mucha valentía sobre Jesús.',
        'Ese día, unas tres mil personas creyeron y fueron bautizadas. Así nació la gran familia de la iglesia: personas que comparten, oran juntas, ayudan a los demás y cuentan a todos el amor de Jesús. Y esa familia sigue creciendo hasta hoy, ¡y tú también eres parte de ella!'
      ],
      pregunta: '¿Cómo crees que el Espíritu Santo nos ayuda hoy a ser valientes y a compartir el amor de Jesús?'
    }
  ];;

  /* ================= 14. TRIVIA BÍBLICA (banco propio) ================= */
  var BANCO_TRIVIA_BIBLICA = [
    { categoria: 'Biblia', pregunta: '¿Quién construyó un arca enorme para salvar a los animales?', opciones: ['Noé', 'Moisés', 'Abraham', 'David'], correcta: 0 },
    { categoria: 'Biblia', pregunta: '¿Cuántos días y noches llovió en el tiempo de Noé?', opciones: ['7', '12', '40', '100'], correcta: 2 },
    { categoria: 'Biblia', pregunta: '¿Qué puso Dios en el cielo como señal de su promesa a Noé?', opciones: ['Una estrella', 'Un arcoíris', 'Una nube', 'Un relámpago'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿Quién venció al gigante Goliat con una honda y una piedra?', opciones: ['Sansón', 'Saúl', 'David', 'Salomón'], correcta: 2 },
    { categoria: 'Biblia', pregunta: '¿Qué instrumento tocaba David?', opciones: ['La trompeta', 'El arpa', 'El tambor', 'La flauta'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿A qué foso fue echado Daniel por orar a Dios?', opciones: ['Al de los osos', 'Al de las serpientes', 'Al de los leones', 'Al del fuego'], correcta: 2 },
    { categoria: 'Biblia', pregunta: '¿Qué animal se tragó a Jonás?', opciones: ['Un tiburón', 'Un gran pez', 'Una ballena azul', 'Un pulpo gigante'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿Cuántos días estuvo Jonás dentro del gran pez?', opciones: ['1', '2', '3', '7'], correcta: 2 },
    { categoria: 'Biblia', pregunta: '¿En qué ciudad nació Jesús?', opciones: ['Nazaret', 'Jerusalén', 'Belén', 'Galilea'], correcta: 2 },
    { categoria: 'Biblia', pregunta: '¿Cómo se llamaba la mamá de Jesús?', opciones: ['Marta', 'María', 'Ana', 'Rut'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿Qué guió a los sabios hasta donde estaba Jesús?', opciones: ['Un ángel', 'Una estrella', 'Un mapa', 'Una paloma'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿A quiénes avisaron primero los ángeles del nacimiento de Jesús?', opciones: ['A los reyes', 'A los pescadores', 'A los pastores', 'A los sacerdotes'], correcta: 2 },
    { categoria: 'Biblia', pregunta: '¿Quién abrió el mar para que el pueblo de Israel pasara?', opciones: ['Moisés', 'Josué', 'Aarón', 'Elías'], correcta: 0 },
    { categoria: 'Biblia', pregunta: '¿Qué recibió Moisés en el monte con los mandamientos de Dios?', opciones: ['Una corona', 'Dos tablas de piedra', 'Un cayado de oro', 'Un libro de plata'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿Cuántos mandamientos hay?', opciones: ['5', '7', '10', '12'], correcta: 2 },
    { categoria: 'Biblia', pregunta: '¿Quién lideró al pueblo de Israel después de Moisés?', opciones: ['Josué', 'Sansón', 'Gedeón', 'Samuel'], correcta: 0 },
    { categoria: 'Biblia', pregunta: '¿Qué niño ofreció sus cinco panes y dos peces a Jesús?', opciones: ['Un niño de la multitud', 'Pedro', 'Juan', 'Tomás'], correcta: 0 },
    { categoria: 'Biblia', pregunta: '¿Cuántas canastas sobraron después de que Jesús alimentó a la multitud?', opciones: ['2', '5', '7', '12'], correcta: 3 },
    { categoria: 'Biblia', pregunta: '¿Cuántas ovejas tenía el pastor de la parábola?', opciones: ['50', '99', '100', '1000'], correcta: 2 },
    { categoria: 'Biblia', pregunta: '¿Quién era el hombre más fuerte de la Biblia, famoso por su pelo?', opciones: ['Sansón', 'Goliat', 'David', 'Absalón'], correcta: 0 },
    { categoria: 'Biblia', pregunta: '¿Qué construyó el rey Salomón en Jerusalén?', opciones: ['Una torre', 'El templo', 'Un palacio de cristal', 'Un arca'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿Por qué era famoso el rey Salomón?', opciones: ['Por su velocidad', 'Por su sabiduría', 'Por su altura', 'Por su voz'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿Quién interpretaba sueños y luego salvó a Egipto del hambre?', opciones: ['José', 'Benjamín', 'Rubén', 'Judá'], correcta: 0 },
    { categoria: 'Biblia', pregunta: '¿Qué tenía José que le regaló su padre Jacob?', opciones: ['Una espada', 'Una túnica de colores', 'Un caballo', 'Una corona'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿Cuántos hermanos tenía José?', opciones: ['3', '7', '11', 'ninguno'], correcta: 2 },
    { categoria: 'Biblia', pregunta: '¿Quién caminó sobre el agua junto a Jesús por un momento?', opciones: ['Pedro', 'Andrés', 'Mateo', 'Felipe'], correcta: 0 },
    { categoria: 'Biblia', pregunta: '¿Cómo se llamaba el primer hombre según la Biblia?', opciones: ['Adán', 'Noé', 'Abel', 'Set'], correcta: 0 },
    { categoria: 'Biblia', pregunta: '¿Cómo se llamaba la primera mujer según la Biblia?', opciones: ['Sara', 'Eva', 'Rebeca', 'Lea'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿Qué día descansó Dios después de crear el mundo?', opciones: ['El primero', 'El sexto', 'El séptimo', 'El décimo'], correcta: 2 },
    { categoria: 'Biblia', pregunta: '¿Quién recibió al niño Jesús en el templo y era un profeta anciano?', opciones: ['Simeón', 'Zacarías', 'Nicodemo', 'Anás'], correcta: 0 },
    { categoria: 'Biblia', pregunta: '¿Qué pájaro volvió al arca llevando una ramita de olivo?', opciones: ['Un cuervo', 'Una paloma', 'Un águila', 'Un gorrión'], correcta: 1 },
    { categoria: 'Biblia', pregunta: '¿Cuántos discípulos eligió Jesús?', opciones: ['7', '10', '12', '40'], correcta: 2 }
  ];

  /* ============ 16. COMPLETA EL VERSÍCULO (banco propio) ============ */
  var BANCO_COMPLETA = [
    { texto: 'El Señor es mi ___; nada me faltará.', cita: 'Salmo 23:1', opciones: ['pastor', 'rey', 'amigo', 'juez'], correcta: 0 },
    { texto: 'Todo lo puedo en ___ que me fortalece.', cita: 'Filipenses 4:13', opciones: ['mí', 'Cristo', 'la familia', 'el trabajo'], correcta: 1 },
    { texto: 'El Señor es mi ___ y mi salvación; ¿de quién temeré?', cita: 'Salmo 27:1', opciones: ['sombra', 'luz', 'camino', 'casa'], correcta: 1 },
    { texto: 'En el principio creó ___ los cielos y la tierra.', cita: 'Génesis 1:1', opciones: ['el hombre', 'los ángeles', 'Dios', 'el sol'], correcta: 2 },
    { texto: 'Tu ___ es una lámpara a mis pies.', cita: 'Salmo 119:105', opciones: ['amor', 'palabra', 'mano', 'voz'], correcta: 1 },
    { texto: 'Ama a tu ___ como a ti mismo.', cita: 'Mateo 22:39', opciones: ['prójimo', 'enemigo', 'hermano', 'maestro'], correcta: 0 },
    { texto: 'Dejen que los ___ vengan a mí.', cita: 'Marcos 10:14', opciones: ['pastores', 'niños', 'sabios', 'pescadores'], correcta: 1 },
    { texto: 'Yo soy el buen ___; el buen pastor su vida da por las ovejas.', cita: 'Juan 10:11', opciones: ['rey', 'pastor', 'amigo', 'profeta'], correcta: 1 },
    { texto: 'Dios es nuestro ___ y fortaleza.', cita: 'Salmo 46:1', opciones: ['amparo', 'escudo', 'tesoro', 'castillo'], correcta: 0 },
    { texto: 'Confía en el ___ con todo tu corazón.', cita: 'Proverbios 3:5', opciones: ['tiempo', 'Señor', 'destino', 'consejo'], correcta: 1 },
    { texto: 'El fruto del Espíritu es ___, gozo, paz…', cita: 'Gálatas 5:22', opciones: ['amor', 'poder', 'riqueza', 'gloria'], correcta: 0 },
    { texto: 'Sean ___ unos con otros, compasivos.', cita: 'Efesios 4:32', opciones: ['fuertes', 'amables', 'rápidos', 'sabios'], correcta: 1 },
    { texto: 'No ___, porque yo estoy contigo.', cita: 'Isaías 41:10', opciones: ['llores', 'corras', 'temas', 'dudes'], correcta: 2 },
    { texto: 'Sé fuerte y ___; no tengas miedo.', cita: 'Josué 1:9', opciones: ['valiente', 'silencioso', 'veloz', 'paciente'], correcta: 0 },
    { texto: 'Alégrense siempre en el ___.', cita: 'Filipenses 4:4', opciones: ['día', 'Señor', 'camino', 'hogar'], correcta: 1 },
    { texto: 'El amor es ___, es bondadoso.', cita: '1 Corintios 13:4', opciones: ['eterno', 'fuerte', 'paciente', 'grande'], correcta: 2 },
    { texto: 'Busquen primeramente el ___ de Dios.', cita: 'Mateo 6:33', opciones: ['templo', 'reino', 'libro', 'pueblo'], correcta: 1 },
    { texto: 'Mi Dios suplirá todo lo que les ___ conforme a sus riquezas.', cita: 'Filipenses 4:19', opciones: ['sobra', 'falta', 'cuesta', 'pesa'], correcta: 1 },
    { texto: 'Encomienda al Señor tu ___, confía en él, y él hará.', cita: 'Salmo 37:5', opciones: ['ofrenda', 'trabajo', 'camino', 'sueño'], correcta: 2 },
    { texto: 'Nosotros le amamos a él, porque él nos ___ primero.', cita: '1 Juan 4:19', opciones: ['buscó', 'amó', 'vio', 'llamó'], correcta: 1 },
    { texto: 'Este es el ___ que hizo el Señor; nos gozaremos en él.', cita: 'Salmo 118:24', opciones: ['día', 'mundo', 'cielo', 'plan'], correcta: 0 },
    { texto: 'He aquí, yo estoy con ustedes todos los ___, hasta el fin del mundo.', cita: 'Mateo 28:20', opciones: ['años', 'siglos', 'días', 'momentos'], correcta: 2 }
  ];
  var TIEMPO_VERSICULO_SEG = 20;

  function crearVersiculo(jugadores, orden) {
    var indices = BANCO_COMPLETA.map(function (_, i) { return i; });
    return {
      tipo: 'versiculo', fase: 'esperando', // esperando | pregunta | revelado | final
      orden: orden ? orden.slice() : indices,
      preguntaIdx: 0, jugadores: (jugadores || []).slice(),
      respuestas: {}, puntajes: {}, correctaRevelada: null, terminado: false
    };
  }
  function versiculoActual(estado) {
    if (estado.preguntaIdx >= estado.orden.length) return null;
    return BANCO_COMPLETA[estado.orden[estado.preguntaIdx]];
  }
  function iniciarVersiculo(estado) {
    if (estado.fase !== 'esperando') throw new Error('Ya empezó');
    return Object.assign({}, estado, { fase: 'pregunta' });
  }
  function responderVersiculo(estado, userId, opcion, tiempoRestante) {
    if (estado.fase !== 'pregunta') throw new Error('Ahora no se puede responder');
    if (estado.respuestas[userId]) throw new Error('Ya respondiste');
    var v = versiculoActual(estado);
    var puntos = 0;
    if (opcion === v.correcta) puntos = 10 + (tiempoRestante > TIEMPO_VERSICULO_SEG / 2 ? 5 : 0);
    var respuestas = Object.assign({}, estado.respuestas);
    respuestas[userId] = { opcion: opcion, puntos: puntos };
    return Object.assign({}, estado, { respuestas: respuestas });
  }
  function revelarVersiculo(estado) {
    if (estado.fase !== 'pregunta') throw new Error('No hay versículo abierto');
    var v = versiculoActual(estado);
    var puntajes = Object.assign({}, estado.puntajes);
    Object.keys(estado.respuestas).forEach(function (uid) {
      puntajes[uid] = (puntajes[uid] || 0) + estado.respuestas[uid].puntos;
    });
    var esUltima = estado.preguntaIdx >= estado.orden.length - 1;
    return Object.assign({}, estado, {
      puntajes: puntajes, correctaRevelada: v.correcta,
      fase: esUltima ? 'final' : 'revelado', terminado: esUltima
    });
  }
  function siguienteVersiculo(estado) {
    if (estado.fase !== 'revelado') throw new Error('Todavía no se reveló la palabra');
    return Object.assign({}, estado, {
      fase: 'pregunta', preguntaIdx: estado.preguntaIdx + 1, respuestas: {}, correctaRevelada: null
    });
  }

  /* ============ PAQUETE DE MEMORIA: mazos temáticos y más ============ */
  var PAREJAS_BIBLICAS = [
    { emoji: '🕊️', nombre: 'Paloma' }, { emoji: '⛵', nombre: 'Arca' },
    { emoji: '🌟', nombre: 'Estrella' }, { emoji: '🐑', nombre: 'Cordero' },
    { emoji: '🐟', nombre: 'Pez' }, { emoji: '🍞', nombre: 'Pan' },
    { emoji: '🦁', nombre: 'León' }, { emoji: '👑', nombre: 'Corona' }
  ];

  var MAZOS_MEMORIA = {
    animales: [
      { emoji: '🦁', nombre: 'León' }, { emoji: '🐘', nombre: 'Elefante' },
      { emoji: '🦒', nombre: 'Jirafa' }, { emoji: '🐵', nombre: 'Mono' },
      { emoji: '🦓', nombre: 'Cebra' }, { emoji: '🦩', nombre: 'Flamenco' },
      { emoji: '🐢', nombre: 'Tortuga' }, { emoji: '🦋', nombre: 'Mariposa' }
    ],
    comida: [
      { emoji: '🍕', nombre: 'Pizza' }, { emoji: '🍔', nombre: 'Hamburguesa' },
      { emoji: '🍎', nombre: 'Manzana' }, { emoji: '🍇', nombre: 'Uvas' },
      { emoji: '🍓', nombre: 'Fresa' }, { emoji: '🥑', nombre: 'Aguacate' },
      { emoji: '🍩', nombre: 'Dona' }, { emoji: '🍦', nombre: 'Helado' }
    ],
    vehiculos: [
      { emoji: '🚗', nombre: 'Carro' }, { emoji: '🚌', nombre: 'Autobús' },
      { emoji: '✈️', nombre: 'Avión' }, { emoji: '🚢', nombre: 'Barco' },
      { emoji: '🚲', nombre: 'Bicicleta' }, { emoji: '🚂', nombre: 'Tren' },
      { emoji: '🚁', nombre: 'Helicóptero' }, { emoji: '🚜', nombre: 'Tractor' }
    ],
    espacio: [
      { emoji: '🚀', nombre: 'Cohete' }, { emoji: '🪐', nombre: 'Planeta' },
      { emoji: '⭐', nombre: 'Estrella' }, { emoji: '🌙', nombre: 'Luna' },
      { emoji: '☄️', nombre: 'Cometa' }, { emoji: '🛸', nombre: 'Nave' },
      { emoji: '🔭', nombre: 'Telescopio' }, { emoji: '👽', nombre: 'Marciano' }
    ]
  };

  var EMOJIS_OBJETOS = ['🍎', '🍌', '🍇', '🍓', '🍕', '🍔', '🚗', '✈️', '🐶', '🐱', '🐸', '🦁',
    '🌻', '⭐', '🎈', '⚽', '🎸', '🚀', '🐢', '🦋', '🍦', '🍩', '🐠', '🦄'];

  /* ===================== 17. ¿QUÉ FALTA? ===================== */
  function rondaQueFalta(jugadores, ronda, rng) {
    var n = 4 + ronda; // ronda 1 → 5 objetos; ronda 8 → 12
    var conjunto = muestra(EMOJIS_OBJETOS, n, rng);
    var faltaIdx = Math.floor(rng() * conjunto.length);
    var falta = conjunto[faltaIdx];
    var distracciones = muestra(EMOJIS_OBJETOS.filter(function (e) { return conjunto.indexOf(e) === -1; }), 3, rng);
    return {
      conjunto: conjunto, falta: falta, faltaIdx: faltaIdx,
      opciones: mezclar([falta].concat(distracciones), rng)
    };
  }

  function crearQueFalta(jugadores, rng) {
    rng = rng || Math.random;
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    var r = rondaQueFalta(jugadores, 1, rng);
    return Object.assign({
      tipo: 'quef', jugadores: (jugadores || []).slice(0, 3),
      ronda: 1, rondasTotales: 8, fase: 'viendo', // viendo | respondiendo
      mostrados: null, respuestas: {}, puntajes: puntajes, terminado: false
    }, r);
  }

  function ocultarQueFalta(estado) {
    if (estado.fase !== 'viendo') throw new Error('Ya se ocultó');
    var mostrados = estado.conjunto.filter(function (_, i) { return i !== estado.faltaIdx; });
    return Object.assign({}, estado, { fase: 'respondiendo', mostrados: mostrados });
  }

  function responderQueFalta(estado, userId, opcionIdx) {
    if (estado.fase !== 'respondiendo') throw new Error('Todavía estamos mirando 👀');
    if (estado.respuestas[userId]) throw new Error('Ya respondiste');
    var correcta = estado.opciones[opcionIdx] === estado.falta;
    var respuestas = Object.assign({}, estado.respuestas);
    respuestas[userId] = { opcion: opcionIdx, correcta: correcta };
    var puntajes = Object.assign({}, estado.puntajes);
    if (correcta) puntajes[userId] = (puntajes[userId] || 0) + 10;
    return Object.assign({}, estado, { respuestas: respuestas, puntajes: puntajes });
  }

  function siguienteQueFalta(estado, rng) {
    if (estado.fase !== 'respondiendo') throw new Error('Todavía no se respondió');
    rng = rng || Math.random;
    if (estado.ronda >= estado.rondasTotales) return Object.assign({}, estado, { terminado: true });
    var r = rondaQueFalta(estado.jugadores, estado.ronda + 1, rng);
    return Object.assign({}, estado, r, {
      ronda: estado.ronda + 1, fase: 'viendo', mostrados: null, respuestas: {}
    });
  }

  /* ================== 18. RECUERDA EL ORDEN ================== */
  function largoFilaOrden(ronda) { return 5 + Math.floor((ronda - 1) / 2); } // 5,5,6,6,7,7

  function crearOrden(jugadores, rng) {
    rng = rng || Math.random;
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    return {
      tipo: 'orden', jugadores: (jugadores || []).slice(0, 3),
      ronda: 1, rondasTotales: 6, fase: 'viendo', // viendo | jugando
      fila: muestra(EMOJIS_OBJETOS, largoFilaOrden(1), rng),
      respuestas: {}, puntajes: puntajes, terminado: false
    };
  }

  function voltearOrden(estado) {
    if (estado.fase !== 'viendo') throw new Error('Ya se volteó la fila');
    return Object.assign({}, estado, { fase: 'jugando' });
  }

  function enviarOrden(estado, userId, secuencia) {
    if (estado.fase !== 'jugando') throw new Error('Todavía estamos memorizando 👀');
    if (estado.respuestas[userId]) throw new Error('Ya enviaste tu fila');
    var aciertos = 0;
    estado.fila.forEach(function (emoji, i) { if (secuencia && secuencia[i] === emoji) aciertos++; });
    var puntos = aciertos * 5 + (aciertos === estado.fila.length ? 10 : 0); // ¡fila completa: bonus!
    var respuestas = Object.assign({}, estado.respuestas);
    respuestas[userId] = { secuencia: (secuencia || []).slice(), aciertos: aciertos, puntos: puntos };
    var puntajes = Object.assign({}, estado.puntajes);
    puntajes[userId] = (puntajes[userId] || 0) + puntos;
    return Object.assign({}, estado, { respuestas: respuestas, puntajes: puntajes });
  }

  function siguienteOrden(estado, rng) {
    if (estado.fase !== 'jugando') throw new Error('Todavía no se jugó la ronda');
    rng = rng || Math.random;
    if (estado.ronda >= estado.rondasTotales) return Object.assign({}, estado, { terminado: true });
    return Object.assign({}, estado, {
      ronda: estado.ronda + 1, fase: 'viendo',
      fila: muestra(EMOJIS_OBJETOS, largoFilaOrden(estado.ronda + 1), rng),
      respuestas: {}
    });
  }

  /* ================== 19. MEMORIA DE NÚMEROS ================== */
  function numeroAleatorio(digitos, rng) {
    var s = String(1 + Math.floor(rng() * 9)); // nunca empieza en 0
    for (var i = 1; i < digitos; i++) s += String(Math.floor(rng() * 10));
    return s;
  }

  function crearNumeros(jugadores, rng) {
    rng = rng || Math.random;
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    return {
      tipo: 'numeros', jugadores: (jugadores || []).slice(0, 3),
      ronda: 1, rondasTotales: 8, fase: 'viendo', // viendo | escribiendo
      digitos: 4, numero: numeroAleatorio(4, rng),
      respuestas: {}, puntajes: puntajes, terminado: false
    };
  }

  function ocultarNumeros(estado) {
    if (estado.fase !== 'viendo') throw new Error('Ya se ocultó el número');
    return Object.assign({}, estado, { fase: 'escribiendo' });
  }

  function responderNumeros(estado, userId, texto) {
    if (estado.fase !== 'escribiendo') throw new Error('Todavía estamos mirando el número 👀');
    if (estado.respuestas[userId]) throw new Error('Ya respondiste');
    var correcta = String(texto || '').replace(/\D/g, '') === estado.numero;
    var respuestas = Object.assign({}, estado.respuestas);
    respuestas[userId] = { texto: String(texto || ''), correcta: correcta };
    var puntajes = Object.assign({}, estado.puntajes);
    if (correcta) puntajes[userId] = (puntajes[userId] || 0) + estado.digitos * 5;
    return Object.assign({}, estado, { respuestas: respuestas, puntajes: puntajes });
  }

  function siguienteNumeros(estado, rng) {
    if (estado.fase !== 'escribiendo') throw new Error('Todavía no se respondió');
    rng = rng || Math.random;
    if (estado.ronda >= estado.rondasTotales) return Object.assign({}, estado, { terminado: true });
    var digitos = estado.digitos + 1;
    return Object.assign({}, estado, {
      ronda: estado.ronda + 1, fase: 'viendo', digitos: digitos,
      numero: numeroAleatorio(digitos, rng), respuestas: {}
    });
  }

  /* ================= PUNTOS DE CAMPEONES (juegos nuevos) ================= */
  function ganadorPorPuntajes(estado) {
    var mejor = null, mejorPts = -1;
    Object.keys(estado.puntajes || {}).forEach(function (uid) {
      if (estado.puntajes[uid] > mejorPts) { mejorPts = estado.puntajes[uid]; mejor = uid; }
    });
    return mejorPts > 0 ? mejor : null;
  }

  function puntosDePartidaExtra(estado) {
    var suma = {};
    if (!estado || !estado.tipo) return suma;
    function dar(uid, pts) { if (uid && pts) suma[uid] = (suma[uid] || 0) + pts; }
    function copiarPuntajes(extraGanador) {
      Object.keys(estado.puntajes || {}).forEach(function (uid) { dar(uid, estado.puntajes[uid] || 0); });
      if (extraGanador) dar(ganadorPorPuntajes(estado), extraGanador);
    }
    switch (estado.tipo) {
      case 'conecta': case 'parchis': case 'naval': case 'ppt': case 'damas':
        if (estado.terminado) dar(estado.ganador, 50);
        break;
      case 'guerra': case 'tesoro': case 'carrera': case 'loteria':
        if (estado.terminado) dar(estado.ganador, 50);
        break;
      case 'puzzle':
        if (estado.terminado && estado.ganado) {
          estado.jugadores.forEach(function (uid) { dar(uid, 20); }); // cooperativo: ganan todos
        }
        break;
      case 'encadenada': case 'quien': case 'vf': case 'encuentra': case 'ordenab': case 'misterio':
        if (estado.terminado) copiarPuntajes(0);
        break;
      case 'serpientes':
        if (estado.terminado) dar(estado.ganador, 50);
        break;
      case 'domino':
        if (estado.terminado) dar(estado.ganador, 50);
        break;
      case 'ahorcado':
        if (estado.terminado && estado.ganado) {
          estado.jugadores.forEach(function (uid) { dar(uid, 20); });
          dar(estado.ultimoAcertante, 30); // quien puso la última letra: 50 en total
        }
        break;
      case 'dibujo':
        if (estado.terminado || estado.fase === 'final') copiarPuntajes(0);
        break;
      case 'sopa':
        if (estado.terminado) Object.keys(estado.puntajes || {}).forEach(function (uid) { dar(uid, (estado.puntajes[uid] || 0) * 10); });
        break;
      case 'basta': case 'versiculo': case 'quef': case 'orden': case 'numeros': case 'adivina':
        if (estado.terminado) copiarPuntajes(0);
        break;
      case 'simon':
        if (estado.terminado) {
          Object.keys(estado.puntajes || {}).forEach(function (uid) { dar(uid, (estado.puntajes[uid] || 0) * 10); });
          dar(estado.ganador, 20);
        }
        break;
      case 'calculo':
        if (estado.terminado) copiarPuntajes(20);
        break;
      case 'obby': // v3.6: las monedas cuentan como puntaje + 50 al que llegó a la meta
        if (estado.terminado) { copiarPuntajes(0); dar(estado.ganador, 50); }
        break;
      case 'tycoon': case 'mascotas': case 'impostor': // v3.6: suma su propio puntaje
        if (estado.terminado) copiarPuntajes(0);
        break;
      case 'torre': // v3.6: puntos por globos reventados + 20 a cada uno si la familia aguantó
        if (estado.terminado) {
          copiarPuntajes(0);
          if (estado.ganado) estado.jugadores.forEach(function (uid) { dar(uid, 20); });
        }
        break;
    }
    return suma;
  }

  /* ==================== v3: JUEGOS NUEVOS (normales) ==================== */

  function barajarLista(arr, rng) {
    var r = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // RNG determinista por semilla (para repartos iguales en todos los aparatos).
  function rngDeSemilla(semilla) {
    var s = 2166136261;
    var txt = String(semilla);
    for (var i = 0; i < txt.length; i++) { s ^= txt.charCodeAt(i); s = (s * 16777619) >>> 0; }
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ----- Damas (reglas sencillas: reyes de un paso, sin captura obligatoria) ----- */
  function crearDamas(jugadores) {
    var tablero = [];
    for (var i = 0; i < 64; i++) tablero.push('');
    for (var f = 0; f < 8; f++) for (var c = 0; c < 8; c++) {
      if ((f + c) % 2 !== 1) continue; // solo casillas oscuras
      if (f < 3) tablero[f * 8 + c] = 'r';       // jugador 0 (🔴) abajo
      else if (f > 4) tablero[f * 8 + c] = 'b'; // jugador 1 (⚪) arriba
    }
    return {
      tipo: 'damas', jugadores: (jugadores || []).slice(0, 2), tablero: tablero,
      turno: 0, ganador: null, terminado: false, empate: false, ultimaJugada: null
    };
  }
  function esPiezaDe(pieza, idxJug) {
    if (!pieza) return false;
    return idxJug === 0 ? (pieza === 'r' || pieza === 'R') : (pieza === 'b' || pieza === 'B');
  }
  function movimientosDamas(estado, pos) {
    var pieza = estado.tablero[pos];
    if (!pieza) return [];
    var f = Math.floor(pos / 8), c = pos % 8;
    var esR = pieza === 'r' || pieza === 'R';
    var rey = pieza === 'R' || pieza === 'B';
    var dirs = rey ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : (esR ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]]);
    var res = [];
    dirs.forEach(function (d) {
      var f1 = f + d[0], c1 = c + d[1];
      if (f1 < 0 || f1 > 7 || c1 < 0 || c1 > 7) return;
      var p1 = f1 * 8 + c1, v1 = estado.tablero[p1];
      if (!v1) { res.push({ hasta: p1, captura: null }); return; }
      var enemiga = esR ? (v1 === 'b' || v1 === 'B') : (v1 === 'r' || v1 === 'R');
      if (!enemiga) return;
      var f2 = f + 2 * d[0], c2 = c + 2 * d[1];
      if (f2 < 0 || f2 > 7 || c2 < 0 || c2 > 7) return;
      var p2 = f2 * 8 + c2;
      if (!estado.tablero[p2]) res.push({ hasta: p2, captura: p1 });
    });
    return res;
  }
  function tieneMovimientosDamas(estado, idxJug) {
    for (var pos = 0; pos < 64; pos++) {
      if (esPiezaDe(estado.tablero[pos], idxJug) && movimientosDamas(estado, pos).length) return true;
    }
    return false;
  }
  function moverDamas(estado, idxJug, de, hasta) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.turno !== idxJug) throw new Error('No es tu turno');
    if (!esPiezaDe(estado.tablero[de], idxJug)) throw new Error('Esa pieza no es tuya');
    var mov = null;
    movimientosDamas(estado, de).forEach(function (m) { if (m.hasta === hasta) mov = m; });
    if (!mov) throw new Error('Ahí no puedes mover');
    var tablero = estado.tablero.slice();
    var pieza = tablero[de];
    tablero[de] = '';
    if (mov.captura !== null) tablero[mov.captura] = '';
    var fNueva = Math.floor(hasta / 8);
    if (pieza === 'r' && fNueva === 7) pieza = 'R'; // ¡rey! 👑
    if (pieza === 'b' && fNueva === 0) pieza = 'B';
    tablero[hasta] = pieza;
    var nuevo = Object.assign({}, estado, {
      tablero: tablero, turno: 1 - idxJug,
      ultimaJugada: { de: de, hasta: hasta, captura: mov.captura }
    });
    var rival = 1 - idxJug;
    var piezasRival = tablero.filter(function (x) { return esPiezaDe(x, rival); }).length;
    if (!piezasRival || !tieneMovimientosDamas(nuevo, rival)) {
      nuevo.terminado = true;
      nuevo.ganador = estado.jugadores[idxJug];
    }
    return nuevo;
  }

  /* ----- Lotería (cartones derivados de la semilla: iguales en todos lados) ----- */
  var FIGURAS_LOTERIA = [
    { e: '🌞', n: 'El sol' }, { e: '🌙', n: 'La luna' }, { e: '⭐', n: 'La estrella' },
    { e: '🌳', n: 'El árbol' }, { e: '🐓', n: 'El gallo' }, { e: '🐦', n: 'El pájaro' },
    { e: '🐴', n: 'El caballo' }, { e: '🐟', n: 'El pez' }, { e: '🦁', n: 'El león' },
    { e: '🐶', n: 'El perrito' }, { e: '🌹', n: 'La rosa' }, { e: '🌺', n: 'La flor' },
    { e: '🍎', n: 'La manzana' }, { e: '🍇', n: 'Las uvas' }, { e: '🏠', n: 'La casa' },
    { e: '⛵', n: 'El barco' }, { e: '🚂', n: 'El tren' }, { e: '🎺', n: 'La trompeta' },
    { e: '🎈', n: 'El globo' }, { e: '❤️', n: 'El corazón' }, { e: '👑', n: 'La corona' },
    { e: '🔔', n: 'La campana' }, { e: '🕯️', n: 'La vela' }, { e: '🌈', n: 'El arcoíris' }
  ];
  function cartonDeLoteria(semilla, userId) {
    var rng = rngDeSemilla(semilla + ':' + userId);
    var idx = FIGURAS_LOTERIA.map(function (_, i) { return i; });
    return barajarLista(idx, rng).slice(0, 16); // cartón 4×4
  }
  function crearLoteria(jugadores, rng) {
    var r = rng || Math.random;
    var semilla = Math.floor(r() * 1e9);
    var orden = barajarLista(FIGURAS_LOTERIA.map(function (_, i) { return i; }), r);
    return {
      tipo: 'loteria', jugadores: (jugadores || []).slice(0, 3),
      semilla: semilla, ordenCantadas: orden, cantadas: 0,
      ganador: null, terminado: false
    };
  }
  function cantarLoteria(estado) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.cantadas >= estado.ordenCantadas.length) throw new Error('Ya se cantaron todas');
    var cantadas = estado.cantadas + 1;
    var salidas = estado.ordenCantadas.slice(0, cantadas);
    var ganador = null;
    estado.jugadores.forEach(function (uid) {
      if (ganador) return;
      var carton = cartonDeLoteria(estado.semilla, uid);
      var completa = carton.every(function (fi) { return salidas.indexOf(fi) !== -1; });
      if (completa) ganador = uid;
    });
    return Object.assign({}, estado, {
      cantadas: cantadas, ganador: ganador, terminado: !!ganador
    });
  }

  /* ----- Guerra de Cartas (la mayor gana la ronda; cartas derivadas) ----- */
  var PALOS_GUERRA = ['♠️', '♥️', '♦️', '♣️'];
  function cartaDeGuerra(semilla, ronda, userId) {
    var rng = rngDeSemilla(semilla + ':g:' + ronda + ':' + userId);
    return {
      valor: 2 + Math.floor(rng() * 13), // 2..14 (11=J, 12=Q, 13=K, 14=As)
      palo: PALOS_GUERRA[Math.floor(rng() * 4)]
    };
  }
  function nombreCartaGuerra(carta) {
    var nombres = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
    return (nombres[carta.valor] || String(carta.valor)) + ' ' + carta.palo;
  }
  function crearGuerra(jugadores, rng) {
    var r = rng || Math.random;
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    return {
      tipo: 'guerra', jugadores: (jugadores || []).slice(0, 3),
      semilla: Math.floor(r() * 1e9), ronda: 0, rondasTotales: 10,
      fase: 'esperando', // esperando | revelado
      cartas: null, ultimoGanador: null, puntajes: puntajes,
      ganador: null, terminado: false
    };
  }
  function revelarGuerra(estado) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.fase !== 'esperando') throw new Error('Ya se revelaron las cartas');
    var cartas = {};
    var mejor = -1;
    estado.jugadores.forEach(function (uid) {
      cartas[uid] = cartaDeGuerra(estado.semilla, estado.ronda, uid);
      if (cartas[uid].valor > mejor) mejor = cartas[uid].valor;
    });
    var ganadores = estado.jugadores.filter(function (uid) { return cartas[uid].valor === mejor; });
    var puntajes = Object.assign({}, estado.puntajes);
    var ultimoGanador = null;
    if (ganadores.length === 1) { puntajes[ganadores[0]] += 1; ultimoGanador = ganadores[0]; }
    return Object.assign({}, estado, {
      fase: 'revelado', cartas: cartas, puntajes: puntajes, ultimoGanador: ultimoGanador
    });
  }
  function siguienteGuerra(estado) {
    if (estado.fase !== 'revelado') throw new Error('Primero revelen las cartas');
    if (estado.ronda + 1 >= estado.rondasTotales) {
      var ganador = ganadorPorPuntajes(estado);
      return Object.assign({}, estado, { fase: 'revelado', terminado: true, ganador: ganador });
    }
    return Object.assign({}, estado, { ronda: estado.ronda + 1, fase: 'esperando', cartas: null, ultimoGanador: null });
  }

  /* ----- El Tesoro Escondido (6×6, pistas frío/tibio/caliente) ----- */
  function crearTesoro(jugadores, rng) {
    var r = rng || Math.random;
    return {
      tipo: 'tesoro', jugadores: (jugadores || []).slice(0, 3),
      tesoro: Math.floor(r() * 36), turno: 0,
      intentos: {}, ultimoIntento: null, ganador: null, terminado: false
    };
  }
  function pistaTesoro(distancia) {
    if (distancia === 0) return '🎯';
    if (distancia <= 2) return '🔥 ¡CALIENTE!';
    if (distancia <= 5) return '🌡️ tibio…';
    return '🧊 frío…';
  }
  function distanciaTesoro(celda, tesoro) {
    return Math.abs(Math.floor(celda / 6) - Math.floor(tesoro / 6)) + Math.abs((celda % 6) - (tesoro % 6));
  }
  function buscarTesoro(estado, idxJug, celda) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.turno !== idxJug) throw new Error('No es tu turno');
    if (celda < 0 || celda > 35) throw new Error('Esa casilla no existe');
    var yaProbadas = [];
    Object.keys(estado.intentos).forEach(function (uid) {
      (estado.intentos[uid] || []).forEach(function (c) { yaProbadas.push(c); });
    });
    if (yaProbadas.indexOf(celda) !== -1) throw new Error('Esa casilla ya se probó');
    var intentos = Object.assign({}, estado.intentos);
    var uid = estado.jugadores[idxJug];
    intentos[uid] = (intentos[uid] || []).concat([celda]);
    var d = distanciaTesoro(celda, estado.tesoro);
    var acierto = celda === estado.tesoro;
    return Object.assign({}, estado, {
      intentos: intentos,
      ultimoIntento: { de: uid, celda: celda, pista: pistaTesoro(d), distancia: d },
      turno: acierto ? idxJug : (idxJug + 1) % estado.jugadores.length,
      ganador: acierto ? uid : null, terminado: acierto
    });
  }

  /* ----- Verdad o Reto familiar (suave, para niños) ----- */
  var TARJETAS_VERDAD = [
    '¿Cuál es tu comida favorita del mundo mundial?', 'Si pudieras tener un superpoder, ¿cuál sería?',
    '¿Qué animal serías y por qué?', '¿Cuál es tu recuerdo más divertido en familia?',
    'Si tuvieras una varita mágica, ¿qué deseo pedirías?', '¿Qué es lo que más te gusta de la persona a tu derecha?',
    '¿Cuál es tu canción favorita para cantar a todo pulmón?', 'Si pudieras viajar a cualquier lugar, ¿a dónde irías?',
    '¿Qué te hace reír siempre, sin falta?', '¿Cuál es tu postre favorito?',
    'Si fueras un superhéroe, ¿cómo te llamarías?', '¿Qué cosa sabes hacer que casi nadie sabe?'
  ];
  var TARJETAS_RETO = [
    'Imita el sonido de un gallo 🐓', 'Haz 5 saltos de rana 🐸',
    'Canta una estrofa de tu canción favorita 🎤', 'Imita a un robot caminando 🤖',
    'Haz una mueca muy graciosa y aguanta 10 segundos 😜', 'Di un trabalenguas 3 veces rápido 👅',
    'Baila como una estrella por 15 segundos 💃', 'Imita el andar de un pingüino 🐧',
    'Cuenta un chiste cortito 😂', 'Haz el sonido de 3 animales distintos 🦁',
    'Camina como un cangrejo de lado a lado 🦀', 'Pon cara de sorpresa máxima por 10 segundos 😲'
  ];
  function crearVerdad(jugadores) {
    return {
      tipo: 'verdad', jugadores: (jugadores || []).slice(0, 3),
      turno: 0, jugadas: 0, jugadasTotales: 9,
      fase: 'eligiendo', // eligiendo | mostrando
      tarjeta: null, terminado: false
    };
  }
  function elegirTarjetaVerdad(estado, idxJug, clase, rng) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.fase !== 'eligiendo') throw new Error('Primero completen la tarjeta actual');
    if (estado.turno !== idxJug) throw new Error('No es tu turno');
    var banco = clase === 'reto' ? TARJETAS_RETO : TARJETAS_VERDAD;
    var r = rng || Math.random;
    return Object.assign({}, estado, {
      fase: 'mostrando',
      tarjeta: { clase: clase === 'reto' ? 'reto' : 'verdad', texto: banco[Math.floor(r() * banco.length)] }
    });
  }
  function completarVerdad(estado) {
    if (estado.fase !== 'mostrando') throw new Error('Todavía no hay tarjeta');
    var jugadas = estado.jugadas + 1;
    return Object.assign({}, estado, {
      fase: 'eligiendo', tarjeta: null, jugadas: jugadas,
      turno: (estado.turno + 1) % estado.jugadores.length,
      terminado: jugadas >= estado.jugadasTotales
    });
  }

  /* ----- Carrera de Dados (a 30: plantarse o seguir, ¡cuidado con el 1!) ----- */
  function crearCarrera(jugadores) {
    var totales = {};
    (jugadores || []).forEach(function (id) { totales[id] = 0; });
    return {
      tipo: 'carrera', jugadores: (jugadores || []).slice(0, 3), meta: 30,
      turno: 0, totales: totales, parcial: 0, ultimosDados: null, ultimoEvento: '',
      ganador: null, terminado: false
    };
  }
  function tirarCarrera(estado, rng) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    var r = rng || Math.random;
    var d1 = 1 + Math.floor(r() * 6), d2 = 1 + Math.floor(r() * 6);
    var uid = estado.jugadores[estado.turno];
    if (d1 === 1 || d2 === 1) {
      // ¡Salió un 1! Pierde lo acumulado en este turno y pasa la mano.
      return Object.assign({}, estado, {
        parcial: 0, ultimosDados: [d1, d2],
        ultimoEvento: '¡Salió un 1! ' + 'Pierde el turno sin guardar 😱',
        turno: (estado.turno + 1) % estado.jugadores.length
      });
    }
    return Object.assign({}, estado, {
      parcial: estado.parcial + d1 + d2, ultimosDados: [d1, d2],
      ultimoEvento: 'Sumó ' + (d1 + d2) + '… ¿se planta o sigue? 🎲'
    });
  }
  function plantarseCarrera(estado) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (!estado.parcial) throw new Error('Primero tira los dados');
    var uid = estado.jugadores[estado.turno];
    var totales = Object.assign({}, estado.totales);
    totales[uid] = (totales[uid] || 0) + estado.parcial;
    var gano = totales[uid] >= estado.meta;
    return Object.assign({}, estado, {
      totales: totales, parcial: 0,
      ultimoEvento: 'Guardó sus puntos en la alcancía 🏦',
      turno: (estado.turno + 1) % estado.jugadores.length,
      ganador: gano ? uid : null, terminado: gano
    });
  }

  /* ----- Palabra Encadenada (última letra = primera de la siguiente) ----- */
  var PALABRAS_ENCADENA = [
    'sol', 'luna', 'casa', 'mesa', 'perro', 'gato', 'flor', 'arbol', 'libro', 'agua',
    'pan', 'leche', 'queso', 'manzana', 'banana', 'naranja', 'ventana', 'puerta', 'camino', 'rio',
    'mar', 'cielo', 'estrella', 'nube', 'lluvia', 'nieve', 'fuego', 'tierra', 'piedra', 'papel',
    'zapato', 'sombrero', 'camisa', 'ojo', 'mano', 'pie', 'boca', 'nariz', 'pelo', 'diente',
    'escuela', 'amigo', 'familia', 'bebe', 'abuelo', 'primo', 'hermano', 'musica', 'baile', 'canto',
    'juego', 'pelota', 'playa', 'barco', 'avion', 'tren', 'coche', 'elefante', 'jirafa', 'leon',
    'tigre', 'oso', 'lobo', 'zorro', 'conejo', 'pato', 'gallo', 'vaca', 'oveja', 'cabra', 'caballo'
  ];
  function ultimaLetraEncadena(palabra) {
    var t = normalizarTexto(palabra || '');
    return t ? t.charAt(t.length - 1) : '';
  }
  function crearEncadenada(jugadores, rng) {
    var r = rng || Math.random;
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    return {
      tipo: 'encadenada', jugadores: (jugadores || []).slice(0, 3),
      palabraActual: PALABRAS_ENCADENA[Math.floor(r() * PALABRAS_ENCADENA.length)],
      usadas: [], turno: 0, turnoGlobal: 0, turnosTotales: 12,
      puntajes: puntajes, ultimoError: '', ganador: null, terminado: false
    };
  }
  function finEncadenada(estado) {
    return Object.assign({}, estado, { terminado: true, ganador: ganadorPorPuntajes(estado) });
  }
  function enviarEncadenada(estado, idxJug, palabra) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.turno !== idxJug) throw new Error('No es tu turno');
    var t = normalizarTexto(palabra || '');
    function falla(msg) {
      var nuevo = Object.assign({}, estado, {
        ultimoError: msg, turnoGlobal: estado.turnoGlobal + 1,
        turno: (estado.turno + 1) % estado.jugadores.length
      });
      return nuevo.turnoGlobal >= estado.turnosTotales ? finEncadenada(nuevo) : nuevo;
    }
    if (PALABRAS_ENCADENA.indexOf(t) === -1) return falla('«' + palabra + '» no está en la lista de palabras 🤔');
    if (estado.usadas.indexOf(t) !== -1 || t === normalizarTexto(estado.palabraActual)) return falla('«' + palabra + '» ya salió 🔁');
    if (t.charAt(0) !== ultimaLetraEncadena(estado.palabraActual)) {
      return falla('¡La palabra debe empezar con «' + ultimaLetraEncadena(estado.palabraActual).toUpperCase() + '»! 🔤');
    }
    var uid = estado.jugadores[idxJug];
    var puntajes = Object.assign({}, estado.puntajes);
    puntajes[uid] = (puntajes[uid] || 0) + 10;
    var nuevo = Object.assign({}, estado, {
      palabraActual: t, usadas: estado.usadas.concat([t]), puntajes: puntajes,
      ultimoError: '', turnoGlobal: estado.turnoGlobal + 1,
      turno: (estado.turno + 1) % estado.jugadores.length
    });
    return nuevo.turnoGlobal >= estado.turnosTotales ? finEncadenada(nuevo) : nuevo;
  }
  function pasarEncadenada(estado, idxJug) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.turno !== idxJug) throw new Error('No es tu turno');
    var nuevo = Object.assign({}, estado, {
      ultimoError: 'Pasó el turno ⏭️', turnoGlobal: estado.turnoGlobal + 1,
      turno: (estado.turno + 1) % estado.jugadores.length
    });
    return nuevo.turnoGlobal >= estado.turnosTotales ? finEncadenada(nuevo) : nuevo;
  }

  /* ----- Rompecabezas Deslizante (3×3 cooperativo, contrarreloj) ----- */
  var EMOJIS_PUZZLE = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼'];
  function crearPuzzle(jugadores, rng) {
    var r = rng || Math.random;
    // Barajar MOVIENDO desde la posición resuelta: siempre tiene solución.
    var piezas = EMOJIS_PUZZLE.concat(['']);
    var vacia = 8;
    for (var k = 0; k < 40; k++) {
      var f = Math.floor(vacia / 3), c = vacia % 3;
      var vecinos = [];
      if (f > 0) vecinos.push(vacia - 3);
      if (f < 2) vecinos.push(vacia + 3);
      if (c > 0) vecinos.push(vacia - 1);
      if (c < 2) vecinos.push(vacia + 1);
      var dest = vecinos[Math.floor(r() * vecinos.length)];
      piezas[vacia] = piezas[dest]; piezas[dest] = ''; vacia = dest;
    }
    if (puzzleResuelto(piezas)) { // jamás entregar uno ya resuelto
      var tmp = piezas[0]; piezas[0] = piezas[1]; piezas[1] = tmp;
      if (puzzleResuelto(piezas)) { piezas[0] = piezas[2]; piezas[2] = tmp; }
    }
    return {
      tipo: 'puzzle', jugadores: (jugadores || []).slice(0, 3),
      piezas: piezas, movimientos: 0, inicioEn: 0, ganado: false, terminado: false
    };
  }
  function puzzleResuelto(piezas) {
    var meta = EMOJIS_PUZZLE.concat(['']);
    for (var i = 0; i < 9; i++) if (piezas[i] !== meta[i]) return false;
    return true;
  }
  function moverPuzzle(estado, pos) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    var vacia = estado.piezas.indexOf('');
    var f = Math.floor(pos / 3), cv = Math.floor(vacia / 3);
    var junto = (Math.floor(pos / 3) === cv && Math.abs((pos % 3) - (vacia % 3)) === 1) ||
      ((pos % 3) === (vacia % 3) && Math.abs(f - cv) === 1);
    if (!junto || pos === vacia) throw new Error('Esa pieza no se puede mover');
    var piezas = estado.piezas.slice();
    piezas[vacia] = piezas[pos]; piezas[pos] = '';
    var gano = puzzleResuelto(piezas);
    return Object.assign({}, estado, {
      piezas: piezas, movimientos: estado.movimientos + 1,
      ganado: gano, terminado: gano
    });
  }

  /* ==================== v3: JUEGOS BÍBLICOS NUEVOS ==================== */
  // Motor común de preguntas (quien / vf / encuentra): fases como el de
  // «Completa el Versículo» — esperando → pregunta → revelado → final.
  var TIEMPO_QUIZ_SEG = 20;

  var BANCO_QUIEN = [
    { frase: 'Yo soy el camino, y la verdad, y la vida.', opciones: ['Jesús', 'Pedro', 'Pablo'], correcta: 0, cita: 'Juan 14:6' },
    { frase: 'Hágase en mí según tu palabra.', opciones: ['Marta', 'María', 'Rut'], correcta: 1, cita: 'Lucas 1:38' },
    { frase: 'Habla, Señor, que tu siervo escucha.', opciones: ['Samuel', 'Elías', 'David'], correcta: 0, cita: '1 Samuel 3:9' },
    { frase: 'Yo y mi casa serviremos al Señor.', opciones: ['Moisés', 'Sansón', 'Josué'], correcta: 2, cita: 'Josué 24:15' },
    { frase: 'Tu pueblo será mi pueblo, y tu Dios será mi Dios.', opciones: ['Ester', 'Rut', 'Sara'], correcta: 1, cita: 'Rut 1:16' },
    { frase: 'El Señor es mi pastor; nada me faltará.', opciones: ['Salomón', 'Saúl', 'David'], correcta: 2, cita: 'Salmo 23:1' },
    { frase: 'Preparen el camino del Señor.', opciones: ['Jesús', 'Juan el Bautista', 'Pedro'], correcta: 1, cita: 'Mateo 3:3' },
    { frase: 'Señor mío y Dios mío.', opciones: ['Tomás', 'Andrés', 'Felipe'], correcta: 0, cita: 'Juan 20:28' },
    { frase: '¿Quién sabe si para esta hora has llegado al reino?', opciones: ['El rey Asuero', 'Ester', 'Mardoqueo'], correcta: 2, cita: 'Ester 4:14' },
    { frase: 'Todo lo puedo en Cristo que me fortalece.', opciones: ['Lucas', 'Pablo', 'Pedro'], correcta: 1, cita: 'Filipenses 4:13' },
    { frase: 'Amarás al Señor tu Dios con todo tu corazón.', opciones: ['Pablo', 'Moisés', 'Jesús'], correcta: 2, cita: 'Mateo 22:37' },
    { frase: 'No soy digno de que entres bajo mi techo; pero di la palabra, y mi siervo sanará.', opciones: ['El centurión', 'Zaqueo', 'Jairo'], correcta: 0, cita: 'Mateo 8:8' }
  ];
  var BANCO_VF = [
    { afirmacion: 'Noé llevó los animales al arca de dos en dos.', verdad: true },
    { afirmacion: 'David venció a Goliat con una espada gigante.', verdad: false },
    { afirmacion: 'Jonás estuvo dentro del gran pez durante tres días.', verdad: true },
    { afirmacion: 'Jesús nació en la ciudad de Jerusalén.', verdad: false },
    { afirmacion: 'Moisés abrió el mar Rojo con la ayuda de Dios.', verdad: true },
    { afirmacion: 'La torre de Babel llegó hasta el cielo.', verdad: false },
    { afirmacion: 'Zaqueo era muy alto y veía por encima de todos.', verdad: false },
    { afirmacion: 'Los sabios de oriente siguieron una estrella para encontrar a Jesús.', verdad: true },
    { afirmacion: 'Daniel fue echado al foso de los leones por orar a Dios.', verdad: true },
    { afirmacion: 'Jesús alimentó a la multitud con dos panes y cinco peces.', verdad: false },
    { afirmacion: 'Ester era una reina valiente que salvó a su pueblo.', verdad: true },
    { afirmacion: 'El hijo pródigo fue recibido por su papá con un abrazo y una fiesta.', verdad: true }
  ];
  var BANCO_ENCUENTRA = [
    { cita: 'Salmo 23:1', opciones: ['El Señor es mi pastor; nada me faltará.', 'El Señor es mi rey; todo me sobrará.', 'El Señor es mi amigo; siempre me reiré.'], correcta: 0 },
    { cita: 'Juan 3:16', opciones: ['Porque Dios mandó a su Hijo a juzgar al mundo.', 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo único.', 'Porque el mundo amó mucho a Dios desde el principio.'], correcta: 1 },
    { cita: 'Génesis 1:1', opciones: ['En el principio creó Dios los cielos y la tierra.', 'En el principio creó el hombre los cielos y la tierra.', 'En el principio no había nada de nada.'], correcta: 0 },
    { cita: 'Filipenses 4:13', opciones: ['Todo lo quiero en Cristo que me enriquece.', 'Todo lo sueño en Cristo que me fortalece.', 'Todo lo puedo en Cristo que me fortalece.'], correcta: 2 },
    { cita: 'Salmo 118:24', opciones: ['Este es el mes que hizo el Señor; a trabajar en él.', 'Este es el día que hizo el Señor; nos gozaremos y alegraremos en él.', 'Este es el día que hice yo; a celebrarlo en grande.'], correcta: 1 },
    { cita: 'Josué 1:9', opciones: ['Corre y sé veloz, porque el Señor va delante.', 'Esfuérzate y sé valiente, porque el Señor tu Dios estará contigo.', 'Espera y sé paciente, porque todo llega a su tiempo.'], correcta: 1 },
    { cita: 'Proverbios 3:5', opciones: ['Confía en el Señor de todo tu corazón.', 'Confía en tu suerte de todo tu corazón.', 'Confía en tus fuerzas de todo tu corazón.'], correcta: 0 },
    { cita: 'Mateo 28:20', opciones: ['Yo estaré lejos, pero los ángeles los cuidan.', 'Vayan solos, que yo los espero en el cielo.', 'Yo estoy con vosotros todos los días, hasta el fin del mundo.'], correcta: 2 },
    { cita: 'Salmo 56:3', opciones: ['En el día que temo, yo en ti confío.', 'En el día que temo, yo huyo y me escondo.', 'En el día que temo, yo llamo a mis amigos.'], correcta: 0 },
    { cita: 'Isaías 41:10', opciones: ['No corras, porque te puedes caer.', 'No temas, porque yo estoy contigo.', 'No duermas, porque viene la mañana.'], correcta: 1 },
    { cita: 'Juan 10:11', opciones: ['Yo soy el buen pastor; el buen pastor su vida da por las ovejas.', 'Yo soy el buen pescador; el buen pescador pesca de noche.', 'Yo soy el buen rey; el buen rey manda sobre todos.'], correcta: 0 },
    { cita: 'Salmo 46:1', opciones: ['Dios es nuestro amparo y fortaleza, nuestro pronto auxilio en las tribulaciones.', 'Dios es nuestro castillo lejano, escondido entre las nubes.', 'Dios es nuestro juez severo, que nos mira desde lejos.'], correcta: 0 }
  ];

  var BANCOS_QUIZ = { quien: BANCO_QUIEN, vf: BANCO_VF, encuentra: BANCO_ENCUENTRA };
  function bancoQuiz(estado) { return BANCOS_QUIZ[estado.tipo] || []; }
  function crearQuizBiblico(tipo, jugadores, orden) {
    var banco = BANCOS_QUIZ[tipo] || [];
    var indices = banco.map(function (_, i) { return i; });
    return {
      tipo: tipo, fase: 'esperando', // esperando | pregunta | revelado | final
      orden: orden ? orden.slice() : indices,
      preguntaIdx: 0, jugadores: (jugadores || []).slice(),
      respuestas: {}, puntajes: {}, correctaRevelada: null, terminado: false
    };
  }
  function preguntaQuiz(estado) { return bancoQuiz(estado)[estado.orden[estado.preguntaIdx]]; }
  function iniciarQuiz(estado) {
    if (estado.fase !== 'esperando') throw new Error('El juego ya empezó');
    return Object.assign({}, estado, { fase: 'pregunta' });
  }
  function responderQuiz(estado, userId, opcion, tiempoRestante) {
    if (estado.fase !== 'pregunta') throw new Error('Ahora no se puede responder');
    if (estado.respuestas[userId]) throw new Error('Ya respondiste');
    var correcta;
    if (estado.tipo === 'vf') correcta = preguntaQuiz(estado).verdad ? 0 : 1; // 0 = «Verdadero», 1 = «Falso»
    else correcta = preguntaQuiz(estado).correcta;
    var puntos = 0;
    if (opcion === correcta) puntos = 10 + (tiempoRestante > TIEMPO_QUIZ_SEG / 2 ? 5 : 0);
    var respuestas = Object.assign({}, estado.respuestas);
    respuestas[userId] = { opcion: opcion, puntos: puntos };
    return Object.assign({}, estado, { respuestas: respuestas });
  }
  function revelarQuiz(estado) {
    if (estado.fase !== 'pregunta') throw new Error('No hay pregunta abierta');
    var puntajes = Object.assign({}, estado.puntajes);
    Object.keys(estado.respuestas).forEach(function (uid) {
      puntajes[uid] = (puntajes[uid] || 0) + estado.respuestas[uid].puntos;
    });
    var correcta = estado.tipo === 'vf' ? (preguntaQuiz(estado).verdad ? 0 : 1) : preguntaQuiz(estado).correcta;
    var esUltima = estado.preguntaIdx >= estado.orden.length - 1;
    return Object.assign({}, estado, {
      puntajes: puntajes, correctaRevelada: correcta,
      fase: esUltima ? 'final' : 'revelado', terminado: esUltima
    });
  }
  function siguienteQuiz(estado) {
    if (estado.fase !== 'revelado') throw new Error('Todavía no se revela esta pregunta');
    return Object.assign({}, estado, {
      preguntaIdx: estado.preguntaIdx + 1, fase: 'pregunta', respuestas: {}, correctaRevelada: null
    });
  }

  /* ----- Ordena la Historia (5 eventos en su orden correcto) ----- */
  var EVENTOS_ORDENA = [
    {
      historia: 'La Creación 🌍', eventos: [
        'Dios hizo la luz', 'Dios hizo el cielo y el mar', 'Dios hizo las plantas y los árboles',
        'Dios hizo el sol, la luna y las estrellas', 'Dios hizo los animales y a las personas'
      ]
    },
    {
      historia: 'Jonás y el gran pez 🐋', eventos: [
        'Dios le pidió a Jonás ir a Nínive', 'Jonás huyó en un barco', 'Vino una gran tormenta',
        'Un gran pez se tragó a Jonás', 'Jonás oró y el pez lo dejó en la playa'
      ]
    },
    {
      historia: 'El nacimiento de Jesús 🌟', eventos: [
        'El ángel Gabriel visitó a María', 'María y José viajaron a Belén', 'Jesús nació en un pesebre',
        'Los ángeles cantaron a los pastores', 'Los sabios siguieron la estrella'
      ]
    }
  ];
  function crearOrdena(jugadores, cual, rng) {
    var r = rng || Math.random;
    var idxHistoria = (typeof cual === 'number') ? cual : Math.floor(r() * EVENTOS_ORDENA.length);
    // El arreglo inicial de cada quien: los eventos revueltos (nunca ya en orden).
    var arreglo = barajarLista([0, 1, 2, 3, 4], r);
    if (arreglo.join() === '0,1,2,3,4') arreglo = [1, 0, 2, 3, 4];
    return {
      tipo: 'ordenab', jugadores: (jugadores || []).slice(0, 3),
      historiaIdx: idxHistoria, arregloBase: arreglo,
      arreglos: {}, entregados: {}, puntajes: {},
      fase: 'ordenando', terminado: false
    };
  }
  function arregloDeOrdena(estado, userId) {
    return (estado.arreglos[userId] || estado.arregloBase).slice();
  }
  function moverEnOrdena(estado, userId, pos, dir) {
    if (estado.fase !== 'ordenando') throw new Error('Ya se entregó el orden');
    if (estado.entregados[userId]) throw new Error('Ya entregaste tu orden');
    var arreglo = arregloDeOrdena(estado, userId);
    var otro = pos + dir;
    if (pos < 0 || pos >= arreglo.length || otro < 0 || otro >= arreglo.length) throw new Error('Ahí no se puede mover');
    var t = arreglo[pos]; arreglo[pos] = arreglo[otro]; arreglo[otro] = t;
    var arreglos = Object.assign({}, estado.arreglos);
    arreglos[userId] = arreglo;
    return Object.assign({}, estado, { arreglos: arreglos });
  }
  function entregarOrdena(estado, userId) {
    if (estado.fase !== 'ordenando') throw new Error('Ya se entregó el orden');
    if (estado.entregados[userId]) throw new Error('Ya entregaste tu orden');
    var arreglo = arregloDeOrdena(estado, userId);
    var aciertos = 0;
    arreglo.forEach(function (evIdx, pos) { if (evIdx === pos) aciertos++; });
    var puntajes = Object.assign({}, estado.puntajes);
    puntajes[userId] = aciertos * 20; // 20 por evento en su sitio (máx 100)
    var entregados = Object.assign({}, estado.entregados);
    entregados[userId] = true;
    var todos = estado.jugadores.every(function (uid) { return !!entregados[uid]; });
    return Object.assign({}, estado, {
      puntajes: puntajes, entregados: entregados,
      fase: todos ? 'final' : 'ordenando', terminado: todos
    });
  }

  /* ----- Personaje Misterioso (pistas una a una: ¡menos pistas, más puntos!) ----- */
  var PERSONAJES_MISTERIO = [
    {
      nombre: 'Noé', variantes: ['noe'], pistas: [
        'Mi historia está al principio de la Biblia, en el libro de Génesis.',
        'Dios me confió cuidar a los animales de un gran peligro.',
        'Construí algo enorme de madera, con ayuda de mis tres hijos.',
        'Los animales entraron de dos en dos a mi gran construcción.',
        'Cuando apareció el arcoíris, supe que el peligro había pasado. 🌈'
      ]
    },
    {
      nombre: 'David', variantes: ['david'], pistas: [
        'Era el menor de ocho hermanos.',
        'Cuidaba ovejas y tocaba el arpa muy bonito.',
        'Un profeta me ungió con aceite cuando todavía era un muchacho.',
        'Dios me ayudó a vencer a un gigante con una honda y una piedra.',
        'Fui pastor de ovejas… ¡y después, rey de Israel! 👑'
      ]
    },
    {
      nombre: 'Jonás', variantes: ['jonas'], pistas: [
        'Soy un profeta que al principio no quiso obedecer a Dios.',
        'Hui en un barco, justo hacia el lado contrario.',
        'Una tormenta terrible casi hunde el barco donde yo iba.',
        'Pasé tres días en un lugar muy oscuro, húmedo y que olía a pescado.',
        'Un pez gigante me tragó… y después me dejó en la playa. 🐋'
      ]
    },
    {
      nombre: 'Moisés', variantes: ['moises'], pistas: [
        'De bebé, mi mamá me escondió en una canastita en el río.',
        'Crecí en el palacio del faraón de Egipto.',
        'Un día vi una zarza que ardía… ¡y no se quemaba!',
        'Dios me envió a sacar a su pueblo de la esclavitud de Egipto.',
        'Con la vara en alto, vi cómo se abría un camino en medio del mar. 🌊'
      ]
    },
    {
      nombre: 'Ester', variantes: ['ester', 'esther'], pistas: [
        'Soy una joven hebrea que llegó a vivir en un palacio.',
        'Mi primo Mardoqueo me crió con mucho amor.',
        'Ayuné y oré tres días antes de hacer algo muy valiente.',
        'Entré ante el rey sin que me llamara, arriesgando mi vida.',
        'El rey me extendió su cetro de oro y pude salvar a mi pueblo. 👸'
      ]
    },
    {
      nombre: 'José', variantes: ['jose'], pistas: [
        'Era el hijo favorito de mi papá, que se llamaba Jacob.',
        'Mis hermanos me tenían envidia, también por mi túnica de colores.',
        'Dios me daba sueños especiales desde jovencito.',
        'Terminé en Egipto, muy lejos de mi casa y de mi familia.',
        'Perdoné a mis hermanos y salvé a mi familia de una gran hambre. 🌾'
      ]
    },
    {
      nombre: 'Daniel', variantes: ['daniel'], pistas: [
        'De joven me llevaron a vivir a una ciudad lejana: Babilonia.',
        'No quise comer la comida del rey: pedí verduras y agua.',
        'Oraba a Dios tres veces al día, aunque el rey lo había prohibido.',
        'Por orar, me echaron a un foso oscuro durante una noche.',
        'Los leones no me tocaron: Dios envió a su ángel. 🦁'
      ]
    },
    {
      nombre: 'María', variantes: ['maria'], pistas: [
        'Vivía en un pueblito pequeño llamado Nazaret.',
        'Un ángel me visitó con un anuncio increíble.',
        'Dije: «Hágase en mí según tu palabra».',
        'Viajé a Belén con mi esposo José, montada en un burrito.',
        'Mi hijo nació en un pesebre, rodeado de animalitos. 🌟'
      ]
    }
  ];
  function crearMisterio(jugadores, rng) {
    var r = rng || Math.random;
    return {
      tipo: 'misterio', jugadores: (jugadores || []).slice(0, 3),
      personajeIdx: Math.floor(r() * PERSONAJES_MISTERIO.length),
      pistasMostradas: 1, resueltos: {}, intentosFallidos: {},
      puntajes: {}, fase: 'jugando', terminado: false
    };
  }
  function personajeMisterio(estado) { return PERSONAJES_MISTERIO[estado.personajeIdx]; }
  function revelarPistaMisterio(estado) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    var total = personajeMisterio(estado).pistas.length;
    if (estado.pistasMostradas >= total) throw new Error('Ya no hay más pistas');
    return Object.assign({}, estado, { pistasMostradas: estado.pistasMostradas + 1 });
  }
  function adivinarMisterio(estado, userId, texto) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.resueltos[userId]) throw new Error('¡Ya lo descubriste!');
    var pj = personajeMisterio(estado);
    var t = normalizarTexto(texto || '');
    var acierto = pj.variantes.indexOf(t) !== -1;
    if (!acierto) {
      var fallidos = Object.assign({}, estado.intentosFallidos);
      fallidos[userId] = (fallidos[userId] || 0) + 1;
      return Object.assign({}, estado, { intentosFallidos: fallidos });
    }
    // Menos pistas vistas = más puntos: con 1 pista, 100; con 5, 20.
    var puntajes = Object.assign({}, estado.puntajes);
    puntajes[userId] = (6 - estado.pistasMostradas) * 20;
    var resueltos = Object.assign({}, estado.resueltos);
    resueltos[userId] = estado.pistasMostradas;
    var todos = estado.jugadores.every(function (uid) { return !!resueltos[uid]; });
    return Object.assign({}, estado, {
      puntajes: puntajes, resueltos: resueltos,
      fase: todos ? 'final' : 'jugando', terminado: todos
    });
  }
  function cerrarMisterio(estado) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    return Object.assign({}, estado, { fase: 'final', terminado: true });
  }

  /* ================= v3.6: MUNDO ROBLOX + EL IMPOSTOR =================
     Pedidos del dueño: más juegos «tipo Roblox» (saltar por un obby,
     construir un tycoon, coleccionar mascotas y defender torres) y el
     clásico de fiesta El Impostor. Todo sigue el patrón de la casa:
     estado JSON compartido, funciones puras que devuelven un estado
     NUEVO y lanzan Error si la jugada no vale. Como unirse a una
     partida solo añade el id a estado.jugadores, los mapas por jugador
     se completan solos en la primera jugada (conMapa). */

  // Completa un mapa por jugador con su valor por defecto para quien
  // se unió después de creada la partida.
  function conMapa(estado, clave, defecto) {
    var mapa = Object.assign({}, estado[clave] || {});
    (estado.jugadores || []).forEach(function (uid) {
      if (mapa[uid] === undefined) mapa[uid] = (typeof defecto === 'function') ? defecto() : defecto;
    });
    return mapa;
  }

  /* ----- 🏃 Obby ¡Salta y Gana! (parkour de casillas con monedas) -----
     Un «obby» de mesa: se avanza con el dado por una pista de 30
     casillas con trampolines 🌀, lava 🌋 (vuelves a tu bandera 🚩) y
     monedas 🪙. El primero en llegar a la meta 🏁 gana; las monedas
     cuentan como puntaje. */
  var OBBY_META = 30;
  var OBBY_MONEDAS = { 3: 5, 8: 5, 13: 10, 19: 5, 24: 10, 27: 10 };
  var OBBY_TRAMPOLIN = { 6: 10, 17: 22 };
  var OBBY_LAVA = [11, 21];

  function crearObby(jugadores) {
    var posiciones = {}, banderas = {}, monedas = {}, puntajes = {};
    (jugadores || []).forEach(function (id) {
      posiciones[id] = 0; banderas[id] = 0; monedas[id] = 0; puntajes[id] = 0;
    });
    return {
      tipo: 'obby', jugadores: (jugadores || []).slice(0, 3),
      posiciones: posiciones, banderas: banderas, monedas: monedas, puntajes: puntajes,
      turno: 0, dado: null, evento: '¡A saltar! El primero en llegar a la meta 🏁 gana.',
      ganador: null, terminado: false
    };
  }

  function tirarObby(estado, jugadorIdx, rng) {
    exigirTurno(estado, jugadorIdx);
    var r = rng || Math.random;
    var uid = estado.jugadores[jugadorIdx];
    var posiciones = conMapa(estado, 'posiciones', 0);
    var banderas = conMapa(estado, 'banderas', 0);
    var monedas = conMapa(estado, 'monedas', 0);
    var dado = 1 + Math.floor(r() * 6);
    var destino = posiciones[uid] + dado;
    var evento = '🎲 Salió un ' + dado + '. ';
    var gano = destino >= OBBY_META;
    if (gano) {
      destino = OBBY_META;
      evento += '¡Llegaste a la META! 🏁🎉';
    } else if (OBBY_TRAMPOLIN[destino]) {
      destino = OBBY_TRAMPOLIN[destino];
      evento += '¡BOING! 🌀 El trampolín te lanzó a la casilla ' + destino + '. ';
    } else if (OBBY_LAVA.indexOf(destino) !== -1) {
      destino = banderas[uid];
      evento += '¡LAVA! 🌋 No pasa nada: vuelves a tu bandera 🚩 (casilla ' + destino + '). ';
    }
    if (!gano && OBBY_MONEDAS[destino]) {
      monedas[uid] += OBBY_MONEDAS[destino];
      evento += '¡Agarraste ' + OBBY_MONEDAS[destino] + ' monedas! 🪙';
    }
    posiciones[uid] = destino;
    var banderaNueva = Math.floor(destino / 10) * 10;
    if (banderaNueva > banderas[uid]) {
      banderas[uid] = banderaNueva;
      if (!gano) evento += ' Nueva bandera 🚩 en la ' + banderaNueva + '.';
    }
    return Object.assign({}, estado, {
      posiciones: posiciones, banderas: banderas, monedas: monedas,
      puntajes: Object.assign({}, monedas),
      dado: dado, evento: evento,
      turno: gano ? estado.turno : siguienteTurno(estado),
      ganador: gano ? uid : null, terminado: gano
    });
  }

  /* ----- 🏗️ Mi Tycoon (cobra, construye y haz crecer tu imperio) -----
     En tu turno primero COBRAS el ingreso de tus negocios (5 🪙 base +
     lo que den tus edificios) y después puedes construir UNO nuevo si
     te alcanzan las monedas (o ahorrar). Dura 8 rondas y gana el mayor
     patrimonio (monedas + lo que valen los edificios). */
  var EDIFICIOS_TYCOON = [
    { id: 'limonada', icono: '🍋', nombre: 'Puesto de limonada', costo: 10, ingreso: 3 },
    { id: 'helados', icono: '🍦', nombre: 'Carrito de helados', costo: 20, ingreso: 6 },
    { id: 'pizza', icono: '🍕', nombre: 'Pizzería', costo: 35, ingreso: 11 },
    { id: 'rueda', icono: '🎡', nombre: 'Rueda de la fortuna', costo: 60, ingreso: 19 },
    { id: 'cine', icono: '🎬', nombre: 'Cine familiar', costo: 90, ingreso: 28 },
    { id: 'cohete', icono: '🚀', nombre: 'Parque espacial', costo: 140, ingreso: 45 }
  ];
  function edificioTycoon(id) {
    for (var i = 0; i < EDIFICIOS_TYCOON.length; i++) if (EDIFICIOS_TYCOON[i].id === id) return EDIFICIOS_TYCOON[i];
    return null;
  }
  function ingresoTycoon(estado, uid) {
    var total = 5; // ingreso base de la familia emprendedora
    ((estado.edificios || {})[uid] || []).forEach(function (id) {
      var ed = edificioTycoon(id);
      if (ed) total += ed.ingreso;
    });
    return total;
  }
  function patrimonioTycoon(estado, uid) {
    var total = (estado.monedas || {})[uid] || 0;
    ((estado.edificios || {})[uid] || []).forEach(function (id) {
      var ed = edificioTycoon(id);
      if (ed) total += ed.costo;
    });
    return total;
  }

  function crearTycoon(jugadores) {
    var monedas = {}, edificios = {}, puntajes = {};
    (jugadores || []).forEach(function (id) {
      monedas[id] = 15; edificios[id] = []; puntajes[id] = 15;
    });
    return {
      tipo: 'tycoon', jugadores: (jugadores || []).slice(0, 3),
      turno: 0, ronda: 1, rondasTotales: 8,
      monedas: monedas, edificios: edificios, puntajes: puntajes,
      evento: '¡A construir! En tu turno cobras y puedes levantar un negocio. 🏗️',
      ganador: null, terminado: false
    };
  }

  function jugarTycoon(estado, jugadorIdx, compraId) {
    exigirTurno(estado, jugadorIdx);
    var uid = estado.jugadores[jugadorIdx];
    var monedas = conMapa(estado, 'monedas', 15);
    var edificios = conMapa(estado, 'edificios', function () { return []; });
    var ingreso = ingresoTycoon({ edificios: edificios }, uid);
    monedas[uid] += ingreso;
    var evento = '💰 Cobró ' + ingreso + ' monedas de sus negocios. ';
    if (compraId) {
      var ed = edificioTycoon(compraId);
      if (!ed) throw new Error('Ese negocio no existe 🙈');
      if (monedas[uid] < ed.costo) throw new Error('No te alcanzan las monedas para eso 🙈');
      monedas[uid] -= ed.costo;
      edificios[uid] = edificios[uid].concat([compraId]);
      evento += '¡Construyó ' + ed.icono + ' ' + ed.nombre + '! 🏗️🎉';
    } else {
      evento += 'Guardó sus monedas en la alcancía 🏦';
    }
    var turnoNuevo = siguienteTurno(estado);
    var rondaNueva = estado.ronda + (turnoNuevo === 0 ? 1 : 0);
    var puntajes = {};
    estado.jugadores.forEach(function (id) {
      puntajes[id] = patrimonioTycoon({ monedas: monedas, edificios: edificios }, id);
    });
    if (rondaNueva > estado.rondasTotales) {
      var fin = Object.assign({}, estado, {
        monedas: monedas, edificios: edificios, puntajes: puntajes,
        ronda: estado.rondasTotales, evento: evento + ' ¡Se acabaron las rondas!',
        terminado: true
      });
      fin.ganador = ganadorPorPuntajes(fin);
      return fin;
    }
    return Object.assign({}, estado, {
      monedas: monedas, edificios: edificios, puntajes: puntajes,
      turno: turnoNuevo, ronda: rondaNueva, evento: evento
    });
  }

  /* ----- 🐾 Mascotas Monederas (explora, junta monedas y mascotas) -----
     Cada exploración puede traer monedas, una mascota nueva (cada una
     ayuda a encontrar más monedas), una estrella ⭐… o que se te caigan
     unas monedas 🙈. Son 30 exploraciones entre todos y al final cada
     mascota vale 5 puntos extra. */
  var MASCOTAS = [
    { id: 'gato', icono: '🐱', nombre: 'Gatito', bonus: 1 },
    { id: 'perro', icono: '🐶', nombre: 'Perrito', bonus: 2 },
    { id: 'conejo', icono: '🐰', nombre: 'Conejito', bonus: 2 },
    { id: 'zorro', icono: '🦊', nombre: 'Zorrito', bonus: 3 },
    { id: 'panda', icono: '🐼', nombre: 'Panda', bonus: 4 },
    { id: 'unicornio', icono: '🦄', nombre: 'Unicornio', bonus: 6 },
    { id: 'dragon', icono: '🐲', nombre: 'Dragón bebé', bonus: 8 }
  ];
  function mascotaDe(id) {
    for (var i = 0; i < MASCOTAS.length; i++) if (MASCOTAS[i].id === id) return MASCOTAS[i];
    return null;
  }
  function bonusMascotas(listaIds) {
    var total = 0;
    (listaIds || []).forEach(function (id) {
      var m = mascotaDe(id);
      if (m) total += m.bonus;
    });
    return total;
  }

  function crearMascotas(jugadores) {
    var monedas = {}, mascotas = {}, puntajes = {};
    (jugadores || []).forEach(function (id) {
      monedas[id] = 0; mascotas[id] = []; puntajes[id] = 0;
    });
    return {
      tipo: 'mascotas', jugadores: (jugadores || []).slice(0, 3),
      turno: 0, jugadas: 0, jugadasTotales: 30,
      monedas: monedas, mascotas: mascotas, puntajes: puntajes,
      ultimoEvento: '¡A explorar! Busquen monedas y mascotas 🐾',
      ganador: null, terminado: false
    };
  }

  function explorarMascotas(estado, jugadorIdx, rng) {
    exigirTurno(estado, jugadorIdx);
    var r = rng || Math.random;
    var uid = estado.jugadores[jugadorIdx];
    var monedas = conMapa(estado, 'monedas', 0);
    var mascotas = conMapa(estado, 'mascotas', function () { return []; });
    var suerte = r();
    var evento;
    if (suerte < 0.42) {
      var ayuda = bonusMascotas(mascotas[uid]);
      var halladas = 6 + Math.floor(r() * 9) + ayuda;
      monedas[uid] += halladas;
      evento = '🪙 Encontró ' + halladas + ' monedas' + (ayuda ? ' (¡sus mascotas ayudaron a buscar! 🐾)' : '') + '.';
    } else if (suerte < 0.72) {
      var libres = MASCOTAS.filter(function (m) { return mascotas[uid].indexOf(m.id) === -1; });
      if (!libres.length) {
        monedas[uid] += 8;
        evento = '🎉 ¡Ya tiene TODAS las mascotas! Premio: 8 monedas 🪙';
      } else {
        var nueva = libres[Math.floor(r() * libres.length)];
        mascotas[uid] = mascotas[uid].concat([nueva.id]);
        evento = '🎉 ¡Nueva mascota! ' + nueva.icono + ' ' + nueva.nombre + ' se unió a la aventura.';
      }
    } else if (suerte < 0.88) {
      monedas[uid] += 20;
      evento = '⭐ ¡Una estrella fugaz! +20 monedas 🪙✨';
    } else {
      var caidas = Math.min(5, monedas[uid]);
      monedas[uid] -= caidas;
      evento = caidas ? '🙈 ¡Uy! Se le cayeron ' + caidas + ' monedas por el camino.' : '🙈 Tropezó… ¡pero no llevaba monedas! Sin daño.';
    }
    var jugadas = estado.jugadas + 1;
    var fin = jugadas >= estado.jugadasTotales;
    var puntajes = {};
    estado.jugadores.forEach(function (id) {
      puntajes[id] = monedas[id] + (fin ? (mascotas[id] || []).length * 5 : 0);
    });
    var nuevo = Object.assign({}, estado, {
      monedas: monedas, mascotas: mascotas, puntajes: puntajes,
      jugadas: jugadas, ultimoEvento: evento,
      turno: fin ? estado.turno : siguienteTurno(estado),
      terminado: fin
    });
    if (fin) nuevo.ganador = ganadorPorPuntajes(nuevo);
    return nuevo;
  }

  /* ----- 🎈 Defiende la Torre (cooperativo: que no escapen los globos) --
     Entre todos defienden el camino: por turnos colocan torres con sus
     monedas y, cuando quieran, lanzan la oleada. La oleada se resuelve
     entera y sin azar: cada globo avanza paso a paso y las torres le
     pegan a su alcance; reventar globos da puntos y monedas a la torre
     dueña. Si escapan 10 globos, pierden todos; si aguantan las 6
     oleadas, ¡gana la familia! */
  var TORRES = [
    { id: 'dardos', icono: '🎯', nombre: 'Torre de dardos', costo: 10, danio: 1, alcance: 3 },
    { id: 'canon', icono: '💣', nombre: 'Cañón', costo: 25, danio: 3, alcance: 2 },
    { id: 'laser', icono: '🔆', nombre: 'Torre láser', costo: 40, danio: 2, alcance: 5 }
  ];
  var TORRE_PISTA = 10; // casillas 0..9; el globo que llega a la 10 escapa
  function torreDe(id) {
    for (var i = 0; i < TORRES.length; i++) if (TORRES[i].id === id) return TORRES[i];
    return null;
  }
  function globosDeOleada(ronda) {
    return { cantidad: 3 + ronda * 2, vida: 1 + Math.floor((ronda - 1) / 2) };
  }

  function crearTorre(jugadores) {
    var monedas = {}, puntajes = {};
    (jugadores || []).forEach(function (id) { monedas[id] = 20; puntajes[id] = 0; });
    return {
      tipo: 'torre', jugadores: (jugadores || []).slice(0, 3),
      turno: 0, fase: 'colocar', ronda: 1, rondasTotales: 6, vidas: 10,
      monedas: monedas, torres: {}, puntajes: puntajes,
      ultimoResumen: 'Coloquen sus torres 🎯 y lancen la primera oleada cuando estén listos.',
      ganado: false, ganador: null, terminado: false
    };
  }

  function colocarTorre(estado, jugadorIdx, torreId, posicion) {
    exigirTurno(estado, jugadorIdx);
    if (estado.fase !== 'colocar') throw new Error('Ahora no se pueden colocar torres');
    var def = torreDe(torreId);
    if (!def) throw new Error('Esa torre no existe 🙈');
    if (typeof posicion !== 'number' || posicion < 0 || posicion >= TORRE_PISTA || Math.floor(posicion) !== posicion) {
      throw new Error('Esa casilla no existe');
    }
    if (estado.torres[posicion]) throw new Error('Ya hay una torre en esa casilla');
    var uid = estado.jugadores[jugadorIdx];
    var monedas = conMapa(estado, 'monedas', 20);
    if (monedas[uid] < def.costo) throw new Error('No te alcanzan las monedas para esa torre 🙈');
    monedas[uid] -= def.costo;
    var torres = Object.assign({}, estado.torres);
    torres[posicion] = { tipo: torreId, dueno: uid };
    return Object.assign({}, estado, {
      monedas: monedas, torres: torres,
      ultimoResumen: def.icono + ' ¡Torre «' + def.nombre + '» colocada en la casilla ' + (posicion + 1) + '!',
      turno: siguienteTurno(estado)
    });
  }

  function pasarTorre(estado, jugadorIdx) {
    exigirTurno(estado, jugadorIdx);
    if (estado.fase !== 'colocar') throw new Error('Ahora no se puede pasar');
    return Object.assign({}, estado, {
      ultimoResumen: 'Pasó su turno de colocar. ⏭️',
      turno: siguienteTurno(estado)
    });
  }

  function lanzarOleada(estado, jugadorIdx) {
    exigirTurno(estado, jugadorIdx);
    if (estado.fase !== 'colocar') throw new Error('La oleada ya está en marcha');
    var spec = globosDeOleada(estado.ronda);
    var globos = [];
    for (var i = 0; i < spec.cantidad; i++) globos.push({ pos: -1 - i, vida: spec.vida, fuera: false });
    var monedas = conMapa(estado, 'monedas', 20);
    var puntajes = conMapa(estado, 'puntajes', 0);
    var torres = estado.torres || {};
    var posicionesTorres = Object.keys(torres).map(Number).sort(function (a, b) { return a - b; });
    var escapados = 0, reventados = 0, pasos = 0;
    function quedanGlobos() {
      return globos.some(function (g) { return !g.fuera; });
    }
    while (quedanGlobos() && pasos < 400) {
      pasos++;
      // 1) Los globos avanzan un paso; el que sale del camino escapa.
      globos.forEach(function (g) {
        if (g.fuera) return;
        g.pos++;
        if (g.pos >= TORRE_PISTA) { g.fuera = true; g.escapado = true; escapados++; }
      });
      // 2) Cada torre pega UNA vez al globo más adelantado a su alcance.
      posicionesTorres.forEach(function (posT) {
        var t = torres[posT];
        var def = torreDe(t.tipo);
        if (!def) return;
        var blanco = null;
        globos.forEach(function (g) {
          if (g.fuera || g.pos < 0) return;
          if (Math.abs(g.pos - posT) > def.alcance) return;
          if (!blanco || g.pos > blanco.pos) blanco = g;
        });
        if (!blanco) return;
        blanco.vida -= def.danio;
        if (blanco.vida <= 0) {
          blanco.fuera = true;
          reventados++;
          puntajes[t.dueno] = (puntajes[t.dueno] || 0) + 1;
          monedas[t.dueno] = (monedas[t.dueno] || 0) + 2;
        }
      });
    }
    estado.jugadores.forEach(function (id) { monedas[id] = (monedas[id] || 0) + 8; }); // premio por oleada
    var vidas = Math.max(0, estado.vidas - escapados);
    var resumen = 'Oleada ' + estado.ronda + ': reventaron ' + reventados + ' globos 🎈' +
      (escapados ? ' y escaparon ' + escapados + ' 😱' : ' ¡y no escapó NI UNO! 🎉') +
      ' Cada quien ganó 8 monedas por la oleada.';
    if (vidas <= 0) {
      return Object.assign({}, estado, {
        monedas: monedas, puntajes: puntajes, vidas: 0,
        ultimoResumen: resumen + ' ¡Los globos ganaron esta vez! A intentarlo otra vez 💪',
        ganado: false, terminado: true
      });
    }
    if (estado.ronda >= estado.rondasTotales) {
      return Object.assign({}, estado, {
        monedas: monedas, puntajes: puntajes, vidas: vidas,
        ultimoResumen: resumen + ' ¡¡LA FAMILIA DEFENDIÓ LA TORRE HASTA EL FINAL!! 🏆🎉',
        ganado: true, terminado: true
      });
    }
    return Object.assign({}, estado, {
      monedas: monedas, puntajes: puntajes, vidas: vidas,
      ronda: estado.ronda + 1, turno: 0,
      ultimoResumen: resumen + ' Coloquen más torres y lancen la oleada ' + (estado.ronda + 1) + '.'
    });
  }

  /* ----- 🕵️ El Impostor (el clásico de fiesta, en línea) -----
     Cada ronda hay una palabra secreta de una categoría: TODOS la ven
     en su aparato menos UNO, el impostor, que solo ve la categoría.
     Por turnos cada quien escribe UNA palabra de pista (el impostor
     improvisa sin saber la palabra) y al final todos votan quién es.
     Si lo descubren, los que votaron bien ganan 10 pts; si no, el
     impostor se lleva 15 pts.
     ⚠️ SECRETO (honesto, como en Batalla Naval y Dibujo y Adivina):
     el modelo de partidas de la app es estado compartido, así que la
     palabra y quién es el impostor VIAJAN en el estado; la pantalla
     solo pinta el rol de cada quien en SU aparato tras tocar
     «ver mi rol» y lo vuelve a ocultar. Es sistema de honor familiar:
     nadie espía el aparato del otro. rolDeImpostor es la única puerta
     que la pantalla debe usar para pintar roles. */
  var BANCO_IMPOSTOR = {
    'Comida': ['PIZZA', 'HELADO', 'PASTEL', 'TACO', 'HAMBURGUESA', 'MANZANA', 'PLATANO', 'QUESO',
      'CHOCOLATE', 'GALLETA', 'SOPA', 'ARROZ', 'POLLO', 'PESCADO', 'UVAS', 'SANDIA'],
    'Animales': ['PERRO', 'GATO', 'ELEFANTE', 'LEON', 'JIRAFA', 'PINGUINO', 'MONO', 'TORTUGA',
      'MARIPOSA', 'CABALLO', 'OSO', 'DELFIN', 'ZORRO', 'CONEJO', 'VACA', 'TIBURON'],
    'Lugares': ['PLAYA', 'ESCUELA', 'PARQUE', 'BIBLIOTECA', 'ZOOLOGICO', 'MUSEO', 'CINE', 'GRANJA',
      'SELVA', 'ISLA', 'CASTILLO', 'HOSPITAL', 'MERCADO', 'AEROPUERTO', 'ESTADIO', 'PISCINA'],
    'Objetos': ['RELOJ', 'LLAVE', 'ESPEJO', 'PELOTA', 'LIBRO', 'GUITARRA', 'TELEFONO', 'SOMBRERO',
      'ZAPATO', 'MOCHILA', 'TIJERA', 'VELA', 'GLOBO', 'TROMPETA', 'BICICLETA', 'COMETA'],
    'Naturaleza': ['SOL', 'LUNA', 'ESTRELLA', 'ARCOIRIS', 'VOLCAN', 'RIO', 'NIEVE', 'FLOR',
      'ARBOL', 'NUBE', 'MAR', 'MONTANA', 'RAYO', 'OLA', 'BOSQUE', 'CASCADA']
  };

  function estadoRondaImpostor(jugadores, puntajes, ronda, rng) {
    var r = rng || Math.random;
    var categorias = Object.keys(BANCO_IMPOSTOR);
    var categoria = categorias[Math.floor(r() * categorias.length)];
    var palabras = BANCO_IMPOSTOR[categoria];
    return {
      tipo: 'impostor', jugadores: (jugadores || []).slice(0, 3),
      ronda: ronda, fase: 'roles', // roles | pistas | votacion | final
      categoria: categoria,
      palabra: palabras[Math.floor(r() * palabras.length)],
      impostor: jugadores[Math.floor(r() * jugadores.length)],
      listos: [], turnoPista: 0, pistas: {}, votos: {},
      puntajes: puntajes || {},
      descubierto: null, masVotado: null,
      ganador: null, terminado: false
    };
  }

  function crearImpostor(jugadores, rng) {
    var puntajes = {};
    (jugadores || []).forEach(function (id) { puntajes[id] = 0; });
    return estadoRondaImpostor(jugadores || [], puntajes, 1, rng);
  }

  // La ÚNICA puerta para pintar roles: lo que cada jugador puede ver
  // en SU aparato. El impostor nunca recibe la palabra por aquí.
  function rolDeImpostor(estado, userId) {
    if (!estado || (estado.jugadores || []).indexOf(userId) === -1) return null;
    var esImpostor = estado.impostor === userId;
    return {
      esImpostor: esImpostor,
      palabra: esImpostor ? null : estado.palabra,
      categoria: estado.categoria
    };
  }

  function marcarRolImpostor(estado, userId) {
    if (estado.terminado || estado.fase !== 'roles') throw new Error('Los roles ya se repartieron');
    if ((estado.jugadores || []).indexOf(userId) === -1) throw new Error('No estás en esta partida');
    if (estado.listos.indexOf(userId) !== -1) return Object.assign({}, estado); // ya lo vio: sin cambios
    var listos = estado.listos.concat([userId]);
    var todos = estado.jugadores.every(function (uid) { return listos.indexOf(uid) !== -1; });
    return Object.assign({}, estado, {
      listos: listos,
      fase: todos ? 'pistas' : 'roles'
    });
  }

  function darPistaImpostor(estado, userId, texto) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.fase !== 'pistas') throw new Error('Todavía no es la hora de las pistas');
    if (estado.jugadores[estado.turnoPista] !== userId) throw new Error('Todavía no es tu turno de pista');
    var t = normalizarTexto(texto || '');
    if (!t) throw new Error('Escribe una pista');
    if (t.indexOf(' ') !== -1) throw new Error('La pista es UNA sola palabra 🙊');
    if (t.length > 16) throw new Error('Pista muy larga: una palabrita, porfa');
    if (t === normalizarTexto(estado.palabra)) throw new Error('¡Esa es la palabra secreta! Di una pista, no la palabra 🙊');
    var pistas = Object.assign({}, estado.pistas);
    pistas[userId] = String(texto || '').trim();
    var turnoPista = estado.turnoPista + 1;
    var todos = estado.jugadores.every(function (uid) { return pistas[uid] !== undefined; });
    return Object.assign({}, estado, {
      pistas: pistas, turnoPista: turnoPista,
      fase: todos ? 'votacion' : 'pistas'
    });
  }

  function votarImpostor(estado, userId, sospechosoId) {
    if (estado.terminado) throw new Error('La partida ya terminó');
    if (estado.fase !== 'votacion') throw new Error('Todavía no es la hora de votar');
    if ((estado.jugadores || []).indexOf(userId) === -1) throw new Error('No estás en esta partida');
    if ((estado.jugadores || []).indexOf(sospechosoId) === -1) throw new Error('Ese jugador no está en la partida');
    if (sospechosoId === userId) throw new Error('No puedes votarte a ti mismo 😅');
    if (estado.votos[userId]) throw new Error('Ya votaste 🗳️');
    var votos = Object.assign({}, estado.votos);
    votos[userId] = sospechosoId;
    var todos = estado.jugadores.every(function (uid) { return !!votos[uid]; });
    if (!todos) return Object.assign({}, estado, { votos: votos });
    // Resolución: gana la votación quien tenga más votos; si hay
    // empate arriba, nadie queda señalado y el impostor se escapa.
    var conteo = {};
    Object.keys(votos).forEach(function (uid) { conteo[votos[uid]] = (conteo[votos[uid]] || 0) + 1; });
    var max = 0, senalados = [];
    Object.keys(conteo).forEach(function (uid) {
      if (conteo[uid] > max) { max = conteo[uid]; senalados = [uid]; }
      else if (conteo[uid] === max) senalados.push(uid);
    });
    var masVotado = senalados.length === 1 ? senalados[0] : null;
    var descubierto = masVotado !== null && masVotado === estado.impostor;
    var puntajes = Object.assign({}, estado.puntajes);
    if (descubierto) {
      estado.jugadores.forEach(function (uid) {
        if (uid !== estado.impostor && votos[uid] === estado.impostor) puntajes[uid] = (puntajes[uid] || 0) + 10;
      });
    } else {
      puntajes[estado.impostor] = (puntajes[estado.impostor] || 0) + 15;
    }
    return Object.assign({}, estado, {
      votos: votos, fase: 'final', terminado: true,
      masVotado: masVotado, descubierto: descubierto,
      puntajes: puntajes,
      ganador: descubierto ? null : estado.impostor
    });
  }

  function siguienteRondaImpostor(estado, rng) {
    if (estado.fase !== 'final') throw new Error('La ronda todavía no termina');
    return estadoRondaImpostor(estado.jugadores, Object.assign({}, estado.puntajes), estado.ronda + 1, rng);
  }

  var API = {
    normalizarTexto: normalizarTexto,
    FICHAS_CONECTA: FICHAS_CONECTA, crearConecta: crearConecta, jugadaConecta: jugadaConecta, lineaConecta: lineaConecta,
    SERPIENTES: SERPIENTES, ESCALERAS: ESCALERAS, crearSerpientes: crearSerpientes, tirarSerpientes: tirarSerpientes,
    PALABRAS_AHORCADO: PALABRAS_AHORCADO, crearAhorcado: crearAhorcado, letraAhorcado: letraAhorcado, palabraVisibleAhorcado: palabraVisibleAhorcado,
    PALABRAS_DIBUJO: PALABRAS_DIBUJO, crearDibujo: crearDibujo, elegirPalabraDibujo: elegirPalabraDibujo,
    intentoDibujo: intentoDibujo, cerrarRondaDibujo: cerrarRondaDibujo, dibujanteDe: dibujanteDe,
    PARCHIS_SEGUROS: PARCHIS_SEGUROS, crearParchis: crearParchis, tirarParchis: tirarParchis,
    moverParchis: moverParchis, movimientosParchis: movimientosParchis, destinoParchis: destinoParchis,
    crearDomino: crearDomino, iniciarDomino: iniciarDomino, jugarDomino: jugarDomino,
    robarDomino: robarDomino, pasarDomino: pasarDomino, extremosDomino: extremosDomino, puedeJugarDomino: puedeJugarDomino,
    crearNaval: crearNaval, iniciarNaval: iniciarNaval, recolocarNaval: recolocarNaval,
    dispararNaval: dispararNaval, colocarBarcosNaval: colocarBarcosNaval, celdasBarco: celdasBarco,
    PALABRAS_SOPA: PALABRAS_SOPA, crearSopa: crearSopa, marcarSopa: marcarSopa, caminoSopa: caminoSopa,
    CATEGORIAS_BASTA: CATEGORIAS_BASTA, crearBasta: crearBasta, enviarRespuestasBasta: enviarRespuestasBasta,
    cerrarBasta: cerrarBasta, marcarBasta: marcarBasta, puntuarBasta: puntuarBasta, siguienteBasta: siguienteBasta,
    COLORES_SIMON: COLORES_SIMON, NOTAS_SIMON: NOTAS_SIMON, crearSimon: crearSimon, presionarSimon: presionarSimon,
    crearCalculo: crearCalculo, generarOperacion: generarOperacion, responderCalculo: responderCalculo, siguienteCalculo: siguienteCalculo,
    OPCIONES_PPT: OPCIONES_PPT, crearPPT: crearPPT, elegirPPT: elegirPPT, siguientePPT: siguientePPT,
    crearAdivina: crearAdivina, adivinarNumero: adivinarNumero, siguienteAdivina: siguienteAdivina,
    VERSICULOS_DIA: VERSICULOS_DIA, versiculoDelDia: versiculoDelDia,
    HISTORIAS_BIBLICAS: HISTORIAS_BIBLICAS,
    BANCO_TRIVIA_BIBLICA: BANCO_TRIVIA_BIBLICA,
    BANCO_COMPLETA: BANCO_COMPLETA, TIEMPO_VERSICULO_SEG: TIEMPO_VERSICULO_SEG,
    crearVersiculo: crearVersiculo, versiculoActual: versiculoActual, iniciarVersiculo: iniciarVersiculo,
    responderVersiculo: responderVersiculo, revelarVersiculo: revelarVersiculo, siguienteVersiculo: siguienteVersiculo,
    PAREJAS_BIBLICAS: PAREJAS_BIBLICAS, MAZOS_MEMORIA: MAZOS_MEMORIA, EMOJIS_OBJETOS: EMOJIS_OBJETOS,
    crearQueFalta: crearQueFalta, ocultarQueFalta: ocultarQueFalta, responderQueFalta: responderQueFalta, siguienteQueFalta: siguienteQueFalta,
    crearOrden: crearOrden, voltearOrden: voltearOrden, enviarOrden: enviarOrden, siguienteOrden: siguienteOrden, largoFilaOrden: largoFilaOrden,
    crearNumeros: crearNumeros, ocultarNumeros: ocultarNumeros, responderNumeros: responderNumeros, siguienteNumeros: siguienteNumeros,
    crearDamas: crearDamas, movimientosDamas: movimientosDamas, moverDamas: moverDamas, tieneMovimientosDamas: tieneMovimientosDamas,
    FIGURAS_LOTERIA: FIGURAS_LOTERIA, crearLoteria: crearLoteria, cantarLoteria: cantarLoteria, cartonDeLoteria: cartonDeLoteria,
    crearGuerra: crearGuerra, revelarGuerra: revelarGuerra, siguienteGuerra: siguienteGuerra, cartaDeGuerra: cartaDeGuerra, nombreCartaGuerra: nombreCartaGuerra, PALOS_GUERRA: PALOS_GUERRA,
    crearTesoro: crearTesoro, buscarTesoro: buscarTesoro, pistaTesoro: pistaTesoro, distanciaTesoro: distanciaTesoro,
    TARJETAS_VERDAD: TARJETAS_VERDAD, TARJETAS_RETO: TARJETAS_RETO, crearVerdad: crearVerdad, elegirTarjetaVerdad: elegirTarjetaVerdad, completarVerdad: completarVerdad,
    crearCarrera: crearCarrera, tirarCarrera: tirarCarrera, plantarseCarrera: plantarseCarrera,
    PALABRAS_ENCADENA: PALABRAS_ENCADENA, crearEncadenada: crearEncadenada, enviarEncadenada: enviarEncadenada, pasarEncadenada: pasarEncadenada, ultimaLetraEncadena: ultimaLetraEncadena,
    EMOJIS_PUZZLE: EMOJIS_PUZZLE, crearPuzzle: crearPuzzle, moverPuzzle: moverPuzzle, puzzleResuelto: puzzleResuelto,
    BANCO_QUIEN: BANCO_QUIEN, BANCO_VF: BANCO_VF, BANCO_ENCUENTRA: BANCO_ENCUENTRA, TIEMPO_QUIZ_SEG: TIEMPO_QUIZ_SEG,
    crearQuizBiblico: crearQuizBiblico, preguntaQuiz: preguntaQuiz, iniciarQuiz: iniciarQuiz, responderQuiz: responderQuiz, revelarQuiz: revelarQuiz, siguienteQuiz: siguienteQuiz,
    EVENTOS_ORDENA: EVENTOS_ORDENA, crearOrdena: crearOrdena, arregloDeOrdena: arregloDeOrdena, moverEnOrdena: moverEnOrdena, entregarOrdena: entregarOrdena,
    PERSONAJES_MISTERIO: PERSONAJES_MISTERIO, crearMisterio: crearMisterio, personajeMisterio: personajeMisterio, revelarPistaMisterio: revelarPistaMisterio, adivinarMisterio: adivinarMisterio, cerrarMisterio: cerrarMisterio,
    OBBY_META: OBBY_META, OBBY_MONEDAS: OBBY_MONEDAS, OBBY_TRAMPOLIN: OBBY_TRAMPOLIN, OBBY_LAVA: OBBY_LAVA, crearObby: crearObby, tirarObby: tirarObby,
    EDIFICIOS_TYCOON: EDIFICIOS_TYCOON, crearTycoon: crearTycoon, jugarTycoon: jugarTycoon, ingresoTycoon: ingresoTycoon, patrimonioTycoon: patrimonioTycoon,
    MASCOTAS: MASCOTAS, crearMascotas: crearMascotas, explorarMascotas: explorarMascotas, bonusMascotas: bonusMascotas, mascotaDe: mascotaDe,
    TORRES: TORRES, TORRE_PISTA: TORRE_PISTA, crearTorre: crearTorre, colocarTorre: colocarTorre, pasarTorre: pasarTorre, lanzarOleada: lanzarOleada, globosDeOleada: globosDeOleada,
    BANCO_IMPOSTOR: BANCO_IMPOSTOR, crearImpostor: crearImpostor, rolDeImpostor: rolDeImpostor, marcarRolImpostor: marcarRolImpostor, darPistaImpostor: darPistaImpostor, votarImpostor: votarImpostor, siguienteRondaImpostor: siguienteRondaImpostor,
    rngDeSemilla: rngDeSemilla,
    puntosDePartidaExtra: puntosDePartidaExtra, ganadorPorPuntajes: ganadorPorPuntajes
  };

  global.FamilyGames = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

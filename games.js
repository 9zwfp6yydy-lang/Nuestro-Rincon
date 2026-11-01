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
    { texto: 'He aquí, yo estoy con ustedes todos los días, hasta el fin del mundo.', cita: 'Mateo 28:20' }
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
      titulo: 'La Creación', emoji: '🌍',
      parrafos: [
        'Al principio no había nada: ni luz, ni plantas, ni animales. Solo estaba Dios. Y Dios dijo: «¡Que haya luz!». Y la luz apareció, brillante y hermosa.',
        'Después Dios hizo el cielo y separó las aguas. Aparecieron los mares y la tierra seca, y sobre la tierra brotaron hierbas, flores y árboles llenos de frutas.',
        'Dios puso el sol para el día y la luna con las estrellas para la noche. Llenó el mar de peces, el cielo de pájaros y la tierra de animales de todos los tamaños.',
        'Por último, Dios hizo a las personas, a su imagen, y las llenó de bendiciones. Miró todo lo que había hecho y vio que era muy bueno. Al séptimo día descansó.'
      ],
      pregunta: 'De todo lo que Dios creó, ¿qué es lo que más te gusta? ¿Por qué?'
    },
    {
      titulo: 'Noé y el arca', emoji: '⛵',
      parrafos: [
        'Noé era un hombre bueno que escuchaba a Dios. Un día Dios le dijo que vendría una lluvia muy grande, y le encargó construir un barco enorme: un arca.',
        'Noé se puso a trabajar con martillo y madera, aunque todos se reían. Cuando el arca estuvo lista, entraron Noé, su familia y dos de cada animal: dos elefantes, dos leones, dos corderitos… ¡de todos!',
        'Llovió durante cuarenta días y cuarenta noches, pero dentro del arca todos estaban seguros y sequitos, cuidados por Dios.',
        'Cuando la tierra se secó, Noé abrió la puerta y los animales salieron corriendo felices. Dios puso un arcoíris en el cielo como señal de su promesa de amor.'
      ],
      pregunta: 'Si pudieras llevar dos animales en el arca, ¿cuáles elegirías?'
    },
    {
      titulo: 'David y Goliat', emoji: '🪨',
      parrafos: [
        'David era un pastor joven que cuidaba las ovejas de su familia. Tocaba el arpa y confiaba mucho en Dios.',
        'Un día apareció un gigante llamado Goliat, que se burlaba del pueblo de Israel. Todos tenían miedo, porque Goliat era altísimo y muy fuerte.',
        'Pero David no tuvo miedo. «Dios me cuidó de los leones y los osos —dijo—, y también me cuidará hoy». Tomó su honda y cinco piedritas lisas del arroyo.',
        'Con una sola piedra y mucho valor, David venció al gigante. Así aprendió todo el pueblo que no gana el más grande, sino el que confía en Dios.'
      ],
      pregunta: '¿Hay algo que te da miedo? ¿Cómo te ayuda saber que Dios está contigo?'
    },
    {
      titulo: 'Daniel y los leones', emoji: '🦁',
      parrafos: [
        'Daniel era un hombre sabio y bueno que trabajaba para el rey. Cada día oraba a Dios junto a su ventana, sin esconderse.',
        'Unos hombres envidiosos engañaron al rey para que firmara una orden injusta: nadie podía orar a Dios. Pero Daniel siguió orando, como siempre.',
        'El rey tuvo que echar a Daniel al foso de los leones. Pasó la noche muy preocupado, sin poder dormir… ¡pero Dios envió a su ángel y cerró la boca de los leones!',
        'Al amanecer, el rey corrió al foso y encontró a Daniel sano y salvo. Entonces el rey declaró que el Dios de Daniel es el Dios verdadero.'
      ],
      pregunta: 'Daniel oraba todos los días. ¿De qué te gusta hablar con Dios cuando oras?'
    },
    {
      titulo: 'Jonás y el gran pez', emoji: '🐋',
      parrafos: [
        'Dios le pidió a Jonás que fuera a la ciudad de Nínive a dar un mensaje. Pero Jonás no quiso ir, y se subió a un barco que iba para el otro lado.',
        'En el mar se levantó una tormenta terrible. Jonás sabía que la tormenta era por su culpa, y pidió a los marineros que lo echaran al agua. En cuanto lo hicieron, el mar se calmó.',
        'Entonces llegó un pez enorme que se tragó a Jonás. Dentro del pez, Jonás oró y pidió perdón. Al tercer día, el pez lo dejó sano y salvo en la playa.',
        'Esta vez Jonás obedeció y fue a Nínive. La gente escuchó el mensaje, pidió perdón a Dios, y Dios la perdonó con alegría.'
      ],
      pregunta: '¿Qué hizo Jonás cuando se equivocó? ¿Qué podemos hacer nosotros cuando nos equivocamos?'
    },
    {
      titulo: 'El nacimiento de Jesús', emoji: '🌟',
      parrafos: [
        'Hace mucho tiempo, en un pueblito llamado Belén, María y José buscaban un lugar donde pasar la noche. Todas las posadas estaban llenas.',
        'Al fin encontraron un establo, y allí, entre pajas y animalitos, nació el bebé Jesús. María lo envolvió en pañales y lo acostó en un pesebre.',
        'Esa noche, unos ángeles avisaron a los pastores: «¡Ha nacido el Salvador!». Los pastores corrieron a Belén y encontraron al bebé, tal como les habían dicho.',
        'También una estrella brillante guió a unos sabios desde muy lejos, que llegaron con regalos para el rey que había nacido. ¡Qué noche tan especial!'
      ],
      pregunta: '¿Qué regalo le habrías llevado tú al bebé Jesús?'
    },
    {
      titulo: 'La oveja perdida', emoji: '🐑',
      parrafos: [
        'Jesús contó la historia de un pastor que tenía cien ovejas. Las cuidaba a todas con mucho cariño y conocía a cada una.',
        'Un día contó sus ovejas y se dio cuenta de que faltaba una. ¡Una ovejita se había perdido! El pastor dejó a las noventa y nueve seguras y salió a buscarla por montes y caminos.',
        'Buscó y buscó, llamándola por su nombre, hasta que por fin la escuchó balar a lo lejos. La encontró, la abrazó y la cargó sobre sus hombros, contentísimo.',
        'Jesús explicó que así se alegra Dios en el cielo cuando una persona que estaba perdida vuelve a él. Nadie es tan pequeño que Dios no salga a buscarlo.'
      ],
      pregunta: '¿Alguna vez se te perdió algo muy querido? ¿Cómo te sentiste cuando lo encontraste?'
    },
    {
      titulo: 'Jesús alimenta a la multitud', emoji: '🍞',
      parrafos: [
        'Un día, una multitud enorme siguió a Jesús hasta un monte para escuchar sus enseñanzas. Eran más de cinco mil personas, y se hizo tarde.',
        'Los discípulos dijeron: «No tenemos comida para tanta gente». Pero un niño se acercó con su merienda: cinco panes y dos pececitos, y se la ofreció a Jesús.',
        'Jesús dio gracias a Dios, partió los panes y los peces, y los discípulos empezaron a repartir. ¡Y alcanzaba para todos! La gente comía y comía, y la comida no se acababa.',
        'Al final, todos quedaron satisfechos y aún sobraron doce canastas llenas. El niño aprendió que lo poco que ofrecemos con amor, Dios lo puede multiplicar.'
      ],
      pregunta: 'El niño compartió su merienda. ¿Qué cosa tuya podrías compartir con alguien que lo necesite?'
    }
  ];

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
      case 'conecta': case 'parchis': case 'naval': case 'ppt':
        if (estado.terminado) dar(estado.ganador, 50);
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
    }
    return suma;
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
    puntosDePartidaExtra: puntosDePartidaExtra, ganadorPorPuntajes: ganadorPorPuntajes
  };

  global.FamilyGames = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

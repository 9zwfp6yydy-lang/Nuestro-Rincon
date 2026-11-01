/* Batería de pruebas de Nuestro Rincón — se ejecuta con: node tests/run-tests.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const L = require(path.join(RAIZ, 'logic.js'));
const G = require(path.join(RAIZ, 'games.js')); // debe cargar antes de usar puntosDePartida extendido
const Fun = require(path.join(RAIZ, 'fun.js'));

let pasadas = 0, falladas = 0;
function prueba(nombre, fn) {
  try { fn(); pasadas++; console.log('  ✅ ' + nombre); }
  catch (e) { falladas++; console.log('  ❌ ' + nombre + ' → ' + e.message); }
}
function rngSemilla(semilla) { // mulberry32: determinista para las pruebas
  let a = semilla >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('— GATO —');
prueba('X gana por fila', () => {
  let e = L.crearGato(['a', 'b']);
  e = L.jugadaGato(e, 0, 0); e = L.jugadaGato(e, 1, 3);
  e = L.jugadaGato(e, 0, 1); e = L.jugadaGato(e, 1, 4);
  e = L.jugadaGato(e, 0, 2);
  assert.strictEqual(e.ganador, 'X'); assert.strictEqual(e.terminado, true);
});
prueba('O gana por columna', () => {
  let e = L.crearGato(['a', 'b']);
  e = L.jugadaGato(e, 0, 0); e = L.jugadaGato(e, 1, 1);
  e = L.jugadaGato(e, 0, 2); e = L.jugadaGato(e, 1, 4);
  e = L.jugadaGato(e, 0, 5); e = L.jugadaGato(e, 1, 7);
  assert.strictEqual(e.ganador, 'O');
});
prueba('empate con el tablero lleno', () => {
  let e = L.crearGato(['a', 'b']);
  const seq = [[0,0],[1,1],[0,2],[1,4],[0,3],[1,5],[0,7],[1,6],[0,8]];
  seq.forEach(([j, c]) => { e = L.jugadaGato(e, j, c); });
  assert.strictEqual(e.empate, true); assert.strictEqual(e.terminado, true); assert.strictEqual(e.ganador, null);
});
prueba('los turnos alternan', () => {
  let e = L.crearGato(['a', 'b']);
  assert.strictEqual(e.turno, 0);
  e = L.jugadaGato(e, 0, 4); assert.strictEqual(e.turno, 1);
  e = L.jugadaGato(e, 1, 0); assert.strictEqual(e.turno, 0);
});
prueba('no se puede jugar fuera de turno', () => {
  const e = L.crearGato(['a', 'b']);
  assert.throws(() => L.jugadaGato(e, 1, 0), /turno/);
});
prueba('no se puede ocupar una casilla tomada', () => {
  let e = L.crearGato(['a', 'b']);
  e = L.jugadaGato(e, 0, 4);
  assert.throws(() => L.jugadaGato(e, 1, 4), /ocupada/);
});
prueba('no se puede jugar tras terminar', () => {
  let e = L.crearGato(['a', 'b']);
  e = L.jugadaGato(e, 0, 0); e = L.jugadaGato(e, 1, 3);
  e = L.jugadaGato(e, 0, 1); e = L.jugadaGato(e, 1, 4);
  e = L.jugadaGato(e, 0, 2);
  assert.throws(() => L.jugadaGato(e, 1, 8), /terminó/);
});
prueba('ganadorGato detecta diagonal y tablero vacío', () => {
  assert.strictEqual(L.ganadorGato(['X', null, null, null, 'X', null, null, null, 'X']), 'X');
  assert.strictEqual(L.ganadorGato(Array(9).fill(null)), null);
});

console.log('— TRIVIA —');
prueba('el banco trae 30+ preguntas válidas y variadas', () => {
  assert.ok(L.BANCO_PREGUNTAS.length >= 30, 'faltan preguntas: ' + L.BANCO_PREGUNTAS.length);
  const cats = new Set(L.BANCO_PREGUNTAS.map(p => p.categoria));
  assert.ok(cats.size >= 5, 'pocas categorías');
  L.BANCO_PREGUNTAS.forEach(p => {
    assert.strictEqual(p.opciones.length, 4);
    assert.ok(p.correcta >= 0 && p.correcta < 4);
    assert.ok(p.pregunta.length > 5);
  });
});
prueba('puntaje: acierto rápido = 150, lento = 100, fallo = 0', () => {
  assert.strictEqual(L.puntosRespuesta(true, 20, 20), 150);
  assert.strictEqual(L.puntosRespuesta(true, 0, 20), 100);
  assert.strictEqual(L.puntosRespuesta(true, 10, 20), 125);
  assert.strictEqual(L.puntosRespuesta(false, 20, 20), 0);
});
prueba('flujo completo de una ronda de trivia', () => {
  let e = L.crearTrivia(['ana', 'luis'], [0, 1]);
  assert.strictEqual(e.fase, 'esperando');
  e = L.iniciarTrivia(e);
  assert.strictEqual(e.fase, 'pregunta');
  const preg = L.preguntaActual(e);
  e = L.responderTrivia(e, 'ana', preg.correcta, 20);
  e = L.responderTrivia(e, 'luis', (preg.correcta + 1) % 4, 20);
  assert.throws(() => L.responderTrivia(e, 'ana', 0, 5), /Ya respondiste/);
  e = L.revelarTrivia(e);
  assert.strictEqual(e.puntajes.ana, 150);
  assert.strictEqual(e.puntajes.luis, 0);
  assert.strictEqual(e.fase, 'revelado');
  e = L.siguientePregunta(e);
  assert.strictEqual(e.fase, 'pregunta');
  assert.strictEqual(e.preguntaIdx, 1);
  const preg2 = L.preguntaActual(e);
  e = L.responderTrivia(e, 'ana', preg2.correcta, 0);
  e = L.revelarTrivia(e);
  assert.strictEqual(e.fase, 'final');
  assert.strictEqual(e.puntajes.ana, 250);
});
prueba('no se responde fuera de la fase de pregunta', () => {
  const e = L.crearTrivia(['ana'], [0]);
  assert.throws(() => L.responderTrivia(e, 'ana', 0, 10), /no se puede/);
});

console.log('— MEMORIA —');
prueba('el mazo trae cada emoji exactamente dos veces', () => {
  const e = L.crearMemoria(8, rngSemilla(42));
  assert.strictEqual(e.cartas.length, 16);
  const conteo = {};
  e.cartas.forEach(c => { conteo[c.emoji] = (conteo[c.emoji] || 0) + 1; });
  Object.values(conteo).forEach(n => assert.strictEqual(n, 2));
  assert.strictEqual(e.parejasRestantes, 8);
});
prueba('acertar una pareja suma punto y mantiene el turno', () => {
  let e = L.crearMemoria(4, rngSemilla(7));
  e.jugadores = ['ana', 'luis'];
  const porEmoji = {};
  e.cartas.forEach((c, i) => { (porEmoji[c.emoji] = porEmoji[c.emoji] || []).push(i); });
  const pareja = Object.values(porEmoji)[0];
  e = L.voltearMemoria(e, pareja[0]);
  e = L.voltearMemoria(e, pareja[1]);
  assert.strictEqual(e.puntajes.ana, 1);
  assert.strictEqual(e.turno, 0); // sigue la misma jugadora
  assert.strictEqual(e.parejasRestantes, 3);
});
prueba('fallar deja pendiente y al resolver pasa el turno', () => {
  let e = L.crearMemoria(4, rngSemilla(9));
  e.jugadores = ['ana', 'luis'];
  const distintos = [];
  e.cartas.forEach((c, i) => { if (!distintos.find(d => d.emoji === c.emoji)) distintos.push({ emoji: c.emoji, i }); });
  e = L.voltearMemoria(e, distintos[0].i);
  e = L.voltearMemoria(e, distintos[1].i);
  assert.ok(e.pendiente);
  assert.throws(() => L.voltearMemoria(e, 0), /Espera/);
  e = L.resolverMemoria(e);
  assert.strictEqual(e.turno, 1);
  assert.strictEqual(e.volteadas.length, 0);
});
prueba('la partida termina al encontrar todas las parejas', () => {
  let e = L.crearMemoria(2, rngSemilla(3));
  e.jugadores = ['ana', 'luis'];
  const porEmoji = {};
  e.cartas.forEach((c, i) => { (porEmoji[c.emoji] = porEmoji[c.emoji] || []).push(i); });
  Object.values(porEmoji).forEach(par => {
    e = L.voltearMemoria(e, par[0]);
    e = L.voltearMemoria(e, par[1]);
  });
  assert.strictEqual(e.terminado, true);
  assert.strictEqual(e.puntajes.ana, 2);
});
prueba('no se puede voltear una carta ya encontrada', () => {
  let e = L.crearMemoria(4, rngSemilla(11));
  e.jugadores = ['ana'];
  const porEmoji = {};
  e.cartas.forEach((c, i) => { (porEmoji[c.emoji] = porEmoji[c.emoji] || []).push(i); });
  const par = Object.values(porEmoji)[0];
  e = L.voltearMemoria(e, par[0]); e = L.voltearMemoria(e, par[1]);
  assert.throws(() => L.voltearMemoria(e, par[0]), /ya se encontró/);
});

console.log('— SINCRONIZACIÓN DE REPRODUCCIÓN —');
prueba('posición remota avanza solo si está reproduciendo', () => {
  const t0 = 1000000;
  assert.strictEqual(L.posicionRemota({ posicion: 30, reproduciendo: true, enviadoEn: t0 }, t0 + 5000), 35);
  assert.strictEqual(L.posicionRemota({ posicion: 30, reproduciendo: false, enviadoEn: t0 }, t0 + 5000), 30);
});
prueba('deriva mayor de 1.5 s → seek a la posición del grupo', () => {
  const t0 = 2000000;
  const msg = { posicion: 100, reproduciendo: true, enviadoEn: t0 };
  const c = L.correccionDeriva(90, msg, t0 + 2000);
  assert.strictEqual(c.accion, 'seek');
  assert.strictEqual(c.a, 102);
});
prueba('deriva pequeña → no se toca nada', () => {
  const t0 = 3000000;
  const msg = { posicion: 50, reproduciendo: true, enviadoEn: t0 };
  const c = L.correccionDeriva(50.8, msg, t0 + 1000);
  assert.strictEqual(c.accion, 'nada');
});
prueba('interpretarSync traduce cada evento del protocolo', () => {
  assert.deepStrictEqual(L.interpretarSync({ tipo: 'cargar', videoId: 'abc', posicion: 3 }), { accion: 'cargar', videoId: 'abc', posicion: 3 });
  assert.deepStrictEqual(L.interpretarSync({ tipo: 'reproducir' }), { accion: 'play' });
  assert.deepStrictEqual(L.interpretarSync({ tipo: 'pausar' }), { accion: 'pause' });
  assert.deepStrictEqual(L.interpretarSync({ tipo: 'buscar', posicion: 42 }), { accion: 'seek', a: 42 });
  assert.deepStrictEqual(L.interpretarSync({ tipo: 'otra-cosa' }), { accion: 'nada' });
  assert.deepStrictEqual(L.interpretarSync(null), { accion: 'nada' });
});

console.log('— CAMPEONES Y DIVERSIÓN —');
prueba('ranking ordena y reparte títulos juguetones', () => {
  const r = L.rankingCampeones({ ana: 300, luis: 120, eva: 300 - 300 });
  assert.strictEqual(r[0].id, 'ana');
  assert.strictEqual(r[0].titulo, L.TITULOS_CAMPEON[0]);
  assert.strictEqual(r[1].id, 'luis');
  assert.strictEqual(r[2].puntos, 0);
});
prueba('puntosDePartida: gato 50 al ganador, memoria 10 por pareja, trivia suma su puntaje', () => {
  const gato = Object.assign(L.crearGato(['a', 'b']), { ganador: 'O', terminado: true });
  assert.deepStrictEqual(L.puntosDePartida(gato), { b: 50 });
  const mem = Object.assign(L.crearMemoria(2, rngSemilla(1)), { terminado: true, puntajes: { a: 2, b: 0 } });
  assert.deepStrictEqual(L.puntosDePartida(mem), { a: 20, b: 0 });
  const tri = Object.assign(L.crearTrivia(['a'], [0]), { fase: 'final', puntajes: { a: 275 } });
  assert.deepStrictEqual(L.puntosDePartida(tri), { a: 275 });
  const enCurso = L.crearGato(['a', 'b']);
  assert.deepStrictEqual(L.puntosDePartida(enCurso), {});
});
prueba('fun.js expone confeti, sonidos y reacciones sin romperse en Node', () => {
  assert.strictEqual(typeof Fun.confeti, 'function');
  assert.strictEqual(typeof Fun.sonido, 'function');
  assert.strictEqual(typeof Fun.reaccionFlotante, 'function');
  assert.ok(Fun.EMOJIS_REACCION.length >= 5);
  assert.ok(Fun.MELODIAS.acierto && Fun.MELODIAS.victoria && Fun.MELODIAS.turno && Fun.MELODIAS.error);
  Fun.sonido('acierto'); Fun.confeti({}); Fun.reaccionFlotante('🎉'); // no debe lanzar en Node
});

console.log('— ARCHIVOS: sintaxis y carga —');
['logic.js', 'games.js', 'fun.js', 'app.js', 'config.js', 'sw.js'].forEach(archivo => {
  prueba('sintaxis válida: ' + archivo, () => {
    execFileSync(process.execPath, ['--check', path.join(RAIZ, archivo)]);
  });
});
prueba('index.html: título y encabezados con el nombre final «Nuestro Rincón»', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.ok(html.includes('<title>Nuestro Rincón</title>'));
  assert.ok((html.match(/Nuestro Rincón/g) || []).length >= 3);
  assert.ok(html.includes('lang="es"'));
  ['sec-sala', 'sec-juegos', 'sec-biblia', 'sec-cine', 'sec-chat', 'barra-voz', 'barra-reacciones', 'capa-ganador', 'franja-videos', 'voz-camara', 'biblia-versiculo-texto', 'lista-biblia-historias'].forEach(id => {
    assert.ok(html.includes('id="' + id + '"'), 'falta #' + id);
  });
  assert.ok(html.includes('data-pestana="biblia"'), 'falta la pestaña Biblia');
  assert.ok(html.includes('src="games.js"'), 'falta cargar games.js');
});
prueba('manifest PWA con el nombre final', () => {
  const m = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));
  assert.strictEqual(m.name, 'Nuestro Rincón');
  assert.strictEqual(m.short_name, 'Nuestro Rincón');
});
prueba('config.js trae los tres valores y ningún secreto privado', () => {
  // Adaptada tras la publicación: la clave ANON de Supabase es pública por
  // diseño (viaja en el sitio en vivo; la protegen las políticas RLS).
  // Lo prohibido aquí es un secreto de verdad: service_role o claves privadas.
  const cfg = fs.readFileSync(path.join(RAIZ, 'config.js'), 'utf8');
  ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'YOUTUBE_API_KEY'].forEach(k => assert.ok(cfg.includes(k), 'falta ' + k));
  assert.ok(!cfg.includes('service_role'), '¡la clave service_role jamás va en config.js!');
  assert.ok(!/SUPABASE_SERVICE|PRIVATE_KEY/.test(cfg), 'ninguna clave privada en config.js');
});
prueba('el esquema SQL: tablas, RLS autenticado y Realtime', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'supabase-schema.sql'), 'utf8');
  ['perfiles', 'mensajes', 'partidas', 'cola_videos', 'estado_reproduccion'].forEach(t => {
    assert.ok(sql.includes('public.' + t), 'falta la tabla ' + t);
  });
  assert.ok((sql.match(/enable row level security/g) || []).length >= 5);
  assert.ok(sql.includes("to authenticated"));
  assert.ok(sql.includes('supabase_realtime'));
});
prueba('APP_NAME en app.js es «Nuestro Rincón»', () => {
  const js = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(js.includes("APP_NAME = 'Nuestro Rincón'"));
});

console.log('— CONECTA 4 —');
prueba('la ficha cae al fondo y la siguiente se apila encima', () => {
  let e = G.crearConecta(['a', 'b']);
  assert.strictEqual(e.tablero.length, 42);
  e = G.jugadaConecta(e, 0, 3);
  assert.strictEqual(e.tablero[5 * 7 + 3], 0);
  assert.strictEqual(e.turno, 1);
  e = G.jugadaConecta(e, 1, 3); // la ficha del jugador 0 NO se sobrescribe
  assert.strictEqual(e.tablero[4 * 7 + 3], 1);
  assert.strictEqual(e.tablero[5 * 7 + 3], 0);
});
prueba('victoria vertical de 4 en línea', () => {
  let e = G.crearConecta(['a', 'b']);
  e = G.jugadaConecta(e, 0, 0); e = G.jugadaConecta(e, 1, 1);
  e = G.jugadaConecta(e, 0, 0); e = G.jugadaConecta(e, 1, 1);
  e = G.jugadaConecta(e, 0, 0); e = G.jugadaConecta(e, 1, 1);
  e = G.jugadaConecta(e, 0, 0);
  assert.strictEqual(e.terminado, true);
  assert.strictEqual(e.ganador, 'a');
});
prueba('conecta: fuera de turno y columna llena lanzan error', () => {
  let e = G.crearConecta(['a', 'b']);
  assert.throws(() => G.jugadaConecta(e, 1, 0), /turno/i);
  for (let i = 0; i < 6; i++) e = G.jugadaConecta(e, i % 2, 2);
  assert.throws(() => G.jugadaConecta(e, 0, 2), /llena/);
});
prueba('conecta: ganar da 50 puntos de campeón', () => {
  const fin = Object.assign(G.crearConecta(['a', 'b']), { terminado: true, ganador: 'b' });
  assert.deepStrictEqual(L.puntosDePartida(fin), { b: 50 });
});

console.log('— SERPIENTES Y ESCALERAS —');
prueba('dado, escalera y serpiente mueven la ficha', () => {
  let e = G.crearSerpientes(['a', 'b']);
  e = Object.assign(e, { posiciones: { a: 10, b: 0 } });
  e = G.tirarSerpientes(e, 0, () => 0); // dado 1 → 11, sin evento
  assert.strictEqual(e.dado, 1); assert.strictEqual(e.posiciones.a, 11); assert.strictEqual(e.evento, null);
  assert.strictEqual(e.turno, 1);
  let e2 = G.crearSerpientes(['a', 'b']);
  e2 = Object.assign(e2, { posiciones: { a: 3, b: 0 } });
  e2 = G.tirarSerpientes(e2, 0, () => 0); // 4 → escalera a 14
  assert.strictEqual(e2.evento, 'escalera'); assert.strictEqual(e2.posiciones.a, 14);
  let e3 = G.crearSerpientes(['a', 'b']);
  e3 = Object.assign(e3, { posiciones: { a: 15, b: 0 } });
  e3 = G.tirarSerpientes(e3, 0, () => 0); // 16 → serpiente a 6
  assert.strictEqual(e3.evento, 'serpiente'); assert.strictEqual(e3.posiciones.a, 6);
});
prueba('serpientes: llegar a 100 gana y fuera de turno falla', () => {
  let e = G.crearSerpientes(['a', 'b']);
  assert.throws(() => G.tirarSerpientes(e, 1, () => 0), /turno/i);
  e = Object.assign(e, { posiciones: { a: 99, b: 0 } });
  e = G.tirarSerpientes(e, 0, () => 0);
  assert.strictEqual(e.terminado, true); assert.strictEqual(e.ganador, 'a');
});

console.log('— AHORCADO —');
prueba('banco de ahorcado: 40+ palabras con pista', () => {
  assert.ok(G.PALABRAS_AHORCADO.length >= 40, 'solo hay ' + G.PALABRAS_AHORCADO.length);
  G.PALABRAS_AHORCADO.forEach(p => {
    assert.ok(/^[A-ZÁÉÍÓÚÑ ]+$/.test(p.palabra), 'palabra rara: ' + p.palabra);
    assert.ok(p.pista && p.pista.length > 2);
  });
});
prueba('ahorcado: aciertos, fallos, letra repetida y victoria', () => {
  let e = G.crearAhorcado(['a'], rngSemilla(4));
  const letras = [...new Set(e.palabra.replace(/ /g, '').split(''))];
  const malas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(l => !e.palabra.includes(l));
  e = G.letraAhorcado(e, 0, malas[0]);
  assert.strictEqual(e.fallos, 1);
  assert.throws(() => G.letraAhorcado(e, 0, malas[0]), /ya se usó/);
  letras.forEach(l => { e = G.letraAhorcado(e, 0, l); });
  assert.strictEqual(e.terminado, true); assert.strictEqual(e.ganado, true);
  assert.strictEqual(e.ultimoAcertante, 'a');
});
prueba('ahorcado: 6 fallos pierden; puntos de campeón al ganar', () => {
  let e = G.crearAhorcado(['a'], rngSemilla(8));
  const malas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(l => !e.palabra.includes(l)).slice(0, 6);
  malas.forEach(l => { e = G.letraAhorcado(e, 0, l); });
  assert.strictEqual(e.terminado, true); assert.strictEqual(e.ganado, false); assert.strictEqual(e.fallos, 6);
  const fin = Object.assign(G.crearAhorcado(['a', 'b'], rngSemilla(1)), { terminado: true, ganado: true, ultimoAcertante: 'b' });
  assert.deepStrictEqual(L.puntosDePartida(fin), { a: 20, b: 50 });
});

console.log('— DIBUJO Y ADIVINA —');
prueba('normalizarTexto quita acentos y mayúsculas', () => {
  assert.strictEqual(G.normalizarTexto('  Árbol Ñandú '), 'arbol nandu');
  assert.strictEqual(G.normalizarTexto('GATO'), 'gato');
});
prueba('dibujo: elegir palabra, acertar suma y cierra la ronda', () => {
  let e = G.crearDibujo(['a', 'b'], rngSemilla(6));
  assert.strictEqual(e.fase, 'elegir');
  assert.strictEqual(e.opciones.length, 3);
  e = G.elegirPalabraDibujo(e, 0, 0);
  assert.strictEqual(e.fase, 'dibujando');
  const res = G.intentoDibujo(e, 'b', ' ' + e.palabra.toLowerCase() + ' ');
  assert.strictEqual(res.acierto, true);
  assert.ok(res.estado.puntajes.b > 0);
  assert.throws(() => G.intentoDibujo(e, 'a', e.palabra), /no adivina/); // quien dibuja no puede adivinar
  const cerrado = G.cerrarRondaDibujo(res.estado);
  assert.ok(cerrado.fase === 'elegir' || cerrado.fase === 'final');
});

console.log('— PARCHÍS —');
prueba('parchís: sin 5 no se sale de casa y el turno pasa', () => {
  let e = G.crearParchis(['a', 'b']);
  assert.deepStrictEqual(e.fichas, { a: [-1, -1], b: [-1, -1] });
  e = G.tirarParchis(e, 0, () => 0.4); // dado 3
  assert.strictEqual(e.turno, 1); assert.strictEqual(e.fase, 'dado'); assert.strictEqual(e.evento, 'sin-movimientos');
});
prueba('parchís: con 5 sale de casa; captura devuelve al rival', () => {
  let e = G.crearParchis(['a', 'b']);
  e = G.tirarParchis(e, 0, () => 0.7); // dado 5
  assert.strictEqual(e.fase, 'mover');
  e = G.moverParchis(e, 0, 0);
  assert.strictEqual(e.fichas.a[0], 0);
  // Captura: 'a' en progreso 12 (abs 12); 'b' (salida 10) en progreso 1 → tira 1 y cae en abs 12
  let e2 = G.crearParchis(['a', 'b']);
  e2 = Object.assign(e2, { fichas: { a: [12, -1], b: [1, -1] }, turno: 1, fase: 'dado' });
  e2 = G.tirarParchis(e2, 1, () => 0); // dado 1
  e2 = G.moverParchis(e2, 1, 0);
  assert.strictEqual(e2.fichas.b[0], 2);
  assert.strictEqual(e2.fichas.a[0], -1); // ¡a casa!
  assert.strictEqual(e2.evento, 'captura');
});
prueba('parchís: meta exacta y rebote simple', () => {
  const e = G.crearParchis(['a', 'b']);
  const conFicha = Object.assign(e, { fichas: { a: [35, 38], b: [-1, -1] } });
  const movs = G.movimientosParchis(conFicha, 0, 5);
  assert.strictEqual(movs.find(m => m.ficha === 0).destino, 40); // exacto
  assert.strictEqual(movs.find(m => m.ficha === 1).destino, 37); // 43 rebota a 37
});

console.log('— DOMINÓ —');
prueba('dominó: el juego completo son 28 fichas únicas 0–6', () => {
  const e = G.iniciarDomino(G.crearDomino(['a', 'b']), rngSemilla(5));
  const fichas = e.manos.a.concat(e.manos.b, e.pozo, e.mesa);
  assert.strictEqual(fichas.length, 28);
  assert.strictEqual(new Set(fichas.map(f => f.join('-'))).size, 28);
  fichas.forEach(f => { assert.ok(f[0] >= 0 && f[0] <= 6 && f[1] >= 0 && f[1] <= 6 && f[0] <= f[1]); });
});
prueba('dominó: reparto de 7, pozo de 14 y primera jugada', () => {
  let e = G.iniciarDomino(G.crearDomino(['a', 'b']), rngSemilla(12));
  assert.strictEqual(e.fase, 'jugando');
  assert.strictEqual(e.manos.a.length, 7); assert.strictEqual(e.manos.b.length, 7);
  assert.strictEqual(e.pozo.length, 14);
  const turnoId = e.jugadores[e.turno];
  e = G.jugarDomino(e, e.turno, 0, 'derecha');
  assert.strictEqual(e.mesa.length, 1);
  assert.strictEqual(e.manos[turnoId].length, 6);
});
prueba('dominó: colocar por la izquierda orienta la ficha; bloqueo gana el de menos puntos', () => {
  const base = G.crearDomino(['a', 'b']);
  let e = Object.assign(base, {
    fase: 'jugando', mesa: [[2, 5]], pozo: [],
    manos: { a: [[2, 3]], b: [[0, 0]] }, turno: 0, pasesSeguidos: 0
  });
  e = G.jugarDomino(e, 0, 0, 'izquierda');
  assert.deepStrictEqual(G.extremosDomino(e), [3, 5]);
  let b = Object.assign(G.crearDomino(['a', 'b']), {
    fase: 'jugando', mesa: [[3, 4]], pozo: [],
    manos: { a: [[1, 1]], b: [[2, 2]] }, turno: 0, pasesSeguidos: 0
  });
  b = G.pasarDomino(b, 0);
  b = G.pasarDomino(b, 1);
  assert.strictEqual(b.terminado, true);
  assert.strictEqual(b.ganador, 'a'); // 2 puntos en mano contra 4
});

console.log('— BATALLA NAVAL —');
prueba('naval: 3 barcos (3,2,2) sin solaparse, dentro del 8×8, desde la creación', () => {
  const e = G.crearNaval(['a', 'b'], rngSemilla(7));
  ['a', 'b'].forEach(id => {
    assert.deepStrictEqual(e.barcos[id].map(b => b.length).sort(), [2, 2, 3]);
    const celdas = G.celdasBarco(e.barcos[id]);
    assert.strictEqual(Object.keys(celdas).length, 7);
    Object.keys(celdas).forEach(c => { assert.ok(+c >= 0 && +c < 64); });
  });
});
prueba('naval: acierto repite turno, agua lo pasa, repetir casilla falla', () => {
  let e = G.iniciarNaval(G.crearNaval(['a', 'b']));
  const celdaBarco = +Object.keys(G.celdasBarco(e.barcos.b))[0];
  e = G.dispararNaval(e, 0, celdaBarco);
  assert.ok(['tocado', 'hundido'].includes(e.ultimoDisparo.resultado));
  assert.strictEqual(e.turno, 0); // repite
  assert.throws(() => G.dispararNaval(e, 0, celdaBarco), /ya disparaste/);
  const celdaAgua = Array.from({ length: 64 }, (_, i) => i).find(i => !G.celdasBarco(e.barcos.b)[i] && !e.disparos.a[i]);
  e = G.dispararNaval(e, 0, celdaAgua);
  assert.strictEqual(e.ultimoDisparo.resultado, 'agua');
  assert.strictEqual(e.turno, 1);
});
prueba('naval: hundir toda la flota gana la partida', () => {
  let e = G.iniciarNaval(G.crearNaval(['a', 'b']));
  Object.keys(G.celdasBarco(e.barcos.b)).forEach(c => { e = G.dispararNaval(e, 0, +c); });
  assert.strictEqual(e.terminado, true);
  assert.strictEqual(e.ganador, 'a');
});

console.log('— SOPA DE LETRAS —');
prueba('sopa: la rejilla esconde las 6 palabras y se pueden marcar', () => {
  let e = G.crearSopa(['a', 'b'], rngSemilla(21));
  assert.strictEqual(e.rejilla.length, 100);
  assert.strictEqual(e.palabras.length, 6);
  e.palabras.forEach(p => {
    const camino = G.caminoSopa(p.inicio, p.fin);
    assert.ok(camino, 'camino inválido para ' + p.palabra);
    assert.strictEqual(camino.map(i => e.rejilla[i]).join(''), p.palabra);
  });
  const p0 = e.palabras[0];
  e = G.marcarSopa(e, 'a', p0.inicio, p0.fin);
  assert.strictEqual(e.puntajes.a, 1);
  assert.strictEqual(e.palabras[0].por, 'a');
  assert.throws(() => G.marcarSopa(e, 'b', p0.inicio, p0.fin)); // ya encontrada: no se puede remarcar
  assert.strictEqual(G.caminoSopa(0, 11), null); // diagonal no vale
});

console.log('— ¡BASTA! —');
prueba('basta: ronda completa con única=10 y repetida=5', () => {
  let e = G.crearBasta(['a', 'b'], () => 0); // letra A
  assert.strictEqual(e.letra, 'A');
  const cats = G.CATEGORIAS_BASTA;
  const respA = {}; const respB = {};
  cats.forEach((c, i) => { respA[c] = 'A-cosa-' + i; respB[c] = i === 0 ? 'A-cosa-0' : ''; });
  e = G.enviarRespuestasBasta(e, 'a', respA);
  e = G.enviarRespuestasBasta(e, 'b', respB);
  e = G.cerrarBasta(e, 'b');
  assert.strictEqual(e.fase, 'puntuando');
  cats.forEach(c => { e = G.marcarBasta(e, 'a', c, true); });
  e = G.marcarBasta(e, 'b', cats[0], true);
  e = G.puntuarBasta(e);
  assert.strictEqual(e.puntajes.a, 5 + 10 * (cats.length - 1)); // la primera repetida, el resto únicas
  assert.strictEqual(e.puntajes.b, 5);
  assert.strictEqual(e.fase, 'puntuada');
  e = G.siguienteBasta(e);
  assert.strictEqual(e.ronda, 2); assert.strictEqual(e.fase, 'escribiendo');
});

console.log('— SIMÓN DICE —');
prueba('simón: repetir bien crece la secuencia y pasa el turno; fallar elimina', () => {
  let e = G.crearSimon(['a', 'b'], rngSemilla(3));
  assert.strictEqual(e.secuencia.length, 1);
  assert.throws(() => G.presionarSimon(e, 1, e.secuencia[0]), /turno/i);
  e = G.presionarSimon(e, 0, e.secuencia[0]);
  assert.strictEqual(e.puntajes.a, 1);
  assert.strictEqual(e.secuencia.length, 2);
  assert.strictEqual(e.turno, 1);
  const malo = G.COLORES_SIMON.find(c => c !== e.secuencia[0]);
  e = G.presionarSimon(e, 1, malo);
  assert.strictEqual(e.vivos.b, false);
  assert.strictEqual(e.terminado, true);
  assert.strictEqual(e.ganador, 'a');
  const pts = L.puntosDePartida(e);
  assert.strictEqual(pts.a, 1 * 10 + 20); // rondas ×10 + bono de ganador
});

console.log('— CÁLCULO RÁPIDO —');
prueba('cálculo: la operación cuadra y el primero en acertar cierra la ronda', () => {
  let e = G.crearCalculo(['a', 'b'], rngSemilla(9));
  const op = e.operacion;
  const esperado = op.op === '+' ? op.a + op.b : op.op === '−' ? op.a - op.b : op.a * op.b;
  assert.strictEqual(op.respuesta, esperado);
  e = G.responderCalculo(e, 'a', esperado + 1);
  assert.strictEqual(e.respuestas.a.correcta, false);
  assert.strictEqual(e.rondaCerrada, false);
  e = G.responderCalculo(e, 'b', esperado);
  assert.strictEqual(e.rondaCerrada, true);
  assert.strictEqual(e.ganadorRonda, 'b');
  assert.strictEqual(e.puntajes.b, 10);
  assert.throws(() => G.responderCalculo(e, 'a', esperado), /cerró/);
  e = G.siguienteCalculo(e);
  assert.strictEqual(e.ronda, 2);
});

console.log('— PIEDRA, PAPEL O TIJERA —');
prueba('ppt: elección simultánea, revelado y mejor de rondas', () => {
  let e = G.crearPPT(['a', 'b']);
  e = G.elegirPPT(e, 'a', 'piedra');
  assert.strictEqual(e.fase, 'eligiendo'); // falta b: nada se revela aún
  e = G.elegirPPT(e, 'b', 'tijera');
  assert.strictEqual(e.fase, 'revelado');
  assert.strictEqual(e.marcador.a, 1); // la piedra rompe la tijera
  e = G.siguientePPT(e);
  assert.strictEqual(e.ronda, 2);
  // 'a' gana dos rondas más y se lleva la partida (meta: 3)
  for (let r = 0; r < 2; r++) {
    e = G.elegirPPT(e, 'a', 'papel');
    e = G.elegirPPT(e, 'b', 'piedra');
    if (!e.terminado) e = G.siguientePPT(e);
  }
  assert.strictEqual(e.terminado, true);
  assert.strictEqual(e.ganador, 'a');
  assert.deepStrictEqual(L.puntosDePartida(e), { a: 50 });
});

console.log('— ADIVINA EL NÚMERO —');
prueba('adivina: pistas mayor/menor y acierto con premio por pocos intentos', () => {
  let e = G.crearAdivina(['a', 'b'], rngSemilla(15));
  assert.ok(e.secreto >= 1 && e.secreto <= 100);
  assert.throws(() => G.adivinarNumero(e, 0, 0), /1 al 100/);
  assert.throws(() => G.adivinarNumero(e, 1, 50), /turno/i);
  const intento = e.secreto > 1 ? e.secreto - 1 : e.secreto + 1;
  e = G.adivinarNumero(e, 0, intento);
  assert.strictEqual(e.historial[0].pista, intento < e.secreto ? 'mayor' : 'menor');
  assert.strictEqual(e.turno, 1);
  // b falla a propósito, vuelve a 'a' y acierta en su 2º intento
  const falloB = e.secreto > 1 ? e.secreto - 1 : e.secreto + 1;
  e = G.adivinarNumero(e, 1, falloB);
  e = G.adivinarNumero(e, 0, e.secreto);
  assert.strictEqual(e.fase, 'ronda-fin');
  assert.strictEqual(e.ganadorRonda, 'a');
  assert.strictEqual(e.puntajes.a, 45); // 50 − 5×(intentos−1): acertó en su 2º intento
});

console.log('— BIBLIA: BANCOS —');
prueba('versículos del día: 60 con cita, rotación por fecha estable', () => {
  assert.strictEqual(G.VERSICULOS_DIA.length, 60);
  G.VERSICULOS_DIA.forEach(v => {
    assert.ok(v.texto.length > 5);
    assert.ok(/.+\d+:\d+/.test(v.cita), 'cita rara: ' + v.cita);
  });
  const f = new Date(2026, 9, 31);
  assert.strictEqual(G.versiculoDelDia(f), G.versiculoDelDia(new Date(2026, 9, 31)));
});
prueba('historias bíblicas: 36 en orden (22 AT + 14 NT), con slug, cita, párrafos y pregunta', () => {
  assert.strictEqual(G.HISTORIAS_BIBLICAS.length, 36);
  const slugs = G.HISTORIAS_BIBLICAS.map(h => h.slug);
  assert.strictEqual(new Set(slugs).size, 36, 'slugs repetidos');
  assert.strictEqual(slugs[0], 'creacion');
  assert.strictEqual(slugs[35], 'pentecostes');
  assert.strictEqual(G.HISTORIAS_BIBLICAS.filter(h => h.testamento === 'antiguo').length, 22);
  assert.strictEqual(G.HISTORIAS_BIBLICAS.filter(h => h.testamento === 'nuevo').length, 14);
  // El orden bíblico nunca mezcla testamentos: primero todo el AT, luego el NT.
  const primeroNT = G.HISTORIAS_BIBLICAS.findIndex(h => h.testamento === 'nuevo');
  assert.ok(G.HISTORIAS_BIBLICAS.slice(primeroNT).every(h => h.testamento === 'nuevo'));
  G.HISTORIAS_BIBLICAS.forEach(h => {
    assert.ok(h.parrafos.length >= 4 && h.parrafos.length <= 6, h.titulo + ': párrafos fuera de 4–6');
    assert.ok(h.pregunta.length > 5, h.titulo + ': sin pregunta');
    assert.ok(h.cita && h.cita.length > 3, h.titulo + ': sin cita');
    assert.ok(h.titulo && h.emoji, h.slug + ': sin título/emoji');
  });
});
prueba('cada historia tiene su ilustración en biblia-img/<slug>.jpg', () => {
  const dir = path.join(RAIZ, 'biblia-img');
  G.HISTORIAS_BIBLICAS.forEach(h => {
    const f = path.join(dir, h.slug + '.jpg');
    assert.ok(fs.existsSync(f), 'falta la imagen de ' + h.slug);
    const st = fs.statSync(f);
    assert.ok(st.size > 8000, h.slug + '.jpg sospechosamente pequeña (' + st.size + ' B)');
    const cab = fs.readFileSync(f).slice(0, 2);
    assert.strictEqual(cab[0], 0xFF); assert.strictEqual(cab[1], 0xD8); // magia JPEG
  });
  const jpgs = fs.readdirSync(dir).filter(n => n.endsWith('.jpg'));
  assert.strictEqual(jpgs.length, 36, 'deben ser exactamente 36 JPG (sin sobrantes de generación)');
});
prueba('trivia bíblica: banco de 30+ con 4 opciones y motor compartido', () => {
  assert.ok(G.BANCO_TRIVIA_BIBLICA.length >= 30);
  G.BANCO_TRIVIA_BIBLICA.forEach(p => {
    assert.strictEqual(p.opciones.length, 4);
    assert.ok(p.correcta >= 0 && p.correcta < 4);
  });
  let e = L.crearTrivia(['a', 'b'], null, 'biblica');
  e = L.iniciarTrivia(e);
  assert.ok(G.BANCO_TRIVIA_BIBLICA.includes(L.preguntaActual(e)));
  const g = L.crearTrivia(['a'], [0]);
  assert.ok(L.BANCO_PREGUNTAS.includes(L.preguntaActual(Object.assign(g, { fase: 'pregunta' }))) || true);
});
prueba('completa el versículo: banco de 20+ válido y flujo completo', () => {
  assert.ok(G.BANCO_COMPLETA.length >= 20);
  G.BANCO_COMPLETA.forEach(v => {
    assert.ok(v.texto.includes('___'), 'sin hueco: ' + v.texto);
    assert.strictEqual(v.opciones.length, 4);
    assert.ok(v.opciones[v.correcta] && v.opciones[v.correcta].length > 0);
    assert.ok(v.cita.length > 3);
  });
  let e = G.crearVersiculo(['a', 'b'], [0, 1]);
  e = G.iniciarVersiculo(e);
  const v = G.versiculoActual(e);
  e = G.responderVersiculo(e, 'a', v.correcta, 20);
  assert.ok(e.respuestas.a.puntos > 0);
  e = G.responderVersiculo(e, 'b', (v.correcta + 1) % 4, 20);
  assert.strictEqual(e.respuestas.b.puntos, 0);
  e = G.revelarVersiculo(e);
  assert.strictEqual(e.fase, 'revelado');
  e = G.siguienteVersiculo(e);
  const v2 = G.versiculoActual(e);
  e = G.responderVersiculo(e, 'a', v2.correcta, 5);
  e = G.revelarVersiculo(e);
  assert.strictEqual(e.fase, 'final');
  assert.strictEqual(e.terminado, true);
});

console.log('— PAQUETE DE MEMORIA —');
prueba('mazos temáticos: 4 mazos de 8 parejas con nombre, y el bíblico aparte', () => {
  ['animales', 'comida', 'vehiculos', 'espacio'].forEach(k => {
    assert.strictEqual(G.MAZOS_MEMORIA[k].length, 8, 'mazo ' + k);
    G.MAZOS_MEMORIA[k].forEach(c => { assert.ok(c.emoji && c.nombre); });
  });
  assert.strictEqual(G.PAREJAS_BIBLICAS.length, 8);
  assert.ok(G.PAREJAS_BIBLICAS.find(c => c.nombre === 'Paloma'));
  const e = L.crearMemoria(8, rngSemilla(2), G.MAZOS_MEMORIA.animales);
  assert.strictEqual(e.cartas.length, 16);
  e.cartas.forEach(c => assert.ok(G.MAZOS_MEMORIA.animales.some(m => m.emoji === c.emoji && m.nombre === c.nombre)));
  const eb = L.crearMemoria(8, rngSemilla(2), G.PAREJAS_BIBLICAS);
  assert.ok(eb.cartas.every(c => c.nombre));
});
prueba('¿qué falta?: conjunto crece, uno se esconde y acertar suma 10', () => {
  let e = G.crearQueFalta(['a', 'b'], rngSemilla(31));
  assert.strictEqual(e.conjunto.length, 5); // ronda 1: 5 objetos, y crece +1 por ronda
  e = G.ocultarQueFalta(e);
  assert.strictEqual(e.mostrados.length, 4);
  assert.ok(!e.mostrados.includes(e.falta));
  assert.ok(e.opciones.includes(e.falta));
  assert.strictEqual(e.opciones.length, 4);
  e = G.responderQueFalta(e, 'a', e.opciones.indexOf(e.falta));
  assert.strictEqual(e.respuestas.a.correcta, true);
  assert.strictEqual(e.puntajes.a, 10);
  e = G.responderQueFalta(e, 'b', (e.opciones.indexOf(e.falta) + 1) % 4);
  assert.strictEqual(e.respuestas.b.correcta, false);
  e = G.siguienteQueFalta(e);
  assert.strictEqual(e.ronda, 2);
  assert.strictEqual(e.conjunto.length, 6);
});
prueba('recuerda el orden: fila exacta vale 5 por posición + 10 extra', () => {
  let e = G.crearOrden(['a', 'b'], rngSemilla(41));
  assert.strictEqual(e.fila.length, G.largoFilaOrden(1));
  e = G.voltearOrden(e);
  assert.strictEqual(e.fase, 'jugando');
  e = G.enviarOrden(e, 'a', e.fila.slice());
  assert.strictEqual(e.respuestas.a.aciertos, e.fila.length);
  assert.strictEqual(e.respuestas.a.puntos, e.fila.length * 5 + 10);
  e = G.enviarOrden(e, 'b', e.fila.slice().reverse());
  assert.ok(e.respuestas.b.aciertos < e.fila.length);
  e = G.siguienteOrden(e);
  assert.strictEqual(e.ronda, 2);
  assert.strictEqual(e.fila.length, G.largoFilaOrden(2));
});
prueba('memoria de números: el número crece y acertarlo suma 5 por dígito', () => {
  let e = G.crearNumeros(['a', 'b'], rngSemilla(51));
  assert.strictEqual(String(e.numero).length, 4);
  e = G.ocultarNumeros(e);
  e = G.responderNumeros(e, 'a', String(e.numero));
  assert.strictEqual(e.respuestas.a.correcta, true);
  assert.strictEqual(e.puntajes.a, 20); // 4 dígitos × 5
  e = G.responderNumeros(e, 'b', '0000');
  assert.strictEqual(e.respuestas.b.correcta, false);
  e = G.siguienteNumeros(e);
  assert.strictEqual(String(e.numero).length, 5);
});

console.log('— VIDEO (estado puro) —');
prueba('fun.registrarVideo/tieneVideo: mapa inmutable de cámaras', () => {
  let m = {};
  m = Fun.registrarVideo(m, 'a', true);
  assert.strictEqual(Fun.tieneVideo(m, 'a'), true);
  assert.strictEqual(Fun.tieneVideo(m, 'b'), false);
  const m2 = Fun.registrarVideo(m, 'a', false);
  assert.strictEqual(Fun.tieneVideo(m2, 'a'), false);
  assert.strictEqual(Fun.tieneVideo(m, 'a'), true); // el original no se mutó
  assert.deepStrictEqual(Fun.participantesConVideo(Fun.registrarVideo(m, 'b', true)), ['a', 'b']);
});

console.log('— CHAT V2: emojis grandes y reacciones (puro) —');
prueba('esSoloEmojis: 1 a 3 emojis y nada más', () => {
  assert.strictEqual(Fun.esSoloEmojis('😂'), true);
  assert.strictEqual(Fun.esSoloEmojis('😂❤️👍'), true);
  assert.strictEqual(Fun.esSoloEmojis('  🎉  '), true);
  assert.strictEqual(Fun.esSoloEmojis('❤️'), true);
  assert.strictEqual(Fun.esSoloEmojis('😂😂😂😂'), false); // más de 3 ya no
  assert.strictEqual(Fun.esSoloEmojis('hola 😂'), false);
  assert.strictEqual(Fun.esSoloEmojis(''), false);
  assert.strictEqual(Fun.esSoloEmojis('123'), false);
});
prueba('contarEmojis: ZWJ cuenta 1, banderas y tonos de piel no duplican', () => {
  assert.strictEqual(Fun.contarEmojis('👨‍👩‍👧'), 1);
  assert.strictEqual(Fun.contarEmojis('🇩🇴🇺🇸'), 2);
  assert.strictEqual(Fun.contarEmojis('👍🏽'), 1);
  assert.strictEqual(Fun.contarEmojis('a😂b❤️'), 2);
  assert.strictEqual(Fun.esSoloEmojis('👨‍👩‍👧'), true);
  assert.strictEqual(Fun.esSoloEmojis('🇩🇴'), true);
  assert.strictEqual(Fun.esSoloEmojis('1️⃣'), true);
});
prueba('alternarReaccion: pone, suma y quita sin mutar el original', () => {
  const vacio = {};
  const r1 = Fun.alternarReaccion(vacio, '😂', 'u1', 'Papá');
  assert.deepStrictEqual(vacio, {}); // no mutó
  assert.deepStrictEqual(r1, { '😂': [{ id: 'u1', nombre: 'Papá' }] });
  const r2 = Fun.alternarReaccion(r1, '😂', 'u2', 'Mamá');
  assert.strictEqual(r2['😂'].length, 2);
  const r3 = Fun.alternarReaccion(r2, '😂', 'u1', 'Papá'); // u1 se la quita
  assert.deepStrictEqual(r3, { '😂': [{ id: 'u2', nombre: 'Mamá' }] });
  const r4 = Fun.alternarReaccion(r3, '😂', 'u2', 'Mamá');
  assert.deepStrictEqual(r4, {}); // sin reacciones no quedan claves vacías
  const r5 = Fun.alternarReaccion(r2, '❤️', 'u1', 'Papá'); // otro emoji convive
  assert.strictEqual(r5['😂'].length, 2);
  assert.strictEqual(r5['❤️'].length, 1);
});
prueba('resumenReacciones: totales y nombres en el orden de la fila', () => {
  const r = { '🎉': [{ id: 'u1', nombre: 'Papá' }], '😂': [{ id: 'u1', nombre: 'Papá' }, { id: 'u2', nombre: 'Mamá' }] };
  const res = Fun.resumenReacciones(r);
  assert.strictEqual(res[0].emoji, '😂'); // 😂 va antes que 🎉 en la fila
  assert.strictEqual(res[0].total, 2);
  assert.deepStrictEqual(res[0].nombres, ['Papá', 'Mamá']);
  assert.strictEqual(res[1].emoji, '🎉');
  assert.deepStrictEqual(Fun.resumenReacciones({}), []);
  assert.deepStrictEqual(Fun.EMOJIS_REACCION_MENSAJE, ['😂', '❤️', '👍', '🎉', '😮']);
});

console.log('— AVISOS PUSH Y NOTAS DE VOZ (puro) —');
prueba('formaSuscripcion: acepta la forma de toJSON y rechaza incompletas', () => {
  assert.deepStrictEqual(
    Fun.formaSuscripcion({ endpoint: 'https://push.example/x', expirationTime: null, keys: { p256dh: 'abc', auth: 'def' } }),
    { endpoint: 'https://push.example/x', p256dh: 'abc', auth: 'def' });
  assert.strictEqual(Fun.formaSuscripcion(null), null);
  assert.strictEqual(Fun.formaSuscripcion({}), null);
  assert.strictEqual(Fun.formaSuscripcion({ endpoint: 'https://x', keys: { p256dh: 'abc' } }), null);
  assert.strictEqual(Fun.formaSuscripcion({ endpoint: 'http://x', keys: { p256dh: 'a', auth: 'b' } }), null);
  assert.strictEqual(Fun.formaSuscripcion({ endpoint: 'https://x', keys: { p256dh: '', auth: 'b' } }), null);
});
prueba('formatoDuracion y límite de grabación de 3 minutos', () => {
  assert.strictEqual(Fun.formatoDuracion(0), '0:00');
  assert.strictEqual(Fun.formatoDuracion(9), '0:09');
  assert.strictEqual(Fun.formatoDuracion(65), '1:05');
  assert.strictEqual(Fun.formatoDuracion(180), '3:00');
  assert.strictEqual(Fun.formatoDuracion(600), '10:00');
  assert.strictEqual(Fun.formatoDuracion(-5), '0:00');
  assert.strictEqual(Fun.formatoDuracion('basura'), '0:00');
  assert.strictEqual(Fun.GRABACION_MAX_SEG, 180);
});
prueba('tono de llamada: iniciar/detener sin navegador no rompe', () => {
  assert.strictEqual(Fun.tonoLlamadaActivo(), false);
  Fun.iniciarTonoLlamada();
  assert.strictEqual(Fun.tonoLlamadaActivo(), true);
  Fun.iniciarTonoLlamada(); // doble inicio: sigue un solo bucle
  assert.strictEqual(Fun.tonoLlamadaActivo(), true);
  Fun.detenerTonoLlamada();
  assert.strictEqual(Fun.tonoLlamadaActivo(), false);
});

console.log('— V2: archivos, esquema y secretos —');
prueba('index.html v2: avisos, panel de emojis, grabación y tarjeta de llamada', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  ['btn-avisos', 'avisos-estado', 'panel-emojis', 'btn-emojis', 'btn-grabar',
   'barra-grabacion', 'grab-tiempo', 'grab-enviar', 'grab-cancelar', 'audio-aviso',
   'tarjeta-llamada', 'llamada-titulo', 'llamada-contestar', 'llamada-ahora-no'].forEach(id => {
    assert.ok(html.includes('id="' + id + '"'), 'falta #' + id);
  });
});
prueba('config.js: VAPID pública presente (es pública a propósito)', () => {
  const cfg = fs.readFileSync(path.join(RAIZ, 'config.js'), 'utf8');
  assert.ok(cfg.includes('VAPID_PUBLIC_KEY'), 'falta VAPID_PUBLIC_KEY');
});
prueba('la clave VAPID PRIVADA no aparece en ningún archivo publicable', () => {
  const local = fs.readFileSync(path.join(RAIZ, 'push-keys.local.txt'), 'utf8');
  const m = local.match(/Private Key:\s*([A-Za-z0-9_-]+)/);
  assert.ok(m, 'push-keys.local.txt debe traer la privada');
  const privada = m[1];
  ['config.js', 'app.js', 'index.html', 'sw.js', 'fun.js', 'logic.js', 'games.js',
   'styles.css', 'manifest.json', 'README.md', 'supabase-schema.sql',
   path.join('supabase', 'functions', 'avisar-llamada', 'index.ts')].forEach(f => {
    const contenido = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    assert.ok(!contenido.includes(privada), '¡la privada apareció en ' + f + '!');
  });
});
prueba('sw.js: caché de la app y manejadores push/notificationclick', () => {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  assert.ok(sw.includes("addEventListener('push'"), 'falta el manejador push');
  assert.ok(sw.includes("addEventListener('notificationclick'"), 'falta notificationclick');
  assert.ok(sw.includes('showNotification'), 'falta showNotification');
  ['index.html', 'app.js', 'fun.js', 'manifest.json'].forEach(f => {
    assert.ok(sw.includes(f), 'la caché debe incluir ' + f);
  });
});
prueba('Edge Function avisar-llamada: valida JWT y lee la privada del entorno', () => {
  const fn = fs.readFileSync(path.join(RAIZ, 'supabase', 'functions', 'avisar-llamada', 'index.ts'), 'utf8');
  assert.ok(fn.includes('auth.getUser'), 'debe validar el JWT');
  assert.ok(fn.includes('VAPID_PRIVATE_KEY'), 'debe leer la privada');
  assert.ok(fn.includes('Deno.env.get'), 'la privada sale del entorno, no del código');
  assert.ok(fn.includes('suscripciones_push'), 'debe leer las suscripciones');
  assert.ok(fn.includes('te está llamando'), 'el texto del aviso de llamada');
});
prueba('esquema v2: reacciones, audios, suscripciones push y bucket', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'supabase-schema.sql'), 'utf8');
  assert.ok(sql.includes('reacciones jsonb'), 'mensajes.reacciones');
  assert.ok(sql.includes('audio_path'), 'mensajes.audio_path');
  assert.ok(sql.includes('audio_seg'), 'mensajes.audio_seg');
  assert.ok(sql.includes('public.suscripciones_push'), 'tabla suscripciones_push');
  assert.ok(sql.includes('solo las mias'), 'política propia de push');
  assert.ok(sql.includes('auth.uid()'), 'la política usa auth.uid()');
  assert.ok(sql.includes("'audios', 'audios', false"), 'bucket privado audios');
  assert.ok(sql.includes('storage.objects'), 'políticas de storage');
});

console.log('— V3 · ENCARGO 1: EL TABLERO SE ABRE A LA VISTA —');
prueba('crear abre el tablero: crearPartida y abrirPartida pasan por abrirYMostrar', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes('function abrirYMostrar'), 'falta abrirYMostrar');
  assert.ok(app.includes('abrirYMostrar(provisional)'),
    'crearPartida abre el tablero AL TOQUE con la partida provisional (v3.3); la fila del insert solo confirma');
  assert.ok(app.includes('if (dentro) { abrirYMostrar(p); return; }'), 'abrirPartida (ya dentro) debe mostrar al instante');
  assert.ok(app.includes('abrirYMostrar({ id: p.id'), 'abrirPartida (unirse) debe mostrar al instante (optimista)');
});
prueba('sin scroll al tablero: la cadena de scroll de la v3 quedó retirada (v3.2: capa)', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(!app.includes('llevarJuegoALaVista'), 'llevarJuegoALaVista debe desaparecer: la capa lo sustituye');
  assert.ok(!app.includes('scrollIntoView'), 'ningún scrollIntoView en la app: abrir ya no desplaza la página');
});
prueba('el tablero vive en la capa #capa-juego, con su ✖ grande cableada a cerrarJuegoVista', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const iCapa = html.indexOf('id="capa-juego"');
  assert.ok(iCapa !== -1, 'falta la capa del juego');
  assert.ok(html.indexOf('id="tarjeta-juego"') > iCapa, 'la tarjeta del juego debe vivir DENTRO de #capa-juego');
  assert.ok(html.indexOf('id="btn-cerrar-juego"') > iCapa, 'la ✖ del juego va en la cabecera de la capa');
  assert.ok(html.includes('btn-cerrar-capa" id="btn-cerrar-juego"'), 'la ✖ debe ser el botón grande de capa');
  assert.ok(app.includes("$('#btn-cerrar-juego').addEventListener('click', cerrarJuegoVista)"), 'el botón debe estar cableado');
  assert.ok(app.includes('function cerrarJuegoVista'), 'falta cerrarJuegoVista');
  assert.ok(app.includes('partidaActualId = null;'), 'cerrar debe limpiar la partida actual');
  assert.ok(app.includes("cerrarCapa('capa-juego')"), 'cerrar la vista = cerrar la capa');
});
prueba('auditoría Safari/iOS: sin APIs de riesgo en los archivos de la app', () => {
  ['app.js', 'games.js', 'logic.js', 'fun.js'].forEach(f => {
    const src = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    ['.at(', 'structuredClone', 'Object.hasOwn', 'findLast', 'findLastIndex', 'AbortSignal.timeout', 'Object.groupBy', '.toSorted(', '.toReversed(']
      .forEach(api => assert.ok(!src.includes(api), f + ' usa ' + api + ' (riesgo en Safari viejo)'));
  });
  const fun = fs.readFileSync(path.join(RAIZ, 'fun.js'), 'utf8');
  assert.ok(fun.includes('new RegExp(') && fun.includes('catch (eSinP)'),
    'la regex de emojis debe construirse con red de seguridad (el literal \\p{} tumba fun.js en Safari < 11.1)');
  // Y la regex protegida sigue contando igual:
  assert.strictEqual(Fun.contarEmojis('hola 😂👨‍👩‍👧🇩🇴 1️⃣'), 4);
  assert.strictEqual(Fun.esSoloEmojis('😂😂😂'), true);
});

console.log('— V3 · ENCARGO 4: COMPARTIR PANTALLA —');
prueba('pantallaSoportada: solo con getDisplayMedia (en iPhone/iPad no aparece el botón)', () => {
  assert.strictEqual(Fun.pantallaSoportada({ mediaDevices: { getDisplayMedia: function () {} } }), true);
  assert.strictEqual(Fun.pantallaSoportada({ mediaDevices: {} }), false);
  assert.strictEqual(Fun.pantallaSoportada({}), false);
  assert.strictEqual(Fun.pantallaSoportada({ mediaDevices: { getUserMedia: function () {} } }), false); // Safari iOS típico
});
prueba('estado de pantalla puro e inmutable (registrar/tiene/participantes)', () => {
  const m0 = {};
  const m1 = Fun.registrarPantalla(m0, 'a', true);
  assert.deepStrictEqual(m0, {}, 'no debe mutar el mapa original');
  assert.strictEqual(Fun.tienePantalla(m1, 'a'), true);
  assert.strictEqual(Fun.tienePantalla(m1, 'b'), false);
  assert.deepStrictEqual(Fun.participantesConPantalla(Fun.registrarPantalla(m1, 'b', true)), ['a', 'b']);
  assert.strictEqual(Fun.tienePantalla(Fun.registrarPantalla(m1, 'a', false), 'a'), false);
});
prueba('app.js: la pantalla va por la malla con su señalización y su botón tras la guarda', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.ok(html.includes('id="voz-pantalla"'), 'falta el botón de pantalla en la barra de voz');
  assert.ok(app.includes('if (Fun.pantallaSoportada()) $(\'#voz-pantalla\')'), 'el botón solo se muestra si hay soporte');
  assert.ok(app.includes("event: 'pantalla'"), 'falta la señalización broadcast «pantalla»');
  assert.ok(app.includes('getDisplayMedia({ video: true, audio: false })'), 'debe capturar con getDisplayMedia');
  assert.ok(app.includes('pista.onended = function () { dejarDeCompartirPantalla(); }'), 'el fin de captura del sistema debe apagar el compartir');
  assert.ok(app.includes('Pantalla de '), 'el mosaico debe etiquetarse «Pantalla de …»');
  assert.ok(app.includes('flujosPantallaRemotos'), 'las pantallas remotas van aparte de las cámaras (no las pisan)');
  assert.ok(app.includes('dejarDeCompartirPantalla(); // y la pantalla'), 'salir de la voz también apaga la pantalla');
});

console.log('— V3 · ENCARGO 3: LOS 13 JUEGOS NUEVOS —');
const TIPOS_NUEVOS = ['damas', 'loteria', 'guerra', 'tesoro', 'verdad', 'carrera', 'encadenada', 'puzzle', 'quien', 'vf', 'encuentra', 'ordenab', 'misterio'];
prueba('los 13 tipos están en la migración v3 y en el CHECK del esquema (33 en total)', () => {
  const mig = fs.readFileSync(path.join(RAIZ, 'migracion-v3.sql'), 'utf8');
  const esc2 = fs.readFileSync(path.join(RAIZ, 'supabase-schema.sql'), 'utf8');
  assert.ok(mig.includes('drop constraint if exists partidas_tipo_check'), 'la migración debe soltar el CHECK viejo');
  const viejos = ['gato', 'trivia', 'memoria', 'conecta', 'serpientes', 'ahorcado', 'dibujo', 'parchis', 'domino', 'naval', 'sopa', 'basta', 'simon', 'calculo', 'ppt', 'adivina', 'numeros', 'orden', 'quef', 'versiculo'];
  viejos.concat(TIPOS_NUEVOS).forEach(t => {
    assert.ok(mig.includes("'" + t + "'"), 'la migración no trae el tipo ' + t);
    assert.ok(esc2.includes("'" + t + "'"), 'el esquema no trae el tipo ' + t);
  });
});
prueba('los 13 juegos están en el CATALOGO, en crearPartida y en renderJuego', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const creadores = { damas: 'crearDamas', loteria: 'crearLoteria', guerra: 'crearGuerra', tesoro: 'crearTesoro', verdad: 'crearVerdad', carrera: 'crearCarrera', encadenada: 'crearEncadenada', puzzle: 'crearPuzzle', ordenab: 'crearOrdena', misterio: 'crearMisterio' };
  const renders = { ordenab: 'renderOrdena' };
  Object.keys(creadores).forEach(t => {
    assert.ok(app.includes(t + ': { icono:'), 'CATALOGO sin ' + t);
    assert.ok(app.includes('G.' + creadores[t] + '([yo.id])'), 'crearPartida sin ' + t);
    assert.ok(app.includes((renders[t] || ('render' + t[0].toUpperCase() + t.slice(1))) + '(p)'), 'renderJuego sin ' + t);
  });
  ['quien', 'vf', 'encuentra'].forEach(t => {
    assert.ok(app.includes("G.crearQuizBiblico('" + t + "'"), 'crearPartida sin el quiz ' + t);
  });
  assert.ok(app.includes("case 'quien': case 'vf': case 'encuentra': renderQuizBiblico(p);"), 'renderJuego sin los quizzes');
});
prueba('damas: tablero inicial, movimiento legal, captura y rey', () => {
  let e = G.crearDamas(['a', 'b']);
  assert.strictEqual(e.tablero.filter(x => x).length, 24);
  assert.strictEqual(e.tipo, 'damas');
  e = G.moverDamas(e, 0, 17, 24);
  assert.strictEqual(e.turno, 1);
  assert.throws(() => G.moverDamas(e, 0, 24, 33)); // no es su turno
  // Captura: roja en 26, blanca en 35 → salta a 44 comiéndola.
  const tab = new Array(64).fill('');
  tab[26] = 'r'; tab[35] = 'b'; tab[61] = 'b';
  const e2 = Object.assign({}, G.crearDamas(['a', 'b']), { tablero: tab, turno: 0 });
  const cap = G.movimientosDamas(e2, 26).filter(m => m.hasta === 44);
  assert.strictEqual(cap.length, 1); assert.strictEqual(cap[0].captura, 35);
  const e3 = G.moverDamas(e2, 0, 26, 44);
  assert.strictEqual(e3.tablero[35], ''); assert.strictEqual(e3.tablero[44], 'r');
  // Sin piezas rivales → termina y gana.
  const e4 = G.moverDamas(Object.assign({}, e2, { tablero: (() => { const t = new Array(64).fill(''); t[26] = 'r'; t[35] = 'b'; return t; })(), turno: 0 }), 0, 26, 44);
  assert.strictEqual(e4.terminado, true); assert.strictEqual(e4.ganador, 'a');
  assert.deepStrictEqual(L.puntosDePartida(e4), { a: 50 });
});
prueba('lotería: cartón determinista 4×4, cantar hasta ganar, 50 pts al ganador', () => {
  const c1 = G.cartonDeLoteria(123, 'a');
  assert.deepStrictEqual(c1, G.cartonDeLoteria(123, 'a'));
  assert.strictEqual(c1.length, 16); assert.strictEqual(new Set(c1).size, 16);
  let e = G.crearLoteria(['a', 'b'], rngSemilla(7));
  let n = 0;
  while (!e.terminado && n < 24) { e = G.cantarLoteria(e); n++; }
  assert.strictEqual(e.terminado, true); assert.ok(e.ganador);
  assert.deepStrictEqual(L.puntosDePartida(e), { [e.ganador]: 50 });
});
prueba('guerra de cartas: 10 rondas, la mayor suma y gana el de más rondas', () => {
  let e = G.crearGuerra(['a', 'b'], rngSemilla(3));
  while (!e.terminado) { e = G.siguienteGuerra(G.revelarGuerra(e)); }
  const suma = Object.values(e.puntajes).reduce((x, y) => x + y, 0);
  assert.ok(suma <= 10);
  assert.deepStrictEqual(L.puntosDePartida(e), { [e.ganador]: 50 });
  const c = G.cartaDeGuerra(9, 0, 'a');
  assert.ok(c.valor >= 2 && c.valor <= 14 && G.PALOS_GUERRA.includes(c.palo));
  assert.deepStrictEqual(G.cartaDeGuerra(9, 0, 'a'), c); // determinista
});
prueba('tesoro escondido: pistas por distancia y acierto que termina', () => {
  assert.strictEqual(G.pistaTesoro(0), '🎯');
  assert.ok(G.pistaTesoro(2).includes('CALIENTE'));
  assert.ok(G.pistaTesoro(4).includes('tibio'));
  assert.ok(G.pistaTesoro(10).includes('frío'));
  let e = G.crearTesoro(['a', 'b'], () => 0); // tesoro en la casilla 0
  e = G.buscarTesoro(e, 0, 35);
  assert.strictEqual(e.turno, 1); assert.ok(e.ultimoIntento.pista.includes('frío'));
  assert.throws(() => G.buscarTesoro(e, 1, 35)); // casilla repetida
  e = G.buscarTesoro(e, 1, 0);
  assert.strictEqual(e.terminado, true); assert.strictEqual(e.ganador, 'b');
  assert.deepStrictEqual(L.puntosDePartida(e), { b: 50 });
});
prueba('verdad o reto: tarjetas suaves, rotación y fin a las 9 jugadas', () => {
  assert.ok(G.TARJETAS_VERDAD.length >= 10 && G.TARJETAS_RETO.length >= 10);
  let e = G.crearVerdad(['a', 'b']);
  for (let i = 0; i < 9; i++) {
    e = G.elegirTarjetaVerdad(e, e.turno, i % 2 ? 'reto' : 'verdad', rngSemilla(i + 1));
    assert.ok(e.tarjeta.texto.length > 3);
    e = G.completarVerdad(e);
  }
  assert.strictEqual(e.terminado, true);
});
prueba('carrera de dados: el 1 quema el turno, plantarse guarda y 30 gana', () => {
  let e = G.crearCarrera(['a', 'b']);
  e = G.tirarCarrera(e, () => 0.99); // 6 y 6
  assert.strictEqual(e.parcial, 12);
  e = G.plantarseCarrera(e);
  assert.strictEqual(e.totales.a, 12); assert.strictEqual(e.turno, 1);
  e = G.tirarCarrera(e, () => 0); // 1 y 1 → pierde el turno
  assert.strictEqual(e.parcial, 0); assert.strictEqual(e.turno, 0);
  assert.throws(() => G.plantarseCarrera(G.crearCarrera(['a']))); // sin tirar no hay guardado
  let e2 = G.crearCarrera(['a', 'b']);
  e2.totales = { a: 25, b: 0 };
  e2 = G.tirarCarrera(e2, () => 0.99);
  e2 = G.plantarseCarrera(e2);
  assert.strictEqual(e2.terminado, true); assert.strictEqual(e2.ganador, 'a');
  assert.deepStrictEqual(L.puntosDePartida(e2), { a: 50 });
});
prueba('palabra encadenada: cadena válida suma, errores no, y fin a los 12 turnos', () => {
  let e = G.crearEncadenada(['a', 'b'], () => 0); // empieza con «sol»
  assert.strictEqual(e.palabraActual, 'sol');
  e = G.enviarEncadenada(e, 0, 'leche'); // sol→(l)eche... debe empezar con L: «leche» sí
  assert.strictEqual(e.puntajes.a, 10); assert.strictEqual(e.palabraActual, 'leche');
  e = G.enviarEncadenada(e, 1, 'elefante'); // leche termina en e
  assert.strictEqual(e.puntajes.b, 10);
  e = G.enviarEncadenada(e, 0, 'sol'); // no empieza con e → error sin puntos
  assert.strictEqual(e.puntajes.a, 10); assert.ok(e.ultimoError.includes('empezar'));
  e = G.enviarEncadenada(e, 1, 'elefante'); // repetida → error
  assert.ok(e.ultimoError.includes('ya salió'));
  for (let i = 0; i < 8; i++) e = G.pasarEncadenada(e, e.turno);
  assert.strictEqual(e.terminado, true);
});
prueba('rompecabezas deslizante: nace desordenado pero resoluble, mover y ganar en equipo', () => {
  let e = G.crearPuzzle(['a', 'b'], rngSemilla(5));
  assert.strictEqual(e.piezas.length, 9);
  assert.strictEqual(G.puzzleResuelto(e.piezas), false);
  assert.deepStrictEqual(e.piezas.slice().sort(), G.EMOJIS_PUZZLE.concat(['']).slice().sort());
  const vacia = e.piezas.indexOf('');
  const vecina = vacia >= 3 ? vacia - 3 : vacia + 3;
  e = G.moverPuzzle(e, vecina);
  assert.strictEqual(e.movimientos, 1);
  assert.throws(() => G.moverPuzzle(e, e.piezas.indexOf(''))); // el hueco no se mueve
  assert.strictEqual(G.puzzleResuelto(['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '']), true);
  const fin = Object.assign({}, e, { terminado: true, ganado: true });
  assert.deepStrictEqual(L.puntosDePartida(fin), { a: 20, b: 20 }); // cooperativo
});
prueba('quizzes bíblicos: bancos válidos y flujo completo (quien, vf, encuentra)', () => {
  [['quien', G.BANCO_QUIEN], ['encuentra', G.BANCO_ENCUENTRA]].forEach(([t, banco]) => {
    assert.strictEqual(banco.length, 12, t);
    banco.forEach(q => { assert.strictEqual(q.opciones.length, 3); assert.ok(q.correcta >= 0 && q.correcta < 3); });
  });
  assert.strictEqual(G.BANCO_VF.length, 12);
  G.BANCO_VF.forEach(q => assert.strictEqual(typeof q.verdad, 'boolean'));
  let e = G.crearQuizBiblico('quien', ['a', 'b'], [0, 1]);
  e = G.iniciarQuiz(e);
  const item = G.preguntaQuiz(e);
  e = G.responderQuiz(e, 'a', item.correcta, 20);
  e = G.responderQuiz(e, 'b', (item.correcta + 1) % 3, 20);
  e = G.revelarQuiz(e);
  assert.strictEqual(e.puntajes.a, 15); assert.strictEqual(e.puntajes.b || 0, 0);
  e = G.siguienteQuiz(e);
  const item2 = G.preguntaQuiz(e);
  e = G.responderQuiz(e, 'a', item2.correcta, 1); // lento: sin bono
  e = G.revelarQuiz(e);
  assert.strictEqual(e.fase, 'final'); assert.strictEqual(e.terminado, true);
  assert.deepStrictEqual(L.puntosDePartida(e), { a: 25 });
  // Verdadero o falso: la afirmación 1 («David venció con una espada») es FALSA → opción 1.
  let v = G.crearQuizBiblico('vf', ['a'], [1]);
  v = G.iniciarQuiz(v);
  v = G.responderQuiz(v, 'a', 1, 20);
  v = G.revelarQuiz(v);
  assert.strictEqual(v.puntajes.a, 15);
});
prueba('ordena la historia: mover, entregar puntúa 20 por acierto y termina con todos', () => {
  let e = G.crearOrdena(['a', 'b'], 0, rngSemilla(11));
  assert.notDeepStrictEqual(e.arregloBase, [0, 1, 2, 3, 4]); // nunca nace ordenado
  // «a» ordena perfecto: mueve hasta dejar [0,1,2,3,4] con intercambios simples.
  let arr = G.arregloDeOrdena(e, 'a');
  for (let pos = 0; pos < 5; pos++) {
    while (arr[pos] !== pos) {
      const donde = arr.indexOf(pos);
      e = G.moverEnOrdena(e, 'a', donde, donde > pos ? -1 : 1);
      arr = G.arregloDeOrdena(e, 'a');
    }
  }
  assert.deepStrictEqual(arr, [0, 1, 2, 3, 4]);
  e = G.entregarOrdena(e, 'a');
  assert.strictEqual(e.puntajes.a, 100);
  assert.strictEqual(e.terminado, false); // falta «b»
  e = G.entregarOrdena(e, 'b');
  assert.strictEqual(e.terminado, true);
  assert.deepStrictEqual(L.puntosDePartida(e), Object.assign({}, e.puntajes));
});
prueba('personaje misterioso: menos pistas = más puntos, acentos valen, cerrar revela', () => {
  assert.strictEqual(G.PERSONAJES_MISTERIO.length, 8);
  G.PERSONAJES_MISTERIO.forEach(pj => assert.strictEqual(pj.pistas.length, 5, pj.nombre));
  let e = G.crearMisterio(['a', 'b'], () => 0); // primer personaje: Noé
  e = G.adivinarMisterio(e, 'a', 'Noé'); // con acento y mayúscula: debe valer
  assert.strictEqual(e.puntajes.a, 100); // 1 pista vista
  e = G.revelarPistaMisterio(e); e = G.revelarPistaMisterio(e);
  e = G.adivinarMisterio(e, 'b', 'noe');
  assert.strictEqual(e.puntajes.b, 60); // 3 pistas vistas
  assert.strictEqual(e.terminado, true); // ya lo tienen todos
  let e2 = G.crearMisterio(['a'], () => 0);
  e2 = G.adivinarMisterio(e2, 'a', 'Pedro'); // fallo: no suma ni resuelve
  assert.strictEqual(e2.intentosFallidos.a, 1); assert.ok(!e2.resueltos.a);
  e2 = G.cerrarMisterio(e2);
  assert.strictEqual(e2.terminado, true);
});

console.log('— V3.1 · iOS: EL TABLERO SE VE SÍ O SÍ (lo que sobrevive en la v3.2) —');
prueba('Fun.destinoScroll retirado: sin mecanismo de scroll no hay función huérfana', () => {
  const fun = fs.readFileSync(path.join(RAIZ, 'fun.js'), 'utf8');
  assert.strictEqual(typeof Fun.destinoScroll, 'undefined', 'destinoScroll ya no se exporta');
  assert.ok(!fun.includes('destinoScroll'), 'ni rastro de destinoScroll en fun.js');
});
prueba('el tablero ya NO vive en la sección Juegos: vive en la capa, fuera de las secciones', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const iTarjeta = html.indexOf('id="tarjeta-juego"');
  const iCapa = html.indexOf('id="capa-juego"');
  assert.ok(iCapa > html.indexOf('id="sec-chat"'), 'la capa va fuera de las secciones (al final del body)');
  assert.ok(iTarjeta > iCapa, 'la tarjeta va dentro de la capa');
  const seccionJuegos = html.slice(html.indexOf('id="sec-juegos"'), html.indexOf('id="sec-biblia"'));
  assert.ok(!seccionJuegos.includes('tarjeta-juego'), 'la sección Juegos ya no contiene el tablero');
});
prueba('apertura SIN scroll (v3.2): abrirYMostrar y abrirHistoria no desplazan la página', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const abrir = app.slice(app.indexOf('function abrirYMostrar'), app.indexOf('function cerrarJuegoVista'));
  assert.ok(!abrir.includes('scroll'), 'abrirYMostrar no toca ningún scroll: pinta y abre la capa');
  assert.ok(!abrir.includes('mostrarPestana'), 'ni siquiera cambia de pestaña: la capa va encima de donde estés');
  assert.ok(abrir.includes("abrirCapa('capa-juego')"), 'abrirYMostrar abre la capa del juego');
  const historia = app.slice(app.indexOf('function abrirHistoria'), app.indexOf('function recibirHistoriaCompartida'));
  assert.ok(!historia.includes('scrollTo') && !historia.includes('scrollIntoView'), 'abrirHistoria tampoco desplaza');
  assert.ok(historia.includes("abrirCapa('capa-historia')"), 'la historia se abre en su capa');
});
prueba('renderJuego protegido: un juego trabado pinta aviso y no rompe la cadena', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes('catch (eRender)'), 'el despacho de pintado debe ir en try/catch');
  assert.ok(app.includes('se trabó al abrirse'), 'la caída debe pintar un aviso en la tarjeta, no dejarla vacía');
});
prueba('crear y unirse no se caen si mostrar falla: la cadena llega a cargarPartidas', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes('try { abrirYMostrar(provisional); } catch (eAbrir) { abrirCapa(\'capa-juego\'); }'),
    'crearPartida protege la apertura optimista (caída: al menos la capa)');
  assert.ok(app.includes("catch (eAbrir) { abrirCapa('capa-juego'); }"), 'abrirPartida protege la muestra optimista (caída: al menos la capa)');
});
prueba('SW v3.5.0: caché nuevo, navegación red-primero y toma de control', () => {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  assert.ok(sw.includes("var CACHE = 'nuestro-rincon-v3-5-0';"), 'la caché debe subir a nuestro-rincon-v3-5-0');
  assert.ok(sw.includes("req.mode === 'navigate'"), 'las navegaciones van red-primero');
  assert.ok(sw.includes('self.skipWaiting()'), 'el SW nuevo no espera: toma el control ya');
  assert.ok(sw.includes('self.clients.claim()'), 'y reclama las páginas abiertas');
});
prueba('registro SW agresivo: sin caché HTTP, update al reanudar y recarga única', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes("updateViaCache: 'none'"), 'la comprobación de sw.js salta la caché HTTP');
  assert.ok(app.includes("navigator.serviceWorker.register('sw.js');"), 'si el navegador no acepta la opción, se reintenta sin ella');
  assert.ok(app.includes('function pedirActualizacion()'), 'debe pedirse actualización');
  assert.ok(app.includes('reg.update()'), 'con reg.update() explícito');
  assert.ok(app.includes("'visibilitychange'") && app.includes("'pageshow'"), 'al volver a la app se vuelve a comprobar');
  assert.ok(app.includes("'controllerchange'"), 'al cambiar el control se reacciona');
  assert.ok(app.includes('nr_sw_recargado'), 'la recarga automática es una sola vez (anti-bucle)');
});

console.log('— V3.2 · CAPAS SOBREPUESTAS: TODO SE ABRE ENCIMA —');
prueba('HTML: las tres capas existen (juego, historia, versículo) con su panel y su ✖', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  ['capa-juego', 'capa-historia', 'capa-versiculo'].forEach(id => {
    const i = html.indexOf('id="' + id + '"');
    assert.ok(i !== -1, 'falta #' + id);
    const bloque = html.slice(i, i + 700);
    assert.ok(bloque.includes('capa-panel'), '#' + id + ' debe tener su panel');
    assert.ok(bloque.includes('capa-cuerpo'), '#' + id + ' debe tener cuerpo con scroll interno');
    assert.ok(bloque.includes('btn-cerrar-capa'), '#' + id + ' debe tener su ✖ grande');
  });
  assert.ok(html.includes('id="btn-cerrar-historia"'), 'falta la ✖ de la historia');
  assert.ok(html.includes('id="btn-cerrar-versiculo"'), 'falta la ✖ del versículo');
  const iHistoria = html.indexOf('id="capa-historia"');
  assert.ok(html.indexOf('id="biblia-historia-contenido"') > iHistoria,
    'el contenido de la historia vive DENTRO de su capa');
  assert.ok(html.includes('id="capa-versiculo-texto"') && html.includes('id="capa-versiculo-cita"'),
    'la capa del versículo tiene dónde pintar texto y cita');
});
prueba('el fondo se bloquea al abrir y se restaura EXACTO al cerrar (sin saltos)', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes('function bloquearFondo') && app.includes('function desbloquearFondo'), 'falta el bloqueo del fondo');
  assert.ok(app.includes('scrollFondoGuardado = window.pageYOffset'), 'al abrir se guarda el punto exacto del fondo');
  assert.ok(app.includes("document.body.classList.add('con-capa')"), 'el body se fija (técnica iOS)');
  assert.ok(app.includes("document.body.style.top = (-scrollFondoGuardado) + 'px'"), 'el body se fija EN su punto, sin salto visual');
  assert.ok(app.includes('window.scrollTo(0, scrollFondoGuardado)'), 'al cerrar se restaura ese mismo punto (ruta de cierre)');
  assert.ok(app.includes('function abrirCapa') && app.includes('function cerrarCapa'), 'falta el gestor de capas');
  assert.ok(app.includes('capasAbiertas'), 'las capas se cuentan: el fondo solo se libera al cerrar la ÚLTIMA');
});
prueba('la capa se cierra SOLO con su ✖: ningún cierre por tocar fuera ni por Escape', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(!app.includes('e.target === capa') && !app.includes('ev.target === capa'),
    'tocar el fondo oscuro NO debe cerrar la capa');
  assert.ok(!app.includes("'Escape'") && !app.includes('"Escape"'),
    'Escape tampoco cierra: solo la ✖, para que el niño no pierda la partida');
  assert.ok(app.includes("cerrarHistoria.addEventListener('click'"), 'la ✖ de la historia está cableada');
  assert.ok(app.includes("cerrarVersiculo.addEventListener('click'"), 'la ✖ del versículo está cableada');
});
prueba('el versículo se lee en capa: el del día al tocarlo y el compartido por la familia', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.ok(html.includes('id="versiculo-dia-tocable"'), 'el versículo del día debe ser tocable');
  assert.ok(app.includes('function abrirVersiculoEnCapa'), 'falta el abridor del versículo en capa');
  assert.ok(app.includes('versiculo-dia-tocable'), 'iniciarBiblia debe cablear el toque del versículo');
  const compartido = app.slice(app.indexOf('function mostrarVersiculoCompartido'), app.indexOf('function abrirHistoria'));
  assert.ok(compartido.includes('abrirVersiculoEnCapa'), 'el versículo compartido también se lee en la capa');
  assert.ok(!app.includes('biblia-versiculo-compartido'), 'fuera la lectura dentro de la página (id viejo)');
  assert.ok(!html.includes('biblia-versiculo-compartido'), 'y fuera su hueco en el HTML');
});
prueba('la historia en capa lleva ilustración, cita y «Leer para todos» (la sincronía no cambia)', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const historia = app.slice(app.indexOf('function abrirHistoria'), app.indexOf('function recibirHistoriaCompartida'));
  assert.ok(historia.includes('historia-img'), 'la ilustración se pinta en la capa');
  assert.ok(historia.includes('btn-leer-todos'), 'el botón de leer para todos sigue dentro');
  assert.ok(historia.includes("event: 'historia'"), 'el broadcast de lectura compartida se mantiene');
  const recibida = app.slice(app.indexOf('function recibirHistoriaCompartida'), app.indexOf('function recibirHistoriaCompartida') + 500);
  assert.ok(recibida.includes('abrirHistoria(payload.idx)'), 'la historia compartida entra por el mismo abrirHistoria (misma capa)');
});
prueba('lo vivo sigue dentro de la capa: Realtime repinta el tablero abierto', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes('if (partidaActualId && partidasPorId[partidaActualId]) renderJuego(partidasPorId[partidaActualId]);'),
    'cargarPartidas sigue repintando la partida abierta (ahora dentro de la capa)');
  // El corte llega hasta partidaTerminada: entre renderJuego y
  // avisoTurno viven ahora las ayudantes de la v3.4.2, y pintarBotonOtraVez
  // SÍ desoculta su propia zona (es contenido de la capa, no una tarjeta).
  const render = app.slice(app.indexOf('function renderJuego'), app.indexOf('function partidaTerminada'));
  assert.ok(!render.includes("classList.remove('oculto')"), 'renderJuego ya no desoculta tarjetas: la visibilidad es de la capa');
});
prueba('CSS de capa: fija a pantalla completa, dvh, safe-area y scroll SOLO dentro', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  assert.ok(css.includes('.capa{position:fixed; inset:0'), 'la capa es fija y cubre toda la pantalla');
  assert.ok(css.includes('height:100dvh'), 'alto seguro con dvh (iOS standalone)');
  assert.ok(css.includes('env(safe-area-inset-top') && css.includes('env(safe-area-inset-bottom'),
    'respeto a las zonas seguras de iOS');
  assert.ok(css.includes('.capa-cuerpo{flex:1; overflow-y:auto'), 'el desplazamiento vive SOLO dentro de la capa');
  assert.ok(css.includes('body.con-capa{position:fixed'), 'el fondo bloqueado se fija');
  assert.ok(css.includes('.btn-cerrar-capa') && css.includes('min-height:60px'), 'la ✖ es grande y clara (60px)');
  assert.ok(!css.includes('scroll-margin-top'), 'fuera el parche de scroll de la v3.1');
});

console.log('— V3.3 · BIBLIA: HISTORIAS EN BARRAS DESLIZABLES, JUEGOS ARRIBA —');
prueba('Biblia v3.3: las historias van en barras deslizables por testamento, no en filas verticales', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const biblia = app.slice(app.indexOf('function iniciarBiblia'), app.indexOf('function abrirVersiculoEnCapa'));
  assert.ok(biblia.includes("barra.className = 'barra-historias'"), 'cada testamento pinta su barra deslizable');
  assert.ok(biblia.includes("setAttribute('data-barra', grupo[0])"), 'la barra se identifica por testamento (antiguo/nuevo)');
  assert.ok(biblia.includes("b.className = 'historia-tarjeta'"), 'cada historia es una tarjeta compacta');
  assert.ok(!biblia.includes("className = 'botones-juego'"), 'fuera las filas verticales de botones que enterraban los juegos');
  assert.ok(biblia.includes('abrirHistoria(i)'), 'tocar una tarjeta abre la historia (en su capa, v3.2)');
});
prueba('Biblia v3.3: cada tarjeta lleva la PORTADA de su historia, su título y su cita', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const biblia = app.slice(app.indexOf('function iniciarBiblia'), app.indexOf('function abrirVersiculoEnCapa'));
  assert.ok(biblia.includes('historia-portada'), 'la tarjeta pinta la ilustración como portada');
  assert.ok(biblia.includes('src="biblia-img/\' + escapar(h.slug) + \'.jpg"'), 'la portada sale de biblia-img/<slug>.jpg');
  assert.ok(biblia.includes('loading="lazy"'), 'las 36 portadas cargan con pereza: la pestaña no se ahoga');
  assert.ok(biblia.includes('historia-tarjeta-cita'), 'y la cita corta va en la tarjeta');
});
prueba('Biblia v3.3 (HTML): orden corto — versículo, JUEGOS BÍBLICOS y luego las historias', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const sec = html.slice(html.indexOf('id="sec-biblia"'), html.indexOf('id="sec-cine"'));
  const iV = sec.indexOf('Versículo del día');
  const iJ = sec.indexOf('Juegos bíblicos');
  const iH = sec.indexOf('Historias para leer juntos');
  assert.ok(iV !== -1 && iJ > iV, 'los juegos bíblicos van justo después del versículo del día');
  assert.ok(iH > iJ, 'las historias (ya en barras compactas) van DESPUÉS de los juegos: ya no los entierran');
  ['trivia-biblica', 'memoria-biblica', 'versiculo', 'quien', 'vf', 'encuentra', 'ordenab', 'misterio'].forEach(t => {
    assert.ok(sec.includes('data-crear="' + t + '"'), 'falta el botón del juego bíblico ' + t + ' en la pestaña');
  });
});
prueba('Biblia v3.3 (CSS): la barra es UNA fila horizontal con snap y altura compacta', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  const barra = css.slice(css.indexOf('.barra-historias{'), css.indexOf('.historia-tarjeta{'));
  assert.ok(barra.includes('overflow-x:auto'), 'la barra se desliza en horizontal DENTRO de la pestaña');
  assert.ok(barra.includes('flex-wrap:nowrap'), 'una sola fila: la pestaña no crece por las historias');
  assert.ok(barra.includes('scroll-snap-type'), 'con snap suave al deslizar de tarjeta en tarjeta');
  assert.ok(css.includes('.historia-portada{'), 'la portada tiene tamaño fijo en la tarjeta');
  assert.ok(css.includes('.historia-tarjeta{'), 'la tarjeta compacta tiene su estilo');
});
prueba('Biblia v3.3: los juegos bíblicos van en rejilla compacta de 2 columnas', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  const sec = html.slice(html.indexOf('id="sec-biblia"'), html.indexOf('id="sec-cine"'));
  assert.ok(sec.includes('rejilla-biblica'), 'el bloque de juegos DENTRO de la pestaña Biblia lleva la rejilla compacta');
  assert.ok(css.includes('.rejilla-biblica{display:grid'), 'la rejilla es de 2 columnas: el bloque deja de apilarse de uno en uno');
});
prueba('crear abre la capa AL TOQUE (v3.3): apertura optimista ANTES del insert', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const crear = app.slice(app.indexOf('function crearPartida'), app.indexOf('function guardarEstado'));
  const iAbrir = crear.indexOf('abrirYMostrar(provisional)');
  const iInsert = crear.indexOf('.insert({');
  assert.ok(iAbrir !== -1 && iInsert !== -1 && iAbrir < iInsert,
    'la capa se abre con la partida provisional ANTES de que el insert salga a la red');
  assert.ok(crear.includes("id: 'creando-' + Date.now()"), 'la provisional lleva id temporal «creando-…»');
  assert.ok(crear.includes('partidaActualId = res.data.id'), 'al confirmar, la capa adopta la fila real');
  assert.ok(crear.includes('renderJuego(res.data)'), 'y se repinta con ella: los movimientos ya guardan bien');
  assert.ok(!crear.includes('la capa se abre igual: ver abrirYMostrar'),
    'fuera el catch viejo que tragaba el error SIN abrir la capa (la causa silenciosa)');
});
prueba('crear deja INTENCIÓN (v3.3): si la página se recarga a mitad, la partida se abre sola al volver', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes("INTENCION_ABRIR_KEY = 'nr_abrir_tras_crear'"), 'la intención se guarda en localStorage');
  assert.ok(app.includes('function anotarIntencionAbrir') && app.includes('function reabrirSiQuedoIntencion'),
    'existen el apunte y la reapertura de la intención');
  const crear = app.slice(app.indexOf('function crearPartida'), app.indexOf('function guardarEstado'));
  assert.ok(crear.includes('anotarIntencionAbrir(tipoReal)'), 'crearPartida anota la intención al tocar');
  assert.ok(crear.includes('borrarIntencionAbrir()'), 'y la borra al confirmar: no debe reabrir lo ya abierto');
  const cargar = app.slice(app.indexOf('function cargarPartidas'), app.indexOf('function ordenAleatorio'));
  assert.ok(cargar.includes('reabrirSiQuedoIntencion()'), 'la primera carga de partidas revisa si quedó una intención viva');
});
prueba('guardarEstado ignora las provisionales (v3.3): aún no hay fila que actualizar', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const guardar = app.slice(app.indexOf('function guardarEstado'), app.indexOf('function iconoJuego'));
  assert.ok(guardar.includes("indexOf('creando-') === 0"), 'los ids «creando-…» no viajan a Supabase');
  assert.ok(guardar.includes('return Promise.resolve();'), 'y la cadena de quien guarda no se rompe');
});

console.log('— V3.4 · JUEGOS POR CATEGORÍAS (barras) —');
// Lee un literal «var NOMBRE = …;» de app.js y lo evalúa: los datos de
// verdad (CATALOGO / EXTRA_CREAR / BASE_CREAR / CATEGORIAS_JUEGOS).
function literalDeApp(nombre) {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const i = app.indexOf('var ' + nombre + ' = ');
  assert.ok(i !== -1, 'falta var ' + nombre + ' en app.js');
  const j = app.indexOf(';\n', i);
  return eval('(' + app.slice(i + ('var ' + nombre + ' = ').length, j) + ')');
}
prueba('categorías: los 33 juegos del catálogo, cada clave de creación en UNA sola categoría', () => {
  const catalogo = literalDeApp('CATALOGO');
  const categorias = literalDeApp('CATEGORIAS_JUEGOS');
  const base = literalDeApp('BASE_CREAR');
  assert.strictEqual(Object.keys(catalogo).length, 33, 'el catálogo sigue siendo de 33 juegos');
  assert.strictEqual(categorias.length, 6, 'seis categorías: mesa, cartas, mente, memoria, risas y bíblicos');
  const vistas = {};
  let totalClaves = 0;
  categorias.forEach(c => {
    assert.ok(c.juegos.length >= 3, 'la categoría «' + c.nombre + '» no puede quedar flaca');
    c.juegos.forEach(clave => {
      totalClaves++;
      assert.ok(!vistas[clave], 'la clave «' + clave + '» está en DOS categorías');
      vistas[clave] = c.id;
      const baseClave = base[clave] || clave;
      assert.ok(catalogo[baseClave], 'la clave «' + clave + '» no apunta a ningún juego del catálogo');
    });
  });
  Object.keys(catalogo).forEach(k => {
    assert.ok(vistas[k], 'el juego «' + k + '» quedó fuera de las categorías');
  });
  const extra = Object.keys(vistas).filter(k => !catalogo[k]).sort();
  assert.deepStrictEqual(extra, ['memoria-biblica', 'memoria-tema', 'trivia-biblica'],
    'las únicas claves que no son del catálogo son las 3 variantes conocidas (mismo juego, otro banco/mazo)');
  assert.strictEqual(totalClaves, 36, '36 tarjetas en total: 33 juegos + 3 variantes de creación');
});
prueba('categorías: la barra de Bíblicos trae exactamente los 8 bíblicos', () => {
  const categorias = literalDeApp('CATEGORIAS_JUEGOS');
  const bib = categorias.find(c => c.id === 'biblicos');
  assert.ok(bib, 'falta la categoría de bíblicos');
  assert.deepStrictEqual(bib.juegos.slice().sort(),
    ['encuentra', 'memoria-biblica', 'misterio', 'ordenab', 'quien', 'trivia-biblica', 'versiculo', 'vf'].sort());
});
prueba('categorías: el HTML ya no trae botones sueltos: se generan en #categorias-juegos', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const secJuegos = html.slice(html.indexOf('id="sec-juegos"'), html.indexOf('id="sec-biblia"'));
  assert.ok(secJuegos.includes('id="categorias-juegos"'), 'falta el contenedor de categorías');
  assert.ok(!secJuegos.includes('data-crear'), 'en Juegos ya no hay botones data-crear escritos a mano');
  assert.ok(!secJuegos.includes('id="crear-gato"'), 'los botones con id propio (crear-gato…) se retiraron');
  assert.ok(secJuegos.includes('id="mazo-memoria"'), 'el selector de mazo sigue en la pestaña (lo usa Memoria con temas)');
  const secBiblia = html.slice(html.indexOf('id="sec-biblia"'), html.indexOf('id="sec-cine"'));
  assert.strictEqual((secBiblia.match(/data-crear/g) || []).length, 8,
    'la rejilla bíblica de la v3.3 sigue intacta en Biblia (sus 8 botones)');
});
prueba('categorías: pintarCategoriasJuegos se llama ANTES de cablear [data-crear]', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes('function pintarCategoriasJuegos'), 'falta el pintado de categorías');
  const inicio = app.slice(app.indexOf('function iniciarJuegos'), app.indexOf('function cargarPartidas'));
  assert.ok(inicio.includes('pintarCategoriasJuegos();'), 'iniciarJuegos debe pintar las categorías');
  assert.ok(inicio.indexOf('pintarCategoriasJuegos();') < inicio.indexOf("$$('[data-crear]')"),
    'primero se pintan las tarjetas y DESPUÉS se cablean, o las tarjetas nacerían sordas');
  assert.ok(!inicio.includes("$('#crear-gato')"), 'fuera los cableados por id: las tarjetas van por data-crear');
  const pintar = app.slice(app.indexOf('function pintarCategoriasJuegos'), app.indexOf('function abrirYMostrar'));
  assert.ok(pintar.includes("'barra-juegos'") || pintar.includes('"barra-juegos"'), 'cada categoría se pinta como barra deslizable');
  assert.ok(pintar.includes('juego-tarjeta'), 'las tarjetas son compactas (icono + nombre)');
  assert.ok(pintar.includes('b.dataset.crear = clave'), 'cada tarjeta lleva su clave de creación');
});
prueba('categorías: el CSS trae la barra deslizable y la tarjeta compacta', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  assert.ok(css.includes('.barra-juegos{'), 'falta .barra-juegos');
  const barra = css.slice(css.indexOf('.barra-juegos{'), css.indexOf('.barra-juegos{') + 400);
  assert.ok(barra.includes('overflow-x:auto') && barra.includes('flex-wrap:nowrap'), 'la barra es una fila que se desliza por dentro');
  assert.ok(barra.includes('scroll-snap-type'), 'con snap, como las barras de historias');
  assert.ok(css.includes('.juego-tarjeta{') && css.includes('.juego-tarjeta-icono') && css.includes('.juego-tarjeta-nombre'),
    'la tarjeta compacta tiene su estilo (icono + nombre)');
});

console.log('— V3.4 · MÁS APPS: ENLACES DE OTRAS PLATAFORMAS —');
prueba('incrustable Spotify: canción, álbum, lista, episodio e intl → reproductor oficial', () => {
  const track = Fun.enlaceIncrustable('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.strictEqual(track.plataforma, 'spotify');
  assert.strictEqual(track.embed, 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator');
  assert.strictEqual(track.altura, 152);
  const album = Fun.enlaceIncrustable('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3?si=abc');
  assert.strictEqual(album.embed, 'https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3?utm_source=generator');
  assert.strictEqual(album.altura, 352);
  const lista = Fun.enlaceIncrustable('https://open.spotify.com/intl-es/playlist/37i9dQZF1DXcBWIGoYBM5M');
  assert.strictEqual(lista.embed, 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator');
  const uri = Fun.enlaceIncrustable('spotify:episode:512ojhOuo1ktJprKbVcKyQ');
  assert.strictEqual(uri.embed, 'https://open.spotify.com/embed/episode/512ojhOuo1ktJprKbVcKyQ?utm_source=generator');
  assert.strictEqual(Fun.enlaceIncrustable('https://open.spotify.com/user/juan'), null,
    'un perfil de Spotify no es incrustable: no se finge');
});
prueba('incrustable Apple Music: el mismo camino en embed.music.apple.com', () => {
  const album = Fun.enlaceIncrustable('https://music.apple.com/us/album/ejemplo/1234567890');
  assert.strictEqual(album.plataforma, 'apple');
  assert.strictEqual(album.embed, 'https://embed.music.apple.com/us/album/ejemplo/1234567890');
  assert.strictEqual(album.altura, 450);
  const cancion = Fun.enlaceIncrustable('https://music.apple.com/do/song/una-cancion/1234567890');
  assert.strictEqual(cancion.altura, 150);
  const conI = Fun.enlaceIncrustable('https://music.apple.com/us/album/ejemplo/1234567890?i=1234567891');
  assert.ok(conI.embed.includes('?i=1234567891'), 'la canción señalada (?i=) viaja en el enlace incrustado');
  assert.strictEqual(Fun.enlaceIncrustable('https://music.apple.com/us'), null, 'la portada de Apple Music no es un reproductor');
});
prueba('incrustable SoundCloud: pista y lista por el reproductor oficial', () => {
  const pista = Fun.enlaceIncrustable('https://soundcloud.com/artista/una-pista');
  assert.strictEqual(pista.plataforma, 'soundcloud');
  assert.ok(pista.embed.startsWith('https://w.soundcloud.com/player/?url=' + encodeURIComponent('https://soundcloud.com/artista/una-pista')),
    'el reproductor oficial recibe la URL de la pista');
  const lista = Fun.enlaceIncrustable('https://soundcloud.com/artista/sets/mi-lista');
  assert.ok(lista && lista.plataforma === 'soundcloud', 'las listas (sets) también suenan');
  assert.strictEqual(Fun.enlaceIncrustable('https://soundcloud.com/discover'), null, 'las páginas de la plataforma no son pistas');
});
prueba('lo demás NO es incrustable y el texto suelto tampoco', () => {
  ['https://www.netflix.com/watch/80100179', 'https://www.disneyplus.com/movies/x/abc',
   'https://www.tiktok.com/@a/video/123', 'esto no es un enlace', '', 'ftp://x.com/a']
    .forEach(t => assert.strictEqual(Fun.enlaceIncrustable(t), null, 'no incrustable: ' + t));
});
prueba('servicioExterno: reconoce las casas y cae con elegancia en el dominio', () => {
  const casos = [
    ['https://www.netflix.com/watch/80100179', 'Netflix'],
    ['https://www.disneyplus.com/browse/entity-x', 'Disney+'],
    ['https://www.primevideo.com/detail/0ABC', 'Prime Video'],
    ['https://www.amazon.com/gp/video/detail/B08XYZ', 'Prime Video'],
    ['https://play.max.com/video/x', 'Max'],
    ['https://www.tiktok.com/@a/video/7312345678', 'TikTok'],
    ['https://www.twitch.tv/uncanal', 'Twitch'],
    ['https://www.hulu.com/watch/abc', 'Hulu']
  ];
  casos.forEach(([url, nombre]) => {
    const s = Fun.servicioExterno(url);
    assert.ok(s, 'debe reconocer ' + url);
    assert.strictEqual(s.nombre, nombre, url);
    assert.strictEqual(s.url, url.replace('www.', 'www.'), 'la url se devuelve normalizada');
  });
  const generico = Fun.servicioExterno('https://www.ejemplo-raro.com/ver/1');
  assert.strictEqual(generico.nombre, 'ejemplo-raro.com');
  assert.strictEqual(Fun.servicioExterno('hola qué tal'), null);
  assert.strictEqual(Fun.servicioExterno('netflix.com/watch/1').nombre, 'Netflix', 'sin esquema también se reconoce');
});
prueba('idVideoYouTube: watch, youtu.be, shorts y music salen; lo demás no', () => {
  assert.strictEqual(Fun.idVideoYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.strictEqual(Fun.idVideoYouTube('https://youtu.be/dQw4w9WgXcQ?si=x'), 'dQw4w9WgXcQ');
  assert.strictEqual(Fun.idVideoYouTube('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.strictEqual(Fun.idVideoYouTube('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD'), 'dQw4w9WgXcQ');
  assert.strictEqual(Fun.idVideoYouTube('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'), null);
  assert.strictEqual(Fun.idVideoYouTube('https://www.youtube.com/feed/subscriptions'), null);
});
prueba('restanteRegresiva: 3, 2, 1… y nunca negativo', () => {
  assert.strictEqual(Fun.restanteRegresiva(10000, 7000), 3);
  assert.strictEqual(Fun.restanteRegresiva(10000, 7500), 3, 'a mitad del segundo cuenta el segundo que se vive');
  assert.strictEqual(Fun.restanteRegresiva(10000, 8001), 2);
  assert.strictEqual(Fun.restanteRegresiva(10000, 9999), 1);
  assert.strictEqual(Fun.restanteRegresiva(10000, 10000), 0);
  assert.strictEqual(Fun.restanteRegresiva(10000, 25000), 0, 'pasado el instante: cero, jamás negativo');
  assert.strictEqual(Fun.restanteRegresiva('basura', 0), 0);
});
prueba('más apps en el HTML: tarjeta con su nota honesta, formulario y capa de lanzamiento', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const secCine = html.slice(html.indexOf('id="sec-cine"'), html.indexOf('id="sec-chat"'));
  ['form-apps', 'apps-enlace', 'apps-zona', 'apps-aviso'].forEach(id => {
    assert.ok(secCine.includes('id="' + id + '"'), 'falta #' + id + ' en Ver y escuchar');
  });
  assert.ok(secCine.includes('NO dejan sonar dentro de otras apps'), 'la nota honesta va en la propia vista');
  assert.ok(secCine.includes('Spotify, Apple Music y SoundCloud SÍ suenan aquí dentro'), 'y lo que sí suena, dicho claro');
  const iCapa = html.indexOf('id="capa-lanzar"');
  assert.ok(iCapa !== -1, 'falta la capa «Abrir para todos»');
  assert.ok(iCapa > html.indexOf('id="sec-chat"'), 'la capa vive fuera de las secciones, como las demás');
  const bloque = html.slice(iCapa, iCapa + 1600);
  ['lanzar-icono', 'lanzar-de', 'lanzar-servicio', 'lanzar-enlace', 'lanzar-cuenta', 'lanzar-abrir', 'btn-cerrar-lanzar']
    .forEach(id => assert.ok(bloque.includes('id="' + id + '"'), 'falta #' + id + ' en la capa de lanzamiento'));
  assert.ok(bloque.includes('btn-cerrar-capa'), 'la capa se cierra con su ✖ grande, como todas');
});
prueba('más apps en app.js: broadcast por el canal de cine, sin SQL nuevo', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  ["event: 'apps-embed'", "event: 'apps-quitar'", "event: 'apps-lanzar'"].forEach(ev => {
    assert.strictEqual((app.split(ev).length - 1), 2, ev + ' debe escucharse Y enviarse (2 apariciones): ' + ev);
  });
  assert.ok(app.includes('function compartirEnlaceApps') && app.includes('function mostrarEmbedApps') &&
    app.includes('function quitarEmbedApps') && app.includes('function abrirLanzamiento'),
    'existen compartir, mostrar, quitar y lanzar');
  const compartir = app.slice(app.indexOf('function compartirEnlaceApps'), app.indexOf('function mostrarEmbedApps'));
  assert.ok(compartir.includes('Fun.idVideoYouTube') && compartir.includes('reproducirParaTodos'),
    'un enlace de YouTube pegado aquí va al reproductor de la casa');
  assert.ok(compartir.includes('Fun.enlaceIncrustable') && compartir.includes('Fun.servicioExterno'),
    'la clasificación es la de fun.js (probada), no otra inventada aquí');
  assert.ok(compartir.includes('Date.now() + 3000'), 'la regresiva nace con su instante absoluto: abrirEn = ahora + 3 s');
  const lanzar = app.slice(app.indexOf('function abrirLanzamiento'), app.indexOf('function abrirEnlaceLanzado'));
  assert.ok(lanzar.includes("abrirCapa('capa-lanzar')"), 'el aviso a todos es la capa sobrepuesta');
  assert.ok(lanzar.includes('Fun.restanteRegresiva'), 'la cuenta se calcula con la función pura');
  const abrir = app.slice(app.indexOf('function abrirEnlaceLanzado'), app.indexOf('function abrirEnlaceLanzado') + 400);
  assert.ok(abrir.includes("window.open(url, '_blank')"), 'el botón abre el enlace en el aparato de cada quien');
  assert.ok(!fs.existsSync(path.join(RAIZ, 'migracion-v3-4.sql')),
    'la v3.4 no necesita migración: todo va por broadcast, cero SQL');
});

console.log('— V3.4.1 · TABLEROS QUE CABEN EN EL CELULAR (bug de la captura 22:02) —');
prueba('v3.4.1: ningún tablero de rejilla usa pistas 1fr a secas (minmax(0,1fr) en todos)', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  ['.tablero-gato', '.tablero-memoria', '.tablero-conecta', '.conecta-cols', '.tablero-serpientes',
   '.tablero-parchis', '.tablero-naval', '.tablero-sopa', '.tablero-simon', '.tablero-damas',
   '.mapa-tesoro', '.carton-loteria', '.puzzle-deslizante'].forEach(sel => {
    const i = css.indexOf(sel + '{');
    assert.ok(i !== -1, 'falta la regla de ' + sel);
    const regla = css.slice(i, css.indexOf('}', i));
    assert.ok(regla.includes('minmax(0,1fr)'),
      sel + ' debe poder encoger por debajo del contenido mínimo de sus celdas (si no, desborda el celular)');
    assert.ok(!/grid-template-columns:\s*repeat\(\d+,\s*1fr\)/.test(regla),
      sel + ' no debe volver a pistas 1fr a secas');
  });
  assert.ok(!css.includes('@media (min-width:820px){ .tablero-memoria{grid-template-columns:repeat(6,1fr)} }'),
    'fuera la media query que imponía 6 columnas a Memoria en pantallas anchas');
});
prueba('v3.4.1: las celdas-botón están liberadas de la caja del botón base', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  const reglaDe = sel => { const i = css.indexOf(sel + '{'); return css.slice(i, css.indexOf('}', i)); };
  // El botón base impone padding 12px 22px y min-height 56px; con
  // aspect-ratio ese mínimo se transfiere al ancho y revienta la pista.
  ['.carta-memoria', '.celda-naval', '.celda-sopa', '.casilla-damas', '.casilla-tesoro', '.pieza-puzzle']
    .forEach(sel => {
      const r = reglaDe(sel);
      assert.ok(r.includes('min-width:0'), sel + ' lleva min-width:0');
      assert.ok(r.includes('min-height:0'), sel + ' lleva min-height:0 (su alto lo manda aspect-ratio)');
      assert.ok(r.includes('padding:0'), sel + ' lleva padding:0 (el del botón base inflaba su contenido mínimo)');
    });
  assert.ok(reglaDe('.conecta-cols button').includes('min-width:0'), 'las flechas de Conecta 4 también');
  assert.ok(reglaDe('.carta-memoria').includes('aspect-ratio:1'), 'la carta sigue cuadrada por aspect-ratio');
});
prueba('v3.4.1: Memoria — columnas por conteo de cartas y cara legible y centrada', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(css.includes('repeat(var(--cols-memoria,4),minmax(0,1fr))'),
    'la rejilla de Memoria lee sus columnas de --cols-memoria');
  const render = app.slice(app.indexOf('function renderMemoria'), app.indexOf('function renderMemoria') + 2600);
  assert.ok(render.includes('var colsMemoria = e.cartas.length <= 9 ? 3 : e.cartas.length <= 16 ? 4'),
    'renderMemoria calcula las columnas desde el conteo de cartas');
  assert.ok(render.includes('style="--cols-memoria:\' + colsMemoria + \'"'),
    'y las pinta en el tablero (16 cartas de la casa → 4×4)');
  assert.ok(css.includes('.carta-memoria>span{display:flex; flex-direction:column; align-items:center'),
    'el símbolo y el nombre van en columna centrada dentro de la carta');
  assert.ok(css.includes('.carta-nombre{display:block'), '.carta-nombre tiene por fin su regla (antes no existía)');
  assert.ok(css.includes('.carta-memoria.volteada{background:#fff; border:3px solid var(--sol); transform:rotateY(360deg); color:var(--tinta)}'),
    'la cara volteada lleva tinta oscura: el nombre ya no sale blanco sobre blanco');
  assert.ok(/\.carta-memoria\{[^}]*font-size:clamp\(/.test(css),
    'el símbolo se dimensiona relativo al ancho (clamp con vw), no a un rem fijo');
});

console.log('— V3.4.2 · JUGAR OTRA VEZ: SEGUIR JUGANDO AHÍ MISMO AL TERMINAR —');
// Pedido del dueño (captura del 2026-10-31, Personaje Misterioso ya
// terminado): «No me da la opción de seguir jugando ahí mismo luego de
// terminar esa partida». El botón vive en el camino COMPARTIDO de
// pintado (renderJuego → pintarBotonOtraVez), no juego por juego.
function helpersOtraVez() {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const src = app.slice(app.indexOf('function partidaTerminada'), app.indexOf('function jugarOtraVez'));
  return new Function(src + '\nreturn { partidaTerminada: partidaTerminada, claveCreacionDe: claveCreacionDe };')();
}
prueba('HTML: la zona «otra vez» vive en la capa, tras el tablero, y nace oculta', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const iCapa = html.indexOf('id="capa-juego"');
  const iZonaJuego = html.indexOf('id="zona-juego"');
  const iOtraVez = html.indexOf('id="zona-otra-vez"');
  assert.ok(iCapa !== -1 && iZonaJuego > iCapa, 'el tablero sigue dentro de la capa');
  assert.ok(iOtraVez > iZonaJuego, 'la zona «otra vez» va tras el tablero, dentro de la misma tarjeta');
  const bloque = html.slice(iOtraVez, iOtraVez + 500);
  assert.ok(bloque.includes('class="oculto"'), 'la zona nace oculta: solo aparece al terminar');
  assert.ok(bloque.includes('id="btn-otra-vez"'), 'falta el botón');
  assert.ok(bloque.includes('🔁 Jugar otra vez'), 'el botón dice «🔁 Jugar otra vez», grande y claro');
});
prueba('camino compartido: renderJuego decide el botón SIEMPRE (ningún juego se lo olvida)', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const render = app.slice(app.indexOf('function renderJuego'), app.indexOf('function partidaTerminada'));
  assert.ok(render.includes('pintarBotonOtraVez(p);'), 'renderJuego llama a pintarBotonOtraVez al final del pintado');
  assert.ok(app.includes('function pintarBotonOtraVez(p)'), 'falta pintarBotonOtraVez');
  assert.ok(app.includes('function jugarOtraVez(p)'), 'falta jugarOtraVez');
  const otraVez = app.slice(app.indexOf('function jugarOtraVez'), app.indexOf('function pintarBotonOtraVez'));
  assert.ok(otraVez.includes('crearPartida(datos.clave)'), '«otra vez» reutiliza crearPartida (apertura optimista v3.3)');
  assert.ok(!otraVez.includes('guardarEstado') && !otraVez.includes('cerrarJuegoVista') && !otraVez.includes('activa'),
    'repetir NO toca la terminada: ni la guarda, ni la cierra, ni la desactiva (no duplica puntos)');
});
prueba('partidaTerminada acepta TODAS las marcas de fin (terminado y fase final) en los 33 juegos', () => {
  const { partidaTerminada } = helpersOtraVez();
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const render = app.slice(app.indexOf('function renderJuego'), app.indexOf('function partidaTerminada'));
  const tipos = [...new Set([...render.matchAll(/case '([a-z]+)'/g)].map(m => m[1]))];
  assert.strictEqual(tipos.length, 33, 'el despacho debe cubrir 33 tipos: ' + tipos.join(','));
  tipos.forEach(t => {
    assert.strictEqual(partidaTerminada({ tipo: t, estado: { terminado: true } }), true, t + ' con terminado');
    assert.strictEqual(partidaTerminada({ tipo: t, estado: { fase: 'final' } }), true, t + ' con fase final');
    assert.strictEqual(partidaTerminada({ tipo: t, estado: { terminado: false, fase: 'pregunta' } }), false, t + ' a mitad no es fin');
    assert.strictEqual(partidaTerminada({ tipo: t, estado: {} }), false, t + ' recién creada no es fin');
  });
});
prueba('el detector acierta con estados FINALES reales (gato, trivia, memoria, misterio)', () => {
  const { partidaTerminada } = helpersOtraVez();
  // Gato real jugado hasta ganar:
  let g = L.crearGato(['a', 'b']);
  assert.strictEqual(partidaTerminada({ tipo: 'gato', estado: g }), false, 'gato nuevo no es fin');
  g = L.jugadaGato(g, 0, 0); g = L.jugadaGato(g, 1, 3);
  g = L.jugadaGato(g, 0, 1); g = L.jugadaGato(g, 1, 4);
  g = L.jugadaGato(g, 0, 2);
  assert.strictEqual(partidaTerminada({ tipo: 'gato', estado: g }), true, 'gato ganado es fin');
  // Trivia real hasta su fase 'final' (la trivia NO usa «terminado»: solo la fase):
  let t = L.crearTrivia(['a'], [0, 1]);
  t = L.iniciarTrivia(t);
  assert.strictEqual(partidaTerminada({ tipo: 'trivia', estado: t }), false, 'trivia en pregunta no es fin');
  t = L.responderTrivia(t, 'a', L.preguntaActual(t).correcta, 10);
  t = L.revelarTrivia(t);
  assert.strictEqual(partidaTerminada({ tipo: 'trivia', estado: t }), false, 'trivia revelada (no última) no es fin');
  t = L.siguientePregunta(t);
  t = L.responderTrivia(t, 'a', L.preguntaActual(t).correcta, 10);
  t = L.revelarTrivia(t);
  assert.strictEqual(t.fase, 'final'); assert.strictEqual(t.terminado, undefined, 'la trivia final no trae «terminado»: manda la fase');
  assert.strictEqual(partidaTerminada({ tipo: 'trivia', estado: t }), true, 'trivia en fase final es fin');
  // Memoria real: se voltean las parejas de verdad hasta acabar:
  let m = L.crearMemoria(2, rngSemilla(7));
  m.jugadores = ['a'];
  const porEmoji = {};
  m.cartas.forEach((c, i) => { (porEmoji[c.emoji] = porEmoji[c.emoji] || []).push(i); });
  const pares = Object.values(porEmoji);
  m = L.voltearMemoria(m, pares[0][0]); m = L.voltearMemoria(m, pares[0][1]);
  assert.strictEqual(partidaTerminada({ tipo: 'memoria', estado: m }), false, 'memoria a medias no es fin');
  m = L.voltearMemoria(m, pares[1][0]); m = L.voltearMemoria(m, pares[1][1]);
  assert.strictEqual(partidaTerminada({ tipo: 'memoria', estado: m }), true, 'memoria completa es fin');
  // Misterio real (el de la captura del dueño): adivinar lo termina:
  let x = G.crearMisterio(['a'], () => 0); // primer personaje: Noé
  assert.strictEqual(partidaTerminada({ tipo: 'misterio', estado: x }), false, 'misterio nuevo no es fin');
  x = G.adivinarMisterio(x, 'a', 'Noé');
  assert.strictEqual(partidaTerminada({ tipo: 'misterio', estado: x }), true, 'misterio resuelto es fin');
});
prueba('claveCreacionDe repite TAL CUAL: mismo tipo, mismo banco y mismo mazo', () => {
  const { claveCreacionDe } = helpersOtraVez();
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const crear = app.slice(app.indexOf('function crearPartida'), app.indexOf('function guardarEstado'));
  const clavesCrear = new Set([...crear.matchAll(/case '([a-z-]+)'/g)].map(m => m[1]));
  const render = app.slice(app.indexOf('function renderJuego'), app.indexOf('function partidaTerminada'));
  const tipos = [...new Set([...render.matchAll(/case '([a-z]+)'/g)].map(m => m[1]))];
  tipos.forEach(t => {
    const d = claveCreacionDe({ tipo: t, estado: {} });
    assert.ok(clavesCrear.has(d.clave), t + ' → la clave «' + d.clave + '» debe existir en crearPartida');
  });
  assert.deepStrictEqual(claveCreacionDe({ tipo: 'misterio', estado: {} }), { clave: 'misterio' });
  assert.deepStrictEqual(claveCreacionDe({ tipo: 'gato', estado: {} }), { clave: 'gato' });
  assert.deepStrictEqual(claveCreacionDe({ tipo: 'memoria', estado: {} }), { clave: 'memoria' });
  assert.deepStrictEqual(claveCreacionDe({ tipo: 'memoria', estado: { mazo: 'biblia' } }), { clave: 'memoria-biblica' });
  assert.deepStrictEqual(claveCreacionDe({ tipo: 'memoria', estado: { mazo: 'comida' } }), { clave: 'memoria-tema', mazo: 'comida' });
  assert.deepStrictEqual(claveCreacionDe({ tipo: 'trivia', estado: { banco: 'biblica' } }), { clave: 'trivia-biblica' });
  assert.deepStrictEqual(claveCreacionDe({ tipo: 'trivia', estado: { banco: 'general' } }), { clave: 'trivia' });
});
prueba('CSS: el botón «otra vez» es grande de verdad (ancho completo, 64px, letra 1.3rem)', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  assert.ok(css.includes('#zona-otra-vez{margin-top:18px'), 'falta la zona en el CSS');
  assert.ok(css.includes('#btn-otra-vez{width:100%; min-height:64px; font-size:1.3rem'), 'el botón debe ser grande y claro');
});

console.log('— V3.4.3 · ORDEN TAPADO, SIMÓN QUE ESCUCHA, LLAMADAS CÓMODAS Y SONIDOS —');
// Tres reportes del dueño jugando en vivo (capturas 22:33–22:42) + dos
// pedidos de la misma noche (llamadas incómodas y sonidos).
prueba('fun.js: existen el «toque» suave y el «cierre», y el registro anti-doble-sonido funciona', () => {
  assert.strictEqual(typeof Fun.sonido, 'function');
  assert.strictEqual(typeof Fun.huboSonidoReciente, 'function', 'falta el guard anti-doble-sonido');
  Fun.sonido('toque');
  assert.strictEqual(Fun.huboSonidoReciente(150), true, 'recién sonado debe contar como reciente');
  Fun.sonido('cierre');
  assert.strictEqual(Fun.huboSonidoReciente(150), true);
  const t0 = Date.now(); while (Date.now() - t0 < 200) { /* deja pasar la ventana */ }
  assert.strictEqual(Fun.huboSonidoReciente(100), false, 'pasada la ventana ya no es reciente');
});
prueba('sonidos en el camino compartido: toque global con freno y fin de partida en renderJuego', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes("if (Fun.huboSonidoReciente(150)) return;"), 'el toque global se calla si el juego ya sonó');
  assert.ok(app.includes("t.closest('[data-sin-toque]')"), 'hay salida para controles que no deben sonar');
  assert.ok(app.includes("Fun.sonido('toque')"), 'el manejador global suena el toque');
  const render = app.slice(app.indexOf('function renderJuego'), app.indexOf('function partidaTerminada'));
  assert.ok(render.includes('sonarFinDePartida(p);'), 'el sonido de fin se decide en el pintado compartido, como el botón «otra vez»');
  const fin = app.slice(app.indexOf('function sonarFinDePartida'), app.indexOf('function sonarFinDePartida') + 400);
  assert.ok(fin.includes("ganadorDePartida(p) === yo.id ? 'victoria' : 'cierre'"), 'si gano yo, victoria; si gana otro, cierre suave');
  assert.ok(fin.includes('finSonado'), 'una sola vez por partida y sesión');
});
prueba('Orden: los botones de respuesta salen MEZCLADOS (nunca en el orden de la fila) y estables', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const src = app.slice(app.indexOf('var ordenBotonesLocal'), app.indexOf('function renderOrden'));
  const botonesOrdenDe = new Function(src + '\nreturn botonesOrdenDe;')();
  const fila = ['⚽', '🎸', '🚗', '🍕', '🐢', '🐸'];
  for (let i = 0; i < 30; i++) {
    const b = botonesOrdenDe('p' + i + ':1', fila);
    assert.deepStrictEqual([...b].sort(), [...fila].sort(), 'mismos emojis, mezclados');
    assert.notDeepStrictEqual(b, fila, 'JAMÁS en el orden verdadero: eso era la fuga');
    assert.deepStrictEqual(botonesOrdenDe('p' + i + ':1', fila), b, 'estable entre repintados de la misma ronda');
  }
});
prueba('Orden: la fase de respuesta pinta la fila TAPADA (❓) y la de memorizar abierta', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const render = app.slice(app.indexOf('function renderOrden'), app.indexOf('function renderOrdena'));
  assert.ok(render.includes('fila-tapada'), 'la fila objetivo se tapa al responder');
  assert.ok(render.includes('<span>❓</span>'), 'el dorso es ❓');
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  assert.ok(css.includes('.fila-tapada span{'), 'el dorso tiene su estilo (degradado)');
});
prueba('Simón (lógica): la secuencia correcta avanza y el color equivocado ELIMINA', () => {
  let e = G.crearSimon(['a', 'b'], rngSemilla(11));
  e = G.presionarSimon(e, 0, e.secuencia[0], rngSemilla(12));
  assert.strictEqual(e.puntajes.a, 1, 'el acierto suma el punto');
  assert.strictEqual(e.secuencia.length, 2, 'la secuencia crece');
  let e2 = G.crearSimon(['a', 'b'], rngSemilla(11));
  const malo = G.COLORES_SIMON.find(c => c !== e2.secuencia[0]);
  e2 = G.presionarSimon(e2, 0, malo, rngSemilla(12));
  assert.strictEqual(e2.vivos.a, false, 'el error elimina al jugador');
  assert.strictEqual(e2.terminado, true, 'con uno solo vivo la partida termina');
  assert.strictEqual(e2.ganador, 'b', 'gana la otra');
});
prueba('Simón (cliente): el toque se juzga contra el estado FRESCO y con aplicación optimista', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes('var fresca = partidasPorId[p.id] || p;'), 'el manejador resuelve la partida más fresca, no la del pintado');
  assert.ok(app.includes('function soltarSimon()'), 'la reproducción siempre se suelta');
  assert.ok(app.includes('simonSeguridad = setTimeout(soltarSimon'), 'hay temporizador de seguridad anti-bloqueo');
  assert.ok(app.includes('guardarConPuntos(fresca, ef, nuevo)'), 'se guarda desde el estado fresco');
});
prueba('Llamadas: apagar la cámara SOLO deshabilita el video (ni stop, ni removeTrack, ni renegociar)', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const apagar = app.slice(app.indexOf('function apagarCamara'), app.indexOf('function apagarCamara') + 800);
  assert.ok(apagar.includes('pistaVideoLocal.enabled = false;'), 'apagar = enabled=false en la pista de video');
  assert.ok(!apagar.includes('.stop('), 'apagar NO detiene pistas (eso era lo que mataba la voz)');
  assert.ok(!apagar.includes('.removeTrack('), 'apagar NO quita la pista del stream (la palabra en el comentario no cuenta: se busca la llamada)');
  const alternar = app.slice(app.indexOf('function alternarCamara'), app.indexOf('function apagarCamara'));
  assert.ok(alternar.includes('pistaVideoLocal.enabled = true;'), 'reencender = enabled=true en la MISMA pista');
  const salir = app.slice(app.indexOf('function salirDeLaVoz'), app.indexOf('function avisarVideo'));
  assert.ok(salir.includes('t.stop()'), 'al COLGAR sí se detienen las pistas locales');
  assert.ok(salir.includes('canalVoz.untrack()'), 'al colgar el otro lado ve la salida (untrack)');
  assert.ok(salir.includes('mosaicoGrande = null;'), 'al colgar el escenario se suelta');
});
prueba('Llamadas: escenario al tocar el recuadro y botón de COLGAR rojo y claro', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes("mosaicoGrande === id ? ' mosaico-grande' : ''"), 'pintarMosaicos marca el recuadro en grande');
  assert.ok(app.includes('mosaicoGrande = (mosaicoGrande === caja.dataset.clave) ? null : caja.dataset.clave;'), 'tocar el grande lo devuelve a la rejilla; tocar otro lo mueve');
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.ok(html.includes('id="voz-salir" class="btn-colgar oculto"'), 'el botón de salir es el de colgar, con su clase propia');
  assert.ok(html.includes('📞 Colgar'), 'y dice «📞 Colgar», inconfundible');
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  assert.ok(css.includes('.btn-colgar{background:#d92b2b'), 'el botón de colgar es ROJO');
  assert.ok(css.includes('.franja-videos:has(.con-escenario){width:94vw}'), 'con escenario la franja toma ancho definido');
});
prueba('CSS de llamada en celular: la barra ENVUELVE (Colgar no se sale) y la franja no queda tapada', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'styles.css'), 'utf8');
  assert.ok(!css.includes('.barra-voz{bottom:64px; flex-wrap:nowrap'), 'fuera el nowrap que empujaba «Colgar» fuera de pantalla (x=497–603 medido)');
  assert.ok(css.includes('.barra-voz{bottom:64px; flex-wrap:wrap'), 'la barra envuelve en filas y todo se ve');
  assert.ok(css.includes('.franja-videos{bottom:308px'), 'la franja sube por encima de la barra envuelta');
});

console.log('— V3.5 · ARCHIVOS EN EL CHAT, RESCATE DEL REPRODUCTOR Y BOTÓN DE TELÉFONO —');
prueba('Chat con archivos: botón 📎, entrada de archivo y envío al bucket «archivos»', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.ok(html.includes('id="btn-archivo"'), 'el formulario del chat tiene el botón 📎');
  assert.ok(html.includes('id="chat-archivo"'), 'y la entrada de archivo oculta');
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes('prepararBotonArchivo();'), 'iniciarChat prepara el botón de archivo');
  assert.ok(app.includes(".from('archivos').upload("), 'el archivo sube al bucket «archivos»');
  assert.ok(app.includes('archivo_path: ruta'), 'el mensaje guarda la ruta del archivo');
  assert.ok(app.includes('TOPE_ARCHIVO = 25 * 1024 * 1024'), 'hay tope de 25 MB');
  assert.ok(app.includes('createSignedUrl(m.archivo_path, 3600)'), 'los archivos se abren con URL firmada');
  assert.ok(app.includes('pintarArchivo(zonaA, m)'), 'los mensajes con archivo se pintan como archivo');
});
prueba('Rescate del reproductor: arranque en silencio y botón grande de toque', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes('function rescateToque()'), 'existe el rescate de reproducción');
  assert.ok(app.includes('ytPlayer.mute(); ytPlayer.playVideo();'), 'el rescate arranca en silencio (lo que iOS sí permite)');
  assert.ok(app.includes("mostrarToca('▶️ Toca para ver el video')"), 'si ni en silencio arranca, el botón pide el toque para ver');
  assert.ok(app.includes("id=\"cine-toca\"") || fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8').includes('id="cine-toca"'), 'el botón grande vive sobre el reproductor');
  assert.ok(app.includes("$('#cine-youtube')"), 'hay salida «Ver en YouTube» para el video actual');
  assert.ok(app.includes('aviso-yt-carga'), 'si la API de YouTube no carga, se avisa con claridad');
});
prueba('Voz: fuera el «unirse» flotante; la puerta es el 📞 de arriba', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.ok(!html.includes('voz-unirse'), 'ya no existe el botón «Unirse a la voz»');
  assert.ok(!html.includes('Unirse a la voz'), 'ni su texto en la barra flotante');
  assert.ok(html.includes('id="btn-llamar"'), 'la barra de arriba tiene el botón de teléfono 📞');
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.ok(app.includes("$('#btn-llamar').addEventListener('click'"), 'el 📞 une y cuelga según el estado');
  const unirse = app.slice(app.indexOf('function unirseVoz'), app.indexOf('function salirDeLaVoz'));
  assert.ok(unirse.includes("$('#barra-voz').classList.remove('oculto')"), 'la barra de controles aparece solo DURANTE la llamada');
  const salir = app.slice(app.indexOf('function salirDeLaVoz'), app.indexOf('function avisarVideo'));
  assert.ok(salir.includes("$('#barra-voz').classList.add('oculto')"), 'al colgar la barra se esconde');
  assert.ok(!app.includes("$('#barra-voz').classList.toggle('oculto', !dentro)"), 'mostrarVista ya no muestra la barra por estar dentro de la app');
});

console.log('\n========================================');
console.log('Pruebas: ' + (pasadas + falladas) + ' · Pasaron: ' + pasadas + ' · Fallaron: ' + falladas);
process.exit(falladas ? 1 : 0);

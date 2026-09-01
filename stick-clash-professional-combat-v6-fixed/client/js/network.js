/* global io */
const Network = (() => {
  let socket = null;
  const listeners = {};

  function connect() {
    if (socket) return socket;
    socket = io({ transports: ['websocket', 'polling'] });
    ['lobby:update', 'player:left', 'match:state', 'match:ended', 'hit', 'knockout', 'round:end', 'debug:pong', 'connect', 'disconnect', 'connect_error']
      .forEach((evt) => {
        socket.on(evt, (payload) => emit(evt, payload));
      });
    return socket;
  }

  function on(evt, cb) {
    (listeners[evt] = listeners[evt] || []).push(cb);
  }

  function emit(evt, payload) {
    (listeners[evt] || []).forEach((cb) => cb(payload));
  }

  function createRoom(name) {
    return new Promise((resolve) => socket.emit('room:create', { name }, resolve));
  }

  function createBotRoom(name) {
    return new Promise((resolve) => socket.emit('room:createBot', { name }, resolve));
  }

  function joinRoom(roomId, name) {
    return new Promise((resolve) => socket.emit('room:join', { roomId, name }, resolve));
  }

  function setReady(ready) { socket.emit('lobby:ready', { ready }); }
  function startMatch() { socket.emit('lobby:start'); }
  function sendInput(input) { if (socket && socket.connected) socket.emit('match:input', input); }
  function rematch() { socket.emit('match:rematch'); }
  function returnToLobby() { socket.emit('match:returnToLobby'); }
  function sendPing(t) { if (socket && socket.connected) socket.emit('debug:ping', t); }

  function id() { return socket ? socket.id : null; }

  return { connect, on, createRoom, createBotRoom, joinRoom, setReady, startMatch, sendInput, rematch, returnToLobby, sendPing, id };
})();

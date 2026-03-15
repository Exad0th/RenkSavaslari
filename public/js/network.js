// Network module - Socket.IO communication
const Network = (() => {
  let socket = null;
  let connected = false;

  function init() {
    socket = io();

    socket.on('connect', () => {
      connected = true;
    });

    socket.on('disconnect', () => {
      connected = false;
    });

    return socket;
  }

  function getSocket() {
    return socket;
  }

  function isConnected() {
    return connected;
  }

  function joinRoom(roomId, callback) {
    socket.emit('joinRoom', roomId, callback);
  }

  function leaveRoom() {
    socket.emit('leaveRoom');
  }

  function leaveGame() {
    socket.emit('leaveGame');
  }

  function toggleReady() {
    socket.emit('toggleReady');
  }

  function moveUnits(unitIds, targetX, targetY) {
    socket.emit('moveUnits', { unitIds, targetX, targetY });
  }

  function changeTeam(teamId, callback) {
    socket.emit('changeTeam', teamId, callback);
  }

  function getRoomList() {
    socket.emit('getRoomList');
  }

  function on(event, handler) {
    socket.on(event, handler);
  }

  function off(event, handler) {
    socket.off(event, handler);
  }

  return {
    init,
    getSocket,
    isConnected,
    joinRoom,
    leaveRoom,
    leaveGame,
    toggleReady,
    moveUnits,
    changeTeam,
    getRoomList,
    on,
    off,
  };
})();

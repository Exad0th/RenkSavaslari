const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const GameState = require('./game/GameState');
const BotAI = require('./game/BotAI');
const { TICK_INTERVAL, TEAMS, TEAM_ORDER } = require('./game/constants');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// --- Room Management ---
const ROOM_COUNT = 2;
const COUNTDOWN_SECONDS = 10;
const rooms = {};
const playerNicknames = {}; // { socketId: nickname }

// --- Ranking persistence ---
const RANKING_FILE = path.join(__dirname, 'ranking.json');
let globalRanking = [];

function loadRanking() {
  try {
    if (fs.existsSync(RANKING_FILE)) {
      const data = fs.readFileSync(RANKING_FILE, 'utf8');
      globalRanking = JSON.parse(data);
      console.log(`📊 ${globalRanking.length} oyuncu sıralaması yüklendi.`);
    }
  } catch (e) {
    console.log('⚠️ Sıralama dosyası okunamadı, sıfırdan başlanıyor.');
    globalRanking = [];
  }
}

function saveRanking() {
  try {
    fs.writeFileSync(RANKING_FILE, JSON.stringify(globalRanking, null, 2), 'utf8');
  } catch (e) {
    console.log('⚠️ Sıralama dosyası kaydedilemedi:', e.message);
  }
}

loadRanking();

// --- Ban System ---
const BANS_FILE = path.join(__dirname, 'bans.json');
let bannedPlayers = [];

function loadBans() {
  try {
    if (fs.existsSync(BANS_FILE)) {
      bannedPlayers = JSON.parse(fs.readFileSync(BANS_FILE, 'utf8'));
      console.log(`🚫 ${bannedPlayers.length} yasaklı oyuncu yüklendi.`);
    }
  } catch (e) {
    bannedPlayers = [];
  }
}

function saveBans() {
  try {
    fs.writeFileSync(BANS_FILE, JSON.stringify(bannedPlayers, null, 2), 'utf8');
  } catch (e) {
    console.log('⚠️ Ban dosyası kaydedilemedi:', e.message);
  }
}

function getSocketIP(socket) {
  return socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
}

function isIPBanned(ip) {
  if (!ip) return false;
  return bannedPlayers.some((b) => b.ip === ip);
}

loadBans();

// --- IP-Nickname Lock ---
const NICKNAMES_FILE = path.join(__dirname, 'nicknames.json');
let ipNicknames = {}; // { ip: nickname }

function loadNicknames() {
  try {
    if (fs.existsSync(NICKNAMES_FILE)) {
      ipNicknames = JSON.parse(fs.readFileSync(NICKNAMES_FILE, 'utf8'));
      console.log(`📝 ${Object.keys(ipNicknames).length} IP-nick eşleşmesi yüklendi.`);
    }
  } catch (e) {
    ipNicknames = {};
  }
}

function saveNicknames() {
  try {
    fs.writeFileSync(NICKNAMES_FILE, JSON.stringify(ipNicknames, null, 2), 'utf8');
  } catch (e) {
    console.log('⚠️ Nickname dosyası kaydedilemedi:', e.message);
  }
}

loadNicknames();

// Pre-create 10 fixed rooms
function initRooms() {
  for (let i = 1; i <= ROOM_COUNT; i++) {
    const roomId = `ODA-${i}`;
    rooms[roomId] = createFreshRoom(roomId);
  }
}

function createFreshRoom(roomId) {
  return {
    roomId,
    gameState: new GameState(),
    intervalId: null,
    bots: {},
    readyPlayers: new Set(),
    countdown: null, // { timer, seconds }
    countdownInterval: null,
    status: 'waiting', // 'waiting' | 'countdown' | 'playing' | 'finished'
  };
}

function resetRoom(roomId) {
  const room = rooms[roomId];
  if (room.intervalId) clearInterval(room.intervalId);
  if (room.countdownInterval) clearInterval(room.countdownInterval);
  rooms[roomId] = createFreshRoom(roomId);
}

function getRoomListForClient() {
  const list = [];
  for (const [roomId, room] of Object.entries(rooms)) {
    const humanCount = Object.keys(room.gameState.players).length;
    const teams = [];
    // Human players
    for (const [sid, data] of Object.entries(room.gameState.players)) {
      teams.push({
        teamId: data.teamId,
        teamName: TEAMS[data.teamId].name,
        teamColor: TEAMS[data.teamId].color,
        isBot: false,
        nickname: playerNicknames[sid] || 'Oyuncu',
      });
    }
    list.push({
      roomId,
      playerCount: humanCount,
      maxPlayers: 8,
      status: room.status,
      teams,
    });
  }
  return list;
}

function getRoomDetail(roomId) {
  const room = rooms[roomId];
  if (!room) return null;

  const players = {};
  for (const [sid, data] of Object.entries(room.gameState.players)) {
    const team = TEAMS[data.teamId];
    players[sid] = {
      teamId: data.teamId,
      teamName: team.name,
      teamColor: team.color,
      isBot: false,
      ready: room.readyPlayers.has(sid),
      nickname: playerNicknames[sid] || 'Oyuncu',
    };
  }

  return {
    roomId,
    players,
    status: room.status,
    playerCount: Object.keys(room.gameState.players).length,
  };
}

function broadcastRoomList() {
  io.emit('roomList', getRoomListForClient());
}

function broadcastRanking() {
  // Sort by score descending
  const sorted = [...globalRanking].sort((a, b) => b.score - a.score);
  io.emit('globalRanking', sorted.slice(0, 20)); // top 20
}

function updateGlobalRanking(room) {
  // Map team scores to player nicknames
  for (const [sid, pData] of Object.entries(room.gameState.players)) {
    const nickname = playerNicknames[sid] || 'Oyuncu';
    const teamScore = room.gameState.scores[pData.teamId] || 0;
    const isWinner = room.gameState.winner === pData.teamId;

    // Find or create player entry
    let entry = globalRanking.find((e) => e.nickname === nickname);
    if (!entry) {
      entry = { nickname, score: 0, gamesPlayed: 0, wins: 0 };
      globalRanking.push(entry);
    }
    entry.score += teamScore;
    entry.gamesPlayed += 1;
    if (isWinner) entry.wins += 1;
  }
  saveRanking();
}

function checkAllReady(room) {
  const humanPlayers = Object.keys(room.gameState.players);
  if (humanPlayers.length === 0) return false;
  return humanPlayers.every((sid) => room.readyPlayers.has(sid));
}

function startCountdown(roomId) {
  const room = rooms[roomId];
  if (!room || room.status !== 'waiting') return;

  room.status = 'countdown';
  room.countdown = COUNTDOWN_SECONDS;

  io.to(roomId).emit('countdownStarted', { seconds: room.countdown });
  broadcastRoomList();

  room.countdownInterval = setInterval(() => {
    room.countdown--;

    io.to(roomId).emit('countdownTick', { seconds: room.countdown });

    if (room.countdown <= 0) {
      clearInterval(room.countdownInterval);
      room.countdownInterval = null;
      startGame(roomId);
    }
  }, 1000);
}

function cancelCountdown(roomId) {
  const room = rooms[roomId];
  if (!room || room.status !== 'countdown') return;

  clearInterval(room.countdownInterval);
  room.countdownInterval = null;
  room.countdown = null;
  room.status = 'waiting';

  io.to(roomId).emit('countdownCancelled');
  broadcastRoomList();
}

function startGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.status = 'playing';

  // Fill remaining slots with bots
  while (true) {
    const botTeam = room.gameState.getAvailableTeam();
    if (!botTeam) break;
    room.gameState.addBot(botTeam);
    room.bots[botTeam] = new BotAI(botTeam);
    console.log(`  Bot added for team ${botTeam}`);
  }

  room.gameState.initGame();

  // Start game loop
  room.intervalId = setInterval(() => {
    // Update bot AI
    for (const [teamId, bot] of Object.entries(room.bots)) {
      bot.update(TICK_INTERVAL, room.gameState);
    }

    room.gameState.update(TICK_INTERVAL);

    // Send state to all players in room
    const state = room.gameState.serialize();
    io.to(roomId).emit('gameState', state);

    // Check if any human player is eliminated (base destroyed + no units alive)
    if (!room.eliminatedPlayers) room.eliminatedPlayers = new Set();
    for (const [sid, pData] of Object.entries(room.gameState.players)) {
      if (sid.startsWith('bot_')) continue;
      if (room.eliminatedPlayers.has(sid)) continue; // Already notified
      const teamId = pData.teamId;
      const base = room.gameState.bases[teamId];
      if (!base || !base.destroyed) continue;
      const hasAliveUnits = room.gameState.units.some((u) => u.teamId === teamId && !u.dead);
      if (!hasAliveUnits) {
        // Player is eliminated - notify but let them watch
        room.eliminatedPlayers.add(sid);
        const sock = io.sockets.sockets.get(sid);
        if (sock) {
          sock.emit('playerEliminated', { message: 'Elendin! Üssün yıkıldı ve tüm askerlerin öldü.' });
        }
        console.log(`Player ${sid} eliminated in ${roomId} (watching)`);
      }
    }

    // Check game over
    if (room.gameState.gameOver) {
      // Update global ranking before emitting
      updateGlobalRanking(room);

      io.to(roomId).emit('gameOver', {
        winner: room.gameState.winner,
        winnerName: TEAMS[room.gameState.winner].name,
        isBot: room.gameState.isBot(room.gameState.winner),
        reason: room.gameState.gameEndReason,
        scores: room.gameState.scores,
      });
      clearInterval(room.intervalId);
      room.intervalId = null;
      room.status = 'finished';
      broadcastRanking();

      // Reset room after 15 seconds
      setTimeout(() => {
        resetRoom(roomId);
        broadcastRoomList();
        console.log(`Room ${roomId} reset after game over`);
      }, 15000);
    }
  }, TICK_INTERVAL);

  io.to(roomId).emit('gameStarted', room.gameState.serialize());
  broadcastRoomList();
  console.log(`Game started in room ${roomId} with ${Object.keys(room.bots).length} bots`);
}

// --- DDoS Protection ---
const ipConnections = {}; // { ip: count }
const ipRateLimits = {}; // { ip: { events: number, resetTime: number, violations: number } }
const MAX_CONNECTIONS_PER_IP = 3;
const MAX_EVENTS_PER_SECOND = 30;
const AUTO_BAN_AFTER_VIOLATIONS = 3;

// HTTP rate limiting
const httpRateLimit = {};
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!httpRateLimit[ip]) httpRateLimit[ip] = { count: 0, resetTime: Date.now() + 60000 };
  if (Date.now() > httpRateLimit[ip].resetTime) {
    httpRateLimit[ip] = { count: 0, resetTime: Date.now() + 60000 };
  }
  httpRateLimit[ip].count++;
  if (httpRateLimit[ip].count > 120) { // max 120 HTTP requests per minute
    return res.status(429).send('Çok fazla istek. Lütfen bekleyin.');
  }
  next();
});

// Clean up rate limit data every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const ip in ipRateLimits) {
    if (now > ipRateLimits[ip].resetTime + 60000) {
      delete ipRateLimits[ip];
    }
  }
  for (const ip in httpRateLimit) {
    if (now > httpRateLimit[ip].resetTime) {
      delete httpRateLimit[ip];
    }
  }
}, 30000);

// --- Socket.IO ---
io.on('connection', (socket) => {
  const connectIP = getSocketIP(socket);

  // Check if IP is banned
  if (isIPBanned(connectIP)) {
    console.log(`🚫 Yasaklı IP bağlantı denedi: ${connectIP}`);
    socket.emit('banned', { message: 'Bu IP adresi yasaklanmıştır.' });
    socket.disconnect(true);
    return;
  }

  // Check connection limit per IP
  ipConnections[connectIP] = (ipConnections[connectIP] || 0) + 1;
  if (ipConnections[connectIP] > MAX_CONNECTIONS_PER_IP) {
    console.log(`⚠️ IP bağlantı limiti aşıldı: ${connectIP} (${ipConnections[connectIP]})`);
    socket.emit('banned', { message: 'Çok fazla bağlantı. Lütfen bekleyin.' });
    socket.disconnect(true);
    ipConnections[connectIP]--;
    return;
  }

  // Track connection count on disconnect
  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].spectators) rooms[currentRoom].spectators.delete(socket.id);
    ipConnections[connectIP] = Math.max(0, (ipConnections[connectIP] || 1) - 1);
  });

  // Event rate limiting middleware
  const originalOnEvent = socket.onevent;
  socket.onevent = function (packet) {
    const now = Date.now();
    if (!ipRateLimits[connectIP]) {
      ipRateLimits[connectIP] = { events: 0, resetTime: now + 1000, violations: 0 };
    }
    const rl = ipRateLimits[connectIP];
    if (now > rl.resetTime) {
      rl.events = 0;
      rl.resetTime = now + 1000;
    }
    rl.events++;
    if (rl.events > MAX_EVENTS_PER_SECOND) {
      rl.violations++;
      console.log(`⚡ Rate limit aşıldı: ${connectIP} (${rl.events} event/s, ihmal #${rl.violations})`);
      if (rl.violations >= AUTO_BAN_AFTER_VIOLATIONS) {
        // Auto-ban
        const nick = playerNicknames[socket.id] || 'Bilinmiyor';
        bannedPlayers.push({
          nickname: nick,
          ip: connectIP,
          userAgent: socket.handshake.headers['user-agent'] || '-',
          socketId: socket.id,
          bannedAt: new Date().toLocaleString('tr-TR'),
          reason: 'Otomatik: Rate limit ihlali',
        });
        saveBans();
        console.log(`🚫 ${nick} (${connectIP}) otomatik yasaklandı! (Rate limit)`);
        socket.emit('banned', { message: 'Şüpheli aktivite tespit edildi.' });
        socket.disconnect(true);
        return;
      }
      return; // Drop the event silently
    }
    originalOnEvent.call(socket, packet);
  };

  console.log(`Player connected: ${socket.id} (IP: ${connectIP}) [${ipConnections[connectIP]} conn]`);
  let currentRoom = null;

  // Auto-assign locked nickname if IP has one
  if (ipNicknames[connectIP]) {
    playerNicknames[socket.id] = ipNicknames[connectIP];
    socket.emit('lockedNickname', ipNicknames[connectIP]);
  }

  // Send room list and ranking on connect
  socket.emit('roomList', getRoomListForClient());
  const sorted = [...globalRanking].sort((a, b) => b.score - a.score);
  socket.emit('globalRanking', sorted.slice(0, 20));

  // Request room list
  socket.on('getRoomList', () => {
    socket.emit('roomList', getRoomListForClient());
  });

  // Set nickname (locked to IP)
  socket.on('setNickname', (nickname) => {
    const ip = getSocketIP(socket);

    // If IP already has a locked nick, enforce it
    if (ipNicknames[ip]) {
      playerNicknames[socket.id] = ipNicknames[ip];
      socket.emit('lockedNickname', ipNicknames[ip]);
      return;
    }

    const clean = String(nickname || '').trim().slice(0, 16);
    if (!clean) return;

    // Check if this nick is already taken by a different IP
    for (const [existingIP, existingNick] of Object.entries(ipNicknames)) {
      if (existingNick.toLowerCase() === clean.toLowerCase() && existingIP !== ip) {
        socket.emit('nickError', 'Bu takma ad zaten kullanılıyor! Başka bir isim seç.');
        return;
      }
    }

    playerNicknames[socket.id] = clean;

    // Lock this nick to this IP
    ipNicknames[ip] = clean;
    saveNicknames();

    const userAgent = socket.handshake.headers['user-agent'] || 'Bilinmiyor';
    const timestamp = new Date().toLocaleString('tr-TR');
    const logLine = `[${timestamp}] Nick: "${clean}" | IP: ${ip} | Browser: ${userAgent} | Socket: ${socket.id}\n`;
    console.log(`📝 ${logLine.trim()}`);
    fs.appendFileSync(path.join(__dirname, 'players.log'), logLine);
  });

  // Nickname change (unlimited, logged)
  socket.on('changeNickname', (newNick) => {
    const ip = getSocketIP(socket);
    const clean = String(newNick || '').trim().slice(0, 16);
    if (!clean) return;

    // Check if taken
    for (const [existingIP, existingNick] of Object.entries(ipNicknames)) {
      if (existingNick.toLowerCase() === clean.toLowerCase() && existingIP !== ip) {
        socket.emit('nickError', 'Bu takma ad zaten kullanılıyor!');
        return;
      }
    }

    const oldNick = ipNicknames[ip] || playerNicknames[socket.id] || 'Anonim';
    playerNicknames[socket.id] = clean;
    ipNicknames[ip] = clean;
    saveNicknames();
    socket.emit('lockedNickname', clean);
    socket.emit('nickChanged', clean);
    console.log('[Nick Change] ' + oldNick + ' -> ' + clean + ' (IP: ' + ip + ')');
  });

  // Join room
  socket.on('joinRoom', (roomId, callback) => {
    const room = rooms[roomId];

    if (!room) {
      callback({ success: false, error: 'Oda bulunamadı!' });
      return;
    }

    if (room.status === 'playing' || room.status === 'finished') {
      callback({ success: false, error: 'Oyun şu anda devam ediyor.' });
      return;
    }

    // Require nickname
    if (!playerNicknames[socket.id] || playerNicknames[socket.id].trim() === '') {
      callback({ success: false, error: 'NICK_REQUIRED' });
      return;
    }

    if (room.status === 'countdown') {
      callback({ success: false, error: 'Geri sayım başladı, bekleyin!' });
      return;
    }

    const teamId = room.gameState.getAvailableTeam();
    if (!teamId) {
      callback({ success: false, error: 'Oda dolu! (Max 4 oyuncu)' });
      return;
    }

    // Leave previous room
    if (currentRoom && rooms[currentRoom]) {
      leaveRoom(socket, currentRoom);
    }

    room.gameState.addPlayer(socket.id, teamId);
    currentRoom = roomId;
    socket.join(roomId);

    console.log(`Player ${socket.id} joined room ${roomId} as ${teamId}`);

    callback({
      success: true,
      roomId,
      teamId,
      roomDetail: getRoomDetail(roomId),
    });

    // Notify others in room
    socket.to(roomId).emit('roomDetail', getRoomDetail(roomId));
    broadcastRoomList();
  });

  // Leave room
  socket.on('leaveRoom', () => {
    if (currentRoom) {
      leaveRoom(socket, currentRoom);
      currentRoom = null;
    }
  });

  // Leave game (mid-game exit - replaced by bot)
  socket.on('leaveGame', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const roomId = currentRoom; // capture before nulling
    const room = rooms[roomId];
    const player = room.gameState.players[socket.id];

    if (player && room.status === 'playing') {
      const teamId = player.teamId;
      room.gameState.removePlayer(socket.id);
      room.gameState.addBot(teamId);
      room.bots[teamId] = new BotAI(teamId);
      socket.leave(roomId);
      console.log(`Player ${socket.id} left game in ${roomId}, bot replacing ${teamId}`);

      // Check if any human players remain
      const humanPlayers = Object.keys(room.gameState.players);
      if (humanPlayers.length === 0) {
        if (room.intervalId) clearInterval(room.intervalId);
        room.status = 'finished';
        setTimeout(() => {
          resetRoom(roomId);
          broadcastRoomList();
        }, 5000);
      } else {
        io.to(roomId).emit('playerLeftMidGame', {
          teamId,
          teamName: TEAMS[teamId].name,
        });
      }

      currentRoom = null;
      broadcastRoomList();
    }
  });

  // Toggle ready
  socket.on('toggleReady', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    if (room.status === 'playing') return;

    if (room.readyPlayers.has(socket.id)) {
      room.readyPlayers.delete(socket.id);
      // If countdown was running, cancel it
      if (room.status === 'countdown') {
        cancelCountdown(currentRoom);
      }
    } else {
      room.readyPlayers.add(socket.id);
    }

    // Update room detail for all in room
    io.to(currentRoom).emit('roomDetail', getRoomDetail(currentRoom));

    // Check if everyone is ready
    if (checkAllReady(room) && Object.keys(room.gameState.players).length > 0) {
      if (Object.keys(room.gameState.players).length >= 4) {
        // 4 players = start immediately with countdown
        startCountdown(currentRoom);
      } else {
        // Less than 4 = start countdown (all must be ready)
        startCountdown(currentRoom);
      }
    }
  });

  // Change team
  socket.on('changeTeam', (teamId, callback) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    if (room.status !== 'waiting') {
      callback({ success: false, error: 'Şu an takım değiştirilemez!' });
      return;
    }

    const assigned = room.gameState.getAssignedTeams();
    if (assigned.includes(teamId) && room.gameState.players[socket.id]?.teamId !== teamId) {
      callback({ success: false, error: 'Bu takım zaten alındı!' });
      return;
    }

    // Remove old assignment, un-ready
    room.gameState.removePlayer(socket.id);
    room.gameState.addPlayer(socket.id, teamId);
    room.readyPlayers.delete(socket.id);

    callback({ success: true, teamId });
    io.to(currentRoom).emit('roomDetail', getRoomDetail(currentRoom));
    broadcastRoomList();
  });

  // Player commands (in-game)
  socket.on('moveUnits', (data) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.gameState.players[socket.id];
    if (!player) return;

    room.gameState.moveUnits(
      player.teamId,
      data.unitIds,
      data.targetX,
      data.targetY
    );
  });

  // Place defense turret
  socket.on('placeDefense', (data, callback) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.gameState.players[socket.id];
    if (!player) return;
    const result = room.gameState.placeDefense(player.teamId, data.x, data.y);
    if (callback) callback(result);
  });

  // Place gold mine
  socket.on('placeGoldMine', (data, callback) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.gameState.players[socket.id];
    if (!player) return;
    const result = room.gameState.placeGoldMine(player.teamId, data.x, data.y);
    if (callback) callback(result);
  });

  // Purchase upgrade
  socket.on('purchaseUpgrade', (data, callback) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.gameState.players[socket.id];
    if (!player) return;
    const result = room.gameState.purchaseUpgrade(player.teamId, data.type);
    if (callback) callback(result);
  });

  // Spectate room
  socket.on('spectateRoom', (roomId, callback) => {
    if (!rooms[roomId]) { if (callback) callback({ success: false }); return; }
    currentRoom = roomId;
    socket.join(roomId);
    if (!rooms[roomId].spectators) rooms[roomId].spectators = new Set();
    rooms[roomId].spectators.add(socket.id);
    if (callback) callback({ success: true });
  });

  // Replace bot with spectator
  socket.on('replaceBot', (data, callback) => {
    console.log('[replaceBot] Request:', data, 'currentRoom:', currentRoom);
    if (!currentRoom || !rooms[currentRoom]) {
      console.log('[replaceBot] No room');
      if (callback) callback({ success: false, error: 'Oda bulunamadi!' });
      return;
    }
    const room = rooms[currentRoom];
    const teamId = data.teamId;
    if (!room.gameState || !room.gameState.botTeams) {
      if (callback) callback({ success: false, error: 'Oyun bulunamadi!' });
      return;
    }
    console.log('[replaceBot] botTeams type:', typeof room.gameState.botTeams, 'isSet:', room.gameState.botTeams instanceof Set, 'contents:', [...(room.gameState.botTeams || [])]);
    // botTeams might be a Set - check both .has and array includes
    const isBot = room.gameState.botTeams instanceof Set
      ? room.gameState.botTeams.has(teamId)
      : (Array.isArray(room.gameState.botTeams) ? room.gameState.botTeams.includes(teamId) : false);
    console.log('[replaceBot] isBot:', isBot, 'teamId:', teamId);
    if (!isBot) {
      if (callback) callback({ success: false, error: 'Bu takim bot degil! (' + teamId + ')' });
      return;
    }
    if (room.spectators) room.spectators.delete(socket.id);
    if (room.bots) delete room.bots[teamId];
    if (room.gameState.botTeams instanceof Set) { room.gameState.botTeams.delete(teamId); } else if (Array.isArray(room.gameState.botTeams)) { room.gameState.botTeams = room.gameState.botTeams.filter(t => t !== teamId); }
    room.gameState.players[socket.id] = { id: socket.id, teamId, ready: true };
    if (callback) callback({ success: true, teamId });
  });

  // Spectator chat
  socket.on('spectatorChat', (text) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    if (!text || typeof text !== 'string') return;
    const msg = text.trim().slice(0, 200);
    if (!msg) return;
    const nickname = playerNicknames[socket.id] || 'Izleyici';
    io.to(currentRoom).emit('chatMessage', { nickname: '\uD83D\uDC41 ' + nickname, text: msg, teamId: 'spectator' });
  });

  // In-game chat
  socket.on('chatMessage', (text) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    if (!text || typeof text !== 'string') return;
    const msg = text.trim().slice(0, 200);
    if (!msg) return;
    const nickname = playerNicknames[socket.id] || 'Oyuncu';
    const player = rooms[currentRoom].gameState.players[socket.id];
    const teamId = player ? player.teamId : null;
    const timestamp = new Date().toLocaleString('tr-TR');
    fs.appendFileSync(path.join(__dirname, 'chats.log'),
      `[${timestamp}] [${currentRoom}] ${nickname} (${teamId || 'lobi'}): ${msg}\n`);
    io.to(currentRoom).emit('chatMessage', {
      nickname,
      teamId,
      text: msg,
      time: Date.now(),
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete playerNicknames[socket.id];
    if (currentRoom && rooms[currentRoom]) {
      const room = rooms[currentRoom];
      const player = room.gameState.players[socket.id];

      if (player && room.status === 'playing' && !room.gameState.gameOver) {
        // Mid-game disconnect: replace player with bot
        const teamId = player.teamId;
        room.gameState.removePlayer(socket.id);
        room.gameState.addBot(teamId);
        room.bots[teamId] = new BotAI(teamId);
        console.log(`Player ${socket.id} disconnected, bot replacing ${teamId}`);

        // Check if any human players remain
        const humanPlayers = Object.keys(room.gameState.players);
        if (humanPlayers.length === 0) {
          if (room.intervalId) clearInterval(room.intervalId);
          room.status = 'finished';
          setTimeout(() => {
            resetRoom(currentRoom);
            broadcastRoomList();
          }, 5000);
        }
      } else {
        leaveRoom(socket, currentRoom);
      }
    }
  });

  function leaveRoom(sock, roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.gameState.removePlayer(sock.id);
    room.readyPlayers.delete(sock.id);
    sock.leave(roomId);

    // If was in countdown, check if we should cancel
    if (room.status === 'countdown') {
      if (!checkAllReady(room) || Object.keys(room.gameState.players).length === 0) {
        cancelCountdown(roomId);
      }
    }

    io.to(roomId).emit('roomDetail', getRoomDetail(roomId));
    broadcastRoomList();
  }
});

// Initialize rooms
initRooms();

const PORT = process.env.PORT || 80;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 Renk Savaşları Server running on http://localhost:${PORT}`);
  console.log(`   ${ROOM_COUNT} rooms ready!`);
  console.log(`\n📋 Konsol komutları:`);
  console.log(`   /ban <nick>     - Oyuncuyu yasakla`);
  console.log(`   /unban <nick>   - Yasağı kaldır`);
  console.log(`   /bans           - Yasaklı oyuncuları listele`);
  console.log(`   /players        - Çevrimiçi oyuncuları listele\n`);
});

// --- Console Commands (stdin) ---
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.on('line', (line) => {
  const input = line.trim();
  if (!input) return;

  if (input === '/players') {
    const sockets = [...io.sockets.sockets.values()];
    if (sockets.length === 0) {
      console.log('ℹ️ Çevrimiçi oyuncu yok.');
      return;
    }
    console.log(`\n👥 Çevrimiçi Oyuncular (${sockets.length}):`);
    for (const s of sockets) {
      const nick = playerNicknames[s.id] || '(nick yok)';
      const ip = getSocketIP(s);
      const ua = s.handshake.headers['user-agent'] || '-';
      console.log(`  • ${nick} | IP: ${ip} | Socket: ${s.id}`);
      console.log(`    Browser: ${ua}`);
    }
    console.log('');
    return;
  }

  if (input === '/bans') {
    if (bannedPlayers.length === 0) {
      console.log('ℹ️ Yasaklı oyuncu yok.');
      return;
    }
    console.log(`\n🚫 Yasaklı Oyuncular (${bannedPlayers.length}):`);
    for (const b of bannedPlayers) {
      console.log(`  • ${b.nickname} | IP: ${b.ip} | Tarih: ${b.bannedAt}`);
      if (b.userAgent) console.log(`    Browser: ${b.userAgent}`);
    }
    console.log('');
    return;
  }

  if (input.startsWith('/ban ')) {
    const targetNick = input.slice(5).trim();
    if (!targetNick) {
      console.log('❌ Kullanım: /ban <nick>');
      return;
    }

    // Find online player with this nick
    let found = false;
    for (const [sid, nick] of Object.entries(playerNicknames)) {
      if (nick.toLowerCase() === targetNick.toLowerCase()) {
        const s = io.sockets.sockets.get(sid);
        if (!s) continue;
        const ip = getSocketIP(s);
        const userAgent = s.handshake.headers['user-agent'] || '-';

        // Check if already banned
        if (bannedPlayers.some((b) => b.ip === ip)) {
          console.log(`⚠️ ${nick} (${ip}) zaten yasaklı.`);
          found = true;
          break;
        }

        bannedPlayers.push({
          nickname: nick,
          ip,
          userAgent,
          socketId: sid,
          bannedAt: new Date().toLocaleString('tr-TR'),
        });
        saveBans();

        // Kick the player
        s.emit('banned', { message: 'Yasaklandınız!' });
        s.disconnect(true);

        console.log(`✅ ${nick} yasaklandı! (IP: ${ip})`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`❌ "${targetNick}" adında çevrimiçi oyuncu bulunamadı.`);
    }
    return;
  }

  if (input.startsWith('/unban ')) {
    const targetNick = input.slice(7).trim();
    if (!targetNick) {
      console.log('❌ Kullanım: /unban <nick>');
      return;
    }
    const idx = bannedPlayers.findIndex((b) => b.nickname.toLowerCase() === targetNick.toLowerCase());
    if (idx === -1) {
      console.log(`❌ "${targetNick}" adında yasaklı oyuncu bulunamadı.`);
      return;
    }
    const removed = bannedPlayers.splice(idx, 1)[0];
    saveBans();
    console.log(`✅ ${removed.nickname} (${removed.ip}) yasağı kaldırıldı.`);
    return;
  }

  console.log('❓ Bilinmeyen komut. Kullanılabilir: /ban /unban /bans /players');
});

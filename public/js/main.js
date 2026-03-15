// Main game entry point
(() => {
  // State
  let myTeamId = null;
  let mySocketId = null;
  let currentRoomId = null;
  let gameState = null;
  let selectedUnits = new Set();
  let isInGame = false;
  let isReady = false;
  let defensePlacing = false;
let minePlacing = false;

  // Init
  const socket = Network.init();

  // Spectator functions (global for onclick)
  window.spectateRoom = function(roomId) {
    socket.emit('spectateRoom', roomId, function(res) {
      if (res && res.success) {
        isInGame = true;
        document.getElementById('lobby-overlay').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        var specBar = document.getElementById('spectator-bar');
        if (!specBar) {
          specBar = document.createElement('div');
          specBar.id = 'spectator-bar';
          specBar.className = 'spectator-bar';
          document.getElementById('hud').appendChild(specBar);
        }
        specBar.style.display = 'flex';
      }
    });
  };

  window.replaceBot = function(teamId) {
    console.log('[Spectator] Requesting replaceBot:', teamId);
    socket.emit('replaceBot', { teamId: teamId }, function(res) {
      console.log('[Spectator] replaceBot response:', res);
      if (res && res.success) {
        myTeamId = res.teamId;
        var specBar = document.getElementById('spectator-bar');
        if (specBar) specBar.style.display = 'none';
      } else {
        alert(res && res.error ? res.error : 'Bot degistirme basarisiz!');
      }
    });
  };

  window.changeNickname = function() {
    var newNick = prompt('Yeni takma adınızı girin (tek seferlik):');
    if (newNick && newNick.trim()) {
      socket.emit('changeNickname', newNick.trim());
    }
  };
  const canvas = document.getElementById('game-canvas');
  Renderer.init(canvas);
  Input.init(canvas);

  // Store socket id
  socket.on('connect', () => {
    mySocketId = socket.id;
    // Send saved nickname
    const savedNick = document.getElementById('input-nickname').value.trim();
    if (savedNick) {
      Network.getSocket().emit('setNickname', savedNick);
    }
  });

  socket.on('banned', (data) => {
    alert(data.message || 'Yasaklandınız!');
    window.location.reload();
  });

  socket.on('lockedNickname', (nick) => {
    const input = document.getElementById('input-nickname');
    input.value = nick;
    input.disabled = true;
    input.title = 'Takma adınız kilitli';
  });

  socket.on('nickError', (msg) => {
    alert(msg);
    document.getElementById('input-nickname').value = '';
  });

  // Send nickname on change
  document.getElementById('input-nickname').addEventListener('input', (e) => {
    const nick = e.target.value.trim();
    if (nick) {
      Network.getSocket().emit('setNickname', nick);
    }
  });

  // --- Input callbacks ---
  Input.setCallbacks(
    // onSelect (box select)
    (x1, y1, x2, y2, additive) => {
      if (!isInGame || !gameState) return;

      // Defense placement mode: click to place
      if (defensePlacing) {
        const clickX = (x1 + x2) / 2;
        const clickY = (y1 + y2) / 2;
        Network.getSocket().emit('placeDefense', { x: clickX, y: clickY }, (res) => {
          if (res && !res.success) {
            UI.showError(res.error);
          }
        });
        defensePlacing = false;
        canvas.style.cursor = 'default';
        document.getElementById('btn-place-defense').classList.remove('active');
        return;
      }

      // Gold mine placement mode: click to place
      if (minePlacing) {
        const clickX = (x1 + x2) / 2;
        const clickY = (y1 + y2) / 2;
        Network.getSocket().emit('placeGoldMine', { x: clickX, y: clickY }, (res) => {
          if (res && !res.success) {
            UI.showError(res.error);
          }
        });
        minePlacing = false;
        canvas.style.cursor = 'default';
        document.getElementById('btn-place-mine').classList.remove('active');
        return;
      }
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      if (width < 5 && height < 5) {
        const clickX = (x1 + x2) / 2;
        const clickY = (y1 + y2) / 2;
        if (!additive) selectedUnits.clear();
        for (const unit of gameState.units) {
          if (unit.teamId !== myTeamId) continue;
          const dx = unit.x - clickX;
          const dy = unit.y - clickY;
          if (Math.sqrt(dx * dx + dy * dy) < 15) {
            if (selectedUnits.has(unit.id)) {
              selectedUnits.delete(unit.id);
            } else {
              selectedUnits.add(unit.id);
            }
            break;
          }
        }
      } else {
        if (!additive) selectedUnits.clear();
        for (const unit of gameState.units) {
          if (unit.teamId !== myTeamId) continue;
          if (unit.x >= x1 && unit.x <= x2 && unit.y >= y1 && unit.y <= y2) {
            selectedUnits.add(unit.id);
          }
        }
      }
    },
    // onMove (right click)
    (targetX, targetY) => {
      if (!isInGame || selectedUnits.size === 0) return;
      Network.moveUnits([...selectedUnits], targetX, targetY);
    },
    // onSelectAll
    () => {
      if (!isInGame || !gameState) return;
      selectedUnits.clear();
      for (const unit of gameState.units) {
        if (unit.teamId === myTeamId && !unit.dead) {
          selectedUnits.add(unit.id);
        }
      }
    }
  );

  // Defense placement button
  document.getElementById('btn-place-defense').addEventListener('click', () => {
    if (!isInGame) return;
    defensePlacing = !defensePlacing;
    canvas.style.cursor = defensePlacing ? 'crosshair' : 'default';
    document.getElementById('btn-place-defense').classList.toggle('active', defensePlacing);
  });

  // ESC cancels defense placement
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (defensePlacing || minePlacing)) {
      defensePlacing = false;
      canvas.style.cursor = 'default';
      document.getElementById('btn-place-defense').classList.remove('active');
      minePlacing = false;
      document.getElementById('btn-place-mine').classList.remove('active');
    }

    // T key - center camera on own base
    if ((e.key === 't' || e.key === 'T') && isInGame && gameState && myTeamId) {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      const base = gameState.bases && gameState.bases[myTeamId];
      if (base && !base.destroyed) {
        const cam = Renderer.getCamera();
        Renderer.setCamera(base.x, base.y, cam.zoom);
      }
    }
  });

  // Gold mine placement button
  document.getElementById('btn-place-mine').addEventListener('click', () => {
    if (!isInGame) return;
    minePlacing = !minePlacing;
    defensePlacing = false;
    canvas.style.cursor = minePlacing ? 'crosshair' : 'default';
    document.getElementById('btn-place-mine').classList.toggle('active', minePlacing);
    document.getElementById('btn-place-defense').classList.remove('active');
  });

  // Upgrade buttons
  document.querySelectorAll('.btn-upgrade').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isInGame) return;
      const type = btn.dataset.type;
      Network.getSocket().emit('purchaseUpgrade', { type }, (res) => {
        if (res && !res.success) {
          UI.showError(res.error);
        }
      });
    });

  // Collapsible panels
  document.querySelectorAll('.collapse-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.dataset.target;
      const target = document.getElementById(targetId);
      if (target) {
        const isHidden = target.style.display === 'none';
        target.style.display = isHidden ? '' : 'none';
        btn.textContent = isHidden ? '−' : '+';
        btn.closest('.collapsible').classList.toggle('collapsed', !isHidden);
      }
    });
  });

  });

  // --- Global Ranking ---
  Network.on('globalRanking', (ranking) => {
    UI.updateGlobalRanking(ranking);
  });

  // --- Room List ---
  Network.on('roomList', (rooms) => {
    UI.updateRoomList(rooms, (roomId) => {
      // Join room callback
      Network.joinRoom(roomId, (res) => {
        if (res.success) {
          currentRoomId = res.roomId;
          myTeamId = res.teamId;
          isReady = false;
          UI.showRoomDetail(res.roomId);
          UI.updateRoomDetail(res.roomDetail, mySocketId);
        } else if (res.error === 'NICK_REQUIRED') {
          showNickPopup(roomId);
        } else {
          UI.showError(res.error);
        }
      });
    });
  });

  // --- Nickname Popup ---
  function showNickPopup(pendingRoomId) {
    const existing = document.getElementById('nick-popup-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'nick-popup-overlay';
    overlay.innerHTML = `
      <div class="nick-popup">
        <h3>⚠️ Takma Ad Gerekli</h3>
        <p>Odaya katılmak için bir takma ad girmelisin.</p>
        <input id="nick-popup-input" type="text" placeholder="Takma adını yaz..." maxlength="20" autofocus />
        <br>
        <button id="nick-popup-btn">Tamam</button>
      </div>
    `;
    document.body.appendChild(overlay);

    function submitNick() {
      const nick = document.getElementById('nick-popup-input').value.trim();
      if (!nick) return;
      document.getElementById('input-nickname').value = nick;
      Network.getSocket().emit('setNickname', nick);
      overlay.remove();
      // Re-try joining the room
      if (pendingRoomId) {
        Network.joinRoom(pendingRoomId, (res) => {
          if (res.success) {
            currentRoomId = res.roomId;
            myTeamId = res.teamId;
            isReady = false;
            UI.showRoomDetail(res.roomId);
            UI.updateRoomDetail(res.roomDetail, mySocketId);
          } else {
            UI.showError(res.error);
          }
        });
      }
    }

    document.getElementById('nick-popup-btn').addEventListener('click', submitNick);
    document.getElementById('nick-popup-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitNick();
    });
  }

  // --- Room Detail Events ---
  Network.on('roomDetail', (detail) => {
    UI.updateRoomDetail(detail, mySocketId);
  });

  // Leave room button
  document.getElementById('btn-leave-room').addEventListener('click', () => {
    Network.leaveRoom();
    currentRoomId = null;
    myTeamId = null;
    isReady = false;
    UI.showLobbyBrowser();
    Network.getRoomList();
  });

  // Ready button
  document.getElementById('btn-ready').addEventListener('click', () => {
    isReady = !isReady;
    UI.setReadyState(isReady);
    Network.toggleReady();
  });

  // Team selector
  document.querySelectorAll('.team-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const teamId = btn.dataset.team;
      Network.changeTeam(teamId, (res) => {
        if (res.success) {
          myTeamId = res.teamId;
          // Un-ready on team change
          isReady = false;
          UI.setReadyState(false);
        } else {
          UI.showError(res.error);
        }
      });
    });
  });

  // --- Countdown Events ---
  Network.on('countdownStarted', (data) => {
    UI.showCountdown(data.seconds);
  });

  Network.on('countdownTick', (data) => {
    UI.updateCountdown(data.seconds);
  });

  Network.on('countdownCancelled', () => {
    UI.hideCountdown();
  });

  // --- Game Events ---
  Network.on('gameStarted', (state) => {
    isInGame = true;
    gameState = state;
    selectedUnits.clear();
    UI.showGame();
    UI.resetScoreFeed();

    // Camera to my base position (random each game)
    const mySpawn = state.spawnPositions?.[myTeamId] || { x: 5000, y: 5000 };
    Renderer.setCamera(mySpawn.x, mySpawn.y, 1);
  });

  Network.on('gameState', (state) => {
    gameState = state;

    if (gameState.units) {
      const aliveIds = new Set(gameState.units.map((u) => u.id));
      for (const id of selectedUnits) {
        if (!aliveIds.has(id)) selectedUnits.delete(id);
      }
    }

    // Update gold display
    const myGold = (state.gold && state.gold[myTeamId]) || 0;
    const goldEl = document.getElementById('gold-display');
    if (goldEl) goldEl.textContent = `⛏ ${myGold} Altın`;

    // Update upgrade buttons
    if (state.upgrades && state.upgradeCosts) {
      const myUpgrades = state.upgrades[myTeamId] || {};
      const upgMult = (state.upgradeCostMultipliers && state.upgradeCostMultipliers[myTeamId]) || 1.0;
      const types = [
        { key: 'speed', label: '⚡ Hız', costs: state.upgradeCosts.speed },
        { key: 'attack', label: '⚔️ Atak', costs: state.upgradeCosts.attack },
        { key: 'hp', label: '❤️ Can', costs: state.upgradeCosts.hp },
        { key: 'baseHp', label: '🏰 Kale', costs: state.upgradeCosts.baseHp },
      ];
      for (const t of types) {
        const btn = document.getElementById('btn-upgrade-' + (t.key === 'baseHp' ? 'basehp' : t.key));
        if (!btn) continue;
        const lvl = myUpgrades[t.key] || 0;
        if (lvl >= t.costs.length) {
          btn.textContent = t.label + ' MAX';
          btn.disabled = true;
        } else {
          const realCost = Math.round(t.costs[lvl] * upgMult);
          btn.textContent = t.label + ' Lv' + lvl + ' (' + realCost + ')';
          btn.disabled = false;
        }
      }
    }

    // Update maxUnits button
    const maxBtn = document.getElementById('btn-upgrade-maxunits');
    if (maxBtn && state.upgrades) {
      const muLvl = (state.upgrades[myTeamId] && state.upgrades[myTeamId].maxUnits) || 0;
      const muMult = (state.upgradeCostMultipliers && state.upgradeCostMultipliers[myTeamId]) || 1.0;
      maxBtn.textContent = '👥 Asker +' + (muLvl * 10) + ' (' + Math.round(50000 * muMult) + ')';
    }

    // Update spectator bar (only if botTeams changed)
    var specBar = document.getElementById('spectator-bar');
    if (specBar && specBar.style.display !== 'none' && state.botTeams) {
      var botKey = state.botTeams.join(',');
      if (specBar.dataset.botKey !== botKey) {
        specBar.dataset.botKey = botKey;
        var teamColorMap = {green:'#2ecc71',purple:'#9b59b6',yellow:'#f1c40f',gray:'#95a5a6',red:'#e74c3c',blue:'#3498db',pink:'#e91e9c',orange:'#e67e22'};
        var html = '<span>\uD83D\uDC41 İzleyici</span> ';
        state.botTeams.forEach(function(bt) {
          html += '<button class="btn-replace" onclick="replaceBot(\'' + bt + '\')" style="border-color:' + (teamColorMap[bt]||'#aaa') + '">' + bt + '</button> ';
        });
        specBar.innerHTML = html;
      }
    }

    // Update mine button cost
    const mineBtn = document.getElementById('btn-place-mine');
    if (mineBtn && state.mineCostMultipliers) {
      const mineMult = state.mineCostMultipliers[myTeamId] || 1.0;
      mineBtn.textContent = '💫 Altın Madeni (' + Math.round(5000 * mineMult) + ')';
    }

    // Update defense button cost
    const defBtn = document.getElementById('btn-place-defense');
    if (defBtn && state.defenses && state.defenseCosts) {
      const myDefCount = state.defenses.filter((d) => d.teamId === myTeamId).length;
      if (myDefCount >= state.defenseCosts.length) {
        defBtn.textContent = '🏰 MAX';
        defBtn.disabled = true;
      } else {
        const baseCost = state.defenseCosts[myDefCount];
        const myMultiplier = state.defenseCostMultipliers && state.defenseCostMultipliers[myTeamId] || 1.0;
        const nextCost = Math.round(baseCost * myMultiplier);
        defBtn.textContent = '🏰 Savunma Kur (' + nextCost + ')';
        defBtn.disabled = false;
      }
    }

    UI.updateHUD(state.teamStats, myTeamId);
    UI.updateScoreboard(state.teamStats);
    UI.updateScoreFeed(state.scoreEvents);
  });

  Network.on('gameOver', (data) => {
    const teamColors = {
      green: '#2ecc71',
      purple: '#9b59b6',
      yellow: '#f1c40f',
      gray: '#95a5a6',
      red: '#e74c3c',
      blue: '#3498db',
      pink: '#e91e9c',
      orange: '#e67e22',
    };
    const reason = data.reason === 'time_up' ? 'Süre doldu!' : 'Üs yıkıldı!';
    UI.showGameOver(data.winnerName, teamColors[data.winner], reason);
  });

  // --- Player Eliminated (watch mode) ---
  Network.on('playerEliminated', (data) => {
    // Show elimination overlay but keep watching
    UI.showEliminatedOverlay(data.message || 'Elendin!');
  });

  // --- Chat ---
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');
  const roomChatInput = document.getElementById('room-chat-input');
  const roomChatMessages = document.getElementById('room-chat-messages');

  // Prevent WASD camera movement when typing
  chatInput.addEventListener('focus', () => Input.setChatFocused(true));
  chatInput.addEventListener('blur', () => Input.setChatFocused(false));

  function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    Network.getSocket().emit('chatMessage', text);
    chatInput.value = '';
  }

  function sendRoomChat() {
    const text = roomChatInput.value.trim();
    if (!text) return;
    Network.getSocket().emit('chatMessage', text);
    roomChatInput.value = '';
  }

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
  document.getElementById('btn-chat-send').addEventListener('click', sendChat);

  roomChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendRoomChat();
  });
  document.getElementById('btn-room-chat-send').addEventListener('click', sendRoomChat);

  Network.on('chatMessage', (data) => {
    const teamColors = {
      green: '#2ecc71', purple: '#9b59b6',
      yellow: '#f1c40f', gray: '#95a5a6',
      red: '#e74c3c', blue: '#3498db', pink: '#e91e9c', spectator: '#888888',
      orange: '#e67e22',
    };
    const color = teamColors[data.teamId] || '#aaa';
    const html = `<span class="chat-nick" style="color:${color}">${data.nickname}:</span>${data.text}`;

    // Add to in-game chat
    const msg1 = document.createElement('div');
    msg1.className = 'chat-msg';
    msg1.innerHTML = html;
    chatMessages.appendChild(msg1);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    while (chatMessages.children.length > 50) chatMessages.removeChild(chatMessages.firstChild);

    // Add to room chat
    const msg2 = document.createElement('div');
    msg2.className = 'chat-msg';
    msg2.innerHTML = html;
    roomChatMessages.appendChild(msg2);
    roomChatMessages.scrollTop = roomChatMessages.scrollHeight;
    while (roomChatMessages.children.length > 50) roomChatMessages.removeChild(roomChatMessages.firstChild);
  });

  // --- Exit Game ---
  document.getElementById('btn-exit-game').addEventListener('click', () => {
    Network.leaveGame();
    isInGame = false;
    selectedUnits.clear();
    gameState = null;
    currentRoomId = null;
    myTeamId = null;
    isReady = false;
    UI.showLobbyBrowser();
    Network.getRoomList();
  });

  // Back to lobby from game over
  document.getElementById('btn-back-lobby').addEventListener('click', () => {
    isInGame = false;
    selectedUnits.clear();
    gameState = null;
    currentRoomId = null;
    myTeamId = null;
    isReady = false;
    UI.showLobbyBrowser();
    Network.getRoomList();
  });

  // --- Game Loop ---
  function gameLoop() {
    if (isInGame && gameState) {
      Input.updateCamera();
      Renderer.render(gameState, selectedUnits, myTeamId);

      const selBox = Input.getSelectionBox();
      if (selBox) {
        Renderer.drawSelectionBox(selBox.x1, selBox.y1, selBox.x2, selBox.y2);
      }
    }

    requestAnimationFrame(gameLoop);
  }

  gameLoop();

  // Show initial lobby
  UI.showLobbyBrowser();
})();

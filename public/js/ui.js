// UI module - Lobby and HUD management
const UI = (() => {
  const TEAM_COLORS = {
    green: { name: 'Yeşil', color: '#2ecc71' },
    purple: { name: 'Mor', color: '#9b59b6' },
    yellow: { name: 'Sarı', color: '#f1c40f' },
    gray: { name: 'Gri', color: '#95a5a6' },
    red: { name: 'Kırmızı', color: '#e74c3c' },
    blue: { name: 'Mavi', color: '#3498db' },
    pink: { name: 'Pembe', color: '#e91e9c' },
    orange: { name: 'Turuncu', color: '#e67e22' },
  };

  const STATUS_MAP = {
    waiting: { text: 'Bekleniyor', class: 'status-waiting' },
    countdown: { text: 'Başlıyor...', class: 'status-countdown' },
    playing: { text: 'Oynanıyor', class: 'status-playing' },
    finished: { text: 'Bitti', class: 'status-finished' },
  };

  function showLobbyBrowser() {
    document.getElementById('lobby-overlay').style.display = 'flex';
    document.getElementById('room-browser').style.display = 'block';
    document.getElementById('room-detail').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('gameover-overlay').style.display = 'none';
  }

  function showRoomDetail(roomId) {
    document.getElementById('room-browser').style.display = 'none';
    document.getElementById('room-detail').style.display = 'block';
    document.getElementById('room-code').textContent = roomId;

    // Reset ready button
    const readyBtn = document.getElementById('btn-ready');
    readyBtn.classList.remove('ready-active');
    readyBtn.innerHTML = '<span class="btn-icon">✋</span> HAZIR';

    // Show ready section, hide countdown
    document.getElementById('ready-section').style.display = 'block';
    document.getElementById('countdown-display').style.display = 'none';
  }

  function updateRoomList(rooms, onJoin) {
    const container = document.getElementById('room-list');
    container.innerHTML = '';

    for (const room of rooms) {
      const row = document.createElement('div');
      row.className = 'room-row';

      const statusInfo = STATUS_MAP[room.status] || STATUS_MAP.waiting;

      // Team dots
      let teamDots = '';
      for (const team of room.teams) {
        teamDots += `<div class="room-team-dot" style="background:${team.teamColor}" title="${team.teamName}"></div>`;
      }
      // Empty slots
      for (let i = room.teams.length; i < 8; i++) {
        teamDots += `<div class="room-team-dot room-team-empty"></div>`;
      }

      const canJoin = room.status === 'waiting' && room.playerCount < 8;

      row.innerHTML = `
        <span class="room-row-name">${room.roomId}</span>
        <div class="room-row-teams">${teamDots}</div>
        <span class="room-row-count">${room.playerCount}/8</span>
        <span class="room-row-status ${statusInfo.class}">${statusInfo.text}</span>
        <button class="btn btn-join-room ${canJoin ? '' : 'btn-disabled'}" ${canJoin ? '' : 'disabled'}>
          ${room.status === 'playing' ? '🔒' : 'Katıl'}
        </button>
        ${room.status === 'playing' ? '<button class="btn btn-spectate" data-room="' + room.roomId + '">👁</button>' : ''}
      `;

      if (canJoin) {
        row.querySelector('.btn-join-room').addEventListener('click', () => {
          onJoin(room.roomId);
        });
      }

      const specBtn = row.querySelector('.btn-spectate');
      if (specBtn) {
        specBtn.addEventListener('click', () => {
          window.spectateRoom(specBtn.dataset.room);
        });
      }

      container.appendChild(row);
    }
  }

  function updateRoomDetail(detail, mySocketId) {
    const container = document.getElementById('players-container');
    container.innerHTML = '';

    // Update player list
    for (const [sid, data] of Object.entries(detail.players)) {
      const entry = document.createElement('div');
      entry.className = 'player-entry';
      const readyIcon = data.ready ? '✅' : '⏳';
      const name = data.nickname || data.teamName;
      entry.innerHTML = `
        <div class="player-dot" style="background:${data.teamColor}; box-shadow: 0 0 6px ${data.teamColor}"></div>
        <span class="player-name">${name} <small style="color:${data.teamColor}">(${data.teamName})</small></span>
        <span class="player-ready">${readyIcon}</span>
        ${sid === mySocketId ? '<span class="player-host" style="color:#2ecc71">Sen</span>' : ''}
      `;
      container.appendChild(entry);
    }

    // Empty slots
    const emptySlots = 8 - detail.playerCount;
    for (let i = 0; i < emptySlots; i++) {
      const entry = document.createElement('div');
      entry.className = 'player-entry player-entry-empty';
      entry.innerHTML = `
        <div class="player-dot" style="background:rgba(100,100,100,0.3)"></div>
        <span class="player-name" style="color:var(--text-secondary)">Boş slot (Bot)</span>
      `;
      container.appendChild(entry);
    }

    // Update team selector
    const assignedTeams = Object.values(detail.players).map((p) => p.teamId);
    const myTeam = detail.players[mySocketId]?.teamId;

    document.querySelectorAll('.team-btn').forEach((btn) => {
      const teamId = btn.dataset.team;
      btn.classList.remove('active', 'taken');
      if (teamId === myTeam) {
        btn.classList.add('active');
      } else if (assignedTeams.includes(teamId)) {
        btn.classList.add('taken');
      }
    });
  }

  function setReadyState(isReady) {
    const readyBtn = document.getElementById('btn-ready');
    if (isReady) {
      readyBtn.classList.add('ready-active');
      readyBtn.innerHTML = '<span class="btn-icon">✅</span> HAZIRIM';
    } else {
      readyBtn.classList.remove('ready-active');
      readyBtn.innerHTML = '<span class="btn-icon">✋</span> HAZIR';
    }
  }

  function showCountdown(seconds) {
    document.getElementById('ready-section').style.display = 'none';
    document.getElementById('countdown-display').style.display = 'flex';
    document.getElementById('countdown-number').textContent = seconds;
  }

  function updateCountdown(seconds) {
    document.getElementById('countdown-number').textContent = seconds;
  }

  function hideCountdown() {
    document.getElementById('ready-section').style.display = 'block';
    document.getElementById('countdown-display').style.display = 'none';
  }

  function showGame() {
    document.getElementById('lobby-overlay').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('gameover-overlay').style.display = 'none';
  }

  function updateHUD(teamStats, myTeamId) {
    if (!teamStats) return;

    // My team info
    const myStats = teamStats[myTeamId];
    if (myStats) {
      const teamInfo = TEAM_COLORS[myTeamId];
      const badge = document.getElementById('my-team-badge');
      badge.style.color = teamInfo.color;
      badge.textContent = teamInfo.name;

      document.getElementById('unit-count').textContent = `Birim: ${myStats.unitCount}`;
      document.getElementById('zone-count').textContent = `Bölge: ${myStats.zoneCount} (♥${myStats.heartZones} ♦${myStats.diamondZones})`;
    }

    // All teams - card style
    const allTeamsEl = document.getElementById('all-teams-info');
    allTeamsEl.innerHTML = '';

    for (const [teamId, stats] of Object.entries(teamStats)) {
      const team = TEAM_COLORS[teamId];
      if (!team) continue;
      const isEliminated = stats.baseDestroyed && stats.unitCount === 0;
      const item = document.createElement('div');
      item.className = 'team-card' + (isEliminated ? ' eliminated' : '');
      
      let cardHtml = '';
      if (stats.isBot) {
        cardHtml += '<div class="team-card-bot">🤖</div>';
      }
      cardHtml += '<div class="team-card-color" style="background:' + team.color + '; box-shadow: 0 0 ' + (isEliminated ? '0' : '8') + 'px ' + team.color + '"></div>';
      cardHtml += '<div class="team-card-name">' + team.name + '</div>';
      if (isEliminated) {
        cardHtml += '<div class="team-card-x">✖</div>';
      }
      item.innerHTML = cardHtml;
      allTeamsEl.appendChild(item);
    }
  }

  function showGameOver(winnerName, winnerColor, reason) {
    const overlay = document.getElementById('gameover-overlay');
    overlay.style.display = 'flex';

    const title = document.getElementById('gameover-title');
    title.textContent = reason || 'Oyun Bitti!';
    title.style.color = winnerColor;

    document.getElementById('gameover-winner').textContent = `${winnerName} takımı kazandı!`;
    document.getElementById('gameover-winner').style.color = winnerColor;
  }

  function showError(msg) {
    const el = document.getElementById('lobby-error');
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 3000);
  }

  let lastEventCount = 0;

  function updateScoreboard(teamStats) {
    if (!teamStats) return;

    const list = document.getElementById('scoreboard-list');
    if (!list) return;
    list.innerHTML = '';

    // Sort teams by score descending
    const sorted = Object.entries(teamStats).sort((a, b) => (b[1].score || 0) - (a[1].score || 0));

    for (let i = 0; i < sorted.length; i++) {
      const [teamId, stats] = sorted[i];
      const team = TEAM_COLORS[teamId];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      const item = document.createElement('div');
      item.className = 'scoreboard-row';
      item.innerHTML = `
        <span class="scoreboard-rank">${medal || (i + 1)}</span>
        <div class="team-stat-dot" style="background:${team.color}"></div>
        <span class="scoreboard-name">${team.name}</span>
        <span class="scoreboard-score" style="color:${team.color}">${stats.score || 0}</span>
      `;
      list.appendChild(item);
    }
  }

  function updateScoreFeed(scoreEvents) {
    if (!scoreEvents || scoreEvents.length === lastEventCount) return;

    const feed = document.getElementById('score-feed');
    if (!feed) return;

    // Show only new events
    const newEvents = scoreEvents.slice(lastEventCount);
    lastEventCount = scoreEvents.length;

    for (const event of newEvents) {
      const team = TEAM_COLORS[event.teamId];
      const item = document.createElement('div');
      item.className = 'score-feed-item';
      item.innerHTML = `
        <span style="color:${team.color}">${team.name}</span>
        <span>+${event.points}</span>
        <span class="score-feed-reason">${event.reason}</span>
      `;
      feed.appendChild(item);

      // Remove after 4 seconds
      setTimeout(() => {
        item.classList.add('score-feed-fade');
        setTimeout(() => item.remove(), 500);
      }, 4000);
    }
  }

  function resetScoreFeed() {
    lastEventCount = 0;
    const feed = document.getElementById('score-feed');
    if (feed) feed.innerHTML = '';
  }

  function updateGlobalRanking(ranking) {
    const list = document.getElementById('ranking-list');
    if (!list) return;
    list.innerHTML = '';

    if (!ranking || ranking.length === 0) {
      list.innerHTML = '<p class="ranking-empty">Henüz sıralama yok</p>';
      return;
    }

    for (let i = 0; i < ranking.length; i++) {
      const entry = ranking[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const row = document.createElement('div');
      row.className = 'ranking-row';
      if (i < 3) row.classList.add('ranking-top');
      row.innerHTML = `
        <span class="ranking-rank">${medal}</span>
        <span class="ranking-name">${entry.nickname}</span>
        <span class="ranking-stats">${entry.wins}W / ${entry.gamesPlayed}G</span>
        <span class="ranking-score">${entry.score}</span>
      `;
      list.appendChild(row);
    }
  }

  function showEliminatedOverlay(message) {
    // Remove existing overlay if any
    const existing = document.getElementById('eliminated-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'eliminated-overlay';
    overlay.innerHTML = `
      <div class="eliminated-content">
        <span class="eliminated-icon">💀</span>
        <h2>Elendin!</h2>
        <p>${message}</p>
        <p class="eliminated-hint">Oyunu izlemeye devam edebilirsin</p>
        <button id="btn-eliminated-leave" class="btn btn-danger">Lobiye Dön</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('btn-eliminated-leave').addEventListener('click', () => {
      overlay.remove();
      // Trigger exit game
      document.getElementById('btn-exit-game').click();
    });
  }

  return {
    showLobbyBrowser,
    showRoomDetail,
    updateRoomList,
    updateRoomDetail,
    setReadyState,
    showCountdown,
    updateCountdown,
    hideCountdown,
    showGame,
    updateHUD,
    updateScoreboard,
    updateScoreFeed,
    resetScoreFeed,
    updateGlobalRanking,
    showGameOver,
    showError,
    showEliminatedOverlay,
    TEAM_COLORS,
  };
})();

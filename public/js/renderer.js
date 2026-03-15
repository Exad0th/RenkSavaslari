// Renderer module - Canvas drawing
const Renderer = (() => {
  let canvas, ctx;
  let camera = { x: 0, y: 0, zoom: 1 };
  let mapWidth = 10000;
  let mapHeight = 10000;

  const TEAM_COLORS = {
    green: { main: '#2ecc71', light: '#a9dfbf', dark: '#1e8449', glow: 'rgba(46, 204, 113, 0.3)' },
    purple: { main: '#9b59b6', light: '#d7bde2', dark: '#6c3483', glow: 'rgba(155, 89, 182, 0.3)' },
    yellow: { main: '#f1c40f', light: '#f9e79f', dark: '#b7950b', glow: 'rgba(241, 196, 15, 0.3)' },
    gray: { main: '#95a5a6', light: '#d5dbdb', dark: '#717d7e', glow: 'rgba(149, 165, 166, 0.3)' },
    red: { main: '#e74c3c', light: '#f1948a', dark: '#922b21', glow: 'rgba(231, 76, 60, 0.25)' },
    blue: { main: '#3498db', light: '#85c1e9', dark: '#1a5276', glow: 'rgba(52, 152, 219, 0.25)' },
    pink: { main: '#e91e9c', light: '#f48fb1', dark: '#880e4f', glow: 'rgba(233, 30, 156, 0.25)' },
    orange: { main: '#e67e22', light: '#f0b27a', dark: '#935116', glow: 'rgba(230, 126, 34, 0.25)' },
  };

  const SPAWN_MARKERS = {
    green: { x: 100, y: 100 },
    purple: { x: 2300, y: 100 },
    yellow: { x: 2300, y: 1500 },
    gray: { x: 100, y: 1500 },
  };

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function setCamera(x, y, zoom) {
    camera.x = x;
    camera.y = y;
    camera.zoom = zoom;
  }

  function getCamera() {
    return camera;
  }

  function worldToScreen(wx, wy) {
    return {
      x: (wx - camera.x) * camera.zoom + canvas.width / 2,
      y: (wy - camera.y) * camera.zoom + canvas.height / 2,
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - canvas.width / 2) / camera.zoom + camera.x,
      y: (sy - canvas.height / 2) / camera.zoom + camera.y,
    };
  }

  function render(state, selectedUnits, myTeamId) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    drawBackground();

    // Grid
    drawGrid();

    // Bases
    if (state.bases) {
      for (const base of state.bases) {
        drawBase(base);
      }
    }

    // Zones
    if (state.zones) {
      for (const zone of state.zones) {
        drawZone(zone);
      }
    }

    // Units
    if (state.units) {
      for (const unit of state.units) {
        const isSelected = selectedUnits.has(unit.id);
        drawUnit(unit, isSelected, myTeamId);
      }
      drawUnitGroupCounts(state.units);
    }

    // Defenses
    if (state.defenses) {
      for (const defense of state.defenses) {
        drawDefense(defense);
      }
    }

    // Gold Mines
    if (state.goldMines) {
      for (const mine of state.goldMines) {
        drawGoldMine(mine);
      }
    }

    // Timer overlay
    if (state.gameDuration && state.elapsedTime !== undefined) {
      drawTimer(state.elapsedTime, state.gameDuration);
    }
  }

  function drawBackground() {
    // Dark gradient background
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0d1117');
    grad.addColorStop(1, '#131a24');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawGrid() {
    const gridSize = 80;
    ctx.strokeStyle = 'rgba(50, 65, 90, 0.2)';
    ctx.lineWidth = 1;

    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(canvas.width, canvas.height);

    const startX = Math.floor(topLeft.x / gridSize) * gridSize;
    const startY = Math.floor(topLeft.y / gridSize) * gridSize;

    for (let x = startX; x <= bottomRight.x; x += gridSize) {
      const s = worldToScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, canvas.height);
      ctx.stroke();
    }

    for (let y = startY; y <= bottomRight.y; y += gridSize) {
      const s = worldToScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, s.y);
      ctx.lineTo(canvas.width, s.y);
      ctx.stroke();
    }

    // Map border
    const tl = worldToScreen(0, 0);
    const br = worldToScreen(mapWidth, mapHeight);
    ctx.strokeStyle = 'rgba(78, 124, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  }

  function drawBase(base) {
    const s = worldToScreen(base.x, base.y);
    const r = base.radius * camera.zoom;
    const colors = TEAM_COLORS[base.teamId];

    if (base.destroyed) {
      // Destroyed base - dark rubble
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40, 20, 20, 0.5)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(180, 50, 50, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = `${20 * camera.zoom}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(180, 50, 50, 0.6)';
      ctx.fillText('💀', s.x, s.y);
      return;
    }

    // Alive base - glowing building
    // Outer glow
    const glowGrad = ctx.createRadialGradient(s.x, s.y, r * 0.5, s.x, s.y, r * 1.5);
    glowGrad.addColorStop(0, colors.glow);
    glowGrad.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // Base body
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    const baseGrad = ctx.createRadialGradient(s.x - r * 0.2, s.y - r * 0.2, 0, s.x, s.y, r);
    baseGrad.addColorStop(0, colors.light);
    baseGrad.addColorStop(1, colors.dark);
    ctx.fillStyle = baseGrad;
    ctx.fill();
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Castle icon
    ctx.font = `${24 * camera.zoom}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🏰', s.x, s.y);

    // HP bar below base
    const hpPercent = base.hp / base.maxHp;
    const barWidth = r * 2;
    const barHeight = 6 * camera.zoom;
    const barX = s.x - barWidth / 2;
    const barY = s.y + r + 8 * camera.zoom;

    // Bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    roundedRect(ctx, barX, barY, barWidth, barHeight, 3 * camera.zoom);
    ctx.fill();

    // HP fill
    let hpColor = colors.main;
    if (hpPercent < 0.5) hpColor = '#f1c40f';
    if (hpPercent < 0.25) hpColor = '#e74c3c';

    if (hpPercent > 0) {
      ctx.beginPath();
      roundedRect(ctx, barX, barY, barWidth * hpPercent, barHeight, 3 * camera.zoom);
      ctx.fillStyle = hpColor;
      ctx.fill();
    }

    // HP text
    ctx.font = `bold ${10 * camera.zoom}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${Math.ceil(base.hp)}/${base.maxHp}`, s.x, barY + barHeight + 2 * camera.zoom);
  }

  function drawTimer(elapsed, duration) {
    const remaining = Math.max(0, duration - elapsed);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const x = canvas.width / 2;
    const y = 30;

    // Background pill
    const textWidth = 80;
    const pillH = 36;
    ctx.beginPath();
    roundedRect(ctx, x - textWidth / 2, y - pillH / 2, textWidth, pillH, pillH / 2);
    ctx.fillStyle = remaining < 30000 ? 'rgba(231, 76, 60, 0.7)' : 'rgba(10, 15, 25, 0.7)';
    ctx.fill();
    ctx.strokeStyle = remaining < 30000 ? 'rgba(231, 76, 60, 0.8)' : 'rgba(78, 124, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Timer text
    ctx.font = `bold 18px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = remaining < 30000 ? '#ff6b6b' : '#e0e8f0';
    ctx.fillText(timeStr, x, y);
  }

  function drawUnitGroupCounts(units) {
    if (!units || units.length === 0) return;

    const GROUP_RADIUS = 25; // world units to consider as a group
    const processed = new Set();
    const groups = [];

    // Group nearby same-team units
    for (let i = 0; i < units.length; i++) {
      if (processed.has(i) || units[i].dead) continue;
      const group = [i];
      processed.add(i);

      for (let j = i + 1; j < units.length; j++) {
        if (processed.has(j) || units[j].dead) continue;
        if (units[j].teamId !== units[i].teamId) continue;
        const dx = units[j].x - units[i].x;
        const dy = units[j].y - units[i].y;
        if (Math.sqrt(dx * dx + dy * dy) < GROUP_RADIUS) {
          group.push(j);
          processed.add(j);
        }
      }

      if (group.length >= 3) {
        // Calculate center of group
        let cx = 0, cy = 0;
        for (const idx of group) {
          cx += units[idx].x;
          cy += units[idx].y;
        }
        groups.push({
          x: cx / group.length,
          y: cy / group.length,
          count: group.length,
          teamId: units[i].teamId,
        });
      }
    }

    // Draw count badges
    for (const g of groups) {
      const s = worldToScreen(g.x, g.y);
      const colors = TEAM_COLORS[g.teamId];
      const text = `${g.count}`;
      const fontSize = Math.max(10, 12 * camera.zoom);

      ctx.font = `bold ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
      const tw = ctx.measureText(text).width;
      const pad = 4 * camera.zoom;
      const bw = tw + pad * 2;
      const bh = fontSize + pad;

      // Badge background
      ctx.beginPath();
      roundedRect(ctx, s.x - bw / 2, s.y - 18 * camera.zoom - bh, bw, bh, bh / 2);
      ctx.fillStyle = colors.dark || 'rgba(0,0,0,0.7)';
      ctx.fill();
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Badge text
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, s.x, s.y - 18 * camera.zoom - bh / 2);
    }
  }

  function drawZone(zone) {
    const s = worldToScreen(zone.x, zone.y);
    const size = zone.size * camera.zoom;
    const half = size / 2;

    // Zone background
    let bgColor = 'rgba(30, 40, 60, 0.6)';
    let borderColor = 'rgba(80, 100, 140, 0.5)';
    if (zone.owner) {
      const colors = TEAM_COLORS[zone.owner];
      bgColor = colors.glow;
      borderColor = colors.main;
    }

    // Rounded rect
    const r = 8 * camera.zoom;
    ctx.beginPath();
    roundedRect(ctx, s.x - half, s.y - half, size, size, r);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Capture progress bar
    if (zone.capturingTeam && !zone.owner) {
      const progress = (zone.captureProgress[zone.capturingTeam] || 0) / zone.captureTime;
      const capColors = TEAM_COLORS[zone.capturingTeam];
      const barWidth = size * 0.8;
      const barHeight = 4 * camera.zoom;
      const barX = s.x - barWidth / 2;
      const barY = s.y + half + 6 * camera.zoom;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = capColors.main;
      ctx.fillRect(barX, barY, barWidth * Math.min(1, progress), barHeight);
    }

    // Zone symbol (heart or diamond)
    const symbolSize = 22 * camera.zoom;
    ctx.font = `${symbolSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (zone.type === 'heart') {
      ctx.fillStyle = zone.owner ? TEAM_COLORS[zone.owner].light : '#ff6b8a';
      ctx.fillText('♥', s.x, s.y);
    } else if (zone.type === 'gold') {
      ctx.fillStyle = zone.owner ? TEAM_COLORS[zone.owner].light : '#ffd700';
      ctx.fillText('⛏', s.x, s.y);
    } else {
      ctx.fillStyle = zone.owner ? TEAM_COLORS[zone.owner].light : '#ffb347';
      ctx.fillText('♦', s.x, s.y);
    }

    // Small label below symbol
    const labelSize = 9 * camera.zoom;
    ctx.font = `${labelSize}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillStyle = 'rgba(200, 210, 230, 0.5)';
    const label = zone.type === 'heart' ? 'CAN' : zone.type === 'gold' ? 'ALTIN' : 'ÜRETIM';
    ctx.fillText(label, s.x, s.y + 18 * camera.zoom);
  }

  function drawGoldMine(mine) {
    const s = worldToScreen(mine.x, mine.y);
    const colors = TEAM_COLORS[mine.teamId];
    if (!colors) return;
    const size = 12 * camera.zoom;

    // Base
    ctx.beginPath();
    ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(218, 165, 32, 0.3)';
    ctx.fill();
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Icon
    const ts = 16 * camera.zoom;
    ctx.font = ts + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd700';
    ctx.fillText('\u26CF', s.x, s.y);

    // HP bar
    if (mine.hp < mine.maxHp) {
      const barW = size * 2;
      const barH = 3 * camera.zoom;
      const barX = s.x - barW / 2;
      const barY = s.y - size - 6 * camera.zoom;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(barX, barY, barW * (mine.hp / mine.maxHp), barH);
    }
  }

    function drawDefense(defense) {
    const s = worldToScreen(defense.x, defense.y);
    const colors = TEAM_COLORS[defense.teamId];
    if (!colors) return;
    const size = 14 * camera.zoom;
    ctx.beginPath();
    ctx.arc(s.x, s.y, defense.range * camera.zoom, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
    ctx.fillStyle = colors.dark;
    ctx.fill();
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = 2;
    ctx.stroke();
    const ts = 14 * camera.zoom;
    ctx.font = `${ts}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.light;
    ctx.fillText('🏰', s.x, s.y);
    // Firing animation - projectile line
    if (defense.firing && defense.targetX != null && defense.targetY != null) {
      const t = worldToScreen(defense.targetX, defense.targetY);
      // Glow line
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = 3;
      ctx.shadowColor = colors.main;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Inner bright line
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Impact flash at target
      ctx.beginPath();
      ctx.arc(t.x, t.y, 5 * camera.zoom, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 200, 0.7)';
      ctx.fill();
    }

    if (defense.hp < defense.maxHp) {
      const barW = size * 2;
      const barH = 3 * camera.zoom;
      const barX = s.x - barW / 2;
      const barY = s.y - size - 6 * camera.zoom;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = colors.main;
      ctx.fillRect(barX, barY, barW * (defense.hp / defense.maxHp), barH);
    }
  }

    function drawUnit(unit, isSelected, myTeamId) {
    const s = worldToScreen(unit.x, unit.y);
    const colors = TEAM_COLORS[unit.teamId];
    if (!colors) return;
    const r = 8 * camera.zoom;
    const now = performance.now();

    // Selection ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, (r + 4) * 1, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Hit flash (white flash when taking damage)
    if (unit.hit) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 3 * camera.zoom, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fill();
    }

    // Unit shadow
    ctx.beginPath();
    ctx.arc(s.x, s.y + 2 * camera.zoom, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();

    // Unit body (shake when attacking)
    let offsetX = 0, offsetY = 0;
    if (unit.isAttacking) {
      offsetX = (Math.random() - 0.5) * 3 * camera.zoom;
      offsetY = (Math.random() - 0.5) * 3 * camera.zoom;
    }

    ctx.beginPath();
    ctx.arc(s.x + offsetX, s.y + offsetY, r, 0, Math.PI * 2);
    const unitGrad = ctx.createRadialGradient(
      s.x + offsetX - r * 0.3, s.y + offsetY - r * 0.3, 0,
      s.x + offsetX, s.y + offsetY, r
    );
    unitGrad.addColorStop(0, unit.isAttacking ? '#fff' : colors.light);
    unitGrad.addColorStop(1, colors.main);
    ctx.fillStyle = unitGrad;
    ctx.fill();

    // Border (red glow when attacking)
    ctx.strokeStyle = unit.isAttacking ? '#ff4444' : colors.dark;
    ctx.lineWidth = unit.isAttacking ? 2.5 : 1.5;
    ctx.stroke();

    // Attack slash line to target
    if (unit.isAttacking && unit.atkTX && unit.atkTY) {
      const t = worldToScreen(unit.atkTX, unit.atkTY);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = 'rgba(255, 200, 50, 0.6)';
      ctx.lineWidth = 2 * camera.zoom;
      ctx.stroke();

      // Impact spark at target
      const sparkSize = 4 * camera.zoom;
      ctx.beginPath();
      ctx.arc(t.x, t.y, sparkSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 220, 80, 0.7)';
      ctx.fill();
    }

    // HP bar (only if damaged or own team)
    const hpPercent = unit.hp / unit.maxHp;
    if (hpPercent < 1 || unit.teamId === myTeamId) {
      const barWidth = 18 * camera.zoom;
      const barHeight = 3 * camera.zoom;
      const barX = s.x - barWidth / 2;
      const barY = s.y - r - 6 * camera.zoom;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      // HP color (green > yellow > red)
      let hpColor = '#2ecc71';
      if (hpPercent < 0.6) hpColor = '#f1c40f';
      if (hpPercent < 0.3) hpColor = '#e74c3c';

      ctx.fillStyle = hpColor;
      ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
    }
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawSelectionBox(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);

    ctx.strokeStyle = 'rgba(78, 124, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, w, h);
    ctx.fillStyle = 'rgba(78, 124, 255, 0.1)';
    ctx.fillRect(left, top, w, h);
  }

  return {
    init,
    resize,
    setCamera,
    getCamera,
    worldToScreen,
    screenToWorld,
    render,
    drawSelectionBox,
    TEAM_COLORS,
  };
})();

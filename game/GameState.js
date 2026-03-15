const Unit = require('./Unit');
const Zone = require('./Zone');
const Base = require('./Base');
const Defense = require('./Defense');
const GoldMine = require('./GoldMine');
const {
  MAP_WIDTH,
  MAP_HEIGHT,
  TEAMS,
  TEAM_ORDER,
  MAX_UNITS_PER_TEAM,
  UNIT_SPEED,
  ZONE_COUNT,
  ZONE_SIZE,
  ZONE_HEART_REGEN,
  ZONE_HEART_BASE_REGEN,
  ZONE_DIAMOND_SPAWN_BONUS,
  SPAWN_MARGIN,
  MIN_BASE_DISTANCE,
  GAME_DURATION,
  BASE_ATTACK_RANGE,
  BASE_DAMAGE_PER_TICK,
  GOLD_PER_SECOND,
  STARTING_GOLD,
  DEFENSE_COSTS,
  MAX_DEFENSES,
  DEFENSE_PLACEMENT_RADIUS,
  GOLD_ZONE_BASE_RADIUS,
  UPGRADE_SPEED_COSTS,
  UPGRADE_SPEED_BONUS,
  UPGRADE_ATTACK_COSTS,
  UPGRADE_ATTACK_BONUS,
  UPGRADE_HP_COSTS,
  UPGRADE_HP_BONUS,
  UPGRADE_BASE_HP_COSTS,
  UPGRADE_BASE_HP_AMOUNT,
} = require('./constants');

class GameState {
  constructor() {
    this.units = [];
    this.zones = [];
    this.bases = {};
    this.defenses = [];
    this.goldMines = [];
    this.players = {};
    this.teamPlayers = {};
    this.botTeams = new Set();
    this.spawnTimers = {};
    this.scores = {};
    this.gold = {};
    this.upgrades = {};
    this.scoreEvents = [];
    this.started = false;
    this.gameOver = false;
    this.winner = null;
    this.tickCount = 0;
    this.elapsedTime = 0;
    this.gameEndReason = null;

    for (const teamId of TEAM_ORDER) {
      this.spawnTimers[teamId] = 0;
      this.scores[teamId] = 0;
      this.gold[teamId] = STARTING_GOLD;
      this.upgrades[teamId] = { speed: 0, attack: 0, hp: 0, baseHp: 0, maxUnits: 0 };
    }
  }

  addPlayer(socketId, teamId) {
    this.players[socketId] = { teamId, ready: false };
    this.teamPlayers[teamId] = socketId;
  }

  removePlayer(socketId) {
    const player = this.players[socketId];
    if (player) {
      delete this.teamPlayers[player.teamId];
      delete this.players[socketId];
    }
  }

  getAssignedTeams() {
    const human = Object.values(this.players).map((p) => p.teamId);
    return [...human, ...this.botTeams];
  }

  getAvailableTeam() {
    const assigned = this.getAssignedTeams();
    return TEAM_ORDER.find((t) => !assigned.includes(t)) || null;
  }

  addBot(teamId) {
    this.botTeams.add(teamId);
    this.teamPlayers[teamId] = `bot_${teamId}`;
  }

  removeBot(teamId) {
    this.botTeams.delete(teamId);
    delete this.teamPlayers[`bot_${teamId}`];
  }

  isBot(teamId) {
    return this.botTeams.has(teamId);
  }

  getBotTeamForReplacement() {
    // Return first bot team that can be replaced by a human player
    for (const teamId of this.botTeams) {
      return teamId;
    }
    return null;
  }

  replaceBotWithPlayer(socketId, teamId) {
    this.botTeams.delete(teamId);
    this.players[socketId] = { teamId, ready: false };
    this.teamPlayers[teamId] = socketId;
  }

  initGame() {
    this.units = [];
    this.zones = [];
    this.bases = {};
    this.started = true;
    this.gameOver = false;
    this.winner = null;
    this.tickCount = 0;
    this.elapsedTime = 0;
    this.gameEndReason = null;
    this.initialTeamCount = this.getAllActiveTeams().length;

    // Reset spawn timers
    for (const teamId of TEAM_ORDER) {
      this.spawnTimers[teamId] = 0;
    }

    // Generate zones at random positions (avoiding corners/spawn areas)
    this.generateZones();

    // Generate random base positions with min distance
    const activeTeams = this.getAllActiveTeams();
    const basePositions = this.generateBasePositions(activeTeams);
    this.spawnPositions = {}; // store for client

    for (const teamId of activeTeams) {
      const pos = basePositions[teamId];
      this.bases[teamId] = new Base(teamId, pos.x, pos.y);
      this.spawnPositions[teamId] = pos;
      // Spawn initial units
      for (let i = 0; i < 5; i++) {
        this.spawnUnit(teamId);
      }
    }
  }

  generateBasePositions(activeTeams) {
    const positions = {};
    const placed = [];

    for (const teamId of activeTeams) {
      let attempts = 0;
      let x, y;
      do {
        x = SPAWN_MARGIN + Math.random() * (MAP_WIDTH - SPAWN_MARGIN * 2);
        y = SPAWN_MARGIN + Math.random() * (MAP_HEIGHT - SPAWN_MARGIN * 2);
        attempts++;
      } while (
        placed.some((p) => Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2) < MIN_BASE_DISTANCE) &&
        attempts < 200
      );
      positions[teamId] = { x, y };
      placed.push({ x, y });
    }
    return positions;
  }

  generateZones() {
    const padding = ZONE_SIZE + 30;
    const minDistBetweenZones = ZONE_SIZE * 2.5;

    // Collect base positions for gold zone density
    const basePositions = Object.values(this.bases).map((b) => ({ x: b.x, y: b.y }));
    const placedZones = [];

    for (let i = 0; i < ZONE_COUNT; i++) {
      let attempts = 0;
      let placed = false;

      while (attempts < 100 && !placed) {
        const x = padding + Math.random() * (MAP_WIDTH - padding * 2);
        const y = padding + Math.random() * (MAP_HEIGHT - padding * 2);

        // Check distance from other zones
        let tooCloseToZone = false;
        for (const zone of placedZones) {
          const dist = Math.sqrt((x - zone.x) ** 2 + (y - zone.y) ** 2);
          if (dist < minDistBetweenZones) {
            tooCloseToZone = true;
            break;
          }
        }

        if (!tooCloseToZone) {
          // Near a base = higher chance of gold zone
          const nearBase = basePositions.some((b) => {
            const dist = Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2);
            return dist < GOLD_ZONE_BASE_RADIUS;
          });

          let type;
          if (nearBase) {
            const roll = Math.random();
            type = roll < 0.5 ? 'gold' : roll < 0.75 ? 'heart' : 'diamond';
          } else {
            const roll = Math.random();
            type = roll < 0.2 ? 'gold' : roll < 0.6 ? 'heart' : 'diamond';
          }

          const zone = new Zone(Math.round(x), Math.round(y), type);
          this.zones.push(zone);
          placedZones.push(zone);
          placed = true;
        }

        attempts++;
      }
    }
  }

  spawnUnit(teamId) {
    const team = TEAMS[teamId];
    const maxUnitsUpgrade = (this.upgrades[teamId]?.maxUnits || 0) * 10;
    const maxUnits = (team.maxUnits || MAX_UNITS_PER_TEAM) + maxUnitsUpgrade;
    const teamUnits = this.units.filter((u) => u.teamId === teamId && !u.dead);
    if (teamUnits.length >= maxUnits) return null;

    // Spawn near base position
    const base = this.bases[teamId];
    const spawnX = base ? base.x : (this.spawnPositions?.[teamId]?.x || MAP_WIDTH / 2);
    const spawnY = base ? base.y : (this.spawnPositions?.[teamId]?.y || MAP_HEIGHT / 2);
    const offsetX = (Math.random() - 0.5) * 80;
    const offsetY = (Math.random() - 0.5) * 80;
    const x = Math.max(10, Math.min(MAP_WIDTH - 10, spawnX + offsetX));
    const y = Math.max(10, Math.min(MAP_HEIGHT - 10, spawnY + offsetY));

    const hpMult = this.getUpgradeMultiplier(teamId, 'hp');
    const atkMult = this.getUpgradeMultiplier(teamId, 'attack');
    const spdMult = this.getUpgradeMultiplier(teamId, 'speed');
    const finalHp = Math.round(team.hp * hpMult);
    const finalAtk = Math.round(team.attack * atkMult);
    const finalSpeed = Math.round((team.speed || UNIT_SPEED) * spdMult);
    const unit = new Unit(teamId, x, y, finalHp, finalAtk, finalSpeed);
    this.units.push(unit);
    return unit;
  }

  getEffectiveSpawnInterval(teamId) {
    const team = TEAMS[teamId];
    let interval = team.spawnInterval;

    // Apply diamond zone bonuses
    const diamondZones = this.zones.filter(
      (z) => z.type === 'diamond' && z.owner === teamId
    );
    for (const zone of diamondZones) {
      interval *= ZONE_DIAMOND_SPAWN_BONUS;
    }

    return Math.max(1000, interval); // minimum 1 second
  }

  getAllActiveTeams() {
    const teams = new Set();
    for (const p of Object.values(this.players)) {
      teams.add(p.teamId);
    }
    for (const t of this.botTeams) {
      teams.add(t);
    }
    return [...teams];
  }

  update(dt) {
    if (!this.started || this.gameOver) return;

    this.tickCount++;
    this.elapsedTime += dt;

    // --- Spawn units (only if base alive) ---
    const activeTeams = this.getAllActiveTeams();
    for (const teamId of activeTeams) {
      const base = this.bases[teamId];
      if (base && base.destroyed) continue; // No spawning if base destroyed

      this.spawnTimers[teamId] += dt;
      const interval = this.getEffectiveSpawnInterval(teamId);
      if (this.spawnTimers[teamId] >= interval) {
        this.spawnUnit(teamId);
        this.spawnTimers[teamId] = 0;
      }
    }

    // --- Update units ---
    const aliveUnits = this.units.filter((u) => !u.dead);
    for (const unit of aliveUnits) {
      unit.update(dt, aliveUnits);
    }

    // --- Before 5min: push enemy units away from base zones ---
    if (this.elapsedTime < GAME_DURATION) {
      const protectionRadius = 200; // how far from base center enemies are blocked
      for (const [baseTeamId, base] of Object.entries(this.bases)) {
        if (base.destroyed) continue;
        for (const unit of aliveUnits) {
          if (unit.teamId === baseTeamId) continue; // Skip friendly units
          const dx = unit.x - base.x;
          const dy = unit.y - base.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < protectionRadius && dist > 0) {
            // Push unit outward
            const pushX = (dx / dist) * protectionRadius;
            const pushY = (dy / dist) * protectionRadius;
            unit.x = base.x + pushX;
            unit.y = base.y + pushY;
          }
        }
      }
    }

    // --- Base attack logic (only after timer runs out) ---
    const baseAttackAllowed = this.elapsedTime >= GAME_DURATION;
    for (const [baseTeamId, base] of Object.entries(this.bases)) {
      if (base.destroyed) continue;
      if (!baseAttackAllowed) continue; // Bases invulnerable until 5min timer expires

      // Find friendly units near this base (defenders)
      const friendliesNearBase = aliveUnits.filter((u) => {
        if (u.teamId !== baseTeamId) return false;
        const dx = u.x - base.x;
        const dy = u.y - base.y;
        return Math.sqrt(dx * dx + dy * dy) < base.radius + BASE_ATTACK_RANGE;
      });

      // Base is protected while friendly units are nearby
      if (friendliesNearBase.length > 0) continue;

      // Find enemy units near this base
      const enemiesNearBase = aliveUnits.filter((u) => {
        if (u.teamId === baseTeamId) return false;
        const dx = u.x - base.x;
        const dy = u.y - base.y;
        return Math.sqrt(dx * dx + dy * dy) < base.radius + BASE_ATTACK_RANGE;
      });

      // Each enemy unit deals damage to the base
      const wasAlive = !base.destroyed;
      for (const enemy of enemiesNearBase) {
        base.takeDamage(BASE_DAMAGE_PER_TICK);
      }

      // Score: base destroyed = 10 points to each attacking team
      if (wasAlive && base.destroyed) {
        const attackingTeams = new Set(enemiesNearBase.map((u) => u.teamId));
        for (const attackTeam of attackingTeams) {
          this.addScore(attackTeam, 10, `Üs yıkıldı! (${TEAMS[baseTeamId].name})`);
        }
      }
    }

    // --- Zone logic ---
    for (const zone of this.zones) {
      const prevOwner = zone.owner;
      const unitsInZone = aliveUnits.filter((u) => zone.containsPoint(u.x, u.y));
      zone.update(dt, unitsInZone);

      // Score: zone captured
      if (zone.owner && zone.owner !== prevOwner) {
        const pts = zone.type === 'diamond' ? 2 : zone.type === 'gold' ? 1 : 1;
        const symbol = zone.type === 'diamond' ? '♦' : zone.type === 'gold' ? '⛏' : '♥';
        this.addScore(zone.owner, pts, `${symbol} Bölge ele geçirildi`);
      }

      // Heart zone: regen HP for owner's units inside + base regen
      if (zone.type === 'heart' && zone.owner) {
        // Heal units inside zone
        for (const unit of unitsInZone) {
          if (unit.teamId === zone.owner) {
            unit.heal(ZONE_HEART_REGEN);
          }
        }
        // Heal owner's base
        const base = this.bases[zone.owner];
        if (base && !base.destroyed && base.hp < base.maxHp) {
          base.hp = Math.min(base.maxHp, base.hp + ZONE_HEART_BASE_REGEN);
        }
      }
    }

    // --- Gold income from gold zones (every 30 ticks ≈ 1 second) ---
    if (this.tickCount % 30 === 0) {
      for (const zone of this.zones) {
        if (zone.type === 'gold' && zone.owner) {
          this.gold[zone.owner] = (this.gold[zone.owner] || 0) + GOLD_PER_SECOND;
        }
      }
      // Gold from placed gold mines
      for (const mine of this.goldMines) {
        if (!mine.destroyed) {
          this.gold[mine.teamId] = (this.gold[mine.teamId] || 0) + mine.incomePerSecond;
        }
      }
    }

    // --- Update defenses ---
    for (const defense of this.defenses) {
      if (!defense.destroyed) {
        defense.update(dt, aliveUnits);
      }
    }

    // --- Units attack enemy defenses ---
    for (const defense of this.defenses) {
      if (defense.destroyed) continue;
      for (const unit of aliveUnits) {
        if (unit.teamId === defense.teamId || unit.dead) continue;
        const dx = unit.x - defense.x;
        const dy = unit.y - defense.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 30) { // melee range to defense
          defense.takeDamage(TEAMS[unit.teamId]?.attack || 5);
        }
      }
    }

    this.defenses = this.defenses.filter((d) => !d.destroyed);

    // --- Units attack enemy gold mines ---
    for (const mine of this.goldMines) {
      if (mine.destroyed) continue;
      for (const unit of aliveUnits) {
        if (unit.teamId === mine.teamId || unit.dead) continue;
        const dx = unit.x - mine.x;
        const dy = unit.y - mine.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 30) {
          const wasAlive = !mine.destroyed;
          mine.takeDamage(TEAMS[unit.teamId]?.attack || 5);
          // Reward gold for destroying enemy mine
          if (wasAlive && mine.destroyed) {
            this.gold[unit.teamId] = (this.gold[unit.teamId] || 0) + 100;
          }
        }
      }
    }
    this.goldMines = this.goldMines.filter((m) => !m.destroyed);

    // --- Remove dead units ---
    this.units = this.units.filter((u) => !u.dead);

    // --- Check win condition ---
    if (this.tickCount % 15 === 0) {
      this.checkWinCondition();
    }
  }

  checkWinCondition() {
    if (this.initialTeamCount < 2) return;

    // A team is "on the map" if it has a standing base OR at least one living unit
    const teamsOnMap = new Set();
    for (const teamId of this.getAllActiveTeams()) {
      const base = this.bases[teamId];
      const baseAlive = base && !base.destroyed;
      const hasUnits = this.units.some((u) => u.teamId === teamId && !u.dead);
      if (baseAlive || hasUnits) {
        teamsOnMap.add(teamId);
      }
    }

    // Game ends only when a single team remains on the entire map
    if (teamsOnMap.size === 1) {
      this.gameOver = true;
      this.winner = [...teamsOnMap][0];
      this.gameEndReason = 'base_destroyed';
      return;
    }

    // If all bases destroyed (unlikely), check units
    if (teamsOnMap.size === 0) {
      // Team with most units wins
      const teamUnitCounts = {};
      for (const unit of this.units) {
        if (!unit.dead) {
          teamUnitCounts[unit.teamId] = (teamUnitCounts[unit.teamId] || 0) + 1;
        }
      }
      let maxTeam = null;
      let maxCount = 0;
      for (const [teamId, count] of Object.entries(teamUnitCounts)) {
        if (count > maxCount) {
          maxCount = count;
          maxTeam = teamId;
        }
      }
      if (maxTeam) {
        this.gameOver = true;
        this.winner = maxTeam;
        this.gameEndReason = 'base_destroyed';
      }
      return;
    }
  }

  addScore(teamId, points, reason) {
    if (!this.scores[teamId]) this.scores[teamId] = 0;
    this.scores[teamId] += points;
    if (this.scores[teamId] < 0) this.scores[teamId] = 0; // Never negative
    this.scoreEvents.push({
      teamId,
      points,
      reason,
      time: this.elapsedTime,
    });
    // Keep only last 20 events
    if (this.scoreEvents.length > 20) {
      this.scoreEvents = this.scoreEvents.slice(-20);
    }
  }

  moveUnits(teamId, unitIds, targetX, targetY) {
    for (const unit of this.units) {
      if (unit.teamId === teamId && unitIds.includes(unit.id) && !unit.dead) {
        unit.moveTo(targetX, targetY);
      }
    }
  }

  placeDefense(teamId, x, y) {
    // Count existing defenses for this team
    const teamDefenses = this.defenses.filter((d) => d.teamId === teamId && !d.destroyed);
    const defenseCount = teamDefenses.length;

    // Check max limit
    if (defenseCount >= MAX_DEFENSES) {
      return { success: false, error: 'Maksimum kule sayısına ulaşıldı! (7)' };
    }

    // Progressive cost with team multiplier
    const baseCost = DEFENSE_COSTS[defenseCount];
    const multiplier = TEAMS[teamId]?.defenseCostMultiplier || 1.0;
    const cost = Math.round(baseCost * multiplier);

    // Check gold
    if ((this.gold[teamId] || 0) < cost) {
      return { success: false, error: `Yeterli altın yok! (${cost} gerekli)` };
    }

    // Check distance from own base
    const base = this.bases[teamId];
    if (!base || base.destroyed) {
      return { success: false, error: 'Kaleniz yok!' };
    }
    const dist = Math.sqrt((x - base.x) ** 2 + (y - base.y) ** 2);
    if (dist > DEFENSE_PLACEMENT_RADIUS) {
      return { success: false, error: 'Kaleden çok uzak! (Max ' + DEFENSE_PLACEMENT_RADIUS + 'px)' };
    }

    // Prevent placing inside any base
    for (const [bTeamId, b] of Object.entries(this.bases)) {
      if (b.destroyed) continue;
      const bDist = Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2);
      if (bDist < 80) {
        return { success: false, error: 'Kalelerin içine kule kurulamaz!' };
      }
    }

    // Deduct gold and place
    this.gold[teamId] -= cost;
    const defense = new Defense(teamId, x, y);
    this.defenses.push(defense);
    return { success: true, defenseId: defense.id };
  }

  placeGoldMine(teamId, x, y) {
    const mineMult = TEAMS[teamId]?.mineCostMultiplier || 1.0;
    const cost = Math.round(5000 * mineMult);
    if ((this.gold[teamId] || 0) < cost) {
      return { success: false, error: 'Yeterli alt\u0131n yok! (5000 gerekli)' };
    }
    this.gold[teamId] -= cost;
    const mine = new GoldMine(teamId, x, y);
    this.goldMines.push(mine);
    return { success: true, mineId: mine.id };
  }

    purchaseUpgrade(teamId, type) {
    const levels = this.upgrades[teamId];
    if (!levels) return { success: false, error: 'Takım bulunamadı!' };

    const costArrays = {
      speed: UPGRADE_SPEED_COSTS,
      attack: UPGRADE_ATTACK_COSTS,
      hp: UPGRADE_HP_COSTS,
      baseHp: UPGRADE_BASE_HP_COSTS,
      maxUnits: null, // special: flat 50000 cost
    };

    // Apply team upgrade cost multiplier
    const upgMult = TEAMS[teamId]?.upgradeCostMultiplier || 1.0;

    // Special: maxUnits has flat cost, no max level
    if (type === 'maxUnits') {
      const cost = Math.round(50000 * upgMult);
      if ((this.gold[teamId] || 0) < cost) {
        return { success: false, error: 'Yeterli alt\u0131n yok! (50000 gerekli)' };
      }
      this.gold[teamId] -= cost;
      levels.maxUnits++;
      return { success: true, level: levels.maxUnits };
    }

    const costs = costArrays[type];
    if (!costs) return { success: false, error: 'Ge\u00E7ersiz y\u00FCkseltme!' };

    const currentLevel = levels[type];
    if (currentLevel >= costs.length) {
      return { success: false, error: 'Maksimum seviyeye ula\u015F\u0131ld\u0131!' };
    }

    const cost = Math.round(costs[currentLevel] * upgMult);
    if ((this.gold[teamId] || 0) < cost) {
      return { success: false, error: `Yeterli altın yok! (${cost} gerekli)` };
    }

    this.gold[teamId] -= cost;
    levels[type]++;

    // Apply base HP upgrade immediately
    if (type === 'baseHp') {
      const base = this.bases[teamId];
      if (base && !base.destroyed) {
        const hpGain = UPGRADE_BASE_HP_AMOUNT[currentLevel];
        base.maxHp += hpGain;
        base.hp += hpGain;
      }
    }

    return { success: true, level: levels[type] };
  }

  getUpgradeMultiplier(teamId, type) {
    const level = this.upgrades[teamId]?.[type] || 0;
    const bonuses = {
      speed: UPGRADE_SPEED_BONUS,
      attack: UPGRADE_ATTACK_BONUS,
      hp: UPGRADE_HP_BONUS,
    };
    return 1 + level * (bonuses[type] || 0);
  }

  serialize() {
    return {
      units: this.units.filter((u) => !u.dead).map((u) => u.serialize()),
      zones: this.zones.map((z) => z.serialize()),
      bases: Object.values(this.bases).map((b) => b.serialize()),
      started: this.started,
      gameOver: this.gameOver,
      winner: this.winner,
      gameEndReason: this.gameEndReason,
      elapsedTime: this.elapsedTime,
      gameDuration: GAME_DURATION,
      teamStats: this.getTeamStats(),
      botTeams: [...this.botTeams],
      scores: this.scores,
      scoreEvents: this.scoreEvents,
      spawnPositions: this.spawnPositions || {},
      gold: this.gold,
      defenses: this.defenses.filter((d) => !d.destroyed).map((d) => d.serialize()),
      goldMines: this.goldMines.filter((m) => !m.destroyed).map((m) => m.serialize()),
      defenseCosts: DEFENSE_COSTS,
      defenseCostMultipliers: Object.fromEntries(TEAM_ORDER.map((t) => [t, TEAMS[t]?.defenseCostMultiplier || 1.0])),
      upgrades: this.upgrades,
      upgradeCostMultipliers: Object.fromEntries(TEAM_ORDER.map((t) => [t, TEAMS[t]?.upgradeCostMultiplier || 1.0])),
      mineCostMultipliers: Object.fromEntries(TEAM_ORDER.map((t) => [t, TEAMS[t]?.mineCostMultiplier || 1.0])),
      upgradeCosts: {
        speed: UPGRADE_SPEED_COSTS,
        attack: UPGRADE_ATTACK_COSTS,
        hp: UPGRADE_HP_COSTS,
        baseHp: UPGRADE_BASE_HP_COSTS,
      },
    };
  }

  getTeamStats() {
    const stats = {};
    const activeTeams = this.getAllActiveTeams();
    for (const teamId of activeTeams) {
      const teamUnits = this.units.filter((u) => u.teamId === teamId && !u.dead);
      const ownedZones = this.zones.filter((z) => z.owner === teamId);
      const base = this.bases[teamId];
      stats[teamId] = {
        unitCount: teamUnits.length,
        zoneCount: ownedZones.length,
        heartZones: ownedZones.filter((z) => z.type === 'heart').length,
        diamondZones: ownedZones.filter((z) => z.type === 'diamond').length,
        spawnInterval: Math.round(this.getEffectiveSpawnInterval(teamId)),
        isBot: this.botTeams.has(teamId),
        baseHp: base ? base.hp : 0,
        baseMaxHp: base ? base.maxHp : 0,
        baseDestroyed: base ? base.destroyed : true,
        score: this.scores[teamId] || 0,
      };
    }
    return stats;
  }
}

module.exports = GameState;

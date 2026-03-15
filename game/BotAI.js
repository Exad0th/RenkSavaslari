const { MAP_WIDTH, MAP_HEIGHT, TEAMS, DEFENSE_COSTS, DEFENSE_PLACEMENT_RADIUS } = require('./constants');

/**
 * Bot AI - Makes strategic decisions for bot-controlled teams.
 * Behaviors:
 *  1. Capture unclaimed zones (prioritize nearby unclaimed ones)
 *  2. Attack weaker enemy groups
 *  3. Defend owned zones when threatened
 *  4. Send groups rather than individual units
 */
class BotAI {
  constructor(teamId) {
    this.teamId = teamId;
    this.decisionTimer = 0;
    this.decisionInterval = 1500 + Math.random() * 1000;
    this.squads = [];
    this.personality = this.generatePersonality();
    this.baseHpTracker = {}; // { enemyTeamId: { lastHp, checks, staleCount } }
  }

  generatePersonality() {
    // Different bot personalities for variety
    const types = ['aggressive', 'defensive', 'balanced', 'rusher'];
    const type = types[Math.floor(Math.random() * types.length)];
    return {
      type,
      aggressiveness: type === 'aggressive' ? 0.7 : type === 'rusher' ? 0.9 : type === 'defensive' ? 0.3 : 0.5,
      captureDesire: type === 'defensive' ? 0.8 : type === 'rusher' ? 0.4 : 0.6,
      squadSize: type === 'rusher' ? 3 : type === 'aggressive' ? 6 : 8,
    };
  }

  update(dt, gameState) {
    this.decisionTimer += dt;
    if (this.decisionTimer < this.decisionInterval) return;
    this.decisionTimer = 0;

    // Vary decision timing slightly for natural feel
    this.decisionInterval = 1200 + Math.random() * 1200;

    // --- Bot defense placement ---
    this.tryPlaceDefense(gameState);
    this.tryUpgrade(gameState);
    this.tryPlaceGoldMine(gameState);

    const myUnits = gameState.units.filter((u) => u.teamId === this.teamId && !u.dead);
    if (myUnits.length === 0) return;

    const idleUnits = this.getIdleUnits(myUnits);
    const enemyUnits = gameState.units.filter((u) => u.teamId !== this.teamId && !u.dead);

    // Clean up dead squad units
    this.cleanSquads(myUnits);

    // Decision priority:
    // 1. If we have idle units, give them tasks
    // 2. Defend threatened zones
    // 3. Capture unclaimed zones
    // 4. Attack enemies

    if (idleUnits.length >= this.personality.squadSize) {
      const decision = this.makeDecision(gameState, idleUnits, enemyUnits);
      if (decision) {
        this.executeDecision(decision, idleUnits, gameState);
      }
    } else if (idleUnits.length >= 2) {
      // Small group - send to nearest unclaimed zone
      const nearestZone = this.findNearestUnclaimedZone(gameState, idleUnits);
      if (nearestZone) {
        this.sendUnitsTo(idleUnits, nearestZone.x, nearestZone.y, 'capture', gameState);
      }
    }
  }

  getIdleUnits(myUnits) {
    const assignedIds = new Set();
    for (const squad of this.squads) {
      for (const id of squad.unitIds) {
        assignedIds.add(id);
      }
    }
    return myUnits.filter((u) => !assignedIds.has(u.id));
  }

  cleanSquads(myUnits) {
    const aliveIds = new Set(myUnits.map((u) => u.id));
    this.squads = this.squads.filter((squad) => {
      squad.unitIds = squad.unitIds.filter((id) => aliveIds.has(id));
      return squad.unitIds.length > 0;
    });

    // Remove squads that have reached their target (units close to target)
    this.squads = this.squads.filter((squad) => {
      const units = myUnits.filter((u) => squad.unitIds.includes(u.id));
      if (units.length === 0) return false;
      const avgX = units.reduce((s, u) => s + u.x, 0) / units.length;
      const avgY = units.reduce((s, u) => s + u.y, 0) / units.length;
      const dist = Math.sqrt((avgX - squad.targetX) ** 2 + (avgY - squad.targetY) ** 2);
      return dist > 50; // keep squad if still far from target
    });
  }

  makeDecision(gameState, idleUnits, enemyUnits) {
    const roll = Math.random();
    const GAME_DURATION = 5 * 60 * 1000;
    const isPreTimer = gameState.elapsedTime < GAME_DURATION;

    // --- PHASE 1: Before 5 min - zone capture & defense only ---
    if (isPreTimer) {
      // Defend own base if enemies approach
      const myBase = gameState.bases[this.teamId];
      if (myBase && !myBase.destroyed) {
        const enemiesNearMyBase = enemyUnits.filter((u) => {
          const d = Math.sqrt((u.x - myBase.x) ** 2 + (u.y - myBase.y) ** 2);
          return d < 200;
        });
        if (enemiesNearMyBase.length >= 3) {
          return { type: 'defend', target: { x: myBase.x, y: myBase.y } };
        }
      }

      // Defend threatened zones
      const threatenedZone = this.findThreatenedZone(gameState, enemyUnits);
      if (threatenedZone && roll < 0.7) {
        return { type: 'defend', target: threatenedZone };
      }

      // Priority: capture unclaimed zones
      const unclaimedZone = this.findNearestUnclaimedZone(gameState, idleUnits);
      if (unclaimedZone) {
        return { type: 'capture', target: unclaimedZone };
      }

      // Capture enemy zones
      const enemyZone = this.findEnemyZone(gameState, idleUnits);
      if (enemyZone) {
        return { type: 'capture', target: enemyZone };
      }

      // Attack nearby enemy units (don't go far)
      const targetCluster = this.findEnemyCluster(enemyUnits, idleUnits);
      if (targetCluster && roll < 0.4) {
        return { type: 'attack', target: targetCluster };
      }

      // Roam near own base, not center
      const ownBase = gameState.bases[this.teamId];
      const baseX = ownBase ? ownBase.x : 5000;
      const baseY = ownBase ? ownBase.y : 5000;
      return {
        type: 'roam',
        target: {
          x: baseX + (Math.random() - 0.5) * 600,
          y: baseY + (Math.random() - 0.5) * 600,
        },
      };
    }

    // --- PHASE 2: After 5 min - aggressive, attack bases ---

    // Defend own base
    const myBase = gameState.bases[this.teamId];
    if (myBase && !myBase.destroyed) {
      const enemiesNearMyBase = enemyUnits.filter((u) => {
        const d = Math.sqrt((u.x - myBase.x) ** 2 + (u.y - myBase.y) ** 2);
        return d < 120;
      });
      if (enemiesNearMyBase.length >= 2) {
        return { type: 'defend', target: { x: myBase.x, y: myBase.y } };
      }
    }

    // Track enemy base HP and detect regeneration
    const targetBase = this.findWeakestEnemyBase(gameState, idleUnits);
    if (targetBase) {
      const targetTeamId = targetBase.teamId || Object.entries(gameState.bases)
        .find(([, b]) => b === targetBase)?.[0];

      if (targetTeamId) {
        if (!this.baseHpTracker[targetTeamId]) {
          this.baseHpTracker[targetTeamId] = { lastHp: targetBase.hp, staleCount: 0 };
        }
        const tracker = this.baseHpTracker[targetTeamId];
        if (targetBase.hp >= tracker.lastHp) {
          tracker.staleCount++;
        } else {
          tracker.staleCount = 0;
        }
        tracker.lastHp = targetBase.hp;

        // If base HP hasn't dropped for 3+ checks, target heart zones first
        if (tracker.staleCount >= 3) {
          const heartZone = this.findEnemyHeartZone(gameState, targetTeamId, idleUnits);
          if (heartZone) {
            tracker.staleCount = 0; // reset after redirecting
            return { type: 'capture', target: heartZone };
          }
        }
      }
    }

    // Attack weakest enemy base
    if (roll < 0.6 + this.personality.aggressiveness * 0.3) {
      if (targetBase) {
        return { type: 'attack_base', target: { x: targetBase.x, y: targetBase.y } };
      }
    }

    // Capture zones
    const unclaimedZone = this.findNearestUnclaimedZone(gameState, idleUnits);
    if (unclaimedZone) {
      return { type: 'capture', target: unclaimedZone };
    }

    // Attack enemy cluster
    const targetCluster = this.findEnemyCluster(enemyUnits, idleUnits);
    if (targetCluster) {
      return { type: 'attack', target: targetCluster };
    }

    // Capture enemy zone
    const enemyZone = this.findEnemyZone(gameState, idleUnits);
    if (enemyZone) {
      return { type: 'capture', target: enemyZone };
    }

    // Default: move towards map center
    return {
      type: 'roam',
      target: {
        x: MAP_WIDTH / 2 + (Math.random() - 0.5) * 600,
        y: MAP_HEIGHT / 2 + (Math.random() - 0.5) * 400,
      },
    };
  }

  executeDecision(decision, idleUnits, gameState) {
    const count = Math.min(idleUnits.length, this.personality.squadSize + Math.floor(Math.random() * 4));
    const squadUnits = idleUnits.slice(0, count);
    this.sendUnitsTo(squadUnits, decision.target.x, decision.target.y, decision.type, gameState);
  }

  sendUnitsTo(units, x, y, task, gameState) {
    // Add some spread to avoid stacking
    const unitIds = units.map((u) => u.id);
    this.squads.push({ unitIds, targetX: x, targetY: y, task });

    // Actually move the units
    gameState.moveUnits(this.teamId, unitIds, x, y);
  }

  findNearestUnclaimedZone(gameState, units) {
    if (units.length === 0) return null;
    const avgX = units.reduce((s, u) => s + u.x, 0) / units.length;
    const avgY = units.reduce((s, u) => s + u.y, 0) / units.length;

    let nearest = null;
    let nearestDist = Infinity;

    for (const zone of gameState.zones) {
      if (zone.owner === this.teamId) continue; // already own it
      if (zone.owner === null) {
        // Unclaimed - priority
        const dist = Math.sqrt((avgX - zone.x) ** 2 + (avgY - zone.y) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = zone;
        }
      }
    }

    return nearest;
  }

  findEnemyZone(gameState, units) {
    if (units.length === 0) return null;
    const avgX = units.reduce((s, u) => s + u.x, 0) / units.length;
    const avgY = units.reduce((s, u) => s + u.y, 0) / units.length;

    let nearest = null;
    let nearestDist = Infinity;

    for (const zone of gameState.zones) {
      if (zone.owner && zone.owner !== this.teamId) {
        const dist = Math.sqrt((avgX - zone.x) ** 2 + (avgY - zone.y) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = zone;
        }
      }
    }

    return nearest;
  }

  findThreatenedZone(gameState, enemyUnits) {
    for (const zone of gameState.zones) {
      if (zone.owner !== this.teamId) continue;

      // Check if enemies are near our zone
      const enemiesNear = enemyUnits.filter((u) => {
        const dist = Math.sqrt((u.x - zone.x) ** 2 + (u.y - zone.y) ** 2);
        return dist < 150;
      });

      if (enemiesNear.length >= 2) {
        return zone;
      }
    }
    return null;
  }

  findEnemyCluster(enemyUnits, myUnits) {
    if (enemyUnits.length === 0 || myUnits.length === 0) return null;

    const avgX = myUnits.reduce((s, u) => s + u.x, 0) / myUnits.length;
    const avgY = myUnits.reduce((s, u) => s + u.y, 0) / myUnits.length;

    // Find the nearest enemy cluster
    let bestTarget = null;
    let bestScore = -Infinity;

    // Group enemies by position proximity
    const checked = new Set();
    for (const enemy of enemyUnits) {
      if (checked.has(enemy.id)) continue;

      const cluster = enemyUnits.filter((u) => {
        const d = Math.sqrt((u.x - enemy.x) ** 2 + (u.y - enemy.y) ** 2);
        return d < 100;
      });

      cluster.forEach((u) => checked.add(u.id));

      const clusterX = cluster.reduce((s, u) => s + u.x, 0) / cluster.length;
      const clusterY = cluster.reduce((s, u) => s + u.y, 0) / cluster.length;
      const dist = Math.sqrt((avgX - clusterX) ** 2 + (avgY - clusterY) ** 2);

      // Score: prefer smaller clusters that are closer
      // Negative because we want high score = good target
      // Primary = nearest (distance dominates), secondary = prefer stronger enemies
      const score = -dist + cluster.length * 10;

      if (score > bestScore && cluster.length <= myUnits.length * 1.5) {
        bestScore = score;
        bestTarget = { x: clusterX, y: clusterY };
      }
    }

    return bestTarget;
  }

  findWeakestEnemyBase(gameState, myUnits) {
    if (!gameState.bases || myUnits.length === 0) return null;

    const avgX = myUnits.reduce((s, u) => s + u.x, 0) / myUnits.length;
    const avgY = myUnits.reduce((s, u) => s + u.y, 0) / myUnits.length;

    let best = null;
    let bestScore = -Infinity;

    for (const [teamId, base] of Object.entries(gameState.bases)) {
      if (teamId === this.teamId || base.destroyed) continue;
      const dist = Math.sqrt((avgX - base.x) ** 2 + (avgY - base.y) ** 2);
      // Primary: nearest base. Secondary: lower HP is a small bonus.
      const score = -dist + (1 - base.hp / 1000) * 200;
      if (score > bestScore) {
        bestScore = score;
        best = base;
      }
    }

    return best;
  }

  findEnemyHeartZone(gameState, enemyTeamId, myUnits) {
    if (!myUnits.length) return null;
    const avgX = myUnits.reduce((s, u) => s + u.x, 0) / myUnits.length;
    const avgY = myUnits.reduce((s, u) => s + u.y, 0) / myUnits.length;

    let nearest = null;
    let nearestDist = Infinity;

    for (const zone of gameState.zones) {
      if (zone.type === 'heart' && zone.owner === enemyTeamId) {
        const dist = Math.sqrt((avgX - zone.x) ** 2 + (avgY - zone.y) ** 2);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = zone;
        }
      }
    }
    return nearest;
  }

  tryPlaceGoldMine(gameState) {
    const myGold = gameState.gold[this.teamId] || 0;
    if (myGold < 5000) return; // not enough gold

    // Don't hoard too many mines, max 5
    const myMines = gameState.goldMines.filter((m) => m.teamId === this.teamId && !m.destroyed);
    if (myMines.length >= 5) return;

    // Only buy if we have extra gold beyond what we need for other things
    if (myGold < 7000) return; // keep some reserve

    // Place near own base area but spread out
    const base = gameState.bases[this.teamId];
    if (!base || base.destroyed) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = 200 + Math.random() * 800;
    const x = base.x + Math.cos(angle) * dist;
    const y = base.y + Math.sin(angle) * dist;
    gameState.placeGoldMine(this.teamId, x, y);
  }

    tryUpgrade(gameState) {
    const myGold = gameState.gold[this.teamId] || 0;
    if (myGold < 100) return; // save minimum gold

    // Priority: baseHp when low, then attack, then hp, then speed
    const base = gameState.bases[this.teamId];
    const priorityTypes = [];
    
    // If base HP is low relative to max, prioritize base upgrades
    if (base && !base.destroyed && base.hp < base.maxHp * 0.5) {
      priorityTypes.push('baseHp');
    }
    
    // Random preference based on personality
    if (this.personality.type === 'aggressive') {
      priorityTypes.push('attack', 'speed', 'hp', 'baseHp');
    } else if (this.personality.type === 'defensive') {
      priorityTypes.push('baseHp', 'hp', 'attack', 'speed');
    } else {
      priorityTypes.push('attack', 'hp', 'speed', 'baseHp');
    }

    for (const type of priorityTypes) {
      const result = gameState.purchaseUpgrade(this.teamId, type);
      if (result.success) return; // one upgrade per decision cycle
    }
  }

    tryPlaceDefense(gameState) {
    const base = gameState.bases[this.teamId];
    if (!base || base.destroyed) return;

    // Count current defenses
    const myDefenses = gameState.defenses.filter((d) => d.teamId === this.teamId && !d.destroyed);
    if (myDefenses.length >= DEFENSE_COSTS.length) return; // maxed out

    const nextCost = DEFENSE_COSTS[myDefenses.length];
    const myGold = gameState.gold[this.teamId] || 0;

    // Bot strategy: defensive bots buy earlier, aggressive bots save more
    const buyThreshold = this.personality.type === 'defensive' ? 1.0 : 
                         this.personality.type === 'balanced' ? 1.2 : 1.5;

    if (myGold >= nextCost * buyThreshold) {
      // Random position within 400px of base
      const angle = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * 300; // 100-400px from base
      const x = base.x + Math.cos(angle) * dist;
      const y = base.y + Math.sin(angle) * dist;
      gameState.placeDefense(this.teamId, x, y);
    }
  }
}

module.exports = BotAI;

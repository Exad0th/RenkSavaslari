const { UNIT_SPEED, UNIT_ATTACK_RANGE, UNIT_ATTACK_COOLDOWN, UNIT_RADIUS, MAP_WIDTH, MAP_HEIGHT } = require('./constants');

let nextUnitId = 1;

class Unit {
  constructor(teamId, x, y, maxHp, attack, speed) {
    this.id = nextUnitId++;
    this.teamId = teamId;
    this.x = x;
    this.y = y;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.attack = attack;
    this.targetX = x;
    this.targetY = y;
    this.speed = speed || UNIT_SPEED;
    this.attackCooldown = 0;
    this.dead = false;
    this.lastCommandTime = 0; // elapsed game time when last command was given
    this.isAttacking = false;
    this.attackTargetX = 0;
    this.attackTargetY = 0;
    this.lastHitTime = 0;
  }

  moveTo(x, y) {
    this.targetX = x;
    this.targetY = y;
    this.lastCommandTime = Date.now();
  }

  update(dt, enemies) {
    if (this.dead) return;
    this.isAttacking = false;

    // Reduce attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    // Find nearest enemy in range
    let nearestEnemy = null;
    let nearestDist = Infinity;

    for (const enemy of enemies) {
      if (enemy.dead || enemy.teamId === this.teamId) continue;
      const dist = this.distanceTo(enemy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestEnemy = enemy;
      }
    }

    // Check if unit is idle (no command for 2 seconds = 2000ms)
    const timeSinceCommand = (Date.now() - this.lastCommandTime);
    const isIdle = timeSinceCommand > 2000;
    const hasPlayerCommand = !isIdle && (Math.abs(this.targetX - this.x) > 5 || Math.abs(this.targetY - this.y) > 5);

    if (nearestEnemy && nearestDist <= UNIT_ATTACK_RANGE && this.attackCooldown <= 0) {
      if (hasPlayerCommand) {
        // Move toward target (player command takes priority)
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 2) {
          const step = Math.min(this.speed, dist);
          this.x += (dx / dist) * step;
          this.y += (dy / dist) * step;
        }
      } else {
        this.attackUnit(nearestEnemy);
        return;
      }
    } else if (isIdle && nearestEnemy && nearestDist <= UNIT_ATTACK_RANGE * 3) {
      // Auto-chase when idle (2s no command) and enemy very close
      const dx = nearestEnemy.x - this.x;
      const dy = nearestEnemy.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const step = Math.min(this.speed, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    } else {
      // Move toward target
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2) {
        const step = Math.min(this.speed, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }

    // Clamp to map boundaries
    this.x = Math.max(UNIT_RADIUS, Math.min(MAP_WIDTH - UNIT_RADIUS, this.x));
    this.y = Math.max(UNIT_RADIUS, Math.min(MAP_HEIGHT - UNIT_RADIUS, this.y));
  }

  attackUnit(enemy) {
    if (this.attackCooldown <= 0) {
      enemy.takeDamage(this.attack);
      this.attackCooldown = UNIT_ATTACK_COOLDOWN;
      this.isAttacking = true;
      this.attackTargetX = enemy.x;
      this.attackTargetY = enemy.y;
    } else {
      this.isAttacking = false;
    }
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.lastHitTime = Date.now();
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  distanceTo(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  serialize() {
    return {
      id: this.id,
      teamId: this.teamId,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      dead: this.dead,
      isAttacking: this.isAttacking,
      atkTX: this.isAttacking ? Math.round(this.attackTargetX) : 0,
      atkTY: this.isAttacking ? Math.round(this.attackTargetY) : 0,
      hit: (Date.now() - (this.lastHitTime || 0)) < 200,
    };
  }
}

module.exports = Unit;

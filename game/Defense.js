const { DEFENSE_HP, DEFENSE_ATTACK, DEFENSE_RANGE, DEFENSE_ATTACK_COOLDOWN, MAP_WIDTH, MAP_HEIGHT } = require('./constants');

let nextDefenseId = 1;

class Defense {
  constructor(teamId, x, y) {
    this.id = nextDefenseId++;
    this.teamId = teamId;
    this.x = x;
    this.y = y;
    this.hp = DEFENSE_HP;
    this.maxHp = DEFENSE_HP;
    this.attack = DEFENSE_ATTACK;
    this.range = DEFENSE_RANGE;
    this.attackCooldown = 0;
    this.destroyed = false;
    this.targetId = null;
    this.targetX = null;
    this.targetY = null;
    this.firing = false; // true when actively shooting
  }

  update(dt, enemies) {
    if (this.destroyed) return;

    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    // Find nearest enemy in range
    let nearest = null;
    let nearestDist = Infinity;

    for (const enemy of enemies) {
      if (enemy.dead || enemy.teamId === this.teamId) continue;
      const dx = enemy.x - this.x;
      const dy = enemy.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= this.range && dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }

    if (nearest && this.attackCooldown <= 0) {
      nearest.hp -= this.attack;
      if (nearest.hp <= 0) {
        nearest.dead = true;
      }
      this.targetId = nearest.id;
      this.targetX = nearest.x;
      this.targetY = nearest.y;
      this.firing = true;
      this.attackCooldown = DEFENSE_ATTACK_COOLDOWN;
    } else {
      this.firing = false;
      if (!nearest) {
        this.targetId = null;
        this.targetX = null;
        this.targetY = null;
      }
    }
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.destroyed = true;
    }
  }

  serialize() {
    return {
      id: this.id,
      teamId: this.teamId,
      x: this.x,
      y: this.y,
      hp: this.hp,
      maxHp: this.maxHp,
      range: this.range,
      destroyed: this.destroyed,
      targetId: this.targetId,
      targetX: this.targetX,
      targetY: this.targetY,
      firing: this.firing,
    };
  }
}

module.exports = Defense;

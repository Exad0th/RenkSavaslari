// Base class - Each team has a base at their spawn point
const { BASE_HP, BASE_RADIUS } = require('./constants');

class Base {
  constructor(teamId, x, y) {
    this.teamId = teamId;
    this.x = x;
    this.y = y;
    this.maxHp = BASE_HP;
    this.hp = this.maxHp;
    this.radius = BASE_RADIUS;
    this.destroyed = false;
  }

  takeDamage(amount) {
    if (this.destroyed) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.destroyed = true;
    }
  }

  serialize() {
    return {
      teamId: this.teamId,
      x: this.x,
      y: this.y,
      hp: this.hp,
      maxHp: this.maxHp,
      radius: this.radius,
      destroyed: this.destroyed,
    };
  }
}

module.exports = Base;

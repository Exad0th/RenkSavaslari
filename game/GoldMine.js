const { MAP_WIDTH, MAP_HEIGHT, GOLD_PER_SECOND } = require('./constants');

let nextMineId = 1;

class GoldMine {
  constructor(teamId, x, y) {
    this.id = nextMineId++;
    this.teamId = teamId;
    this.x = Math.max(10, Math.min(MAP_WIDTH - 10, x));
    this.y = Math.max(10, Math.min(MAP_HEIGHT - 10, y));
    this.hp = 300;
    this.maxHp = 300;
    this.destroyed = false;
    this.incomePerSecond = GOLD_PER_SECOND; // same as zone income
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
      destroyed: this.destroyed,
    };
  }
}

module.exports = GoldMine;

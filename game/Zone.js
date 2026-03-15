const { ZONE_SIZE, ZONE_CAPTURE_TIME_HEART, ZONE_CAPTURE_TIME_DIAMOND, ZONE_CAPTURE_TIME_GOLD, TEAMS } = require('./constants');

let nextZoneId = 1;

class Zone {
  constructor(x, y, type) {
    this.id = nextZoneId++;
    this.x = x; // center x
    this.y = y; // center y
    this.size = ZONE_SIZE;
    this.type = type; // 'heart', 'diamond', or 'gold'
    this.captureTime = type === 'diamond' ? ZONE_CAPTURE_TIME_DIAMOND : type === 'gold' ? ZONE_CAPTURE_TIME_GOLD : ZONE_CAPTURE_TIME_HEART;
    this.owner = null; // team id
    this.captureProgress = {}; // { teamId: progressMs }
    this.capturingTeam = null; // team currently progressing
  }

  containsPoint(px, py) {
    const half = this.size / 2;
    return (
      px >= this.x - half &&
      px <= this.x + half &&
      py >= this.y - half &&
      py <= this.y + half
    );
  }

  update(dt, unitsInZone) {
    // Count units per team in this zone
    const teamCounts = {};
    for (const unit of unitsInZone) {
      if (!unit.dead) {
        teamCounts[unit.teamId] = (teamCounts[unit.teamId] || 0) + 1;
      }
    }

    const teams = Object.keys(teamCounts);

    // If only one team present, they make progress
    if (teams.length === 1) {
      const teamId = teams[0];

      // If already owned by this team, nothing to do
      if (this.owner === teamId) {
        this.capturingTeam = null;
        return;
      }

      // Need at least 3 units to start capturing
      if (teamCounts[teamId] < 3) {
        this.capturingTeam = teamId;
        // Still show as "trying" but no real progress
        return;
      }

      if (!this.captureProgress[teamId]) {
        this.captureProgress[teamId] = 0;
      }

      // More units = faster capture, but slower base rate
      // 3 units = 1x, 6 units = ~1.6x, 12 units = ~2.2x
      const speedMultiplier = 0.5 + Math.log2(teamCounts[teamId]) * 0.5;
      const teamCapMult = TEAMS[teamId]?.captureSpeedMultiplier || 1;
      this.captureProgress[teamId] += dt * speedMultiplier * teamCapMult;
      this.capturingTeam = teamId;

      // If zone is owned by another team, must first neutralize it
      if (this.owner && this.owner !== teamId) {
        // Decapture: remove ownership progress
        if (!this.captureProgress[this.owner]) {
          this.captureProgress[this.owner] = this.captureTime;
        }
        this.captureProgress[this.owner] -= dt * speedMultiplier * 0.8;
        if (this.captureProgress[this.owner] <= 0) {
          // Zone becomes neutral
          this.owner = null;
          this.captureProgress = {};
          this.captureProgress[teamId] = 0;
        }
        return;
      }

      // Reset other teams' progress faster
      for (const otherTeam of Object.keys(this.captureProgress)) {
        if (otherTeam !== teamId) {
          this.captureProgress[otherTeam] = Math.max(0, this.captureProgress[otherTeam] - dt * 0.8);
        }
      }

      // Check if captured
      if (this.captureProgress[teamId] >= this.captureTime) {
        this.owner = teamId;
        this.captureProgress = {};
        this.capturingTeam = null;
      }
    } else if (teams.length > 1) {
      // Contested - no progress, fast decay
      this.capturingTeam = null;
      for (const teamId of Object.keys(this.captureProgress)) {
        this.captureProgress[teamId] = Math.max(0, this.captureProgress[teamId] - dt * 0.6);
      }
    } else {
      // No units - decay progress, owned zones slowly lose grip
      this.capturingTeam = null;
      for (const teamId of Object.keys(this.captureProgress)) {
        this.captureProgress[teamId] = Math.max(0, this.captureProgress[teamId] - dt * 0.3);
      }
    }
  }

  getCapturePercent(teamId) {
    if (this.owner === teamId) return 100;
    return Math.min(100, ((this.captureProgress[teamId] || 0) / this.captureTime) * 100);
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      size: this.size,
      type: this.type,
      owner: this.owner,
      capturingTeam: this.capturingTeam,
      captureProgress: this.captureProgress,
      captureTime: this.captureTime,
    };
  }
}

module.exports = Zone;

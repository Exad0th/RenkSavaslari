// Game Constants
const MAP_WIDTH = 10000;
const MAP_HEIGHT = 10000;

const TICK_RATE = 30; // server ticks per second
const TICK_INTERVAL = 1000 / TICK_RATE;

const MAX_UNITS_PER_TEAM = 50;
const UNIT_RADIUS = 8;
const UNIT_SPEED = 1.8;
const UNIT_ATTACK_RANGE = 20;
const UNIT_ATTACK_COOLDOWN = 500; // ms

const ZONE_SIZE = 80;
const ZONE_CAPTURE_TIME_HEART = 30000;
const ZONE_CAPTURE_TIME_DIAMOND = 60000;
const ZONE_CAPTURE_TIME_GOLD = 20000;
const ZONE_COUNT = 110;
const ZONE_HEART_REGEN = 0.3;
const ZONE_HEART_BASE_REGEN = 5;
const ZONE_DIAMOND_SPAWN_BONUS = 0.75;
const GOLD_PER_SECOND = 15;
const STARTING_GOLD = 0;

const SPAWN_MARGIN = 500;
const MIN_BASE_DISTANCE = 2000;

const GAME_DURATION = 5 * 60 * 1000;
const BASE_HP = 1000;
const BASE_RADIUS = 40;
const BASE_ATTACK_RANGE = 25;
const BASE_DAMAGE_PER_TICK = 2;

// Defense
const DEFENSE_COSTS = [50, 200, 500, 1250, 2500, 5000, 10000];
const MAX_DEFENSES = DEFENSE_COSTS.length;
const DEFENSE_HP = 2000;
const DEFENSE_ATTACK = 15;
const DEFENSE_RANGE = 250;
const DEFENSE_ATTACK_COOLDOWN = 500;
const DEFENSE_PLACEMENT_RADIUS = 500;
const GOLD_ZONE_BASE_RADIUS = 1500;

// Upgrades
const UPGRADE_SPEED_COSTS = [500, 1500, 3500, 7500, 17500];
const UPGRADE_SPEED_BONUS = 0.12;
const UPGRADE_ATTACK_COSTS = [750, 2250, 5000, 12500, 30000];
const UPGRADE_ATTACK_BONUS = 0.15;
const UPGRADE_HP_COSTS = [750, 2250, 5000, 12500, 30000];
const UPGRADE_HP_BONUS = 0.15;
const UPGRADE_BASE_HP_COSTS = [1000, 2500, 6000, 15000, 35000, 75000, 150000, 250000, 375000, 500000];
const UPGRADE_BASE_HP_AMOUNT = [1000, 2000, 4000, 8000, 12000, 16000, 20000, 15000, 12000, 10000];

const TEAMS = {
  green: {
    id: 'green',
    name: 'Yeşil',
    color: '#2ecc71',
    colorLight: '#a9dfbf',
    colorDark: '#1e8449',
    hp: 45,
    spawnInterval: 3000, // ms - very fast
    attack: 5,
    maxUnits: 200,
    spawnX: SPAWN_MARGIN,
    spawnY: SPAWN_MARGIN,
  },
  purple: {
    id: 'purple',
    name: 'Mor',
    color: '#9b59b6',
    colorLight: '#d7bde2',
    colorDark: '#6c3483',
    hp: 50,
    spawnInterval: 6000, // ms - slow-medium
    attack: 15,
    maxUnits: 60,
    spawnX: MAP_WIDTH - SPAWN_MARGIN,
    spawnY: SPAWN_MARGIN,
  },
  yellow: {
    id: 'yellow',
    name: 'Sarı',
    color: '#f1c40f',
    colorLight: '#f9e79f',
    colorDark: '#b7950b',
    hp: 125,
    spawnInterval: 7000, // ms - slow
    attack: 8,
    maxUnits: 45,
    spawnX: MAP_WIDTH - SPAWN_MARGIN,
    spawnY: MAP_HEIGHT - SPAWN_MARGIN,
  },
  gray: {
    id: 'gray',
    name: 'Gri',
    color: '#95a5a6',
    colorLight: '#d5dbdb',
    colorDark: '#717d7e',
    hp: 75,
    spawnInterval: 5000, // ms - medium
    attack: 10,
    maxUnits: 60,
    spawnX: SPAWN_MARGIN,
    spawnY: MAP_HEIGHT - SPAWN_MARGIN,
  },
  red: {
    id: 'red',
    name: 'Kırmızı',
    color: '#e74c3c',
    colorLight: '#f1948a',
    colorDark: '#922b21',
    hp: 75,
    spawnInterval: 5000, // ms - medium
    attack: 12,
    maxUnits: 50,
    speed: 2.7, // 50% faster than default (1.8)
    spawnX: MAP_WIDTH / 2,
    spawnY: SPAWN_MARGIN,
  },
  blue: {
    id: 'blue',
    name: 'Mavi',
    color: '#3498db',
    colorLight: '#85c1e9',
    colorDark: '#1a5276',
    hp: 40,
    spawnInterval: 4000,
    attack: 5,
    maxUnits: 80,
    defenseCostMultiplier: 0.4,
    mineCostMultiplier: 0.4,
    spawnX: MAP_WIDTH / 2,
    spawnY: MAP_HEIGHT - SPAWN_MARGIN,
  },
  pink: {
    id: 'pink',
    name: 'Pembe',
    color: '#e91e9c',
    colorLight: '#f48fb1',
    colorDark: '#880e4f',
    hp: 50,
    spawnInterval: 4000,
    attack: 9,
    maxUnits: 100,
    captureSpeedMultiplier: 1.5,
    spawnX: MAP_WIDTH - SPAWN_MARGIN,
    spawnY: MAP_HEIGHT / 2,
  },
  orange: {
    id: 'orange',
    name: 'Turuncu',
    color: '#e67e22',
    colorLight: '#f0b27a',
    colorDark: '#935116',
    hp: 60,
    spawnInterval: 4500,
    attack: 10,
    maxUnits: 75,
    upgradeCostMultiplier: 0.4,
    spawnX: SPAWN_MARGIN,
    spawnY: MAP_HEIGHT / 2,
  },
};
const TEAM_ORDER = ['green', 'purple', 'yellow', 'gray', 'red', 'blue', 'pink', 'orange'];

module.exports = {
  MAP_WIDTH,
  MAP_HEIGHT,
  TICK_RATE,
  TICK_INTERVAL,
  MAX_UNITS_PER_TEAM,
  UNIT_RADIUS,
  UNIT_SPEED,
  UNIT_ATTACK_RANGE,
  UNIT_ATTACK_COOLDOWN,
  ZONE_SIZE,
  ZONE_CAPTURE_TIME_HEART,
  ZONE_CAPTURE_TIME_DIAMOND,
  ZONE_CAPTURE_TIME_GOLD,
  ZONE_COUNT,
  ZONE_HEART_REGEN,
  ZONE_HEART_BASE_REGEN,
  ZONE_DIAMOND_SPAWN_BONUS,
  GOLD_PER_SECOND,
  STARTING_GOLD,
  SPAWN_MARGIN,
  GAME_DURATION,
  BASE_HP,
  BASE_RADIUS,
  BASE_ATTACK_RANGE,
  BASE_DAMAGE_PER_TICK,
  MIN_BASE_DISTANCE,
  DEFENSE_COSTS,
  MAX_DEFENSES,
  DEFENSE_HP,
  DEFENSE_ATTACK,
  DEFENSE_RANGE,
  DEFENSE_ATTACK_COOLDOWN,
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
  TEAMS,
  TEAM_ORDER,
};

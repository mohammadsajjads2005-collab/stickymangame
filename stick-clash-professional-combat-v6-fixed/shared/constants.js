/**
 * Shared constants — loaded by both the Node server (via require) and the
 * browser client (via <script src="/shared/constants.js">). Keep this file
 * dependency-free so it works in both environments unmodified.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameConstants = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    TICK_RATE: 30, // server physics ticks per second
    TICK_MS: 1000 / 30,

    ARENA_WIDTH: 1280,
    ARENA_HEIGHT: 720,
    GRAVITY: 1800, // px/s^2
    GROUND_FRICTION: 2200,
    AIR_DRAG: 300,

    PLAYER: {
      WIDTH: 34,
      HEIGHT: 84,
      CROUCH_HEIGHT: 54,
      MOVE_SPEED: 320,
      AIR_MOVE_SPEED: 260,
      JUMP_VELOCITY: -720,
      DASH_SPEED: 900,
      DASH_DURATION: 0.16, // seconds
      DASH_COOLDOWN: 0.8,
      ROLL_SPEED: 720,
      ROLL_DURATION: 0.34,
      ROLL_COOLDOWN: 0.9,
      MAX_HP: 150,
      HIT_STUN: 0.28,
      HIT_STUN_HEAVY: 0.42,
      BLOCK_CHIP_MULT: 0.08,
      // Damage is deliberately slower for longer, more tactical rounds.
      HEAD_DAMAGE_MULT: 1.35,
      BODY_DAMAGE_MULT: 1.00,
      LEG_DAMAGE_MULT: 0.75, // damage taken while blocking
    },

    // Attack values per the spec's target ranges. Each has its own
    // startup/active/recovery window; the hitbox only exists during "active".
    ATTACKS: {
      punch:      { label: 'Light Punch',  damage: 4,  knockback: 170, range: 46,  height: 38, startup: 0.08, active: 0.10, recovery: 0.20, stamina: 6,  heavy: false },
      kick:       { label: 'Kick',         damage: 7,  knockback: 250, range: 56,  height: 48, startup: 0.11, active: 0.10, recovery: 0.26, stamina: 10, heavy: false },
      heavy:      { label: 'Heavy Punch',  damage: 10, knockback: 390, range: 60,  height: 58, startup: 0.24, active: 0.11, recovery: 0.46, stamina: 22, heavy: true },
      heavyKick:  { label: 'Heavy Kick',   damage: 12, knockback: 440, range: 66,  height: 54, startup: 0.26, active: 0.12, recovery: 0.50, stamina: 24, heavy: true },
      sword:      { label: 'Sword Slash',  damage: 13, knockback: 430, range: 120, height: 76, startup: 0.18, active: 0.13, recovery: 0.38, stamina: 20, heavy: true },
      airPunch:   { label: 'Air Attack',   damage: 5,  knockback: 190, range: 50,  height: 44, startup: 0.09, active: 0.09, recovery: 0.22, stamina: 8,  heavy: false },
      dashAttack: { label: 'Dash Attack',  damage: 6,  knockback: 260, range: 42,  height: 58, startup: 0,    active: 0.16, recovery: 0.12, stamina: 0,  heavy: false },
    },

    STAMINA: {
      MAX: 100,
      REGEN_PER_SEC: 22,
      REGEN_DELAY: 0.4, // seconds after last spend before regen resumes
    },

    // Round/match structure: Best of 3, 100 HP per round, sudden-death cap.
    ROUND: {
      HP_START: 150,
      WINS_TO_TAKE_MATCH: 2, // Best of 3
      INTRO_COUNTDOWN: 3.0, // 3, 2, 1, then FIGHT; server clears countdown authoritatively
      TIME_LIMIT: 120,       // seconds — extended round timer
      POST_ROUND_DELAY: 2.6, // seconds banner shows before next round / match end
    },

    HITSTOP: {
      LIGHT_MS: 0,
      HEAVY_MS: 90, // brief freeze-frame on heavy hits / KOs, in ms
    },

    ROOM: {
      MIN_PLAYERS: 1,
      MAX_PLAYERS: 2,
      ID_LENGTH: 5,
      ID_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // no ambiguous chars
    },

    PLAYER_COLORS: ['#3DDBD9', '#FF5B9E', '#FFC93C', '#8B7CFF'],

    MODES: {
      FFA: 'ffa',
    },

    MAPS: {
      ROOFTOP: 'rooftop',
    },
  };
});

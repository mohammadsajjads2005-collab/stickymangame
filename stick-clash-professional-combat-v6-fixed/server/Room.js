const C = require('../shared/constants');
const Maps = require('../shared/maps');

const P = C.PLAYER;

function makeId(len, chars) {
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

class Player {
  constructor(socketId, name, color, slot) {
    this.id = socketId;
    this.name = name;
    this.color = color;
    this.slot = slot;
    this.ready = false;
    // Match-level stats: persist across rounds, only cleared by resetForNewMatch().
    this.roundWins = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.reset(80 + slot * 20, 600);
  }

  /** Per-round reset: position, HP, physics state. Does NOT touch match-level stats. */
  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.crouching = false;
    this.hp = C.ROUND.HP_START;
    this.stamina = C.STAMINA.MAX;
    this.staminaRegenAt = 0;
    this.state = 'idle'; // idle|walk|jump|crouch|attack|hitstun|dash|block|dead
    this.attackType = null;
    this.attackClock = 0; // time since attack started
    this.attackHitApplied = false;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.rollTimer = 0;
    this.rollCooldownTimer = 0;
    this._dashHitApplied = false;
    this.hitstunTimer = 0;
    this.eliminated = false; // KO'd for this round (no mid-round respawn)
    this.input = { left: false, right: false, up: false, down: false, punch: false, kick: false, heavy: false, sword: false, dash: false, roll: false, block: false };
    this._prevInput = { ...this.input };
  }

  resetForNewMatch() {
    this.roundWins = 0;
    this.kills = 0;
    this.damageDealt = 0;
  }

  get width() { return P.WIDTH; }
  get height() { return this.crouching ? P.CROUCH_HEIGHT : P.HEIGHT; }
}

class Room {
  constructor(io, hostId, hostName) {
    this.io = io;
    this.id = makeId(C.ROOM.ID_LENGTH, C.ROOM.ID_CHARS);
    this.hostId = hostId;
    this.players = new Map();
    this.mode = C.MODES.FFA;
    this.mapId = C.MAPS.ROOFTOP;
    this.status = 'lobby'; // lobby|countdown|fighting|roundEnd|matchEnd
    this.countdown = 0;
    this.matchClock = 0; // resets each round; sudden-death cap is C.ROUND.TIME_LIMIT
    this.roundNumber = 0;
    this.roundEndTimer = 0;
    this.matchWinnerId = null;
    this.lastRoundResult = null;
    this.hitStopTimer = 0; // ms remaining of authoritative freeze-frame
    this.loopHandle = null;
    this.botMode = false;
    this.addPlayer(hostId, hostName);
  }

  addBot(name = 'Shadow Bot') {
    if (this.players.size >= C.ROOM.MAX_PLAYERS) return null;
    const slot = this.players.size;
    const botId = `BOT_${this.id}`;
    const bot = new Player(botId, name, '#050505', slot);
    bot.isBot = true;
    bot.ready = true;
    bot.isBot = true;
    this.players.set(botId, bot);
    return bot;
  }

  get map() { return Maps.getMap(this.mapId); }

  addPlayer(socketId, name) {
    if (this.players.size >= C.ROOM.MAX_PLAYERS) return { error: 'Room is full' };
    if (this.status !== 'lobby') return { error: 'Match already in progress' };
    if (this.botMode) return { error: 'This room is a solo bot match' };
    const slot = this.players.size;
    const color = C.PLAYER_COLORS[slot % C.PLAYER_COLORS.length];
    const p = new Player(socketId, name || `Player${slot + 1}`, color, slot);
    this.players.set(socketId, p);
    return { player: p };
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    if (this.hostId === socketId && this.players.size > 0) {
      this.hostId = this.players.values().next().value.id;
    }
  }

  get isEmpty() { return this.players.size === 0; }

  setReady(socketId, ready) {
    const p = this.players.get(socketId);
    if (p) p.ready = !!ready;
  }

  allReady() {
    if (this.players.size < 1) return false;
    return [...this.players.values()].every((p) => p.ready || p.id === this.hostId);
  }

  applyInput(socketId, input) {
    const p = this.players.get(socketId);
    if (!p || this.status !== 'fighting') return;
    p._prevInput = p.input;
    p.input = {
      left: !!input.left,
      right: !!input.right,
      up: !!input.up,
      down: !!input.down,
      punch: !!input.punch,
      kick: !!input.kick,
      heavy: !!input.heavy,
      sword: !!input.sword,
      dash: !!input.dash,
      roll: !!input.roll,
      block: !!input.block,
    };
  }

  /** Host presses START MATCH from the lobby: begins round 1 of a fresh Best-of-N match. */
  startCountdown() {
    if (this.status !== 'lobby') return;
    [...this.players.values()].forEach((p) => p.resetForNewMatch());
    this.roundNumber = 0;
    this.matchWinnerId = null;
    this.lastRoundResult = null;
    this.beginRoundIntro();
  }

  /** Shared by "start match" and "next round after roundEnd": places players and starts the 3-2-1 intro. */
  beginRoundIntro() {
    this.roundNumber += 1;
    this.status = 'countdown';
    this.countdown = C.ROUND.INTRO_COUNTDOWN;
    this.roundEndTimer = 0;
    const map = this.map;
    [...this.players.values()].forEach((p, i) => {
      const sp = map.spawnPoints[i % map.spawnPoints.length];
      p.reset(sp.x, sp.y);
    });
  }

  beginFighting() {
    this.status = 'fighting';
    this.matchClock = 0;
  }

  /** A round just ended (someone KO'd, or sudden-death time-limit decision). */
  endRound(winnerId) {
    if (winnerId) {
      const winner = this.players.get(winnerId);
      if (winner) winner.roundWins += 1;
    }
    this.lastRoundResult = {
      winnerId: winnerId || null,
      roundNumber: this.roundNumber,
      scores: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, roundWins: p.roundWins })),
    };
    const matchWinner = [...this.players.values()].find((p) => p.roundWins >= C.ROUND.WINS_TO_TAKE_MATCH);
    this.matchWinnerId = matchWinner ? matchWinner.id : null;
    this.status = 'roundEnd';
    this.roundEndTimer = C.ROUND.POST_ROUND_DELAY;
    this.io.to(this.id).emit('round:end', this.lastRoundResult);
  }

  endMatch() {
    this.status = 'matchEnd';
    this.io.to(this.id).emit('match:ended', { results: this.results(), matchWinnerId: this.matchWinnerId });
  }

  returnToLobby() {
    this.status = 'lobby';
    [...this.players.values()].forEach((p) => { p.ready = false; });
  }

  // ---- physics / combat tick ----
  tick(dt) {
    if (this.status === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.beginFighting();
      return;
    }

    if (this.status === 'roundEnd') {
      this.roundEndTimer -= dt;
      if (this.roundEndTimer <= 0) {
        if (this.matchWinnerId) this.endMatch();
        else this.beginRoundIntro();
      }
      return;
    }

    if (this.status !== 'fighting') return;

    // Hit-stop: brief authoritative freeze-frame on heavy hits/KOs. Timers still
    // drain in real time (so it can't be exploited to stall), physics doesn't.
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt * 1000;
      return;
    }

    this.matchClock += dt;
    const map = this.map;

    this.updateBots(dt);
    for (const p of this.players.values()) this.updatePlayer(p, dt, map);
    this.resolveCombat(dt, map);

    const standing = [...this.players.values()].filter((p) => !p.eliminated);
    const timeUp = this.matchClock >= C.ROUND.TIME_LIMIT;

    if (this.players.size > 1 && standing.length <= 1) {
      this.endRound(standing[0] ? standing[0].id : null);
    } else if (timeUp) {
      // Sudden-death fallback: highest remaining HP wins the round.
      const byHp = [...this.players.values()].sort((a, b) => b.hp - a.hp);
      const tie = byHp.length > 1 && byHp[0].hp === byHp[1].hp;
      this.endRound(tie ? null : byHp[0].id);
    }
  }

  updateBots(dt) {
    for (const bot of this.players.values()) {
      if (!bot.isBot || bot.eliminated) continue;
      const opponents = [...this.players.values()].filter((p) => p !== bot && !p.eliminated);
      const target = opponents[0];
      if (!target) { bot.input = { left:false,right:false,up:false,down:false,punch:false,kick:false,heavy:false,sword:false,dash:false,roll:false,block:false }; continue; }

      const botCenter = bot.x + bot.width / 2;
      const targetCenter = target.x + target.width / 2;
      const dx = targetCenter - botCenter;
      const dist = Math.abs(dx);
      const facing = dx >= 0 ? 1 : -1;
      bot.facing = facing;

      const input = { left:false,right:false,up:false,down:false,punch:false,kick:false,heavy:false,sword:false,dash:false,roll:false,block:false };
      // Keep the bot inside the continuous arena and approach its opponent.
      if (dist > 78) {
        if (dx < 0) input.left = true; else input.right = true;
      }
      // Occasional defensive movement when the opponent is attacking.
      if (target.attackType && dist < 150 && Math.random() < dt * 1.4) input.block = true;
      if (target.attackType && dist < 130 && Math.random() < dt * 0.45) input.roll = true;

      // Attack decision. Actions are pulses so the bot doesn't lock itself into a held attack.
      const ready = !bot.attackType && bot.hitstunTimer <= 0 && bot.dashTimer <= 0 && bot.rollTimer <= 0;
      if (ready && dist < 125) {
        const r = Math.random();
        if (r < dt * 3.2) input.punch = true;
        else if (r < dt * 5.0) input.kick = true;
        else if (r < dt * 5.9 && bot.stamina >= C.ATTACKS.heavy.stamina) input.heavy = true;
        else if (r < dt * 6.8 && bot.stamina >= C.ATTACKS.sword.stamina) input.sword = true;
      } else if (ready && dist > 150 && dist < 320 && Math.random() < dt * 0.9) {
        input.dash = true;
      }

      bot.input = input;
      bot._prevInput = bot.input;
    }
  }

  updatePlayer(p, dt, map) {
    // KO'd players are frozen (ragdolled in place) for the rest of the round — no mid-round respawn.
    if (p.eliminated) { p.state = 'dead'; return; }

    // stamina regen
    p.staminaRegenAt -= dt;
    if (p.staminaRegenAt <= 0 && p.stamina < C.STAMINA.MAX) {
      p.stamina = Math.min(C.STAMINA.MAX, p.stamina + C.STAMINA.REGEN_PER_SEC * dt);
    }

    if (p.hitstunTimer > 0) {
      p.hitstunTimer -= dt;
      p.state = 'hitstun';
    } else if (p.attackType) {
      p.attackClock += dt;
      const def = C.ATTACKS[p.attackType];
      const totalDur = def.startup + def.active + def.recovery;
      if (p.attackClock >= totalDur) {
        p.attackType = null;
        p.attackClock = 0;
        p.attackHitApplied = false;
        p.state = 'idle';
      } else {
        p.state = 'attack';
      }
    } else if (p.rollTimer > 0) {
      p.rollTimer -= dt;
      p.state = 'roll';
    } else if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.state = 'dash';
    } else {
      // read input & set intent
      const inp = p.input;
      p.crouching = inp.down && p.onGround;
      p.facing = inp.left ? -1 : inp.right ? 1 : p.facing;

      if (inp.block && p.onGround) {
        p.state = 'block';
      } else if (!p.onGround) {
        p.state = 'jump';
      } else if (p.crouching) {
        p.state = 'crouch';
      } else if (inp.left || inp.right) {
        p.state = 'walk';
      } else {
        p.state = 'idle';
      }

      // Start new actions. Roll is a short invulnerable defensive movement.
      if (inp.roll && p.onGround && p.rollCooldownTimer <= 0 && p.stamina >= 12) {
        p.rollTimer = P.ROLL_DURATION;
        p.rollCooldownTimer = P.ROLL_COOLDOWN;
        p.vx = p.facing * P.ROLL_SPEED;
        p.stamina -= 12;
        p.staminaRegenAt = C.STAMINA.REGEN_DELAY;
      } else if (inp.dash && p.dashCooldownTimer <= 0 && p.stamina >= 10) {
        p.dashTimer = P.DASH_DURATION;
        p.dashCooldownTimer = P.DASH_COOLDOWN;
        p.vx = p.facing * P.DASH_SPEED;
        p.stamina -= 10;
        p.staminaRegenAt = C.STAMINA.REGEN_DELAY;
        p._dashHitApplied = false; // dash-attack: one contact hit per dash
      } else if (inp.sword && p.stamina >= C.ATTACKS.sword.stamina) {
        this.beginAttack(p, 'sword');
      } else if (inp.heavy && p.stamina >= C.ATTACKS.heavy.stamina) {
        this.beginAttack(p, 'heavy');
      } else if (inp.kick && p.crouching && p.stamina >= C.ATTACKS.heavyKick.stamina) {
        this.beginAttack(p, 'heavyKick');
      } else if (inp.kick && p.stamina >= C.ATTACKS.kick.stamina) {
        this.beginAttack(p, 'kick');
      } else if (inp.punch && p.stamina >= C.ATTACKS.punch.stamina) {
        this.beginAttack(p, p.onGround ? 'punch' : 'airPunch');
      } else if (inp.up && p.onGround) {
        p.vy = P.JUMP_VELOCITY;
        p.onGround = false;
      }
    }

    if (p.dashCooldownTimer > 0) p.dashCooldownTimer -= dt;
    if (p.rollCooldownTimer > 0) p.rollCooldownTimer -= dt;

    // horizontal movement (skipped during dash/attack lock/hitstun/block)
    const locked = p.rollTimer > 0 || p.dashTimer > 0 || p.attackType || p.hitstunTimer > 0;
    if (!locked) {
      const speed = p.onGround ? P.MOVE_SPEED : P.AIR_MOVE_SPEED;
      const isBlocking = p.input.block && p.onGround;
      if (isBlocking) {
        p.vx *= 0.6;
      } else if (p.input.left) {
        p.vx = -speed;
      } else if (p.input.right) {
        p.vx = speed;
      } else {
        const fr = p.onGround ? P.MOVE_SPEED * 6 : P.MOVE_SPEED * 2;
        p.vx = Math.abs(p.vx) < 8 ? 0 : p.vx - Math.sign(p.vx) * fr * dt;
      }
    }

    // gravity
    p.vy += C.GRAVITY * dt;
    p.vy = Math.min(p.vy, 1800);

    // integrate
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // world bounds (soft walls)
    p.x = Math.max(10, Math.min(map.width - 10 - p.width, p.x));

    // Stable one-floor collision. The arena is a flat Shadow-Fight-style stage,
    // so movement can never make the player fall through the floor.
    p.onGround = false;
    let landedPlatform = null;
    let bestTop = Infinity;
    for (const plat of map.platforms) {
      const pxLeft = p.x, pxRight = p.x + p.width;
      const platTop = plat.y;
      const withinX = pxRight > plat.x && pxLeft < plat.x + plat.w;
      const feetY = p.y + p.height;
      const prevFeetY = feetY - p.vy * dt;
      if (withinX && p.vy >= 0 && feetY >= platTop && prevFeetY <= platTop + 2) {
        if (platTop < bestTop) {
          bestTop = platTop;
          landedPlatform = plat;
        }
      }
    }
    if (landedPlatform) {
      p.y = landedPlatform.y - p.height;
      p.vy = 0;
      p.onGround = true;
    }

    // Absolute floor safety net: never allow a player to fall below the arena floor.
    const floor = map.platforms.find((plat) => plat.kind === 'ground');
    if (floor && p.y + p.height >= floor.y && p.vy >= 0) {
      p.y = floor.y - p.height;
      p.vy = 0;
      p.onGround = true;
    }

    // No ring-outs / potholes: this is a single continuous ground arena.
    // The floor collision above is the authoritative safety boundary, so a fighter
    // can never fall through the stage or be KO'd by simply walking around.
  }

  beginAttack(p, type) {
    p.attackType = type;
    p.attackClock = 0;
    p.attackHitApplied = false;
    p.stamina -= C.ATTACKS[type].stamina;
    p.staminaRegenAt = C.STAMINA.REGEN_DELAY;
    p.state = 'attack';
  }

  resolveCombat(dt, map) {
    // Standard attacks: hitbox only exists during the active-frame window,
    // positioned from attacker position + facing + attack def (never from the sprite).
    for (const attacker of this.players.values()) {
      if (!attacker.attackType || attacker.attackHitApplied || attacker.eliminated) continue;
      const def = C.ATTACKS[attacker.attackType];
      const activeStart = def.startup;
      const activeEnd = def.startup + def.active;
      if (attacker.attackClock < activeStart || attacker.attackClock > activeEnd) continue;

      const box = this.attackHitbox(attacker, def);
      const target = this.firstOverlappingTarget(attacker, box);
      if (!target) continue;

      attacker.attackHitApplied = true;
      this.applyHit(attacker, target, def, box.cx, box.cy);
    }

    // Dash attack: while dashing, physical contact with an opponent deals damage once per dash.
    for (const attacker of this.players.values()) {
      if (attacker.dashTimer <= 0 || attacker._dashHitApplied || attacker.eliminated) continue;
      const def = C.ATTACKS.dashAttack;
      const box = {
        hbLeft: attacker.x, hbRight: attacker.x + attacker.width,
        hbTop: attacker.y, hbBottom: attacker.y + attacker.height,
        cx: attacker.x + attacker.width / 2, cy: attacker.y + attacker.height / 2,
      };
      const target = this.firstOverlappingTarget(attacker, box);
      if (!target) continue;
      attacker._dashHitApplied = true;
      this.applyHit(attacker, target, def, box.cx, box.cy);
    }
  }

  attackHitbox(attacker, def) {
    const cx = attacker.x + attacker.width / 2 + attacker.facing * (def.range / 2);
    const cy = attacker.y + attacker.height / 2 - def.height / 4;
    return {
      cx, cy,
      hbLeft: cx - def.range / 2, hbRight: cx + def.range / 2,
      hbTop: cy - def.height / 2, hbBottom: cy + def.height / 2,
    };
  }

  firstOverlappingTarget(attacker, box) {
    for (const target of this.players.values()) {
      if (target === attacker || target.eliminated) continue;
      // Dodge: a target currently in its dash state is treated as having briefly evaded
      // the hitbox (i-frames), matching "a correctly timed dodge should make an attack
      // miss". Keyed off `state` (not the raw timer) so it stays in sync with the exact
      // ticks the dash animation is actually playing, with no off-by-one at the tail end.
      if (target.state === 'dash' || target.state === 'roll') continue;
      const tLeft = target.x, tRight = target.x + target.width;
      const tTop = target.y, tBottom = target.y + target.height;
      const overlap = box.hbLeft < tRight && box.hbRight > tLeft && box.hbTop < tBottom && box.hbBottom > tTop;
      if (overlap) return target; // one target per swing
    }
    return null;
  }

  applyHit(attacker, target, def, cx, cy) {
    const blocking = target.state === 'block' && target.facing === -attacker.facing;
    const hitY = cy;
    const rel = hitY - target.y;
    const zone = rel < target.height * 0.30 ? 'head' : (rel > target.height * 0.68 ? 'legs' : 'body');
    const zoneMult = zone === 'head' ? P.HEAD_DAMAGE_MULT : (zone === 'legs' ? P.LEG_DAMAGE_MULT : P.BODY_DAMAGE_MULT);
    const rawDamage = def.damage * zoneMult;
    const dmg = blocking ? rawDamage * P.BLOCK_CHIP_MULT : rawDamage;
    target.hp = Math.max(0, target.hp - dmg);
    attacker.damageDealt += dmg;
    const kb = blocking ? def.knockback * 0.25 : def.knockback;
    target.vx = attacker.facing * kb;
    target.vy = -kb * 0.35;
    if (!blocking) {
      target.hitstunTimer = def.heavy ? P.HIT_STUN_HEAVY : P.HIT_STUN;
      target.attackType = null;
      // Remember who landed this hit so a resulting ring-out (fall past the death
      // boundary from the knockback) still credits the right player as the KO'er.
      target._lastHitBy = attacker.id;
      target._lastHitAt = this.matchClock;
    }
    if (def.heavy) this.hitStopTimer = C.HITSTOP.HEAVY_MS;

    this.io.to(this.id).emit('hit', {
      attackerId: attacker.id, targetId: target.id, damage: Math.round(dmg),
      blocked: blocking, heavy: !!def.heavy, hitZone: zone, x: cx, y: cy,
    });

    if (target.hp <= 0) this.knockOut(target, attacker);
  }

  knockOut(target, attacker) {
    if (target.eliminated) return;
    target.eliminated = true;
    target.hp = 0;
    target.state = 'dead';
    if (attacker) {
      attacker.kills += 1;
      this.hitStopTimer = Math.max(this.hitStopTimer || 0, C.HITSTOP.HEAVY_MS * 1.6);
    }
    this.io.to(this.id).emit('knockout', { targetId: target.id, attackerId: attacker ? attacker.id : null });
  }

  // ---- serialization for network updates ----
  snapshotLobby() {
    return {
      roomId: this.id,
      hostId: this.hostId,
      status: this.status,
      mode: this.mode,
      mapId: this.mapId,
      botMode: this.botMode,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, ready: p.ready, slot: p.slot, isBot: !!p.isBot,
      })),
    };
  }

  snapshotState() {
    return {
      status: this.status,
      countdown: Math.max(0, Math.ceil(this.countdown || 0)),
      matchClock: this.matchClock,
      roundTimeLimit: C.ROUND.TIME_LIMIT,
      roundNumber: this.roundNumber,
      roundsToWin: C.ROUND.WINS_TO_TAKE_MATCH,
      mapId: this.mapId,
      botMode: this.botMode,
      lastRoundResult: this.status === 'roundEnd' ? this.lastRoundResult : null,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, isBot: !!p.isBot, x: p.x, y: p.y,
        facing: p.facing, state: p.state, hp: Math.max(0, Math.round(p.hp)),
        stamina: Math.round(p.stamina), roundWins: p.roundWins, kills: p.kills,
        damageDealt: Math.round(p.damageDealt), crouching: p.crouching,
        eliminated: p.eliminated, onGround: p.onGround,
        vx: Math.round(p.vx), vy: Math.round(p.vy),
        attackType: p.attackType, attackClock: p.attackClock, rollTimer: p.rollTimer,
      })),
    };
  }

  results() {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, color: p.color, roundWins: p.roundWins, kills: p.kills, damageDealt: Math.round(p.damageDealt) }))
      .sort((a, b) => b.roundWins - a.roundWins || b.kills - a.kills || b.damageDealt - a.damageDealt);
  }
}

module.exports = { Room, Player };

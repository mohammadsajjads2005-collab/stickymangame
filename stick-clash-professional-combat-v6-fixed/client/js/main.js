/* global Network, Input, Renderer, UI, GameConstants */
(function () {
  let myId = null;
  let currentLobby = null;
  let iAmReady = false;

  let prevSnapshot = null; // {t, players:Map}
  let currSnapshot = null;
  let currArrivalTime = 0;
  let matchMapId = GameConstants.MAPS.ROOFTOP;
  let lastStatus = 'lobby';
  let lastRoundState = null; // latest full match:state payload, for HUD/debug

  let debugOn = false;
  let pingMs = null;
  let fps = 0, fpsAccum = 0, fpsFrames = 0, fpsClock = 0;

  const el = (id) => document.getElementById(id);

  function toPlayerMap(list) {
    const m = new Map();
    list.forEach((p) => m.set(p.id, p));
    return m;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------------- Menu wiring ----------------
  function initMenu() {
    el('btn-join-open').addEventListener('click', () => {
      el('join-panel').classList.toggle('hidden');
    });

    el('btn-bot').addEventListener('click', async () => {
      UI.menuError('');
      const name = el('input-name').value.trim();
      const res = await Network.createBotRoom(name);
      if (!res.ok) return UI.menuError(res.error || 'Could not start bot match');
      enterLobby(res.lobby);
      // Solo mode is ready immediately: start the match automatically.
      setTimeout(() => Network.startMatch(), 80);
    });

    el('btn-create').addEventListener('click', async () => {
      UI.menuError('');
      const name = el('input-name').value.trim();
      const res = await Network.createRoom(name);
      if (!res.ok) return UI.menuError(res.error || 'Could not create room');
      enterLobby(res.lobby);
    });

    el('btn-join').addEventListener('click', async () => {
      UI.menuError('');
      const name = el('input-name').value.trim();
      const roomId = el('input-roomid').value.trim().toUpperCase();
      if (!roomId) return UI.menuError('Enter a Room ID');
      const res = await Network.joinRoom(roomId, name);
      if (!res.ok) return UI.menuError(res.error || 'Could not join room');
      enterLobby(res.lobby);
    });

    el('btn-howto').addEventListener('click', () => UI.show('howto'));
    el('btn-howto-back').addEventListener('click', () => UI.show(currentLobby ? 'lobby' : 'menu'));

    el('btn-copy').addEventListener('click', () => {
      if (!currentLobby) return;
      navigator.clipboard && navigator.clipboard.writeText(currentLobby.roomId).catch(() => {});
      const btn = el('btn-copy');
      const old = btn.textContent;
      btn.textContent = 'COPIED!';
      setTimeout(() => { btn.textContent = old; }, 1200);
    });

    el('btn-ready').addEventListener('click', () => {
      iAmReady = !iAmReady;
      Network.setReady(iAmReady);
      UI.setReadyButton(iAmReady);
    });

    el('btn-start').addEventListener('click', () => Network.startMatch());

    el('btn-rematch').addEventListener('click', () => Network.rematch());
    el('btn-lobby').addEventListener('click', () => Network.returnToLobby());

    // Dev-only debug overlay toggle. Off by default; never shown unless pressed.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        debugOn = !debugOn;
        UI.setDebugVisible(debugOn);
      }
    });
  }

  function enterLobby(lobby) {
    currentLobby = lobby;
    iAmReady = false;
    UI.setReadyButton(false);
    UI.renderLobby(lobby, myId);
    UI.show('lobby');
  }

  // ---------------- Network events ----------------
  function initNetwork() {
    Network.connect();
    Network.on('connect', () => { myId = Network.id(); });

    Network.on('lobby:update', (lobby) => {
      currentLobby = lobby;
      if (lobby.status === 'lobby') {
        UI.renderLobby(lobby, myId);
        if (document.getElementById('screen-lobby')) UI.show('lobby');
      }
    });

    Network.on('player:left', () => { /* lobby:update follows right after */ });

    Network.on('match:state', (state) => {
      matchMapId = state.mapId;
      lastRoundState = state;

      if (state.status === 'countdown') {
        if (lastStatus !== 'countdown') {
          UI.show('lobby');
          document.getElementById('screen-lobby').classList.remove('active');
          UI.hideRoundBanner();
        }
        UI.setHudVisible(true);
        Input.setActive(false);
        UI.showCountdown(state.countdown > 0 ? state.countdown : 'FIGHT!');
        // Countdown is presentation-only; fighting state below is authoritative and clears it.
      } else if (state.status === 'fighting') {
        // Always clear the intro overlay when the server enters the fight state.
        // Previously the final 3-2-1/FIGHT overlay could remain on top of the game.
        UI.showCountdown(0);
        if (lastStatus !== 'fighting') {
          UI.setHudVisible(true);
          Input.setActive(true);
          document.getElementById('screen-end').classList.remove('active');
        }
        prevSnapshot = currSnapshot;
        currSnapshot = { players: toPlayerMap(state.players) };
        currArrivalTime = performance.now();
        UI.renderHud(state);
      } else if (state.status === 'roundEnd') {
        UI.showCountdown(0);
        if (lastStatus !== 'roundEnd') {
          Input.setActive(false);
          if (state.lastRoundResult) {
            UI.showRoundBanner(state.lastRoundResult, toPlayerMap(state.players));
          }
        }
      }
      lastStatus = state.status;
    });

    Network.on('match:ended', ({ results, matchWinnerId }) => {
      Input.setActive(false);
      UI.setHudVisible(false);
      UI.hideRoundBanner();
      UI.renderEnd(results, myId, matchWinnerId);
      UI.show('end');
    });

    Network.on('hit', (payload) => {
      const color = getPlayerColor(payload.targetId) || '#ffffff';
      Renderer.spawnHit(payload.x, payload.y, color, !!payload.heavy);
      if (payload.heavy) Renderer.shake(10, 0.18);
      else Renderer.shake(4, 0.1);
    });

    Network.on('knockout', () => {
      Renderer.shake(16, 0.3);
      UI.flash();
    });

    Network.on('debug:pong', (sentAt) => {
      pingMs = Math.round(performance.now() - sentAt);
    });
  }

  function getPlayerColor(id) {
    if (currSnapshot && currSnapshot.players.has(id)) return currSnapshot.players.get(id).color;
    if (currentLobby) {
      const p = currentLobby.players.find((pp) => pp.id === id);
      if (p) return p.color;
    }
    return null;
  }

  // ---------------- Render / input loop ----------------
  function interpolatedPlayers(now) {
    if (!currSnapshot) return [];
    if (!prevSnapshot) return [...currSnapshot.players.values()];
    const tickMs = GameConstants.TICK_MS;
    const t = Math.max(0, Math.min(1.4, (now - currArrivalTime) / tickMs));
    const out = [];
    currSnapshot.players.forEach((cp, id) => {
      const pp = prevSnapshot.players.get(id);
      if (!pp) { out.push(cp); return; }
      out.push({
        ...cp,
        x: lerp(pp.x, cp.x, t),
        y: lerp(pp.y, cp.y, t),
      });
    });
    return out;
  }

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    fpsAccum += dt; fpsFrames += 1;
    if (fpsAccum >= 0.5) { fps = Math.round(fpsFrames / fpsAccum); fpsAccum = 0; fpsFrames = 0; }

    const showable = lastStatus === 'fighting' || lastStatus === 'countdown' || lastStatus === 'roundEnd';
    let players = [];
    if (showable) {
      players = interpolatedPlayers(now);
      Renderer.draw(matchMapId, players, now / 1000, dt, debugOn);
    }

    if (debugOn) renderDebugOverlay(players);

    requestAnimationFrame(frame);
  }

  function renderDebugOverlay(players) {
    const me = players.find((p) => p.id === myId);
    const lines = [`FPS: ${fps}`, `PING: ${pingMs != null ? pingMs + 'ms' : '—'}`];
    if (me) {
      lines.push(
        `STATE: ${me.state.toUpperCase()}`,
        `HP: ${me.hp}`,
        `POS: ${Math.round(me.x)}, ${Math.round(me.y)}`,
        `GROUND: ${me.onGround ? 'TRUE' : 'FALSE'}`,
      );
    }
    UI.renderDebug(lines);
  }

  let inputTimer = null;
  function startInputLoop() {
    if (inputTimer) return;
    inputTimer = setInterval(() => {
      if (lastStatus === 'fighting') Network.sendInput(Input.snapshot());
    }, 1000 / 30);
  }

  let pingTimer = null;
  function startPingLoop() {
    if (pingTimer) return;
    pingTimer = setInterval(() => {
      if (debugOn) Network.sendPing(performance.now());
    }, 1000);
  }

  // ---------------- Boot ----------------
  function boot() {
    Renderer.init();
    Input.init();
    initMenu();
    initNetwork();
    startInputLoop();
    startPingLoop();
    requestAnimationFrame(frame);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

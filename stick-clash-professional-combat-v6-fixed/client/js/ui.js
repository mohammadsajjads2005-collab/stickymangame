const UI = (() => {
  const screens = ['menu', 'howto', 'lobby', 'end'];

  function show(name) {
    screens.forEach((s) => {
      document.getElementById(`screen-${s}`).classList.toggle('active', s === name);
    });
  }

  function menuError(msg) {
    document.getElementById('menu-error').textContent = msg || '';
  }

  function renderLobby(lobby, mySocketId) {
    document.getElementById('lobby-roomid').textContent = lobby.roomId;
    const isHost = lobby.hostId === mySocketId;
    const list = document.getElementById('lobby-players');
    list.innerHTML = '';
    lobby.players.forEach((p) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      li.appendChild(dot);
      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;
      li.appendChild(nameSpan);
      const tag = document.createElement('span');
      if (p.isBot) {
        tag.className = 'tag ready';
        tag.textContent = 'BOT';
      } else if (p.id === lobby.hostId) {
        tag.className = 'tag host';
        tag.textContent = 'HOST';
      } else {
        tag.className = 'tag' + (p.ready ? ' ready' : '');
        tag.textContent = p.ready ? 'READY' : 'WAITING';
      }
      tag.classList.add('tag');
      li.appendChild(tag);
      list.appendChild(li);
    });

    document.getElementById('btn-start').classList.toggle('hidden', !isHost);
    document.getElementById('btn-ready').classList.toggle('hidden', isHost);
    const hint = document.getElementById('lobby-hint');
    hint.textContent = lobby.botMode
      ? 'Solo practice — the Shadow Bot will fight automatically.'
      : isHost
      ? 'You are the host — start whenever your friends are ready.'
      : 'Waiting for host to start…';
  }

  function setReadyButton(ready) {
    const btn = document.getElementById('btn-ready');
    btn.textContent = ready ? 'NOT READY' : 'READY';
    btn.classList.toggle('btn-primary', ready);
  }

  /** n: number for "3,2,1"; pass the string 'FIGHT!' to show the fight banner; 0/undefined hides it. */
  function showCountdown(n) {
    const overlay = document.getElementById('countdown-overlay');
    const num = document.getElementById('countdown-num');
    if (!n) { overlay.classList.add('hidden'); num.classList.remove('fight'); return; }
    overlay.classList.remove('hidden');
    num.textContent = n;
    num.classList.toggle('fight', n === 'FIGHT!');
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
  }

  function setHudVisible(v) {
    document.getElementById('hud').classList.toggle('hidden', !v);
  }

  function renderHud(state) {
    const wrap = document.getElementById('hud-bars');
    wrap.innerHTML = '';
    state.players.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'hud-card';
      const pct = Math.max(0, p.hp);
      const hpColor = pct > 50 ? '#3ddbd9' : pct > 20 ? '#ffc93c' : '#ff4d4d';
      const pips = Array.from({ length: state.roundsToWin }, (_, i) => i < p.roundWins ? '●' : '○').join(' ');
      card.innerHTML = `
        <div class="name-row"><span>${escapeHtml(p.name)}</span><span class="round-pips">${pips}</span></div>
        <div class="hud-bar-track"><div class="hud-bar-fill" style="width:${pct}%;background:${hpColor}"></div></div>
        <div class="hud-stamina-track"><div class="hud-stamina-fill" style="width:${p.stamina}%"></div></div>
      `;
      wrap.appendChild(card);
    });
    const timeLeft = Math.max(0, Math.ceil(state.roundTimeLimit - state.matchClock));
    const m = Math.floor(timeLeft / 60), s = timeLeft % 60;
    document.getElementById('hud-timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
    document.getElementById('hud-map').textContent = `ROUND ${state.roundNumber}`;
  }

  function showRoundBanner(result, playersById) {
    const banner = document.getElementById('round-banner');
    const winner = result.winnerId ? playersById.get(result.winnerId) : null;
    document.getElementById('round-banner-winner').textContent = winner ? `${winner.name.toUpperCase()} WINS ROUND` : 'DRAW';
    const scoreText = result.scores.map((s) => `${s.name} ${s.roundWins}`).join('  —  ');
    document.getElementById('round-banner-score').textContent = scoreText;
    banner.classList.remove('hidden');
  }

  function hideRoundBanner() {
    document.getElementById('round-banner').classList.add('hidden');
  }

  function setDebugVisible(v) {
    document.getElementById('debug-overlay').classList.toggle('hidden', !v);
  }

  function renderDebug(lines) {
    document.getElementById('debug-overlay').textContent = lines.join('\n');
  }

  function renderEnd(results, myId, matchWinnerId) {
    const wrap = document.getElementById('end-rankings');
    wrap.innerHTML = '';
    results.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'end-row';
      row.innerHTML = `
        <span class="place">#${i + 1}</span>
        <span class="dot" style="background:${r.color};width:12px;height:12px;border-radius:50%;display:inline-block;"></span>
        <span>${escapeHtml(r.name)}${r.id === myId ? ' (you)' : ''}</span>
        <span class="stats">${r.roundWins} rounds won · ${r.kills} KOs · ${r.damageDealt} dmg</span>
      `;
      wrap.appendChild(row);
    });
    const winner = results.find((r) => r.id === matchWinnerId) || results[0];
    const score = results.map((r) => r.roundWins).join('–');
    document.getElementById('end-title').textContent = winner ? `${winner.name.toUpperCase()} WINS MATCH  (${score})` : 'MATCH OVER';
  }

  function flash() {
    const el = document.getElementById('fx-flash');
    el.style.transition = 'none';
    el.style.opacity = '0.55';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 180ms ease';
      el.style.opacity = '0';
    });
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { show, menuError, renderLobby, setReadyButton, showCountdown, setHudVisible, renderHud, renderEnd, flash, showRoundBanner, hideRoundBanner, setDebugVisible, renderDebug };
})();

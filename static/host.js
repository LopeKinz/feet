const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const playerCount = document.getElementById('playerCount');
const controllerUrl = document.getElementById('controllerUrl');
const modeSelect = document.getElementById('modeSelect');
controllerUrl.textContent = `${location.origin}/controller?autojoin=1`;

const GRAVITY = 1900;
const SPEED = 280;
const JUMP_VELOCITY = -700;
const CHUNK_WIDTH = 420;
const BASE_FLOOR = canvas.height - 90;

const state = {
  controllers: [],
  entities: new Map(),
  chunks: new Map(),
  cameraX: 0,
  mode: 'race',
  modeTimer: 60,
};

function colorById(id) {
  const palette = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#577590'];
  const n = parseInt(id.slice(0, 2), 16) || 0;
  return palette[n % palette.length];
}

function rand(seed) {
  const x = Math.sin(seed * 1337.77) * 43758.5453;
  return x - Math.floor(x);
}

function createChunk(index) {
  const startX = index * CHUNK_WIDTH;
  const platforms = [];
  for (let i = 0; i < 4; i++) {
    const seed = index * 10 + i;
    const width = 90 + Math.floor(rand(seed + 1) * 120);
    const x = startX + Math.floor(rand(seed + 2) * (CHUNK_WIDTH - width));
    const y = BASE_FLOOR - 60 - Math.floor(rand(seed + 3) * 260);
    platforms.push({ x, y, w: width, h: 14 });
  }

  const coins = [];
  for (let i = 0; i < 3; i++) {
    const seed = index * 13 + i;
    coins.push({
      x: startX + 30 + Math.floor(rand(seed + 4) * (CHUNK_WIDTH - 60)),
      y: BASE_FLOOR - 120 - Math.floor(rand(seed + 5) * 260),
      taken: false,
    });
  }

  return { index, startX, endX: startX + CHUNK_WIDTH, platforms, coins };
}

function ensureWorldAround(cameraX) {
  const centerChunk = Math.floor(cameraX / CHUNK_WIDTH);
  for (let i = centerChunk - 3; i <= centerChunk + 5; i++) {
    if (!state.chunks.has(i)) {
      state.chunks.set(i, createChunk(i));
    }
  }

  for (const idx of [...state.chunks.keys()]) {
    if (idx < centerChunk - 6 || idx > centerChunk + 8) {
      state.chunks.delete(idx);
    }
  }
}

function getPlatformsNear(x) {
  const idx = Math.floor(x / CHUNK_WIDTH);
  const platforms = [{ x: -100000, y: BASE_FLOOR, w: 200000, h: 30 }];
  for (let i = idx - 1; i <= idx + 1; i++) {
    const chunk = state.chunks.get(i);
    if (!chunk) continue;
    platforms.push(...chunk.platforms);
  }
  return platforms;
}

function resetByMode() {
  for (const [, e] of state.entities) {
    e.x = 120;
    e.y = BASE_FLOOR;
    e.vx = 0;
    e.vy = 0;
    e.onGround = true;
    e.progress = 0;
    e.coins = 0;
    e.alive = true;
  }
  state.modeTimer = 60;
  state.chunks.clear();
}

modeSelect.addEventListener('change', () => {
  const mode = modeSelect.value;
  state.mode = mode;
  resetByMode();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'mode_change', mode }));
  }
});

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'join', role: 'host', name: 'Host' }));
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type !== 'state') return;
  state.controllers = msg.controllers;
  state.mode = msg.mode || state.mode;
  modeSelect.value = state.mode;
  playerCount.textContent = String(state.controllers.length);

  for (const c of state.controllers) {
    if (!state.entities.has(c.id)) {
      state.entities.set(c.id, {
        x: 120 + state.entities.size * 36,
        y: BASE_FLOOR,
        vx: 0,
        vy: 0,
        onGround: true,
        color: colorById(c.id),
        name: c.name,
        progress: 0,
        coins: 0,
        alive: true,
      });
    }
  }

  for (const id of [...state.entities.keys()]) {
    if (!state.controllers.find((c) => c.id === id)) {
      state.entities.delete(id);
    }
  }
});

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  const leader = [...state.entities.values()].reduce((m, e) => Math.max(m, e.x), 0);
  state.cameraX = Math.max(0, leader - 240);
  ensureWorldAround(state.cameraX);

  if (state.mode === 'survival') {
    state.modeTimer = Math.max(0, state.modeTimer - dt);
  }

  for (const c of state.controllers) {
    const e = state.entities.get(c.id);
    if (!e || !e.alive) continue;

    e.vx = 0;
    if (c.input.left) e.vx -= SPEED;
    if (c.input.right) e.vx += SPEED;

    if (c.input.jump && e.onGround) {
      e.vy = JUMP_VELOCITY;
      e.onGround = false;
    }

    e.vy += GRAVITY * dt;
    e.x += e.vx * dt;
    const oldY = e.y;
    e.y += e.vy * dt;

    e.onGround = false;
    const platforms = getPlatformsNear(e.x);
    for (const p of platforms) {
      const withinX = e.x + 28 > p.x && e.x < p.x + p.w;
      const crossingDown = oldY <= p.y && e.y >= p.y;
      if (withinX && crossingDown && e.vy >= 0) {
        e.y = p.y;
        e.vy = 0;
        e.onGround = true;
      }
    }

    if (state.mode === 'coin_rush') {
      const idx = Math.floor(e.x / CHUNK_WIDTH);
      for (let i = idx - 1; i <= idx + 1; i++) {
        const chunk = state.chunks.get(i);
        if (!chunk) continue;
        for (const coin of chunk.coins) {
          if (coin.taken) continue;
          const dx = e.x - coin.x;
          const dy = (e.y - 24) - coin.y;
          if (dx * dx + dy * dy < 22 * 22) {
            coin.taken = true;
            e.coins += 1;
          }
        }
      }
    }

    if (state.mode === 'survival' && e.y > canvas.height + 100) {
      e.alive = false;
    }

    e.progress = Math.max(e.progress, e.x);
  }

  draw();
  requestAnimationFrame(tick);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-state.cameraX, 0);

  for (const [, chunk] of state.chunks) {
    for (const p of chunk.platforms) {
      ctx.fillStyle = '#6b4f2a';
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }

    if (state.mode === 'coin_rush') {
      for (const coin of chunk.coins) {
        if (coin.taken) continue;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  for (const [, e] of state.entities) {
    if (!e.alive) continue;
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x, e.y - 50, 32, 50);

    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(e.name, e.x - 6, e.y - 58);
  }

  ctx.restore();

  drawModeHud();
}

function drawModeHud() {
  const entities = [...state.entities.values()];
  let status = '';

  if (state.mode === 'race') {
    const leader = entities.reduce((m, e) => Math.max(m, e.progress || 0), 0);
    status = `Race: Leader bei ${Math.floor(leader)}m`;
  } else if (state.mode === 'coin_rush') {
    const leaderCoins = entities.reduce((m, e) => Math.max(m, e.coins || 0), 0);
    status = `Coin Rush: Beste Coins ${leaderCoins}`;
  } else {
    const alive = entities.filter((e) => e.alive).length;
    status = `Survival: ${alive} alive | ${Math.ceil(state.modeTimer)}s`;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(12, 12, 360, 34);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText(status, 20, 34);
}

requestAnimationFrame(tick);

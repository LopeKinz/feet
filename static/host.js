const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const playerCount = document.getElementById('playerCount');
const controllerUrl = document.getElementById('controllerUrl');
const modeSelect = document.getElementById('modeSelect');
const connStatus = document.getElementById('connStatus');
controllerUrl.textContent = `${location.origin}/controller?autojoin=1`;

let ws = null;
let reconnectAttempts = 0;
let reconnectTimer = null;

let viewWidth = Math.floor(canvas.getBoundingClientRect().width || 1280);
let viewHeight = Math.floor(canvas.getBoundingClientRect().height || 720);

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;
  viewWidth = Math.floor(rect.width);
  viewHeight = Math.floor(rect.height);

  const pixelWidth = Math.max(1, Math.floor(viewWidth * dpr));
  const pixelHeight = Math.max(1, Math.floor(viewHeight * dpr));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function floorY() {
  return viewHeight - 90;
}

const GRAVITY = 1900;
const SPEED = 280;
const JUMP_VELOCITY = -700;
const CHUNK_WIDTH = 460;

const state = {
  controllers: [],
  entities: new Map(),
  chunks: new Map(),
  cameraX: 0,
  mode: 'race',
  modeTimer: 60,
  time: 0,
};

function setConnStatus(text, color = '#eee') {
  connStatus.textContent = text;
  connStatus.style.color = color;
}

function connectWs() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  setConnStatus('Verbinde…', '#ddd');
  modeSelect.disabled = true;

  ws.addEventListener('open', () => {
    reconnectAttempts = 0;
    setConnStatus('Online', '#9be58c');
    modeSelect.disabled = false;
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
          x: 120 + state.entities.size * 40,
          y: floorY(),
          vx: 0,
          vy: 0,
          onGround: true,
          color: colorById(c.id),
          name: c.name,
          progress: 0,
          coins: 0,
          alive: true,
          facing: 1,
        });
      }
    }

    for (const id of [...state.entities.keys()]) {
      if (!state.controllers.find((c) => c.id === id)) {
        state.entities.delete(id);
      }
    }
  });

  const onDisconnect = () => {
    modeSelect.disabled = true;
    setConnStatus('Offline – Reconnect…', '#ffcc66');
    if (reconnectTimer) return;
    const delay = Math.min(5000, 700 * (reconnectAttempts + 1));
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWs();
    }, delay);
  };

  ws.addEventListener('close', onDisconnect);
  ws.addEventListener('error', onDisconnect);
}

function colorById(id) {
  const palette = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#577590'];
  const n = parseInt(id.slice(0, 2), 16) || 0;
  return palette[n % palette.length];
}

function rand(seed) {
  const x = Math.sin(seed * 1337.77) * 43758.5453;
  return x - Math.floor(x);
}

function biomeByChunk(index) {
  const biomes = ['grass', 'desert', 'ice'];
  const n = Math.floor(Math.abs(index) / 4) % biomes.length;
  return biomes[n];
}

function colorsForBiome(biome) {
  if (biome === 'desert') return { ground: '#8d6e40', top: '#c39a5f' };
  if (biome === 'ice') return { ground: '#8db6d9', top: '#d0ebff' };
  return { ground: '#5b3f1f', top: '#7fba67' };
}

function createChunk(index) {
  const startX = index * CHUNK_WIDTH;
  const biome = biomeByChunk(index);
  const platforms = [];

  const baseY = floorY() - 45 - Math.floor(rand(index + 2) * 120);
  let xCursor = startX + 8;

  for (let i = 0; i < 5; i++) {
    const seed = index * 20 + i;
    const width = 90 + Math.floor(rand(seed + 1) * 140);
    const gap = 35 + Math.floor(rand(seed + 2) * 55);
    const wave = Math.sin((index * 5 + i) * 0.8) * 36;
    const y = baseY + wave + Math.floor(rand(seed + 3) * 90);
    platforms.push({ x: xCursor, y, w: width, h: 14, biome });
    xCursor += width + gap;
  }

  const bonusPlatformY = floorY() - 240 - Math.floor(rand(index * 11 + 8) * 120);
  platforms.push({
    x: startX + 50 + Math.floor(rand(index * 17 + 2) * (CHUNK_WIDTH - 130)),
    y: bonusPlatformY,
    w: 80,
    h: 14,
    biome,
  });

  const coins = [];
  for (let i = 0; i < 4; i++) {
    const seed = index * 13 + i;
    coins.push({
      x: startX + 25 + Math.floor(rand(seed + 4) * (CHUNK_WIDTH - 50)),
      y: floorY() - 120 - Math.floor(rand(seed + 5) * 250),
      taken: false,
    });
  }

  return { index, startX, endX: startX + CHUNK_WIDTH, platforms, coins, biome };
}

function ensureWorldAround(cameraX) {
  const centerChunk = Math.floor(cameraX / CHUNK_WIDTH);
  for (let i = centerChunk - 3; i <= centerChunk + 6; i++) {
    if (!state.chunks.has(i)) {
      state.chunks.set(i, createChunk(i));
    }
  }

  for (const idx of [...state.chunks.keys()]) {
    if (idx < centerChunk - 7 || idx > centerChunk + 9) {
      state.chunks.delete(idx);
    }
  }
}

function getPlatformsNear(x) {
  const idx = Math.floor(x / CHUNK_WIDTH);
  const platforms = [{ x: -100000, y: floorY(), w: 200000, h: 35, biome: 'grass' }];
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
    e.y = floorY();
    e.vx = 0;
    e.vy = 0;
    e.onGround = true;
    e.progress = 0;
    e.coins = 0;
    e.alive = true;
    e.facing = 1;
  }
  state.modeTimer = 60;
  state.chunks.clear();
}

modeSelect.addEventListener('change', () => {
  const mode = modeSelect.value;
  state.mode = mode;
  resetByMode();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'mode_change', mode }));
  }
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
connectWs();

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  state.time += dt;

  const leader = [...state.entities.values()].reduce((m, e) => Math.max(m, e.x), 0);
  state.cameraX = Math.max(0, leader - viewWidth * 0.25);
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
    if (e.vx !== 0) e.facing = e.vx > 0 ? 1 : -1;

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

    if (state.mode === 'survival' && e.y > viewHeight + 100) {
      e.alive = false;
    }

    e.progress = Math.max(e.progress, e.x);
  }

  draw();
  requestAnimationFrame(tick);
}

function drawBackground() {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, viewHeight);
  skyGrad.addColorStop(0, '#214478');
  skyGrad.addColorStop(1, '#82b8ff');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  const hillOffset = (state.cameraX * 0.2) % 600;
  ctx.fillStyle = 'rgba(50, 90, 70, 0.35)';
  for (let i = -1; i < 4; i++) {
    const x = i * 600 - hillOffset;
    ctx.beginPath();
    ctx.moveTo(x, viewHeight);
    ctx.quadraticCurveTo(x + 200, viewHeight - 170, x + 420, viewHeight);
    ctx.closePath();
    ctx.fill();
  }
}

function draw() {
  drawBackground();

  ctx.save();
  ctx.translate(-state.cameraX, 0);

  for (const [, chunk] of state.chunks) {
    for (const p of chunk.platforms) {
      const c = colorsForBiome(p.biome);
      ctx.fillStyle = c.ground;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = c.top;
      ctx.fillRect(p.x, p.y - 4, p.w, 4);
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
    drawPlayer(e);
  }

  ctx.restore();
  drawModeHud();
}

function drawPlayer(e) {
  const walk = Math.sin(state.time * 12 + e.x * 0.04) * 3;
  const x = e.x;
  const y = e.y;

  ctx.fillStyle = e.color;
  ctx.fillRect(x + 4, y - 40, 24, 28); // torso

  ctx.fillStyle = '#ffd7b5';
  ctx.beginPath();
  ctx.arc(x + 16, y - 49, 10, 0, Math.PI * 2); // head
  ctx.fill();

  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(x + 12 + e.facing * 2, y - 52, 2, 2); // eye

  ctx.strokeStyle = e.color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 12, y - 12);
  ctx.lineTo(x + 10, y + walk);
  ctx.moveTo(x + 20, y - 12);
  ctx.lineTo(x + 22, y - walk);
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = '14px sans-serif';
  ctx.fillText(e.name, x - 6, y - 60);
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
  ctx.fillRect(12, 12, 370, 34);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText(status, 20, 34);
}

requestAnimationFrame(tick);

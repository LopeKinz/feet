const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const playerCount = document.getElementById('playerCount');
const controllerUrl = document.getElementById('controllerUrl');
controllerUrl.textContent = `${location.origin}/controller`;

const GRAVITY = 1900;
const SPEED = 280;
const JUMP_VELOCITY = -700;
const FLOOR_Y = canvas.height - 80;

const state = {
  controllers: [],
  entities: new Map(),
};

function colorById(id) {
  const palette = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#577590'];
  const n = parseInt(id.slice(0, 2), 16) || 0;
  return palette[n % palette.length];
}

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'join', role: 'host', name: 'Host' }));
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type !== 'state') return;
  state.controllers = msg.controllers;
  playerCount.textContent = String(state.controllers.length);

  for (const c of state.controllers) {
    if (!state.entities.has(c.id)) {
      state.entities.set(c.id, {
        x: 140 + state.entities.size * 70,
        y: FLOOR_Y,
        vx: 0,
        vy: 0,
        onGround: true,
        color: colorById(c.id),
        name: c.name,
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

  for (const c of state.controllers) {
    const e = state.entities.get(c.id);
    if (!e) continue;

    e.vx = 0;
    if (c.input.left) e.vx -= SPEED;
    if (c.input.right) e.vx += SPEED;

    if (c.input.jump && e.onGround) {
      e.vy = JUMP_VELOCITY;
      e.onGround = false;
    }

    e.vy += GRAVITY * dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    if (e.y > FLOOR_Y) {
      e.y = FLOOR_Y;
      e.vy = 0;
      e.onGround = true;
    }

    e.x = Math.max(20, Math.min(canvas.width - 40, e.x));
  }

  draw();
  requestAnimationFrame(tick);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#2f6f38';
  ctx.fillRect(0, FLOOR_Y + 40, canvas.width, canvas.height - FLOOR_Y - 40);

  ctx.fillStyle = '#6b4f2a';
  ctx.fillRect(0, FLOOR_Y + 30, canvas.width, 10);

  for (const [, e] of state.entities) {
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x, e.y - 50, 32, 50);

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x, e.y + 2, 32, 4);

    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(e.name, e.x - 6, e.y - 58);
  }
}

requestAnimationFrame(tick);

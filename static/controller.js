const statusEl = document.getElementById('status');
const joinBtn = document.getElementById('join');
const leftBtn = document.getElementById('left');
const rightBtn = document.getElementById('right');
const jumpBtn = document.getElementById('jump');

const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);

const input = {
  left: false,
  right: false,
  jump: false,
};

function sendInput() {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'input', input }));
}

function hold(button, key) {
  const onDown = (e) => {
    e.preventDefault();
    input[key] = true;
    sendInput();
  };
  const onUp = (e) => {
    e.preventDefault();
    input[key] = false;
    sendInput();
  };
  button.addEventListener('touchstart', onDown, { passive: false });
  button.addEventListener('touchend', onUp, { passive: false });
  button.addEventListener('touchcancel', onUp, { passive: false });
  button.addEventListener('mousedown', onDown);
  button.addEventListener('mouseup', onUp);
  button.addEventListener('mouseleave', onUp);
}

ws.addEventListener('open', () => {
  statusEl.textContent = 'Verbunden. Drücke "Beitreten".';
});

ws.addEventListener('close', () => {
  statusEl.textContent = 'Verbindung getrennt.';
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'joined') {
    statusEl.textContent = `Beigetreten als ${msg.name}`;
    joinBtn.disabled = true;
  } else if (msg.type === 'error') {
    statusEl.textContent = `Fehler: ${msg.message}`;
  }
});

joinBtn.addEventListener('click', () => {
  if (ws.readyState !== WebSocket.OPEN) {
    statusEl.textContent = 'Noch keine Verbindung zum Host.';
    return;
  }
  const name = `Player-${Math.floor(Math.random() * 900 + 100)}`;
  ws.send(JSON.stringify({ type: 'join', role: 'controller', name }));
});

hold(leftBtn, 'left');
hold(rightBtn, 'right');
hold(jumpBtn, 'jump');

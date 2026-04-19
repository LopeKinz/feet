const statusEl = document.getElementById('status');
const joinBtn = document.getElementById('join');
const leftBtn = document.getElementById('left');
const rightBtn = document.getElementById('right');
const jumpBtn = document.getElementById('jump');

const autoJoin = new URLSearchParams(window.location.search).get('autojoin') === '1';

let ws = null;
let joined = false;
let reconnectAttempts = 0;
let reconnectTimer = null;

const input = {
  left: false,
  right: false,
  jump: false,
};

function controlsEnabled(enabled) {
  leftBtn.disabled = !enabled;
  rightBtn.disabled = !enabled;
  jumpBtn.disabled = !enabled;
  joinBtn.disabled = joined || !enabled;
}

function sendInput() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !joined) return;
  ws.send(JSON.stringify({ type: 'input', input }));
}

function joinAsController() {
  if (!ws || ws.readyState !== WebSocket.OPEN || joined) return;
  const name = `Player-${Math.floor(Math.random() * 900 + 100)}`;
  ws.send(JSON.stringify({ type: 'join', role: 'controller', name }));
}

function hold(button, key) {
  const onDown = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    input[key] = true;
    sendInput();
  };

  const onUp = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    input[key] = false;
    sendInput();
  };

  if (window.PointerEvent) {
    button.addEventListener('pointerdown', onDown);
    button.addEventListener('pointerup', onUp);
    button.addEventListener('pointercancel', onUp);
    button.addEventListener('pointerleave', onUp);
  } else {
    let usingTouch = false;

    const touchDown = (e) => {
      usingTouch = true;
      onDown(e);
    };

    const touchUp = (e) => {
      usingTouch = true;
      onUp(e);
    };

    const mouseDown = (e) => {
      if (usingTouch) return;
      onDown(e);
    };

    const mouseUp = (e) => {
      if (usingTouch) return;
      onUp(e);
    };

    button.addEventListener('touchstart', touchDown, { passive: false });
    button.addEventListener('touchend', touchUp, { passive: false });
    button.addEventListener('touchcancel', touchUp, { passive: false });

    button.addEventListener('mousedown', mouseDown);
    button.addEventListener('mouseup', mouseUp);
    button.addEventListener('mouseleave', mouseUp);
  }
}

function connectWs() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  controlsEnabled(false);
  statusEl.textContent = 'Verbinde…';

  ws.addEventListener('open', () => {
    reconnectAttempts = 0;
    statusEl.textContent = autoJoin ? 'Verbunden. Auto-Join läuft…' : 'Verbunden. Drücke "Beitreten".';
    controlsEnabled(true);
    if (autoJoin && !joined) {
      joinAsController();
    }
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'joined') {
      joined = true;
      statusEl.textContent = `Beigetreten als ${msg.name}`;
      controlsEnabled(true);
    } else if (msg.type === 'error') {
      statusEl.textContent = `Fehler: ${msg.message}`;
    }
  });

  const onDisconnect = () => {
    controlsEnabled(false);
    joined = false;
    statusEl.textContent = 'Verbindung getrennt – erneuter Versuch…';

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



document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

document.addEventListener('selectstart', (e) => {
  e.preventDefault();
});

joinBtn.addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    statusEl.textContent = 'Noch keine Verbindung zum Host.';
    return;
  }
  joinAsController();
});

hold(leftBtn, 'left');
hold(rightBtn, 'right');
hold(jumpBtn, 'jump');
controlsEnabled(false);
connectWs();

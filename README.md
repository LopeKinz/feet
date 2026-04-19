# Local-Coop Platformer (Python)

Ein lokaler Coop-Platformer, bei dem ein Laptop das Spiel hostet und Smartphones als Controller dienen – ohne App-Download.

## Features
- Python-Backend (`aiohttp`) für Lobby, Controller-Verwaltung und WebSocket-Kommunikation
- Host-Ansicht (`/`) rendert Platformer im Browser (Canvas)
- Smartphone-Controller (`/controller`) mit Touch-Buttons
- QR-Code in der Host-Ecke für direkten Controller-Join (`autojoin=1`)
- Unendlich generierende Welt (Chunk-basiert) mit Biomen und zusammenhängender Hauptroute (weniger Zufallschaos)
- Mehrere Spielmodi: `Race`, `Coin Rush`, `Survival`
- Verbesserte Figuren-Darstellung (Kopf/Körper/Animation) statt einfacher Blöcke
- Controller verhindert Long-Press-Textauswahl/Kontextmenü auf Smartphones
- Robustere Verbindung per einfachem WebSocket-Reconnect (Host + Controller)
- Input-Updates werden serverseitig gezielt an den Host gesendet (weniger Broadcast-Overhead)

## Voraussetzungen
- Python 3.10+

## Installation
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Start
```bash
python server.py --host 0.0.0.0 --port 8000
```

Dann:
- Host-Ansicht auf dem Laptop öffnen: `http://<laptop-ip>:8000/`
- Auf Smartphones: `http://<laptop-ip>:8000/controller`
- Oder direkt QR auf dem Host-Bildschirm scannen

## Netzwerk-Hinweis
Alle Geräte müssen im selben Netzwerk sein (Laptop-Hotspot oder gleiches WLAN).

## Architektur
- `server.py`: Webserver + WebSocket-Hub + Spielmodus + QR-Endpoint
- `static/host.js`: Rendering, Game-Loop, Weltgenerierung, Spielmodi
- `static/controller.js`: Touch-/Pointer-Eingaben, Autojoin-Flow, Reconnect
- `templates/*.html`: Host- und Controller-Oberfläche

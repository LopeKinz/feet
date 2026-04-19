import argparse
import json
import secrets
from dataclasses import dataclass, field
from typing import Dict, Optional

from aiohttp import WSMsgType, web


@dataclass
class PlayerInput:
    left: bool = False
    right: bool = False
    jump: bool = False


@dataclass
class Player:
    id: str
    name: str
    role: str
    ws: web.WebSocketResponse
    input: PlayerInput = field(default_factory=PlayerInput)


class GameHub:
    def __init__(self) -> None:
        self.players: Dict[str, Player] = {}
        self.host_id: Optional[str] = None

    async def broadcast(self, message: dict) -> None:
        dead = []
        for pid, player in self.players.items():
            if player.ws.closed:
                dead.append(pid)
                continue
            await player.ws.send_str(json.dumps(message))
        for pid in dead:
            self.remove_player(pid)

    def remove_player(self, player_id: str) -> None:
        player = self.players.pop(player_id, None)
        if not player:
            return
        if player.role == "host" and self.host_id == player_id:
            self.host_id = None

    def snapshot(self) -> dict:
        controllers = [
            {
                "id": p.id,
                "name": p.name,
                "input": {
                    "left": p.input.left,
                    "right": p.input.right,
                    "jump": p.input.jump,
                },
            }
            for p in self.players.values()
            if p.role == "controller"
        ]
        return {"type": "state", "controllers": controllers}


hub = GameHub()


async def index(request: web.Request) -> web.Response:
    return web.FileResponse("templates/host.html")


async def controller(request: web.Request) -> web.Response:
    return web.FileResponse("templates/controller.html")


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(heartbeat=15)
    await ws.prepare(request)

    player_id = secrets.token_hex(4)
    role = "controller"
    name = "Player"

    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                data = json.loads(msg.data)
                event = data.get("type")

                if event == "join":
                    requested_role = data.get("role", "controller")
                    if requested_role == "host":
                        if hub.host_id is not None:
                            await ws.send_str(json.dumps({"type": "error", "message": "Host already connected."}))
                            continue
                        role = "host"
                        hub.host_id = player_id
                    else:
                        role = "controller"

                    name = data.get("name") or ("Host" if role == "host" else f"Player-{player_id[:3]}")
                    hub.players[player_id] = Player(id=player_id, name=name, role=role, ws=ws)
                    await ws.send_str(json.dumps({"type": "joined", "id": player_id, "role": role, "name": name}))
                    await hub.broadcast(hub.snapshot())

                elif event == "input":
                    player = hub.players.get(player_id)
                    if not player or player.role != "controller":
                        continue
                    inp = data.get("input", {})
                    player.input.left = bool(inp.get("left", False))
                    player.input.right = bool(inp.get("right", False))
                    player.input.jump = bool(inp.get("jump", False))
                    await hub.broadcast(hub.snapshot())

                elif event == "ping":
                    await ws.send_str(json.dumps({"type": "pong"}))

            elif msg.type == WSMsgType.ERROR:
                break

    finally:
        hub.remove_player(player_id)
        await hub.broadcast(hub.snapshot())

    return ws


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/controller", controller)
    app.router.add_get("/ws", websocket_handler)
    app.router.add_static("/static", "static")
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local coop platformer hub")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    web.run_app(create_app(), host=args.host, port=args.port)

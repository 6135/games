# games

Unified repository for my serverless multiplayer games. One lobby, one room core, one game module per game.
React on GitHub Pages, all state over a public MQTT broker, every payload sealed with AES-GCM from the room
key. No backend, no database.

Live: https://6135.github.io/games/

| Game | Rules |
|------|-------|
| **Forca** | A round master types a secret word on their own device. The others guess letter by letter. Shared life pool. The word never leaves the master device before the reveal. |
| **Galo** | Tic-tac-toe for 2 to 12 players. One symbol per seat, the grid is `(players + 1)²`, the host sets the win length. The host can add bots (MCTS AI, three levels), alone or next to people. |
| **Pontos e Quadrados** | Dots and boxes for 2 to 8 players. Draw a line; close a box to keep it and play again. The board grows with the players (or the host sets 3×3 to 10×10). Bots: take a box, else a safe line, else give away the shortest chain. |
| **Batalha Naval** | Battleship, all against all, 2 to 6 players. 10×10 sea, fleet 5-4-3-3-2, ships never touch. Each fleet stays on its owner's device and the owner's device answers the shots. Before the first shot every player publishes a SHA-256 of fleet + salt; at the end every fleet is revealed and checked against every answer, so a lie shows in the history and a cheating winner scores nothing. Bots: hunt on a checkerboard, then follow the hits. |

## Run it

```bash
npm install
npm run dev        # http://localhost:5173/games/
npm run broker     # optional local broker on ws://127.0.0.1:1884
npm test
npm run typecheck
npm run build
npm run e2e        # every game end to end, local broker (set CHROMIUM_PATH if needed)
npm run sniff -- <forca|galo|pontos|naval> "<room name>" "<room key>" [broker url]
```

A push to `main` builds and publishes `dist` to the `gh-pages` branch (`.github/workflows/main.yml`).

## Layout

| Path | Holds |
|------|-------|
| `src/core/net/` | Room identifier, PBKDF2 and AES-GCM, the envelope guard, MQTT, the open room list. |
| `src/core/` | Session (create, join, leave, routing), store, host base class, shared room rules, turn rotation, the game module contract. |
| `src/core/ui/` | Room shell, player list, host panel, banner, sound. |
| `src/core/boardRoom.ts` | The room rules of a game where the host runs the round (pontos, naval): start, rounds, score, history. |
| `src/games/<game>/` | One game: its rules, its host, its client, its screen. `src/games/index.ts` lists the games. |
| `src/screens/Lobby.tsx` | The one lobby: pick a game, create or join, the open room list of every game. |
| `docs/forca-architecture.md` | The original protocol design. The core still follows it. |

## How a game plugs in

- The core routes `room`, `roster`, `join` and `presence`. Every other topic goes to the game.
- A game gives a **host** (extends `HostCore`: start, next round, restart, void, and its round topics), a
  **client** (runs on every device: forca's round master lives here, galo sends its moves from here) and a
  **room screen** built on `RoomShell`.
- Each game keeps its own protocol prefix (`forca/v1`, `galo/v1`). The prefix enters the room identifier and
  the key derivation, so the same room name and key in two games are two different rooms.
- A room link carries the game and the name, never the key: `#/?game=galo&room=<name>`.

## Old addresses

`6135.github.io/forca-multiplayer/` and `6135.github.io/galo-multiplayer/` redirect here, room link included.

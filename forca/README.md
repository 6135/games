# Forca Multiplayer

A serverless multiplayer hangman ("forca") game. React on GitHub Pages, all
state exchanged over a public MQTT broker. No backend, no database.

- One player hosts a room with a name and a key. Others join with the same pair.
- The host builds a frozen random turn order when the game starts.
- Each round the next player in that order becomes the round master. They type a
  secret word and a category on their own device.
- The category is published. The word is not. Players see empty slots only.
- The round master types each guess that a player speaks, evaluates it locally
  and publishes the revealed slots.
- Lives are a shared pool. A miss costs one life.
- The player who completes the word scores a point. The room shows a ranking.

Read [architecture.md](architecture.md) before you write any code. It defines the
topic map, the encryption envelope, the state shapes and the failure modes.

## Run it

```bash
npm install
npm run dev        # the application on http://localhost:5173
npm run broker     # optional: a local MQTT broker on ws://127.0.0.1:1884
```

The lobby holds a broker field. It defaults to the public HiveMQ endpoint. Put
the local broker URL there when you develop offline.

```bash
npm test           # unit tests: the reducers, the words, the order, the envelope
npm run typecheck
npm run build
npm run e2e        # three browsers, two rounds, one local broker
```

To read the traffic of a live room in clear text:

```bash
npm run sniff -- "<room name>" "<room key>" [broker url]
```

A generic MQTT client cannot show these payloads. They are AES-GCM binary, so
a client that reads a payload as UTF-8 drops the message without a word.

`npm run e2e` needs a Chromium build. Set `CHROMIUM_PATH` when Playwright cannot
find one.

## Layout

| Path | Holds |
|------|-------|
| `src/net/` | Room identifier, PBKDF2 and AES-GCM, the envelope guard, MQTT. |
| `src/game/` | Pure reducers, word folding, the frozen order. No network import. |
| `src/roles/host/` | Room state, the score, the frozen order, the lifecycle. |
| `src/roles/master/` | The word, the guess entry, the round state. |
| `src/screens/`, `src/ui/` | The lobby, the room and the board. |

`roundReducer` takes the word as a parameter and never writes it into
`RoundState`, so the publisher cannot leak it.

## Where the code refines the architecture

| Item | Decision |
|------|----------|
| `room` and `roster` | Section 4.4 splits them, section 6.1 shows one type. `room` carries the lifecycle only. `roster` carries the state of section 6.1. |
| Client and player identifiers | `src` is a client identifier, `order` and `masterId` hold player identifiers. `RoomState` gained `hostPlayerId`, and a `round` message is checked against `roster.masterId` and `roundNumber`. |
| Last Will envelope | The broker holds it from connect time, so its `seq` and `ts` are stale on arrival. A payload marked `lwt` skips both checks and does not move the stored sequence number. |
| Sequence numbers | Tracked per topic **and** per publisher. Every player writes `join`, and each round master restarts its counter on `round` and `round/end`. |
| Carried lives | `lastRound.livesRemaining` passes the pool to the next master when `livesResetEachRound` is false. |
| Round end | A win closes the round at once. A loss waits for the master, so the manual life control can still correct a mistyped guess. |
| Extra config | `config.onePassLimit` ends the game after one round per player. |
| Restart | The host puts the room back in the lobby in place. The people stay, the scores go to zero and the order is drawn again. |
| Round history | `RoomState.history` holds the last 50 finished rounds, so the history screen needs no new topic. |
| Open room list | `forca/v1/directory/<roomId>`, retained and in **clear text**, because a lobby holds no room key. It is opt in per room and it publishes the room name only. The key still gates the room and still derives the cipher key, so the traffic stays unreadable. The cost is real: the room name becomes public and tied to its topic. The host repeats the entry every 30 s and a lobby drops an entry after 90 s, because one Last Will is already spent on `room` and a crashed host cannot clear the list. |

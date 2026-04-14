# Aura Off

Aura Off is a Phaser browser game with:
- single-player mode (existing gameplay loop)
- minimal private-room multiplayer mode (`2-4` players)

## Multiplayer Scope
Implemented intentionally small:
- private room code / invite link
- one short round mode
- instant rematch flow
- no public lobbies, matchmaking, persistence, progression, cosmetics, or accounts

Polish additions:
- server-authored `lastEvents` feed (bounded recent break/release/cascade moments)
- reactive crowd NPC pressure actors (non-enemy behavior)
- client interpolation/prediction smoothing with soft reconciliation

## Authoritative Boundaries
Server-authoritative:
- room membership and host
- round phase and timer
- player movement resolution
- charge state, aura, pressure, break/release decisions
- winner calculation (highest aura at timer end or last unbroken player)

Client-authoritative:
- input capture only
- presentation (rendering, camera feel, labels, local UX polish)
- local UI state for hints/errors

Shared typed contracts:
- `src/shared/protocol.ts`

## Local Development

### 1. Install
```bash
npm install
```

### 2. Run multiplayer server
```bash
npm run dev:server
```
Default server: `ws://localhost:8787`

Optional dev net diagnostics from server snapshots:
```bash
NET_DEBUG=1 npm run dev:server
```

### 3. Run browser client
```bash
npm run dev
```
Default client: `http://localhost:5173`

### 4. Play single-player
Open:
```text
http://localhost:5173
```

### 5. Play multiplayer
Host opens:
```text
http://localhost:5173/?mode=mp
```
You will get an in-game join prompt for name and optional room code.

Optional URL prefills are still supported:
```text
http://localhost:5173/?mode=mp&name=Host&ws=ws://localhost:8787
```

After connect, the room code and invite URL appear in the HUD.

Friend joins with:
```text
http://localhost:5173/?mode=mp&room=ABCD&name=Friend&ws=ws://localhost:8787
```

Note: joining is blocked while a round is live; join in lobby/result for fairness.

## Multiplayer Controls
- `WASD` or arrow keys: move
- `SPACE` hold: charge
- `SPACE` release: release action
- `ENTER`: host starts round
- `R`: toggle rematch ready in result phase

## Railway Deployment (Multiplayer Server)
This repo includes:
- `railway.json`
- `Procfile`

### Steps
1. Push this repo to GitHub.
2. In Railway, create a new project from the repo.
3. Set service root to repository root.
4. Railway start command uses:
   - `npm run start:server`
5. Set environment variable:
   - `CLIENT_ORIGIN=https://<your-client-domain>`
6. Deploy and note the generated backend URL.
7. Use that backend URL from the client via query param:
   - `?ws=wss://<your-railway-backend-domain>`

### Notes
- Server listens on Railway `PORT` automatically.
- Health check endpoint is `GET /`.

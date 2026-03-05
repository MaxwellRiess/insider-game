# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Server (with auto-reload)
cd server && npm run dev

# Client
cd client && npm run dev
```

### Production build (used by Render)
```bash
npm run build   # builds client dist, installs server deps
npm start       # runs server from root
```

### Lint
```bash
cd client && npm run lint
```

There are no automated tests.

## Architecture

This is a real-time multiplayer social deduction game ("Insider") with a monorepo structure:

- **`server/`** - Node.js/Express + Socket.io backend (CommonJS modules)
- **`client/`** - React + Vite SPA (ES modules)

In production the server serves the built client from `client/dist/` as static files — a single-origin deployment. In development, the client runs on Vite's dev server (default port 5173) and connects to the server on port 3001.

### Server

All game logic lives in `server/gameManager.js` (`GameManager` class). Rooms are stored in a `Map` keyed by 4-letter room code. Room state machine:

```
LOBBY -> ROLE_REVEAL -> QUIZ -> VOTING -> RESULT
                                       -> GAME_OVER (timer expired without correct answer)
```

`server/index.js` is the Socket.io entry point — it wires socket events to `GameManager` methods and handles the disconnect/reconnect lifecycle.

Key game mechanics:
- **Roles**: MASTER (knows the word, answers yes/no), INSIDER (knows the word, pretends not to), COMMON (doesn't know the word)
- **Disconnect grace**: Players get a 5-minute reconnect window before being evicted
- **Session resume**: Players reconnect using a `sessionToken` stored in `localStorage` via `resumeSession` socket event
- **Voting**: Uses remaining quiz time; ends early if all players vote; tie = Insider wins

`getSanitizedRoom()` strips sensitive server fields (socket IDs, session tokens, disconnect timers) before broadcasting `roomUpdate` events. The roles map (`room.roles`) **is included** in the broadcast — client-side each player sees everyone's role (the RoleReveal component is responsible for revealing/hiding appropriately).

### Client

`client/src/socket.js` exports a singleton `socket` instance. In dev it connects to `http://localhost:3001`; in prod it connects to the same origin (undefined URL).

`client/src/session.js` manages `localStorage` session persistence (`digital-insider.session` key).

`App.jsx` owns all top-level state (`room`, `savedSession`, connection status) and renders the correct phase component based on `room.state`. Socket event listeners (`roomUpdate`, `roomClosed`, `connect`, `disconnect`) are registered once in `App.jsx`. Phase components:

- `Lobby` — join/create room
- `RoleReveal` — shows each player their role; Master begins the round
- Quiz phase — `GameTimer`, `MasterControls` (Master only), `PlayerLog`
- `VotingScreen` — players vote for who they think is the Insider
- `ResultsScreen` — shows outcome and vote tallies

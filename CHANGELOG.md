# Changelog

## 2026-02-16

### Added
- Persistent session resume so players can rejoin rooms after tab/app switches and browser reopen.
- Host-only room controls in the top bar (`•••`) on all in-room screens:
  - `RESET ROOM`
  - `CLOSE ROOM`
- `roomClosed` handling so all players are returned cleanly when host ends a room.
- Master-controlled round start from role reveal (`BEGIN ROUND`) so the game does not auto-advance.

### Changed
- Player identity is now stable across reconnects (no longer tied to transient `socket.id`).
- Disconnect behavior now uses a grace window before removing players, improving in-person mobile reliability.
- Difficulty selection moved to host pre-start lobby controls (per-round selection).
- Create-room flow now goes directly to the waiting room (removed intermediate screen).
- Role reveal screen now has stronger role/word hierarchy:
  - Bold role emphasis with role colors.
  - For Master and Insider: small `SECRET WORD:` label plus large centered round word.

### Visual Updates
- Results title color:
  - Commons win: bright green.
  - Insider win: red.
- Role tags on results:
  - Master: white
  - Commoner: green
  - Insider: red
- Narrowed and centered key UI blocks (inputs, waiting-room list, difficulty/start controls) for better mobile fit.
- Host menu now closes on outside tap/click (mobile-friendly).

### Fixed
- Removed confusing default "Room not found" startup error on stale auto-resume.
- Kept explicit end-of-room messaging when host closes the room (`The host has ended the room.`).

# Buzzer Genie En Herbe - Project Info

## Purpose

This project is a real-time buzzer game for a host and multiple players.
It is designed as a Progressive Web App (PWA) frontend plus a Socket.IO backend.

The game flow is:

1. The host creates a room and defines the teams.
2. The host enters a theme setup step.
3. Players join with a nickname and team selection.
4. Players buzz in real time.
5. The host sees the queue, validates or rejects answers, updates scores, and controls round flow.

## Current Stack

- Frontend: React + Vite
- Routing: `react-router-dom`
- Real-time transport: Socket.IO
- Backend: Node.js + Socket.IO
- PWA support: Vite PWA manifest/service worker setup

## Main Directory Layout

- `Buzzer_PWA/src/pages/shared/Mode.jsx`
- `Buzzer_PWA/src/pages/host/Configuration.jsx`
- `Buzzer_PWA/src/pages/host/ThemesSetup.jsx`
- `Buzzer_PWA/src/pages/host/PlayersRoom.jsx`
- `Buzzer_PWA/src/pages/host/HostRound.jsx`
- `Buzzer_PWA/src/pages/player/JoinGame.jsx`
- `Buzzer_PWA/src/pages/player/TeamSelection.jsx`
- `Buzzer_PWA/src/pages/player/PlayerBuzzer.jsx`
- `Buzzer_PWA/src/components/AppLogo.jsx`
- `Buzzer_PWA/src/components/ConfirmationModal.jsx`
- `Buzzer_PWA/src/lib/session.js`
- `Buzzer_PWA/src/lib/socket.js`
- `Buzzer_PWA/src/lib/socketRequest.js`
- `Buzzer_PWA/src/lib/roomData.js`
- `server/index.js`
- `server/roomStore.js`

## Routing Flow

### Host flow

- `/` -> `Mode.jsx`
- Host clicks `Host`
- `/configuration` -> team names
- `/themes-setup` -> enter two series of three themes
- `/players-room` -> room waiting screen
- `/host-round` -> live host control screen

### Player flow

- `/` -> `Mode.jsx`
- Player clicks `Player`
- `/player/join` -> enter game code
- `/player/team-selection` -> enter nickname and choose team
- `/player/buzzer` -> active buzz screen

## Important UX / Product Decisions

- The app is mobile-first but also supports desktop host use.
- The host uses the same branded logo across screens.
- The player nickname field was renamed to `Prénom` in the UI.
- Players can change their nickname later from the buzzer screen.
- The team selection screen highlights the selected team more clearly.
- Host action buttons like “Créer une nouvelle partie” and “Se déconnecter” use confirmation modals.
- The host can edit team scores directly.
- The host can change question points using:
  - `+`
  - `-`
  - an input field for fast editing
- Default question points are `1`.
- Correct answer scoring adds the current question points.
- The host can reveal theme mysteries manually.

## Theme System

### What was added

- A dedicated host step exists for entering themes before the game starts.
- Themes are entered as:
  - 2 series
  - 3 themes per series
  - exactly 1 mystery theme per series
- The host can later reveal the mystery theme for each series manually.

### Theme data model

Each series has:

- `id`
- `label`
- `themes`

Each theme has:

- `id`
- `title`
- `isMystery`
- `revealed`

### Server events

- `host:set-theme-series`
- `host:reveal-theme-mystery`

### Frontend files involved

- `Buzzer_PWA/src/pages/host/ThemesSetup.jsx`
- `Buzzer_PWA/src/pages/host/ThemesSetup.css`
- `Buzzer_PWA/src/pages/host/HostRound.jsx`
- `Buzzer_PWA/src/pages/host/Configuration.jsx`
- `Buzzer_PWA/src/lib/roomData.js`
- `Buzzer_PWA/src/lib/session.js`

## Game Rules

- Real-time transport uses Socket.IO.
- Only one host controls the game.
- Players join with:
  - nickname
  - temporary socket/session identity
- Buzzing is only allowed while the round is open.
- The server keeps the full buzz queue in exact buzz order.
- If a player answers wrong, the host moves to the next pending buzz in the queue.
- If all players in the queue are wrong, the round ends automatically.
- Players who disconnect are removed after a reconnect window if they do not come back.
- Host and player reconnect flows are session-based.

## Reconnect / Persistence Behavior

- The app was updated so short app switches should not immediately drop the user.
- Host and player sessions are stored using browser storage helpers in `session.js`.
- Host room/session restoration is handled on socket reconnect.
- Player session restoration is handled on socket reconnect.

## Backend Notes

### `server/roomStore.js`

This file owns the in-memory state of rooms and players.

It currently handles:

- room creation
- joining a room
- resuming host/player sessions
- opening rounds
- marking answers
- setting question points
- setting team scores
- setting theme series
- revealing mystery themes
- buzzing
- nickname updates
- host/player disconnect logic

### Room storage

- Game state is stored in memory only.
- A server restart resets active games.
- This was considered acceptable for this project.

## Frontend Notes

### `App.jsx`

The app currently routes directly between the host and player screens.

### `roomData.js`

This file converts live socket room data into the UI-friendly structure used by the pages.

It also provides demo data so the UI can render even before real socket data arrives.

### `session.js`

This file contains helpers for:

- host session storage
- player session storage
- player join info
- host theme draft storage

## UI Components / Assets

- `AppLogo.jsx` uses the real app logo asset.
- `Ding.mp3` is the sound played on the host device when someone buzzes.
- The app logo asset is `src/assets/Host_UI_Logo.png`.

## Deployment Notes

Frontend:

- Deployed on Netlify
- Build must point to the frontend app directory
- Publish directory must point to the Vite `dist` output in that frontend folder

Backend:

- Deployed on Render
- Must expose Socket.IO and a health endpoint
- `CLIENT_ORIGIN` must be set on the backend
- `VITE_SERVER_URL` must be set on the frontend

## Known Constraints / Design Choices

- No database persistence yet.
- No authentication system.
- One host only.
- Team size limit is enforced on the server.
- Players may freely choose a team before the game starts.
- The app is intentionally built so UI state can later be replaced by live server data without rewriting the whole frontend.

## Testing Habits That Have Worked Well

- Use multiple browser tabs for quick local testing.
- Reduce team size temporarily when testing join/rejoin edge cases.
- Test the host and player flows separately.
- Verify real device behavior for Android/iPhone PWA differences.

## Useful Notes for Future Work

- Theme management is still a host-only feature.
- If a future change needs server data to be shown in the UI, prefer adding it to `roomStore.js` first, then serialize it, then map it in `roomData.js`.
- When adding new Socket.IO actions:
  - add the store function in `roomStore.js`
  - add the socket handler in `server/index.js`
  - add the frontend request in the appropriate page/component
- Keep the code data-driven so real server data can replace placeholder demo values easily.

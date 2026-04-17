# Buzzer PWA

## Run Locally

### 1. Start the Socket.IO server

From the repo root:

```bash
npm run server:dev
```

The backend listens on `http://localhost:3001`.

### 2. Start the frontend

From `Buzzer_PWA/`:

```bash
npm run dev
```

The frontend runs on the Vite dev server, usually `http://localhost:5173`.

## Frontend / Backend Connection

By default, the frontend socket client uses the current origin and Vite proxies
`/socket.io` and `/health` to `http://localhost:3001` during development.

That means the default dev setup works without extra configuration.

If you want to point the frontend to another backend URL, create a local env file:

```bash
cp .env.example .env
```

Then edit:

```env
VITE_SERVER_URL=http://localhost:3001
```

## Netlify SPA Routing

This app uses React Router, so direct refreshes on nested routes such as:

- `/configuration`
- `/player/join`
- `/player/buzzer`

must resolve to `index.html`.

That fallback is already configured through:

`public/_redirects`

with this rule:

```txt
/* /index.html 200
```

## Current Real-Time Flow

- Host creates a room from the configuration page
- Players check the room code
- Players choose a team and nickname
- Host sees players join in the waiting room
- Host opens a round
- Players buzz in real time
- Host validates or rejects the active buzz
- Scores and queue state update live

# Buzzer Genie En Herbe Server Spec

## Overview

This app uses a real-time Socket.IO server to manage buzzer games between one host and multiple players.

The server is authoritative for:
- room creation
- room code generation
- player joins
- team assignment rules
- round open/closed state
- buzz ordering
- active buzz progression
- score updates
- disconnect cleanup

State is stored in memory only.

## Core Rules

- Transport: `Socket.IO`
- Persistence: in-memory only
- One host per room
- Room code format: 6 uppercase alphanumeric characters, e.g. `AB12CD`
- Team size limit: 5 players per team
- Players appear in the room only after full confirmation:
  - valid code
  - selected team
  - nickname entered
  - join submitted
- Players can buzz only when `roundOpen === true`
- Server keeps the full buzz queue
- Server also keeps `activeBuzzIndex`
- Correct answer:
  - add fixed points to the answering player's team
  - end round
  - clear queue
  - reset player buzz flags
- Wrong answer:
  - mark current queue item as wrong
  - move to next queue item
  - no new buzz required
- If queue is exhausted after wrong answers:
  - end round automatically
- Only host receives the "play buzz sound" event
- On player disconnect:
  - remove player from room immediately

## Suggested In-Memory State

```ts
type ServerState = {
  rooms: Map<string, Room>
  socketToPresence: Map<string, SocketPresence>
}

type SocketPresence = {
  roomCode: string
  role: 'host' | 'player'
  playerId?: string
}

type Room = {
  code: string
  hostSocketId: string
  createdAt: number
  roundOpen: boolean
  activeBuzzIndex: number | null
  teams: [Team, Team]
  players: Player[]
  buzzQueue: BuzzEntry[]
}

type Team = {
  id: string
  name: string
  score: number
  maxPlayers: number
}

type Player = {
  id: string
  socketId: string
  nickname: string
  teamId: string
  connected: boolean
  hasBuzzedInRound: boolean
}

type BuzzEntry = {
  id: string
  playerId: string
  socketId: string
  nickname: string
  teamId: string
  buzzedAt: number
  status: 'pending' | 'correct' | 'wrong'
}
```

## Room Lifecycle

### 1. Host creates room

Triggered when host submits team names and clicks launch game.

Server:
- generates unique 6-character code
- creates room
- initializes teams with score `0`
- initializes `roundOpen = false`
- initializes `buzzQueue = []`
- initializes `activeBuzzIndex = null`

Client result:
- host receives room code
- host enters host room/waiting view

### 2. Player checks room code

Triggered when player enters code.

Server:
- validates room existence
- returns public room join data:
  - room code
  - team names
  - current player counts per team
  - whether team is full

### 3. Player joins room

Triggered after player selects team and enters nickname.

Server:
- validates room exists
- validates selected team exists
- validates team is not full
- validates nickname is non-empty
- creates player record
- adds player to room

Client result:
- player enters buzzer screen
- host waiting room updates

## Round Lifecycle

### Open round

Triggered by host.

Server:
- sets `roundOpen = true`
- clears previous buzz queue
- sets `activeBuzzIndex = null`
- resets every player's `hasBuzzedInRound = false`
- broadcasts updated room state

### Player buzz

Triggered by player on buzzer screen.

Server checks:
- room exists
- sender is a valid player in that room
- `roundOpen === true`
- player has not buzzed already this round

Server action:
- append buzz entry with timestamp
- set player's `hasBuzzedInRound = true`
- if first queue item, set `activeBuzzIndex = 0`
- broadcast updated room state
- emit `host:buzz-sound` to host only

### Host validates current buzz

Triggered by host action on active queue item.

Server:
- gets current active queue entry from `activeBuzzIndex`
- marks it `correct`
- adds fixed points, e.g. `+10`, to that team
- ends round

Round end means:
- `roundOpen = false`
- `activeBuzzIndex = null`
- clear queue
- reset `hasBuzzedInRound` for all players
- broadcast updated room state

### Host rejects current buzz

Triggered by host action on active queue item.

Server:
- gets current active queue entry
- marks it `wrong`
- increments `activeBuzzIndex`

If next pending queue entry exists:
- keep round open
- broadcast updated room state

If no next pending queue entry exists:
- end round automatically

## Disconnect Behavior

### Player disconnects

Server:
- remove player from room
- remove their future buzz eligibility
- remove pending queue entries linked to that player
- if removed player was current active entry:
  - advance to next pending buzz
  - if none exists, end round if appropriate
- broadcast updated room state

### Host disconnects

Suggested first version:
- destroy room immediately
- notify players with `room:closed`

## Socket Event Contract

### Client -> Server

#### Host events

`host:create-room`
```json
{
  "teams": [
    { "name": "Equipe A" },
    { "name": "Equipe B" }
  ]
}
```

`host:open-round`
```json
{
  "roomCode": "AB12CD"
}
```

`host:mark-answer`
```json
{
  "roomCode": "AB12CD",
  "result": "correct"
}
```
or
```json
{
  "roomCode": "AB12CD",
  "result": "wrong"
}
```

#### Player events

`player:check-room`
```json
{
  "roomCode": "AB12CD"
}
```

`player:join-room`
```json
{
  "roomCode": "AB12CD",
  "nickname": "Alice",
  "teamId": "team-a"
}
```

`player:buzz`
```json
{
  "roomCode": "AB12CD"
}
```

`player:disconnect-room`
```json
{
  "roomCode": "AB12CD"
}
```

### Server -> Client

`host:room-created`
```json
{
  "room": {
    "code": "AB12CD",
    "roundOpen": false,
    "activeBuzzIndex": null,
    "teams": [
      { "id": "team-a", "name": "Equipe A", "score": 0, "maxPlayers": 5, "playerCount": 0 },
      { "id": "team-b", "name": "Equipe B", "score": 0, "maxPlayers": 5, "playerCount": 0 }
    ],
    "players": [],
    "buzzQueue": []
  }
}
```

`room:join-info`
```json
{
  "room": {
    "code": "AB12CD",
    "teams": [
      { "id": "team-a", "name": "Equipe A", "playerCount": 2, "maxPlayers": 5, "isFull": false },
      { "id": "team-b", "name": "Equipe B", "playerCount": 5, "maxPlayers": 5, "isFull": true }
    ]
  }
}
```

`room:state`
```json
{
  "room": {
    "code": "AB12CD",
    "roundOpen": true,
    "activeBuzzIndex": 1,
    "teams": [
      { "id": "team-a", "name": "Equipe A", "score": 10, "maxPlayers": 5, "playerCount": 3 },
      { "id": "team-b", "name": "Equipe B", "score": 0, "maxPlayers": 5, "playerCount": 2 }
    ],
    "players": [
      { "id": "p1", "nickname": "Alice", "teamId": "team-a", "connected": true, "hasBuzzedInRound": true }
    ],
    "buzzQueue": [
      { "id": "b1", "playerId": "p1", "nickname": "Alice", "teamId": "team-a", "status": "pending", "queuePosition": 1 }
    ]
  }
}
```

`host:buzz-sound`
```json
{
  "roomCode": "AB12CD"
}
```

`player:buzz-status`
```json
{
  "hasBuzzed": true,
  "rank": 3
}
```

`room:closed`
```json
{
  "roomCode": "AB12CD",
  "reason": "host_disconnected"
}
```

`server:error`
```json
{
  "code": "TEAM_FULL",
  "message": "Selected team is already full."
}
```

## Suggested Error Codes

- `ROOM_NOT_FOUND`
- `ROOM_ALREADY_EXISTS`
- `INVALID_ROOM_CODE`
- `INVALID_TEAM`
- `TEAM_FULL`
- `INVALID_NICKNAME`
- `PLAYER_ALREADY_JOINED`
- `ROUND_CLOSED`
- `ALREADY_BUZZED`
- `NOT_ACTIVE_HOST`
- `NO_ACTIVE_BUZZ`
- `ROOM_CLOSED`

## Frontend Mapping

### Host frontend

- Configuration page:
  - emits `host:create-room`
- Players room page:
  - listens for `room:state`
- Host round page:
  - emits `host:open-round`
  - emits `host:mark-answer`
  - listens for `room:state`
  - listens for `host:buzz-sound`

### Player frontend

- Join page:
  - emits `player:check-room`
- Team selection page:
  - captures `nickname + teamId`
  - emits `player:join-room`
- Buzzer page:
  - emits `player:buzz`
  - listens for `player:buzz-status`
  - listens for `room:state`
  - emits `player:disconnect-room` on explicit leave

## First Backend Milestone

The simplest first working version should support:
- host creates room
- player checks room code
- player joins team with nickname
- host sees joined players
- host opens round
- players buzz
- host sees full buzz queue
- host marks correct/wrong
- score updates
- player disconnect cleanup

That milestone is enough to connect the current frontend screens to a real Socket.IO backend.

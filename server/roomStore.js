const TEAM_SIZE_LIMIT = 5
const ROUND_POINTS = 1
const ROOM_CODE_LENGTH = 6
const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const PLAYER_RECONNECT_WINDOW_MS = 10 * 60 * 1000

export class SocketEventError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SocketEventError'
    this.code = code
  }
}

export function createStore() {
  return {
    rooms: new Map(),
    socketToPresence: new Map(),
  }
}

export function createRoom(store, hostSocketId, payload) {
  const teams = normalizeHostTeams(payload?.teams)
  const code = generateUniqueRoomCode(store.rooms)

  const room = {
    code,
    hostSocketId,
    createdAt: Date.now(),
    roundOpen: false,
    activeBuzzIndex: null,
    teams: teams.map((team, index) => ({
      id: `team-${index + 1}`,
      name: team.name,
      score: 0,
      maxPlayers: TEAM_SIZE_LIMIT,
    })),
    players: [],
    buzzQueue: [],
  }

  store.rooms.set(code, room)
  store.socketToPresence.set(hostSocketId, {
    roomCode: code,
    role: 'host',
  })

  return room
}

export function checkRoom(store, roomCode) {
  const room = getRoomOrThrow(store, roomCode)
  return serializeJoinInfo(room)
}

export function joinRoom(store, socketId, payload) {
  const room = getRoomOrThrow(store, payload?.roomCode)

  if (!room.hostSocketId) {
    throw new SocketEventError('ROOM_CLOSED', 'This room is no longer available.')
  }

  const nickname = sanitizeNickname(payload?.nickname)
  const team = getTeamOrThrow(room, payload?.teamId)
  const teamPlayerCount = room.players.filter((player) => player.teamId === team.id).length
  if (teamPlayerCount >= team.maxPlayers) {
    throw new SocketEventError('TEAM_FULL', 'Selected team is already full.')
  }

  const player = {
    id: `player-${crypto.randomUUID()}`,
    socketId,
    nickname,
    teamId: team.id,
    connected: true,
    hasBuzzedInRound: false,
    lastSeenAt: Date.now(),
    disconnectDeadlineAt: null,
  }

  room.players.push(player)
  store.socketToPresence.set(socketId, {
    roomCode: room.code,
    role: 'player',
    playerId: player.id,
  })

  return { room, player }
}

export function resumePlayerSession(store, socketId, payload) {
  const room = getRoomOrThrow(store, payload?.roomCode)
  const playerId = String(payload?.playerId || '').trim()
  if (!playerId) {
    throw new SocketEventError('INVALID_PLAYER_SESSION', 'Player session is missing.')
  }

  const player = getPlayerByIdOrThrow(room, playerId)
  player.socketId = socketId
  player.connected = true
  player.lastSeenAt = Date.now()
  player.disconnectDeadlineAt = null

  store.socketToPresence.set(socketId, {
    roomCode: room.code,
    role: 'player',
    playerId: player.id,
  })

  return { room, player }
}

export function openRound(store, hostSocketId, payload) {
  const room = getHostRoomOrThrow(store, hostSocketId, payload?.roomCode)

  room.roundOpen = true
  room.activeBuzzIndex = null
  room.buzzQueue = []
  for (const player of room.players) {
    player.hasBuzzedInRound = false
  }

  return room
}

export function markAnswer(store, hostSocketId, payload) {
  const room = getHostRoomOrThrow(store, hostSocketId, payload?.roomCode)

  if (room.activeBuzzIndex === null || !room.buzzQueue[room.activeBuzzIndex]) {
    throw new SocketEventError('NO_ACTIVE_BUZZ', 'There is no active buzz to score.')
  }

  const entry = room.buzzQueue[room.activeBuzzIndex]
  if (payload?.result === 'correct') {
    entry.status = 'correct'
    const team = room.teams.find((item) => item.id === entry.teamId)
    if (team) {
      team.score += ROUND_POINTS
    }
    endRound(room)
    return { room, resolvedEntry: entry }
  }

  if (payload?.result === 'wrong') {
    entry.status = 'wrong'
    const nextIndex = findNextPendingIndex(room.buzzQueue, room.activeBuzzIndex + 1)

    if (nextIndex === null) {
      endRound(room)
    } else {
      room.activeBuzzIndex = nextIndex
    }

    return { room, resolvedEntry: entry }
  }

  throw new SocketEventError('INVALID_RESULT', 'Result must be correct or wrong.')
}

export function addBuzz(store, socketId, payload) {
  const presence = getPresenceOrThrow(store, socketId)
  if (presence.role !== 'player') {
    throw new SocketEventError('INVALID_ROLE', 'Only players can buzz.')
  }

  const room = getRoomOrThrow(store, payload?.roomCode || presence.roomCode)
  const player = getPlayerByIdOrThrow(room, presence.playerId)

  if (!room.roundOpen) {
    throw new SocketEventError('ROUND_CLOSED', 'Buzzing is currently disabled.')
  }

  if (!player.connected) {
    throw new SocketEventError('PLAYER_DISCONNECTED', 'Reconnect before buzzing.')
  }

  if (player.hasBuzzedInRound) {
    throw new SocketEventError('ALREADY_BUZZED', 'You already buzzed during this round.')
  }

  player.hasBuzzedInRound = true
  player.lastSeenAt = Date.now()

  const entry = {
    id: `buzz-${crypto.randomUUID()}`,
    playerId: player.id,
    socketId: player.socketId,
    nickname: player.nickname,
    teamId: player.teamId,
    buzzedAt: Date.now(),
    status: 'pending',
  }

  room.buzzQueue.push(entry)

  if (room.activeBuzzIndex === null) {
    room.activeBuzzIndex = 0
  }

  return { room, player, entry }
}

export function removeSocket(store, socketId) {
  const presence = store.socketToPresence.get(socketId)
  if (!presence) {
    return { removed: false }
  }

  store.socketToPresence.delete(socketId)
  const room = store.rooms.get(presence.roomCode)
  if (!room) {
    return { removed: false }
  }

  if (presence.role === 'host') {
    store.rooms.delete(room.code)
    return {
      removed: true,
      type: 'host',
      roomCode: room.code,
      room,
    }
  }

  if (presence.role === 'player' && presence.playerId) {
    const player = room.players.find((item) => item.id === presence.playerId)
    if (!player) {
      return { removed: false }
    }

    player.connected = false
    player.socketId = null
    player.lastSeenAt = Date.now()
    player.disconnectDeadlineAt = Date.now() + PLAYER_RECONNECT_WINDOW_MS

    return {
      removed: true,
      type: 'player-disconnected',
      roomCode: room.code,
      room,
      playerId: player.id,
      expiresAt: player.disconnectDeadlineAt,
    }
  }

  return { removed: false }
}

export function expireDisconnectedPlayer(store, roomCode, playerId) {
  const room = store.rooms.get(String(roomCode || '').trim().toUpperCase())
  if (!room) {
    return { removed: false }
  }

  const player = room.players.find((item) => item.id === playerId)
  if (!player || player.connected || !player.disconnectDeadlineAt) {
    return { removed: false, room }
  }

  if (Date.now() < player.disconnectDeadlineAt) {
    return { removed: false, room }
  }

  removePlayerFromRoom(room, playerId)
  return {
    removed: true,
    type: 'player-expired',
    roomCode: room.code,
    room,
    playerId,
  }
}

export function removePlayerByRequest(store, socketId, payload) {
  const presence = getPresenceOrThrow(store, socketId)
  if (presence.role !== 'player') {
    throw new SocketEventError('INVALID_ROLE', 'Only players can disconnect from a room.')
  }

  const room = getRoomOrThrow(store, payload?.roomCode || presence.roomCode)
  removePlayerFromRoom(room, presence.playerId)
  store.socketToPresence.delete(socketId)

  return { room, playerId: presence.playerId }
}

export function serializeRoom(room) {
  return {
    code: room.code,
    roundOpen: room.roundOpen,
    activeBuzzIndex: room.activeBuzzIndex,
    teams: room.teams.map((team) => ({
      id: team.id,
      name: team.name,
      score: team.score,
      maxPlayers: team.maxPlayers,
      playerCount: room.players.filter((player) => player.teamId === team.id).length,
      isFull:
        room.players.filter((player) => player.teamId === team.id).length >= team.maxPlayers,
    })),
    players: room.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      teamId: player.teamId,
      connected: player.connected,
      hasBuzzedInRound: player.hasBuzzedInRound,
      disconnectDeadlineAt: player.disconnectDeadlineAt,
    })),
    buzzQueue: room.buzzQueue.map((entry, index) => ({
      id: entry.id,
      playerId: entry.playerId,
      nickname: entry.nickname,
      teamId: entry.teamId,
      status: entry.status,
      queuePosition: index + 1,
      buzzedAt: entry.buzzedAt,
      isActive: room.activeBuzzIndex === index,
    })),
  }
}

export function getPlayerBuzzStatus(room, playerId) {
  const player = room.players.find((item) => item.id === playerId)
  const queueIndex = room.buzzQueue.findIndex((entry) => entry.playerId === playerId)

  return {
    hasBuzzed: player?.hasBuzzedInRound ?? false,
    rank: queueIndex >= 0 ? queueIndex + 1 : null,
    connected: Boolean(player?.connected),
  }
}

function serializeJoinInfo(room) {
  return {
    code: room.code,
    teams: room.teams.map((team) => ({
      id: team.id,
      name: team.name,
      playerCount: room.players.filter((player) => player.teamId === team.id).length,
      maxPlayers: team.maxPlayers,
      isFull:
        room.players.filter((player) => player.teamId === team.id).length >= team.maxPlayers,
    })),
  }
}

function endRound(room) {
  room.roundOpen = false
  room.activeBuzzIndex = null
  room.buzzQueue = []
  for (const player of room.players) {
    player.hasBuzzedInRound = false
  }
}

function removePlayerFromRoom(room, playerId) {
  const playerIndex = room.players.findIndex((player) => player.id === playerId)
  if (playerIndex === -1) {
    return
  }

  room.players.splice(playerIndex, 1)

  const queueWithoutPlayer = room.buzzQueue.filter((entry) => entry.playerId !== playerId)
  room.buzzQueue = queueWithoutPlayer

  if (room.buzzQueue.length === 0) {
    room.activeBuzzIndex = room.roundOpen ? null : room.activeBuzzIndex
    if (room.roundOpen) {
      endRound(room)
    }
    return
  }

  if (room.activeBuzzIndex === null) {
    room.activeBuzzIndex = findNextPendingIndex(room.buzzQueue, 0)
    return
  }

  if (
    !room.buzzQueue[room.activeBuzzIndex] ||
    room.buzzQueue[room.activeBuzzIndex].status !== 'pending'
  ) {
    const nextIndex = findNextPendingIndex(room.buzzQueue, room.activeBuzzIndex)
    if (nextIndex === null) {
      endRound(room)
    } else {
      room.activeBuzzIndex = nextIndex
    }
  }
}

function normalizeHostTeams(teams) {
  if (!Array.isArray(teams) || teams.length !== 2) {
    throw new SocketEventError('INVALID_TEAMS', 'Exactly two teams are required.')
  }

  return teams.map((team, index) => {
    const name = String(team?.name || '').trim()
    if (!name) {
      throw new SocketEventError(
        'INVALID_TEAMS',
        `Team ${index + 1} must have a non-empty name.`,
      )
    }

    return { name }
  })
}

function sanitizeNickname(value) {
  const nickname = String(value || '').trim()
  if (!nickname) {
    throw new SocketEventError('INVALID_NICKNAME', 'Nickname is required.')
  }
  if (nickname.length > 20) {
    throw new SocketEventError('INVALID_NICKNAME', 'Nickname is too long.')
  }
  return nickname
}

function getPresenceOrThrow(store, socketId) {
  const presence = store.socketToPresence.get(socketId)
  if (!presence) {
    throw new SocketEventError('ROOM_NOT_FOUND', 'Socket is not attached to a room.')
  }
  return presence
}

function getRoomOrThrow(store, roomCode) {
  const normalizedCode = String(roomCode || '').trim().toUpperCase()
  if (!normalizedCode) {
    throw new SocketEventError('INVALID_ROOM_CODE', 'Room code is required.')
  }

  const room = store.rooms.get(normalizedCode)
  if (!room) {
    throw new SocketEventError('ROOM_NOT_FOUND', 'Room not found.')
  }
  return room
}

function getHostRoomOrThrow(store, hostSocketId, roomCode) {
  const room = getRoomOrThrow(store, roomCode)
  if (room.hostSocketId !== hostSocketId) {
    throw new SocketEventError('NOT_ACTIVE_HOST', 'Only the host can perform this action.')
  }
  return room
}

function getTeamOrThrow(room, teamId) {
  const team = room.teams.find((item) => item.id === teamId)
  if (!team) {
    throw new SocketEventError('INVALID_TEAM', 'Selected team does not exist.')
  }
  return team
}

function getPlayerByIdOrThrow(room, playerId) {
  const player = room.players.find((item) => item.id === playerId)
  if (!player) {
    throw new SocketEventError('PLAYER_NOT_FOUND', 'Player not found in room.')
  }
  return player
}

function generateUniqueRoomCode(rooms) {
  let attempts = 0
  while (attempts < 1000) {
    const code = generateRoomCode()
    if (!rooms.has(code)) {
      return code
    }
    attempts += 1
  }

  throw new SocketEventError('ROOM_CODE_GENERATION_FAILED', 'Unable to generate room code.')
}

function generateRoomCode() {
  let code = ''
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARS.length)
    code += ROOM_CODE_CHARS[randomIndex]
  }
  return code
}

function findNextPendingIndex(queue, startIndex) {
  for (let index = startIndex; index < queue.length; index += 1) {
    if (queue[index].status === 'pending') {
      return index
    }
  }
  return null
}

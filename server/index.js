import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { Server } from 'socket.io'
import {
  HOST_RECONNECT_WINDOW_MS,
  PLAYER_RECONNECT_WINDOW_MS,
  SocketEventError,
  addBuzz,
  checkRoom,
  createRoom,
  createStore,
  expireDisconnectedHost,
  expireDisconnectedPlayer,
  getPlayerBuzzStatus,
  joinRoom,
  markAnswer,
  openRound,
  removeHostByRequest,
  removePlayerByRequest,
  removeSocket,
  setQuestionPoints,
  setTeamScore,
  setThemeSeries,
  resumeHostSession,
  resumePlayerSession,
  revealThemeMystery,
  updatePlayerNickname,
  serializeRoom,
} from './roomStore.js'

const PORT = Number(process.env.PORT || 3001)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*'

export function createSocketServer(options = {}) {
  const httpServer =
    options.httpServer ||
    createServer((request, response) => {
      if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: true }))
        return
      }

      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: false, message: 'Not found' }))
    })

  const io = new Server(httpServer, {
    cors: {
      origin: options.clientOrigin || CLIENT_ORIGIN,
      methods: ['GET', 'POST'],
    },
  })

  const store = createStore()
  const playerExpiryTimers = new Map()
  const hostExpiryTimers = new Map()

  io.on('connection', (socket) => {
    socket.on('host:create-room', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const room = createRoom(store, socket.id, payload)
        socket.join(room.code)

        const serializedRoom = serializeRoom(room)
        socket.emit('host:room-created', { room: serializedRoom })
        emitRoomState(room)
        return {
          room: serializedRoom,
          hostSessionToken: room.hostSessionToken,
        }
      })
    })

    socket.on('host:resume-session', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const { room } = resumeHostSession(store, socket.id, payload)
        socket.join(room.code)
        clearHostExpiry(room.code)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return {
          room: serializeRoom(room),
          hostSessionToken: room.hostSessionToken,
        }
      })
    })

    socket.on('player:check-room', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const joinInfo = checkRoom(store, payload?.roomCode)
        socket.emit('room:join-info', { room: joinInfo })
        return { room: joinInfo }
      })
    })

    socket.on('player:join-room', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const { room, player } = joinRoom(store, socket.id, payload)
        socket.join(room.code)
        clearPlayerExpiry(player.id)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return {
          room: serializeRoom(room),
          player: {
            id: player.id,
            nickname: player.nickname,
            teamId: player.teamId,
          },
        }
      })
    })

    socket.on('player:resume-session', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const { room, player } = resumePlayerSession(store, socket.id, payload)
        socket.join(room.code)
        clearPlayerExpiry(player.id)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return {
          room: serializeRoom(room),
          player: {
            id: player.id,
            nickname: player.nickname,
            teamId: player.teamId,
          },
          playerStatus: getPlayerBuzzStatus(room, player.id),
        }
      })
    })

    socket.on('host:open-round', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const room = openRound(store, socket.id, payload)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return { room: serializeRoom(room) }
      })
    })

    socket.on('host:mark-answer', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const { room } = markAnswer(store, socket.id, payload)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return { room: serializeRoom(room) }
      })
    })


    socket.on('host:set-question-points', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const room = setQuestionPoints(store, socket.id, payload)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return { room: serializeRoom(room) }
      })
    })

    socket.on('host:set-team-score', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const room = setTeamScore(store, socket.id, payload)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return { room: serializeRoom(room) }
      })
    })

    socket.on('host:set-theme-series', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const room = setThemeSeries(store, socket.id, payload)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return { room: serializeRoom(room) }
      })
    })

    socket.on('host:reveal-theme-mystery', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const { room, seriesIndex, themeId, revealed } = revealThemeMystery(store, socket.id, payload)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return { room: serializeRoom(room), seriesIndex, themeId, revealed }
      })
    })

    socket.on('player:buzz', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const { room, player } = addBuzz(store, socket.id, payload)
        emitRoomState(room)
        emitPlayerStatuses(room)
        if (room.hostSocketId) {
          io.to(room.hostSocketId).emit('host:buzz-sound', { roomCode: room.code })
        }
        return {
          room: serializeRoom(room),
          playerStatus: getPlayerBuzzStatus(room, player.id),
        }
      })
    })


    socket.on('player:update-nickname', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const { room, player } = updatePlayerNickname(store, socket.id, payload)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return {
          room: serializeRoom(room),
          player: {
            id: player.id,
            nickname: player.nickname,
            teamId: player.teamId,
          },
        }
      })
    })

    socket.on('player:disconnect-room', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const { room, playerId } = removePlayerByRequest(store, socket.id, payload)
        clearPlayerExpiry(playerId)
        socket.leave(room.code)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return { room: serializeRoom(room) }
      })
    })


    socket.on('host:disconnect-room', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const { room, roomCode } = removeHostByRequest(store, socket.id, payload)
        clearHostExpiry(roomCode)
        socket.leave(roomCode)
        io.to(roomCode).emit('room:closed', {
          roomCode,
          reason: 'host_disconnected',
        })
        return { room: serializeRoom(room) }
      })
    })

    socket.on('disconnect', () => {
      const result = removeSocket(store, socket.id)
      if (!result.removed) {
        return
      }

      if (result.type === 'host-disconnected') {
        scheduleHostExpiry(result.roomCode, result.expiresAt)
        emitRoomState(result.room)
        emitPlayerStatuses(result.room)
        return
      }

      if (result.type === 'player-disconnected') {
        schedulePlayerExpiry(result.roomCode, result.playerId, result.expiresAt)
        emitRoomState(result.room)
        emitPlayerStatuses(result.room)
      }
    })
  })

  function emitRoomState(room) {
    io.to(room.code).emit('room:state', {
      room: serializeRoom(room),
    })
  }

  function emitPlayerStatuses(room) {
    for (const player of room.players) {
      if (!player.socketId) {
        continue
      }
      io.to(player.socketId).emit('player:buzz-status', getPlayerBuzzStatus(room, player.id))
    }
  }

  function scheduleHostExpiry(roomCode, expiresAt) {
    clearHostExpiry(roomCode)

    const delay = Math.max(0, (expiresAt || Date.now() + HOST_RECONNECT_WINDOW_MS) - Date.now())
    const timeoutId = setTimeout(() => {
      hostExpiryTimers.delete(roomCode)
      const result = expireDisconnectedHost(store, roomCode)
      if (!result.removed) {
        return
      }

      io.to(result.roomCode).emit('room:closed', {
        roomCode: result.roomCode,
        reason: 'host_disconnected',
      })
    }, delay)

    hostExpiryTimers.set(roomCode, timeoutId)
  }

  function clearHostExpiry(roomCode) {
    const timeoutId = hostExpiryTimers.get(roomCode)
    if (timeoutId) {
      clearTimeout(timeoutId)
      hostExpiryTimers.delete(roomCode)
    }
  }

  function schedulePlayerExpiry(roomCode, playerId, expiresAt) {
    clearPlayerExpiry(playerId)

    const delay = Math.max(0, (expiresAt || Date.now() + PLAYER_RECONNECT_WINDOW_MS) - Date.now())
    const timeoutId = setTimeout(() => {
      playerExpiryTimers.delete(playerId)
      const result = expireDisconnectedPlayer(store, roomCode, playerId)
      if (!result.removed) {
        return
      }

      emitRoomState(result.room)
      emitPlayerStatuses(result.room)
    }, delay)

    playerExpiryTimers.set(playerId, timeoutId)
  }

  function clearPlayerExpiry(playerId) {
    const timeoutId = playerExpiryTimers.get(playerId)
    if (timeoutId) {
      clearTimeout(timeoutId)
      playerExpiryTimers.delete(playerId)
    }
  }

  return { io, httpServer, store }
}

function handleEvent(socket, callback, operation) {
  try {
    const result = operation()
    if (typeof callback === 'function') {
      callback({ ok: true, ...result })
    }
  } catch (error) {
    const payload = normalizeError(error)
    socket.emit('server:error', payload)
    if (typeof callback === 'function') {
      callback({ ok: false, error: payload })
    }
  }
}

function normalizeError(error) {
  if (error instanceof SocketEventError) {
    return {
      code: error.code,
      message: error.message,
    }
  }

  console.error(error)
  return {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected server error occurred.',
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { httpServer } = createSocketServer()
  httpServer.listen(PORT, () => {
    console.log(`Socket.IO server listening on http://localhost:${PORT}`)
  })
}

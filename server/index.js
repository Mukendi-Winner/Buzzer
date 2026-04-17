import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { Server } from 'socket.io'
import {
  SocketEventError,
  addBuzz,
  checkRoom,
  createRoom,
  createStore,
  getPlayerBuzzStatus,
  joinRoom,
  markAnswer,
  openRound,
  removePlayerByRequest,
  removeSocket,
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

  io.on('connection', (socket) => {
    socket.on('host:create-room', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const room = createRoom(store, socket.id, payload)
        socket.join(room.code)

        const serializedRoom = serializeRoom(room)
        socket.emit('host:room-created', { room: serializedRoom })
        emitRoomState(room)
        return { room: serializedRoom }
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

    socket.on('player:buzz', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const { room, player } = addBuzz(store, socket.id, payload)
        emitRoomState(room)
        emitPlayerStatuses(room)
        io.to(room.hostSocketId).emit('host:buzz-sound', { roomCode: room.code })
        return {
          room: serializeRoom(room),
          playerStatus: getPlayerBuzzStatus(room, player.id),
        }
      })
    })

    socket.on('player:disconnect-room', (payload, callback) => {
      handleEvent(socket, callback, () => {
        const room = removePlayerByRequest(store, socket.id, payload)
        socket.leave(room.code)
        emitRoomState(room)
        emitPlayerStatuses(room)
        return { room: serializeRoom(room) }
      })
    })

    socket.on('disconnect', () => {
      const result = removeSocket(store, socket.id)
      if (!result.removed) {
        return
      }

      if (result.type === 'host') {
        io.to(result.roomCode).emit('room:closed', {
          roomCode: result.roomCode,
          reason: 'host_disconnected',
        })
        return
      }

      emitRoomState(result.room)
      emitPlayerStatuses(result.room)
    })
  })

  function emitRoomState(room) {
    io.to(room.code).emit('room:state', {
      room: serializeRoom(room),
    })
  }

  function emitPlayerStatuses(room) {
    for (const player of room.players) {
      io.to(player.socketId).emit('player:buzz-status', getPlayerBuzzStatus(room, player.id))
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
